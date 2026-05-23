"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollRoutes = pollRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const auth_1 = require("../plugins/auth");
const polls_1 = require("../lib/polls");
const pollFeedPost_1 = require("../lib/pollFeedPost");
const feedIndex_1 = require("../lib/feedIndex");
async function optionalUserId(request) {
    try {
        await request.jwtVerify();
        return request.user.sub;
    }
    catch {
        return null;
    }
}
async function pollRoutes(app) {
    // POST /polls — verified residents create block polls
    app.post('/polls', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const Schema = zod_1.z.object({
            question: zod_1.z.string().min(5).max(300),
            options: zod_1.z.array(zod_1.z.string().min(1).max(100)).min(2).max(6),
            closesAt: zod_1.z.string().datetime().optional(),
        });
        const body = Schema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                error: 'Invalid request',
                details: body.error.flatten().fieldErrors,
            });
        }
        const jwtUser = request.user;
        const communityId = await (0, polls_1.getUserCommunityId)(jwtUser.sub);
        if (!communityId) {
            return reply.status(400).send({
                error: 'You must verify your address before creating polls',
            });
        }
        const poll = await prisma_1.default.poll.create({
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
        });
        const post = await prisma_1.default.post.create({
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
        });
        await (0, feedIndex_1.indexPostInFeed)(communityId, post.id, poll.createdAt);
        await (0, feedIndex_1.notifyFeedPostApproved)(communityId, post.id, post.title);
        await (0, pollFeedPost_1.ensurePollFeedPost)(poll.id);
        const shaped = await (0, polls_1.fetchPollById)(poll.id, jwtUser.sub);
        return reply.status(201).send({ poll: shaped });
    });
    // GET /polls/:pollId
    app.get('/polls/:pollId', async (request, reply) => {
        const { pollId } = request.params;
        const userId = await optionalUserId(request);
        await (0, pollFeedPost_1.ensurePollFeedPost)(pollId);
        const poll = await (0, polls_1.fetchPollById)(pollId, userId);
        if (!poll) {
            return reply.status(404).send({ error: 'Poll not found' });
        }
        return reply.send({ poll });
    });
    // POST /polls/:pollId/vote
    app.post('/polls/:pollId/vote', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const { pollId } = request.params;
        const jwtUser = request.user;
        const Schema = zod_1.z.object({
            optionId: zod_1.z.string().uuid(),
        });
        const body = Schema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: 'optionId is required' });
        }
        const communityId = await (0, polls_1.getUserCommunityId)(jwtUser.sub);
        if (!communityId) {
            return reply.status(400).send({
                error: 'You must verify your address before voting',
            });
        }
        const poll = await prisma_1.default.poll.findUnique({
            where: { id: pollId },
            select: {
                id: true,
                communityId: true,
                closesAt: true,
            },
        });
        if (!poll) {
            return reply.status(404).send({ error: 'Poll not found' });
        }
        if (poll.communityId !== communityId) {
            return reply.status(403).send({
                error: 'You can only vote in your own community polls',
            });
        }
        if (poll.closesAt && new Date() > poll.closesAt) {
            return reply.status(400).send({ error: 'This poll is closed' });
        }
        const option = await prisma_1.default.pollOption.findUnique({
            where: { id: body.data.optionId },
            select: { id: true, pollId: true },
        });
        if (!option || option.pollId !== pollId) {
            return reply.status(400).send({ error: 'Invalid option for this poll' });
        }
        try {
            await prisma_1.default.pollVote.create({
                data: {
                    pollId,
                    optionId: body.data.optionId,
                    userId: jwtUser.sub,
                },
            });
        }
        catch (err) {
            const code = err?.code;
            if (code === 'P2002') {
                return reply.status(409).send({
                    error: 'You have already voted in this poll',
                });
            }
            throw err;
        }
        const shaped = await (0, polls_1.fetchPollById)(pollId, jwtUser.sub);
        return reply.status(201).send({
            message: 'Vote recorded',
            poll: shaped,
        });
    });
    // GET /communities/:communityId/polls
    app.get('/communities/:communityId/polls', { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const jwtUser = request.user;
        const { communityId } = request.params;
        const query = request.query;
        const userCommunityId = await (0, polls_1.getUserCommunityId)(jwtUser.sub);
        if (!userCommunityId || userCommunityId !== communityId) {
            return reply.status(403).send({ error: 'You are not in this community' });
        }
        const limit = Math.min(parseInt(query.limit ?? '20', 10), 50);
        const { polls, nextCursor } = await (0, polls_1.fetchPollsForCommunity)(communityId, {
            cursor: query.cursor,
            limit,
            userId: jwtUser.sub,
        });
        return reply.send({ polls, nextCursor });
    });
}
