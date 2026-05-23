"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indexPostInFeed = indexPostInFeed;
exports.notifyFeedPostApproved = notifyFeedPostApproved;
const redis_1 = require("../plugins/redis");
const FEED_TTL_SECONDS = 60 * 60 * 24 * 7;
async function indexPostInFeed(communityId, postId, createdAt) {
    const redis = (0, redis_1.getRedis)();
    const key = `feed:${communityId}`;
    const score = createdAt.getTime();
    await redis.zadd(key, score, postId);
    await redis.expire(key, FEED_TTL_SECONDS);
    const count = await redis.zcard(key);
    if (count > 500) {
        await redis.zremrangebyrank(key, 0, count - 501);
    }
}
async function notifyFeedPostApproved(communityId, postId, title) {
    const redis = (0, redis_1.getRedis)();
    await redis.publish(`ws:community:${communityId}`, JSON.stringify({
        type: 'post_approved',
        postId,
        communityId,
        title,
        timestamp: new Date().toISOString(),
    }));
}
