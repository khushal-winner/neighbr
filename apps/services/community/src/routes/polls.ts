import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../plugins/prisma'
import { requireAuth } from '../plugins/auth'

export async function pollRoutes(app: FastifyInstance) {

    // POST /polls
    // any verified resident can create a poll in their community
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

        const user = request.user as { sub: string; communityId: string | null }

        if (!user.communityId) {
            return reply.status(400).send({
                error: 'You must verify your address before creating polls',
            })
        }

        const poll = await prisma.poll.create({
            data: {
                communityId: user.communityId,
                createdById: user.sub,
                question: body.data.question,
                closesAt: body.data.closesAt ? new Date(body.data.closesAt) : null,
                options: {
                    create: body.data.options.map(text => ({ text })),
                },
            },
            include: {
                options: true,
            },
        })

        return reply.status(201).send({ poll })
    })


    // GET /polls/:pollId
    // get poll with current vote tallies
    // public — anyone can see poll results
    app.get('/polls/:pollId', async (request, reply) => {
        const { pollId } = request.params as { pollId: string }

        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: {
                options: {
                    include: {
                        _count: { select: { votes: true } },
                    },
                },
                _count: { select: { votes: true } },
            },
        })

        if (!poll) {
            return reply.status(404).send({ error: 'Poll not found' })
        }

        const isClosed = poll.closesAt
            ? new Date() > poll.closesAt
            : false

        // shape response — add vote count per option and percentage
        const totalVotes = poll._count.votes

        const options = poll.options.map(opt => ({
            id: opt.id,
            text: opt.text,
            votes: opt._count.votes,
            percentage: totalVotes > 0
                ? Math.round((opt._count.votes / totalVotes) * 100)
                : 0,
        }))

        return reply.send({
            poll: {
                id: poll.id,
                question: poll.question,
                communityId: poll.communityId,
                closesAt: poll.closesAt,
                isClosed,
                totalVotes,
                options,
            },
        })
    })


    // POST /polls/:pollId/vote
    // cast a vote — one per user per poll enforced by DB unique constraint
    app.post(
        '/polls/:pollId/vote',
        { preHandler: requireAuth },
        async (request, reply) => {
            const { pollId } = request.params as { pollId: string }
            const user = request.user as { sub: string; communityId: string | null }

            const Schema = z.object({
                optionId: z.string().uuid(),
            })

            const body = Schema.safeParse(request.body)
            if (!body.success) {
                return reply.status(400).send({ error: 'optionId is required' })
            }

            // verify poll exists and belongs to user's community
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

            if (poll.communityId !== user.communityId) {
                return reply.status(403).send({
                    error: 'You can only vote in your own community polls',
                })
            }

            if (poll.closesAt && new Date() > poll.closesAt) {
                return reply.status(400).send({ error: 'This poll is closed' })
            }

            // verify option belongs to this poll
            const option = await prisma.pollOption.findUnique({
                where: { id: body.data.optionId },
                select: { id: true, pollId: true },
            })

            if (!option || option.pollId !== pollId) {
                return reply.status(400).send({ error: 'Invalid option for this poll' })
            }

            try {
                // unique constraint [pollId, userId] prevents double voting at DB level
                // if user already voted this throws and we catch it below
                await prisma.pollVote.create({
                    data: {
                        pollId,
                        optionId: body.data.optionId,
                        userId: user.sub,
                    },
                })
            } catch (err: any) {
                // Prisma unique constraint violation code
                if (err?.code === 'P2002') {
                    return reply.status(409).send({ error: 'You have already voted in this poll' })
                }
                throw err
            }

            return reply.status(201).send({ message: 'Vote recorded' })
        }
    )


    // GET /communities/:communityId/polls
    // list all polls for a community — newest first
    app.get(
        '/communities/:communityId/polls',
        async (request, reply) => {
            const { communityId } = request.params as { communityId: string }

            const query = request.query as { cursor?: string; limit?: string }
            const limit = Math.min(parseInt(query.limit ?? '10', 10), 50)
            const cursor = query.cursor ? new Date(query.cursor) : new Date()

            const polls = await prisma.poll.findMany({
                where: {
                    communityId,
                    createdAt: { lt: cursor },
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    options: {
                        include: {
                            _count: { select: { votes: true } },
                        },
                    },
                    _count: { select: { votes: true } },
                },
            })

            const nextCursor = polls.length === limit
                ? polls[polls.length - 1].createdAt.toISOString()
                : null

            return reply.send({ polls, nextCursor })
        }
    )

}