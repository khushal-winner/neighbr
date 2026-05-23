"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupRoutes = groupRoutes;
const auth_1 = require("../plugins/auth");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const zod_1 = require("zod");
const redis_1 = require("../plugins/redis");
async function userBelongsToCommunity(userId, communityId) {
    const row = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { communityId: true },
    });
    return row?.communityId === communityId;
}
async function groupRoutes(app) {
    // get /chat/group/:communityId
    // get or auto-create the group thread for a commnity block
    // every coomunity has exactly one group thread - created lazily on first access
    app.get('/chat/group/:communityId', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const user = request.user;
        const { communityId } = request.params;
        if (!(await userBelongsToCommunity(user.sub, communityId))) {
            return reply.status(403).send({ error: 'You are not in this community' });
        }
        // find or create the group thread for this community
        let thread = await prisma_1.default.chatThread.findFirst({
            where: {
                type: 'group', communityId
            },
        });
        if (!thread) {
            thread = await prisma_1.default.chatThread.create({
                data: { type: 'group', communityId }
            });
        }
        // auto-join if user isnt a participant yet , add them 
        await prisma_1.default.chatParticipant.upsert({
            where: {
                threadId_userId: { threadId: thread.id, userId: user.sub },
            },
            create: {
                threadId: thread.id, userId: user.sub
            },
            update: {}
        });
        return reply.send({ thread });
    });
    // post /chat/group/:communityId/message
    // send a message to the community group chat
    app.post('/chat/group/:communityId/message', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const Schema = zod_1.z.object({
            body: zod_1.z.string().min(1).max(2000),
        });
        const parsed = Schema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors });
        }
        const sender = request.user;
        const { communityId } = request.params;
        if (!(await userBelongsToCommunity(sender.sub, communityId))) {
            return reply.status(403).send({ error: 'You are not in this community' });
        }
        const thread = await prisma_1.default.chatThread.findFirst({
            where: { type: 'group', communityId },
        });
        if (!thread) {
            return reply.status(404).send({ error: 'Group thread not found - open the group chat first' });
        }
        const message = await prisma_1.default.chatMessage.create({
            data: {
                threadId: thread.id,
                senderId: sender.sub,
                body: parsed.data.body
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        displayName: true,
                    }
                }
            }
        });
        // publish to community channel - gateway delivera to all online community members
        const redis = (0, redis_1.getRedis)();
        await redis.publish(`ws:community:${communityId}`, JSON.stringify({
            type: 'group_message',
            messageId: message.id,
            threadId: thread.id,
            senderId: sender.sub,
            senderName: message.sender.displayName,
            communityId,
            body: message.body,
            createdAt: message.createdAt.toISOString(),
        }));
        return reply.status(201).send({ message });
    });
    // GET /chat/group/:communityId/messages
    // paginated group message history
    app.get('/chat/group/:communityId/messages', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const user = request.user;
        const { communityId } = request.params;
        if (!(await userBelongsToCommunity(user.sub, communityId))) {
            return reply.status(403).send({ error: 'You are not in this community' });
        }
        let thread = await prisma_1.default.chatThread.findFirst({
            where: { type: 'group', communityId },
        });
        if (!thread) {
            thread = await prisma_1.default.chatThread.create({
                data: { type: 'group', communityId },
            });
        }
        await prisma_1.default.chatParticipant.upsert({
            where: {
                threadId_userId: { threadId: thread.id, userId: user.sub },
            },
            create: { threadId: thread.id, userId: user.sub },
            update: {},
        });
        const query = request.query;
        const limit = Math.min(parseInt(query.limit ?? '30', 10), 100);
        const cursor = query.cursor ? new Date(query.cursor) : new Date();
        const messages = await prisma_1.default.chatMessage.findMany({
            where: {
                threadId: thread.id,
                createdAt: { lt: cursor },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                sender: {
                    select: {
                        id: true,
                        displayName: true,
                    },
                },
            },
        });
        const nextCursor = messages.length === limit
            ? messages[messages.length - 1].createdAt.toISOString()
            : null;
        return reply.send({ messages, nextCursor });
    });
}
