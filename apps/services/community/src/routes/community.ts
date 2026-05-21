import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../plugins/prisma'
import { requireAuth } from '../plugins/auth'
import { requireCaptain } from '../middleware/requireCaptain'
import { getRedis } from '../plugins/redis'

export async function communityRoutes(app: FastifyInstance) {

    // GET /communities/:communityId
    // public — community info page
    // shows resident count, online count, pinned post, block captain
    app.get('/communities/:communityId', async (request, reply) => {
        const { communityId } = request.params as { communityId: string }

        const community = await prisma.microCommunity.findUnique({
            where: { id: communityId },
            select: {
                id: true,
                name: true,
                residentCount: true,
                blockCaptainId: true,
                pinnedPostId: true,
                createdAt: true,
            },
        })

        if (!community) {
            return reply.status(404).send({ error: 'Community not found' })
        }

        // get online count from Redis presence hash
        // same hash the WebSocket Gateway writes to
        const redis = getRedis()
        const presenceKey = `presence:${communityId}`
        const presenceMap = await redis.hgetall(presenceKey)

        const cutoff = Date.now() / 1000 - 30   // active in last 30 seconds
        const onlineCount = Object.values(presenceMap)
            .filter(ts => parseInt(ts, 10) > cutoff)
            .length

        // fetch block captain display name if one is set
        let blockCaptain: { id: string; displayName: string } | null = null
        if (community.blockCaptainId) {
            blockCaptain = await prisma.user.findUnique({
                where: { id: community.blockCaptainId },
                select: { id: true, displayName: true },
            })
        }

        return reply.send({
            community: {
                ...community,
                onlineCount,
                blockCaptain,
            },
        })
    })


    // POST /communities/:communityId/pin
    // block captain only — set the pinned post for this community
    app.post(
        '/communities/:communityId/pin',
        { preHandler: [requireAuth, requireCaptain] },
        async (request, reply) => {
            const { communityId } = request.params as { communityId: string }

            const Schema = z.object({
                postId: z.string().uuid(),
            })

            const body = Schema.safeParse(request.body)
            if (!body.success) {
                return reply.status(400).send({ error: 'postId is required' })
            }

            // verify the post belongs to this community and is approved
            const post = await prisma.post.findUnique({
                where: { id: body.data.postId },
                select: { id: true, communityId: true, moderationStatus: true },
            })

            if (!post || post.communityId !== communityId) {
                return reply.status(404).send({ error: 'Post not found in this community' })
            }

            if (post.moderationStatus !== 'approved') {
                return reply.status(400).send({ error: 'Can only pin approved posts' })
            }

            await prisma.microCommunity.update({
                where: { id: communityId },
                data: { pinnedPostId: body.data.postId },
            })

            // notify all online residents that the pinned post changed
            const redis = getRedis()
            await redis.publish(`ws:community:${communityId}`, JSON.stringify({
                type: 'post_pinned',
                postId: body.data.postId,
                communityId,
            }))

            return reply.send({ message: 'Post pinned' })
        }
    )


    // DELETE /communities/:communityId/pin
    // block captain only — unpin the current pinned post
    app.delete(
        '/communities/:communityId/pin',
        { preHandler: [requireAuth, requireCaptain] },
        async (request, reply) => {
            const { communityId } = request.params as { communityId: string }

            await prisma.microCommunity.update({
                where: { id: communityId },
                data: { pinnedPostId: null },
            })

            return reply.send({ message: 'Post unpinned' })
        }
    )


    // DELETE /communities/:communityId/posts/:postId
    // block captain only — remove a post from the community
    // calls through to Post Service internally to update status
    app.delete(
        '/communities/:communityId/posts/:postId',
        { preHandler: [requireAuth, requireCaptain] },
        async (request, reply) => {
            const { communityId, postId } = request.params as {
                communityId: string
                postId: string
            }

            const post = await prisma.post.findUnique({
                where: { id: postId },
                select: { id: true, communityId: true },
            })

            if (!post || post.communityId !== communityId) {
                return reply.status(404).send({ error: 'Post not found in this community' })
            }

            // block captain removes a post — set status to removed
            await prisma.post.update({
                where: { id: postId },
                data: { moderationStatus: 'removed' },
            })

            console.log(`[Community] Block captain removed post ${postId}`)

            return reply.send({ message: 'Post removed' })
        }
    )


    // POST /communities/:communityId/announce
    // block captain only — send a broadcast announcement to all online residents
    // delivers via Redis pub/sub → WebSocket Gateway
    // also creates a post in the community feed so offline users see it
    app.post(
        '/communities/:communityId/announce',
        { preHandler: [requireAuth, requireCaptain] },
        async (request, reply) => {
            const { communityId } = request.params as { communityId: string }
            const user = request.user as { sub: string }

            const Schema = z.object({
                title: z.string().min(1).max(200),
                body: z.string().min(1).max(2000),
            })

            const parsed = Schema.safeParse(request.body)
            if (!parsed.success) {
                return reply.status(400).send({
                    error: 'Invalid request',
                    details: parsed.error.flatten().fieldErrors,
                })
            }

            // create a community post so it appears in the feed
            // moderationStatus approved immediately — captain posts skip moderation
            const post = await prisma.post.create({
                data: {
                    authorId: user.sub,
                    communityId,
                    type: 'community',
                    title: parsed.data.title,
                    body: parsed.data.body,
                    moderationStatus: 'approved',
                    imageUrls: [],
                },
            })

            // push to all online residents via WebSocket
            const redis = getRedis()
            await redis.publish(`ws:community:${communityId}`, JSON.stringify({
                type: 'announcement',
                postId: post.id,
                title: parsed.data.title,
                body: parsed.data.body,
                communityId,
                captainId: user.sub,
            }))

            return reply.status(201).send({ post })
        }
    )


    // PATCH /communities/:communityId/captain
    // promote a user to block captain — only current captain can do this
    // or any admin in a real system — for MVP only current captain
    app.patch(
        '/communities/:communityId/captain',
        { preHandler: [requireAuth, requireCaptain] },
        async (request, reply) => {
            const { communityId } = request.params as { communityId: string }

            const Schema = z.object({
                userId: z.string().uuid(),
            })

            const body = Schema.safeParse(request.body)
            if (!body.success) {
                return reply.status(400).send({ error: 'userId is required' })
            }

            // verify new captain is a verified resident of this community
            const newCaptain = await prisma.user.findUnique({
                where: { id: body.data.userId },
                select: {
                    id: true,
                    communityId: true,
                    verificationLevel: true,
                    displayName: true,
                },
            })

            if (!newCaptain) {
                return reply.status(404).send({ error: 'User not found' })
            }

            if (newCaptain.communityId !== communityId) {
                return reply.status(400).send({
                    error: 'User is not a resident of this community',
                })
            }

            if (newCaptain.verificationLevel === 'unverified') {
                return reply.status(400).send({
                    error: 'Cannot promote an unverified user to block captain',
                })
            }

            await prisma.microCommunity.update({
                where: { id: communityId },
                data: { blockCaptainId: body.data.userId },
            })

            console.log(
                `[Community] ${newCaptain.displayName} promoted to block captain of ${communityId}`
            )

            return reply.send({
                message: `${newCaptain.displayName} is now the block captain`,
            })
        }
    )

}