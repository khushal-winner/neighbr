import prisma from '../plugins/prisma'
import { ensurePollFeedPost } from './pollFeedPost'

export type PollWithCounts = {
    id: string
    question: string
    communityId: string
    closesAt: Date | null
    createdAt: Date
    feedPost?: { id: string } | null
    options: {
        id: string
        text: string
        _count: { votes: number }
    }[]
    _count: { votes: number }
}

export type ShapedPoll = {
    id: string
    question: string
    communityId: string
    closesAt: string | null
    createdAt: string
    isClosed: boolean
    totalVotes: number
    options: {
        id: string
        text: string
        votes: number
        percentage: number
    }[]
    myVoteOptionId: string | null
    hasVoted: boolean
    feedPostId: string | null
}

const pollInclude = {
    options: {
        include: {
            _count: { select: { votes: true } },
        },
    },
    _count: { select: { votes: true } },
    feedPost: { select: { id: true } },
} as const

export function shapePoll(
    poll: PollWithCounts,
    myVoteOptionId: string | null = null,
): ShapedPoll {
    const totalVotes = poll._count.votes
    const isClosed = poll.closesAt ? new Date() > poll.closesAt : false

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
            percentage:
                totalVotes > 0
                    ? Math.round((opt._count.votes / totalVotes) * 100)
                    : 0,
        })),
        myVoteOptionId,
        hasVoted: myVoteOptionId !== null,
        feedPostId: poll.feedPost?.id ?? null,
    }
}

export async function fetchPollById(
    pollId: string,
    userId?: string | null,
): Promise<ShapedPoll | null> {
    const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        include: pollInclude,
    })

    if (!poll) return null

    let myVoteOptionId: string | null = null
    if (userId) {
        const vote = await prisma.pollVote.findUnique({
            where: { pollId_userId: { pollId, userId } },
            select: { optionId: true },
        })
        myVoteOptionId = vote?.optionId ?? null
    }

    return shapePoll(poll, myVoteOptionId)
}

export async function fetchPollsForCommunity(
    communityId: string,
    opts: { cursor?: string; limit?: number; userId?: string | null } = {},
): Promise<{ polls: ShapedPoll[]; nextCursor: string | null }> {
    const limit = Math.min(opts.limit ?? 20, 50)

    const polls = await prisma.poll.findMany({
        where: {
            communityId,
            ...(opts.cursor
                ? { createdAt: { lt: new Date(opts.cursor) } }
                : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: pollInclude,
    })

    let votesByPollId: Record<string, string> = {}
    if (opts.userId && polls.length > 0) {
        const votes = await prisma.pollVote.findMany({
            where: {
                userId: opts.userId,
                pollId: { in: polls.map((p) => p.id) },
            },
            select: { pollId: true, optionId: true },
        })
        votesByPollId = Object.fromEntries(
            votes.map((v) => [v.pollId, v.optionId]),
        )
    }

    const nextCursor =
        polls.length === limit
            ? polls[polls.length - 1].createdAt.toISOString()
            : null

    return {
        polls: polls.map((p) => shapePoll(p, votesByPollId[p.id] ?? null)),
        nextCursor,
    }
}

export async function getUserCommunityId(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { communityId: true },
    })
    return user?.communityId ?? null
}
