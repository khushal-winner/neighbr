import { FastifyInstance } from "fastify"
import { requireAuth } from "../plugins/auth"
import { z } from "zod"
import prisma from "../plugins/prisma"
import { getRedis } from "../plugins/redis"



export async function dmRoutes(app: FastifyInstance) {

    // post /chat/dm
    // start or retrieve a DM thread bw two user
    // idemponent - calling twice returns the same thread
    app.post('/chat/dm', { preHandler: requireAuth }, async (request, reply) => {
        const Schema = z.object({
            recipientId: z.string().uuid(),
        })
        const body = Schema.safeParse(request.body)
        if (!body.success) {
            return reply.status(400).send({ error: body.error })
        }

        const sender = request.user as { sub: string }
        const { recipientId } = body.data

        if (sender.sub === recipientId) {
            return reply.status(400).send({ error: 'Cannot send DM to yourself' })
        }


        // verify recipient exists and is verified - no DMs to unverified accounts
        const recipient = await prisma.user.findUnique({
            where: {
                id: recipientId
            }
        })
        if (!recipient) {
            return reply.status(404).send({ error: 'User not found' })
        }
        if (recipient.verificationLevel === 'unverified') {
            return reply.status(400).send({ error: 'Cannot message unverified user' })
        }

        // find existing thread between these two users
        // a DM thread has exactly two participants - look for one that has both
        const exisiting = await prisma.chatThread.findFirst({
            where: {
                type: 'dm',
                participants: {
                    every: {
                        userId: {
                            in: [sender.sub, recipientId]
                        },
                    },
                    some: {
                        userId: sender.sub
                    },
                }
            },
            include: {
                participants: {
                    select: { userId: true },
                }
            }
        })


        // if both users are in the same thread its the DM thread
        const existingDM = exisiting?.participants.length === 2 ? exisiting : null

        if (existingDM) {
            return reply.status(200).send({ threadId: existingDM.id })
        }

        // no thread yet - create one with both pariticipants
        const thread = await prisma.chatThread.create({
            data: {
                type: 'dm',
                participants: {
                    create: [
                        {
                            userId: sender.sub
                        },
                        {
                            userId: recipientId
                        }
                    ]
                },
            },
            include: {
                participants: { select: { userId: true } }
            }
        })

        return reply.status(201).send({ thread })
    })


    // post /chat/dm/:threadId/message
    // send a message in a DM thread
    app.post('/chat/dm/:threadId/message', { preHandler: requireAuth }, async (request, reply) => {
        const Schema = z.object({
            body: z.string().min(1).max(2000),
        })

        const parsed = Schema.safeParse(request.body)
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid request body' })
        }

        const sender = request.user as { sub: string }
        const { threadId } = request.params as { threadId: string }

        // verify sender is a participant in this thred
        const participation = await prisma.chatParticipant.findUnique({
            where: {
                threadId_userId: {
                    threadId,
                    userId: sender.sub
                }
            }, include: {
                thread: {
                    include: {
                        participants: { select: { userId: true } }
                    }
                }
            }
        })

        if (!participation) {
            return reply.status(403).send({ error: 'You are not a participant in this thread' })
        }

        // create message
        const message = await prisma.chatMessage.create({
            data: {
                threadId,
                senderId: sender.sub,
                body: parsed.data.body
            },
            include: {
                thread: { select: { type: true } }
            }
        })

        // real-time delivery - publish to each other partiiciapnt's redis channel
        // websocket gateway is subscribed to ws:user:{id} for online users
        const redis = getRedis()

        const payload = JSON.stringify({
            type: 'chat-message',
            messageId: message.id,
            threadId,
            senderId: sender.sub,
            body: message.body,
            createdAt: message.createdAt.toISOString(),
        })

        const otherParticipants = participation.thread.participants.filter(p => p.userId !== sender.sub)

        // pipeline - one redis round trip for all recipients 
        const pipeline = redis.pipeline()
        for (const participant of otherParticipants) {
            pipeline.publish(`ws:user:${participant.userId}`, payload)
        }
        await pipeline.exec()

        return reply.status(201).send({ message })
    })


    // get /chat/dm/:threadId/messages
    //  paginated message history - cursor is message createdAt timestamp
    app.get('/chat/dm/:threadId/messages', { preHandler: requireAuth }, async (request, reply) => {
        const sender = request.user as { sub: string }
        const { threadId } = request.params as { threadId: string }

        const query = request.query as { cursor?: string; limit?: string }
        const limit = Math.min(parseInt(query.limit ?? '30', 10), 100) // this means max 100 messages per request
        const cursor = query.cursor ? new Date(query.cursor) : new Date()

        // verify membership before returning history
        const membership = await prisma.chatParticipant.findUnique({
            where: {
                threadId_userId: {
                    userId: sender.sub,
                    threadId
                }
            }
        })

        if (!membership) {
            return reply.status(403).send({ error: 'Forbidden' })
        }

        // fetch messages
        const messages = await prisma.chatMessage.findMany({
            where: {
                threadId,
                createdAt: {
                    lt: cursor
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: limit
        })

        const nextCursor = messages.length === limit ? messages[messages.length - 1].createdAt.toISOString() : null

        return reply.send({ messages, nextCursor })
    })

    // patch /chat/dm/:threadId/read
    // mark all messages in a thread as read up to now
    app.patch('/chat/dm/:threadId/read', { preHandler: requireAuth }, async (request, reply) => {
        const sender = request.user as { sub: string }
        const { threadId } = request.params as { threadId: string }

        // verify membership
        const membership = await prisma.chatParticipant.findUnique({
            where: {
                threadId_userId: {
                    userId: sender.sub,
                    threadId
                }
            }
        })

        if (!membership) {
            return reply.status(403).send({ error: 'Forbidden' })
        }

        // mark all messages as read
        await prisma.chatMessage.updateMany({
            where: {
                threadId,
                senderId: { not: sender.sub },
                readAt: null
            },
            data: {
                readAt: new Date()
            }
        })

        return reply.send({ message: 'Messages marked as read' })
    })

    // GET /chat/thread
    // list all DM threads for the current user with last message preview
    app.get('/chat/threads', { preHandler: requireAuth }, async (request, reply) => {
        const user = request.user as { sub: string }

        const threads = await prisma.chatThread.findMany({
            where: {
                type: 'dm',
                participants: {
                    some: { userId: user.sub },
                }
            },
            include: {
                participants: {
                    where: {
                        userId: { not: user.sub },
                    },
                    include: {
                        // we only need the display name of the other person
                    }
                },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1, // last message preview
                }
            },
            orderBy: {
                // order by most recent messages - prisma doesnt support this natively
                // so we do createdAt of the thread as approximation , good enough for now
                createdAt: 'desc'
            }
        })

        return reply.send({ threads })
    })
}
