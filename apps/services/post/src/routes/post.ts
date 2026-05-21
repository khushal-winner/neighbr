import { z } from 'zod'
import { requireAuth } from '../plugins/auth'
import { FastifyInstance } from 'fastify'
import prisma from '../plugins/prisma'
import { request } from 'node:http'
import { error } from 'node:console'
import { PublishToModerationQueue } from '../services/queue'
import { getKafkaProducer } from '../plugins/kafka'


const PostTypeSchema = z.enum([
    'community',
    'emergency',
    'classified',
    'lost_found',
    'poll',
    'event',
    'planning_notice',
])

const CreatePostSchema = z.object({
    type: PostTypeSchema,
    title: z.string().min(1).max(200),
    body: z.string().max(5000),
    // optional — client uploads directly to S3, passes back URLs
    imageUrls: z.array(z.string().url()).default([]),

})

export async function postRoutes(app: FastifyInstance) {

    // posts /posts
    // create a post stores as pending , hands off to moderaiton
    app.post('/posts', { preHandler: requireAuth }, async (request, reply) => {
        const parsed = CreatePostSchema.safeParse(request.body)

        if (!parsed.success) {
            return reply.status(400).send({ message: 'Invalid Request', details: parsed.error.flatten().fieldErrors })
        }

        const user = request.user as {
            sub: string
            communityId: string | null
            verificationLevel: string
            trustScore?: number
        }

        if (!user.communityId) {
            return reply.status(400).send({ error: 'Verify your address before posting' })
        }

        const { type, title, body: postBody, imageUrls } = parsed.data

        // store as pending never show unmoderated content in the feed
        const post = await prisma.post.create({
            data: {
                authorId: user.sub,
                communityId: user.communityId,
                type,
                title,
                body: postBody,
                imageUrls,
                moderationStatus: 'pending',
            },
            select: {
                id: true,
                type: true,
                title: true,
                body: true,
                imageUrls: true,
                moderationStatus: true,
                authorId: true,
                communityId: true,
                createdAt: true,
            },
        })

        // publish to moderation queue - fire and forget
        // don't wait user shouldn't wait for moderation to complete
        // if this fails , console.error log it post is already saved
        PublishToModerationQueue({
            postId: post.id,
            text: `${title} ${postBody}`,
            imageUrls,
            trustScore: user.trustScore ?? 0,
            authorId: user.sub,
            type,

        }).catch(error => console.error('[Post} Moderation queue published failed:', error))

        if (type == 'emergency') {
            // emergency bypass — skip moderation queue, publish directly to Kafka
            // Alert Fan-Out consumer will pick this up and deliver within 5 seconds
            const producer = await getKafkaProducer()
            await producer.send({
                topic: `alerts:${post.communityId}`,
                messages: [{
                    key: post.id,
                    value: JSON.stringify({
                        postId: post.id,
                        communityId: post.communityId,
                        cityId: post.communityId,   // you may need to include cityId in the DB query
                        title: post.title,
                        body: post.body,
                        // coordinates come from the author's stored location
                        // for MVP we look them up; in production this would be in the JWT
                        authorId: post.authorId,
                        createdAt: post.createdAt.toISOString(),
                    })
                }]

            })
        }

        return reply.status(201).send({ post })
    })


    // get /posts/:id
    // pending/flagged posts return 404, not 403
    // why 404 not 403? don't reveal that a post exists but is flagged
    app.get('/posts/:id', async (request, reply) => {
        const { id } = request.params as { id: string }

        const post = await prisma.post.findUnique({
            where: { id },
            select: {
                id: true,
                type: true,
                title: true,
                body: true,
                imageUrls: true,
                moderationStatus: true,
                upvotes: true,
                flagCount: true,
                authorId: true,
                communityId: true,
                createdAt: true,
            }
        })

        if (!post || post.moderationStatus !== 'approved') {
            return reply.status(404).send({ error: 'Post not found' })
        }

        return reply.send({ post })
    })

    // post /posts/:id/flag
    // increment flag count - moderation service watches this
    app.post('/posts/:id/flag', { preHandler: requireAuth }, async (request, reply) => {
        const { id } = request.params as { id: string }

        const post = await prisma.post.findUnique({
            where: { id },
            select: { id: true, authorId: true }
        })

        if (!post) {
            return reply.status(404).send({ error: 'Post not found' })
        }

        const updated = await prisma.post.update({
            where: { id },
            data: { flagCount: { increment: 1 } },
            select: { id: true, flagCount: true }
        })

        // trust score service will deduct points from author
        const producer = await getKafkaProducer()
        await producer.send({
            topic: 'user.events',
            messages: [{
                key: post.authorId,
                value: JSON.stringify({
                    userId: post.authorId,
                    eventType: 'flag-received',
                    occuredAt: new Date().toISOString(),
                })
            }]
        })

        return reply.send({ flagCount: updated.flagCount })
    })

    // post /posts/:id/upvote
    app.post('/posts/:id/upvote', { preHandler: requireAuth }, async (request, reply) => {
        const { id } = request.params as { id: string }

        const post = await prisma.post.findUnique({
            where: { id },
            select: { id: true, moderationStatus: true, authorId: true }
        })

        if (!post) {
            return reply.status(404).send({ error: 'Post not found' })
        }

        if (post.moderationStatus !== 'approved') {
            return reply.status(403).send({ error: 'Cannot upvote a pending post' })
        }

        const updated = await prisma.post.update({
            where: { id },
            data: { upvotes: { increment: 1 } },
            select: { id: true, upvotes: true }
        })

        // trust score service will add points to author
        const producer = await getKafkaProducer()
        await producer.send({
            topic: 'user.events',
            messages: [{
                key: post.authorId,
                value: JSON.stringify({
                    userId: post.authorId,
                    eventType: 'post-upvoted',
                    postId: id,
                    occuredAt: new Date().toISOString()
                })
            }]
        })

        return reply.send({ upvotes: updated.upvotes })
    })


    // patch /post/:id/status
    // internal only — called by Moderation Service after review
    // no auth — internal service-to-service call on private network
    // in production: restrict to internal network via Nginx/K8s NetworkPolicy

    app.patch('/posts/:id/status', async (request, reply) => {
        const { id } = request.params as { id: string }

        const StatusSchema = z.object({
            status: z.enum(['approved', 'flagged', 'removed'])
        })

        const parsed = StatusSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid status' })
        }

        try {
            const post = await prisma.post.update({
                where: { id },
                data: { moderationStatus: parsed.data.status },
                select: { id: true, moderationStatus: true }
            })

            return reply.send({ post })
        } catch (error: any) {
            if (error.code === 'P2025') {
                return reply.status(404).send({ error: 'Post not found' })
            }
            throw error
        }
    })

    app.delete('/posts/:id', { preHandler: requireAuth }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const user = request.user as { sub: string }

        const post = await prisma.post.findUnique({
            where: { id },
            select: { authorId: true }
        })

        if (!post) return reply.status(404).send({ error: 'Post not found' })
        if (post.authorId !== user.sub) return reply.status(403).send({ error: 'Forbidden' })

        await prisma.post.delete({ where: { id } })
        return reply.send({ message: 'Post deleted' })
    })
}
