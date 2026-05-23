"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dmRoutes = dmRoutes;
const auth_1 = require("../plugins/auth");
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const redis_1 = require("../plugins/redis");
async function dmRoutes(app) {
    // post /chat/dm
    // start or retrieve a DM thread bw two user
    // idemponent - calling twice returns the same thread
    app.post('/chat/dm', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const Schema = zod_1.z.object({
            recipientId: zod_1.z.string().uuid(),
        });
        const body = Schema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: body.error });
        }
        const sender = request.user;
        const { recipientId } = body.data;
        if (sender.sub === recipientId) {
            return reply.status(400).send({ error: 'Cannot send DM to yourself' });
        }
        // verify recipient exists and is verified - no DMs to unverified accounts
        const recipient = await prisma_1.default.user.findUnique({
            where: {
                id: recipientId
            }
        });
        if (!recipient) {
            return reply.status(404).send({ error: 'User not found' });
        }
        if (recipient.verificationLevel === 'unverified') {
            return reply.status(400).send({ error: 'Cannot message unverified user' });
        }
        // find existing 1:1 DM (both users must be participants, exactly two total)
        const candidates = await prisma_1.default.chatThread.findMany({
            where: {
                type: 'dm',
                AND: [
                    { participants: { some: { userId: sender.sub } } },
                    { participants: { some: { userId: recipientId } } },
                ],
            },
            include: {
                participants: { select: { userId: true } },
            },
        });
        const existingDM = candidates.find((t) => t.participants.length === 2 &&
            t.participants.every((p) => p.userId === sender.sub || p.userId === recipientId)) ?? null;
        if (existingDM) {
            return reply.status(200).send({
                threadId: existingDM.id,
                thread: existingDM,
            });
        }
        // no thread yet - create one with both pariticipants
        const thread = await prisma_1.default.chatThread.create({
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
        });
        return reply.status(201).send({ thread });
    });
    // post /chat/dm/:threadId/message
    // send a message in a DM thread
    app.post('/chat/dm/:threadId/message', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const Schema = zod_1.z.object({
            body: zod_1.z.string().min(1).max(2000),
        });
        const parsed = Schema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid request body' });
        }
        const sender = request.user;
        const { threadId } = request.params;
        // verify sender is a participant in this thred
        const participation = await prisma_1.default.chatParticipant.findUnique({
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
        });
        if (!participation) {
            return reply.status(403).send({ error: 'You are not a participant in this thread' });
        }
        // create message
        const message = await prisma_1.default.chatMessage.create({
            data: {
                threadId,
                senderId: sender.sub,
                body: parsed.data.body
            },
            include: {
                thread: { select: { type: true } }
            }
        });
        // real-time delivery - publish to each other partiiciapnt's redis channel
        // websocket gateway is subscribed to ws:user:{id} for online users
        const redis = (0, redis_1.getRedis)();
        const payload = JSON.stringify({
            type: 'chat_message',
            messageId: message.id,
            threadId,
            senderId: sender.sub,
            body: message.body,
            createdAt: message.createdAt.toISOString(),
        });
        const otherParticipants = participation.thread.participants.filter(p => p.userId !== sender.sub);
        // pipeline - one redis round trip for all recipients 
        const pipeline = redis.pipeline();
        for (const participant of otherParticipants) {
            pipeline.publish(`ws:user:${participant.userId}`, payload);
        }
        await pipeline.exec();
        return reply.status(201).send({ message });
    });
    // get /chat/dm/:threadId/messages
    //  paginated message history - cursor is message createdAt timestamp
    app.get('/chat/dm/:threadId/messages', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const sender = request.user;
        const { threadId } = request.params;
        const query = request.query;
        const limit = Math.min(parseInt(query.limit ?? '30', 10), 100); // this means max 100 messages per request
        const cursor = query.cursor ? new Date(query.cursor) : new Date();
        // verify membership before returning history
        const membership = await prisma_1.default.chatParticipant.findUnique({
            where: {
                threadId_userId: {
                    userId: sender.sub,
                    threadId
                }
            }
        });
        if (!membership) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        // fetch messages
        const messages = await prisma_1.default.chatMessage.findMany({
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
        });
        const nextCursor = messages.length === limit ? messages[messages.length - 1].createdAt.toISOString() : null;
        // find recipient
        const recipientParticipation = await prisma_1.default.chatParticipant.findFirst({
            where: {
                threadId,
                userId: { not: sender.sub }
            }
        });
        let recipientName = 'Neighbour';
        let recipientId = null;
        if (recipientParticipation) {
            recipientId = recipientParticipation.userId;
            const recipientUser = await prisma_1.default.user.findUnique({
                where: { id: recipientParticipation.userId },
                select: { displayName: true }
            });
            if (recipientUser) {
                recipientName = recipientUser.displayName;
            }
        }
        return reply.send({ messages, nextCursor, recipientName, recipientId });
    });
    // patch /chat/dm/:threadId/read
    // mark all messages in a thread as read up to now
    app.patch('/chat/dm/:threadId/read', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const sender = request.user;
        const { threadId } = request.params;
        // verify membership
        const membership = await prisma_1.default.chatParticipant.findUnique({
            where: {
                threadId_userId: {
                    userId: sender.sub,
                    threadId
                }
            }
        });
        if (!membership) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        // mark all messages as read
        await prisma_1.default.chatMessage.updateMany({
            where: {
                threadId,
                senderId: { not: sender.sub },
                readAt: null
            },
            data: {
                readAt: new Date()
            }
        });
        return reply.send({ message: 'Messages marked as read' });
    });
    // GET /chat/thread
    // list all DM threads for the current user with last message preview
    app.get('/chat/threads', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const user = request.user;
        const threads = await prisma_1.default.chatThread.findMany({
            where: {
                type: 'dm',
                participants: {
                    some: { userId: user.sub },
                }
            },
            include: {
                participants: true,
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
        });
        // Fetch other users' displayNames
        const otherUserIds = threads.map(t => {
            const other = t.participants.find(p => p.userId !== user.sub);
            return other?.userId;
        }).filter((id) => !!id);
        const users = await prisma_1.default.user.findMany({
            where: { id: { in: otherUserIds } },
            select: { id: true, displayName: true }
        });
        const userMap = new Map(users.map(u => [u.id, u.displayName]));
        const threadsWithNames = threads
            .map((t) => {
            const other = t.participants.find((p) => p.userId !== user.sub);
            const otherName = other
                ? (userMap.get(other.userId) ?? 'Neighbour')
                : 'Neighbour';
            return {
                ...t,
                recipientId: other?.userId,
                recipientName: otherName,
            };
        })
            .sort((a, b) => {
            const aTime = a.messages[0]?.createdAt ?? a.createdAt;
            const bTime = b.messages[0]?.createdAt ?? b.createdAt;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
        // one conversation per neighbour — keep the thread with latest activity
        const byOtherUser = new Map();
        for (const thread of threadsWithNames) {
            const otherId = thread.recipientId;
            if (!otherId)
                continue;
            const existing = byOtherUser.get(otherId);
            if (!existing) {
                byOtherUser.set(otherId, thread);
                continue;
            }
            const threadTime = new Date(thread.messages[0]?.createdAt ?? thread.createdAt).getTime();
            const existingTime = new Date(existing.messages[0]?.createdAt ?? existing.createdAt).getTime();
            if (threadTime > existingTime) {
                byOtherUser.set(otherId, thread);
            }
        }
        const dedupedThreads = Array.from(byOtherUser.values()).sort((a, b) => {
            const aTime = a.messages[0]?.createdAt ?? a.createdAt;
            const bTime = b.messages[0]?.createdAt ?? b.createdAt;
            return new Date(bTime).getTime() - new Date(aTime).getTime();
        });
        return reply.send({ threads: dedupedThreads });
    });
}
