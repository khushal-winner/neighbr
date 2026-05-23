"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shapePoll = shapePoll;
exports.fetchPollById = fetchPollById;
exports.fetchPollsForCommunity = fetchPollsForCommunity;
exports.getUserCommunityId = getUserCommunityId;
const prisma_1 = __importDefault(require("../plugins/prisma"));
const pollInclude = {
    options: {
        include: {
            _count: { select: { votes: true } },
        },
    },
    _count: { select: { votes: true } },
    feedPost: { select: { id: true } },
};
function shapePoll(poll, myVoteOptionId = null) {
    const totalVotes = poll._count.votes;
    const isClosed = poll.closesAt ? new Date() > poll.closesAt : false;
    return {
        id: poll.id,
        question: poll.question,
        communityId: poll.communityId,
        closesAt: poll.closesAt?.toISOString() ?? null,
        createdAt: poll.createdAt.toISOString(),
        isClosed,
        totalVotes,
        options: poll.options.map((opt) => ({
            id: opt.id,
            text: opt.text,
            votes: opt._count.votes,
            percentage: totalVotes > 0
                ? Math.round((opt._count.votes / totalVotes) * 100)
                : 0,
        })),
        myVoteOptionId,
        hasVoted: myVoteOptionId !== null,
        feedPostId: poll.feedPost?.id ?? null,
    };
}
async function fetchPollById(pollId, userId) {
    const poll = await prisma_1.default.poll.findUnique({
        where: { id: pollId },
        include: pollInclude,
    });
    if (!poll)
        return null;
    let myVoteOptionId = null;
    if (userId) {
        const vote = await prisma_1.default.pollVote.findUnique({
            where: { pollId_userId: { pollId, userId } },
            select: { optionId: true },
        });
        myVoteOptionId = vote?.optionId ?? null;
    }
    return shapePoll(poll, myVoteOptionId);
}
async function fetchPollsForCommunity(communityId, opts = {}) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const polls = await prisma_1.default.poll.findMany({
        where: {
            communityId,
            ...(opts.cursor
                ? { createdAt: { lt: new Date(opts.cursor) } }
                : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: pollInclude,
    });
    let votesByPollId = {};
    if (opts.userId && polls.length > 0) {
        const votes = await prisma_1.default.pollVote.findMany({
            where: {
                userId: opts.userId,
                pollId: { in: polls.map((p) => p.id) },
            },
            select: { pollId: true, optionId: true },
        });
        votesByPollId = Object.fromEntries(votes.map((v) => [v.pollId, v.optionId]));
    }
    const nextCursor = polls.length === limit
        ? polls[polls.length - 1].createdAt.toISOString()
        : null;
    return {
        polls: polls.map((p) => shapePoll(p, votesByPollId[p.id] ?? null)),
        nextCursor,
    };
}
async function getUserCommunityId(userId) {
    const user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        select: { communityId: true },
    });
    return user?.communityId ?? null;
}
