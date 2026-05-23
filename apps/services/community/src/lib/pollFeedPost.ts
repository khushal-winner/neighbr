import prisma from '../plugins/prisma'
import { indexPostInFeed, notifyFeedPostApproved } from './feedIndex'

/** Ensures every block poll has an approved feed post so neighbours see it on /feed */
export async function ensurePollFeedPost(pollId: string): Promise<string | null> {
    try {
        return await ensurePollFeedPostInner(pollId)
    } catch (err) {
        console.error('[Poll] ensurePollFeedPost failed:', pollId, err)
        return null
    }
}

async function ensurePollFeedPostInner(pollId: string): Promise<string | null> {
    const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        select: {
            id: true,
            question: true,
            communityId: true,
            createdById: true,
            createdAt: true,
            feedPost: { select: { id: true } },
        },
    })

    if (!poll) return null

    if (poll.feedPost?.id) {
        return poll.feedPost.id
    }

    const existing = await prisma.post.findFirst({
        where: { pollId: poll.id },
        select: { id: true, communityId: true, title: true },
    })

    if (existing) {
        await indexPostInFeed(poll.communityId, existing.id, poll.createdAt)
        return existing.id
    }

    const post = await prisma.post.create({
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
    })

    await indexPostInFeed(poll.communityId, post.id, poll.createdAt)
    await notifyFeedPostApproved(poll.communityId, post.id, post.title)

    return post.id
}
