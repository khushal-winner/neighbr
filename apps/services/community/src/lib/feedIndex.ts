import { getRedis } from '../plugins/redis'

const FEED_TTL_SECONDS = 60 * 60 * 24 * 7

export async function indexPostInFeed(
    communityId: string,
    postId: string,
    createdAt: Date,
): Promise<void> {
    const redis = getRedis()
    const key = `feed:${communityId}`
    const score = createdAt.getTime()

    await redis.zadd(key, score, postId)
    await redis.expire(key, FEED_TTL_SECONDS)

    const count = await redis.zcard(key)
    if (count > 500) {
        await redis.zremrangebyrank(key, 0, count - 501)
    }
}

export async function notifyFeedPostApproved(
    communityId: string,
    postId: string,
    title: string,
): Promise<void> {
    const redis = getRedis()
    await redis.publish(
        `ws:community:${communityId}`,
        JSON.stringify({
            type: 'post_approved',
            postId,
            communityId,
            title,
            timestamp: new Date().toISOString(),
        }),
    )
}
