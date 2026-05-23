import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import prisma from '../plugins/prisma'
import { requireAuth } from '../plugins/auth'
import {
    fetchPollById,
    fetchPollsForCommunity,
    getUserCommunityId,
} from '../lib/polls'
import { ensurePollFeedPost } from '../lib/pollFeedPost'
import { indexPostInFeed, notifyFeedPostApproved } from '../lib/feedIndex'

async function optionalUserId(request: FastifyRequest): Promise<string | null> {
    try {
        await request.jwtVerify()
        return (request.user as { sub: string }).sub
    } catch {
        return null
    }
}

export async function pollRoutes(app: FastifyInstance) {
    // POST /polls — verified residents create block polls
    app.post('/polls', { preHandler: requireAuth }, async (request, reply) => {
        const Schema = z.object({
            question: z.string().min(5).max(300),
            options: z.array(z.string().min(1).max(100)).min(2).max(6),
            closesAt: z.string().datetime().optional(),
        })

        const body = Schema.safeParse(request.body)
        if (!body.success) {
            return reply.status(400).send({
                error: 'Invalid request',
                details: body.error.flatten().fieldErrors,
            })
        }

        const jwtUser = request.user as { sub: string }
        const communityId = await getUserCommunityId(jwtUser.sub)

        if (!communityId) {
            return reply.status(400).send({
                error: 'You must verify your address before creating polls',
            })
        }

        const poll = await prisma.poll.create({
            data: {
                communityId,
                createdById: jwtUser.sub,
                question: body.data.question.trim(),
                closesAt: body.data.closesAt ? new Date(body.data.closesAt) : null,
                options: {
                    create: body.data.options.map((text) => ({ text: text.trim() })),
                },
            },
            include: {
                options: {
                    include: { _count: { select: { votes: true } } },
                },
                _count: { select: { votes: true } },
            },
        })

        const post = await prisma.post.create({
            data: {
                authorId: jwtUser.sub,
                communityId,
                type: 'poll',
                title: poll.question.slice(0, 200),
                body: poll.question,
                moderationStatus: 'approved',
                pollId: poll.id,
                imageUrls: [],
                createdAt: poll.createdAt,
            },
        })

        await indexPostInFeed(communityId, post.id, poll.createdAt)
        await notifyFeedPostApproved(communityId, post.id, post.title)

        await ensurePollFeedPost(poll.id)
        const shaped = await fetchPollById(poll.id, jwtUser.sub)
        return reply.status(201).send({ poll: shaped })
    })

    // GET /polls/:pollId
    app.get('/polls/:pollId', async (request, reply) => {
        const { pollId } = request.params as { pollId: string }
        const userId = await optionalUserId(request)
        await ensurePollFeedPost(pollId)
        const poll = await fetchPollById(pollId, userId)

        if (!poll) {
            return reply.status(404).send({ error: 'Poll not found' })
        }

        return reply.send({ poll })
    })

    // POST /polls/:pollId/vote
    app.post(
        '/polls/:pollId/vote',
        { preHandler: requireAuth },
        async (request, reply) => {
            const { pollId } = request.params as { pollId: string }
            const jwtUser = request.user as { sub: string }

            const Schema = z.object({
                optionId: z.string().uuid(),
            })

            const body = Schema.safeParse(request.body)
            if (!body.success) {
                return reply.status(400).send({ error: 'optionId is required' })
            }

            const communityId = await getUserCommunityId(jwtUser.sub)
            if (!communityId) {
                return reply.status(400).send({
                    error: 'You must verify your address before voting',
                })
            }

            const poll = await prisma.poll.findUnique({
                where: { id: pollId },
                select: {
                    id: true,
                    communityId: true,
                    closesAt: true,
                },
            })

            if (!poll) {
                return reply.status(404).send({ error: 'Poll not found' })
            }

            if (poll.communityId !== communityId) {
                return reply.status(403).send({
                    error: 'You can only vote in your own community polls',
                })
            }

            if (poll.closesAt && new Date() > poll.closesAt) {
                return reply.status(400).send({ error: 'This poll is closed' })
            }

            const option = await prisma.pollOption.findUnique({
                where: { id: body.data.optionId },
                select: { id: true, pollId: true },
            })

            if (!option || option.pollId !== pollId) {
                return reply.status(400).send({ error: 'Invalid option for this poll' })
            }

            try {
                await prisma.pollVote.create({
                    data: {
                        pollId,
                        optionId: body.data.optionId,
                        userId: jwtUser.sub,
                    },
                })
            } catch (err: unknown) {
                const code = (err as { code?: string })?.code
                if (code === 'P2002') {
                    return reply.status(409).send({
                        error: 'You have already voted in this poll',
                    })
                }
                throw err
            }

            const shaped = await fetchPollById(pollId, jwtUser.sub)
            return reply.status(201).send({
                message: 'Vote recorded',
                poll: shaped,
            })
        },
    )

    // GET /communities/:communityId/polls
    app.get(
        '/communities/:communityId/polls',
        { preHandler: requireAuth },
        async (request, reply) => {
            const jwtUser = request.user as { sub: string }
            const { communityId } = request.params as { communityId: string }
            const query = request.query as { cursor?: string; limit?: string }

            const userCommunityId = await getUserCommunityId(jwtUser.sub)
            if (!userCommunityId || userCommunityId !== communityId) {
                return reply.status(403).send({ error: 'You are not in this community' })
            }

            const limit = Math.min(parseInt(query.limit ?? '20', 10), 50)
            const { polls, nextCursor } = await fetchPollsForCommunity(communityId, {
                cursor: query.cursor,
                limit,
                userId: jwtUser.sub,
            })

            return reply.send({ polls, nextCursor })
        },
    )
}
