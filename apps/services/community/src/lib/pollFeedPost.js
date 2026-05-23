"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePollFeedPost = ensurePollFeedPost;
const prisma_1 = __importDefault(require("../plugins/prisma"));
const feedIndex_1 = require("./feedIndex");
/** Ensures every block poll has an approved feed post so neighbours see it on /feed */
async function ensurePollFeedPost(pollId) {
    try {
        return await ensurePollFeedPostInner(pollId);
    }
    catch (err) {
        console.error('[Poll] ensurePollFeedPost failed:', pollId, err);
        return null;
    }
}
async function ensurePollFeedPostInner(pollId) {
    const poll = await prisma_1.default.poll.findUnique({
        where: { id: pollId },
        select: {
            id: true,
            question: true,
            communityId: true,
            createdById: true,
            createdAt: true,
            feedPost: { select: { id: true } },
        },
    });
    if (!poll)
        return null;
    if (poll.feedPost?.id) {
        return poll.feedPost.id;
    }
    const existing = await prisma_1.default.post.findFirst({
        where: { pollId: poll.id },
        select: { id: true, communityId: true, title: true },
    });
    if (existing) {
        await (0, feedIndex_1.indexPostInFeed)(poll.communityId, existing.id, poll.createdAt);
        return existing.id;
    }
    const post = await prisma_1.default.post.create({
        data: {
            authorId: poll.createdById,
            communityId: poll.communityId,
            type: 'poll',
            title: poll.question.slice(0, 200),
            body: poll.question,
            moderationStatus: 'approved',
            pollId: poll.id,
            imageUrls: [],
            createdAt: poll.createdAt,
        },
    });
    await (0, feedIndex_1.indexPostInFeed)(poll.communityId, post.id, poll.createdAt);
    await (0, feedIndex_1.notifyFeedPostApproved)(poll.communityId, post.id, post.title);
    return post.id;
}
