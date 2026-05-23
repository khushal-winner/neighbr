"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmergencyNotification = sendEmergencyNotification;
exports.flushCommunity = flushCommunity;
const firebase_1 = require("../plugins/firebase");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const redis_1 = require("../plugins/redis");
// fetch FCM tokens for users in a community, excluding online and emergencyOnly users
async function getTokensForCommunity(communityId, excludeUserIds) {
    const users = await prisma_1.default.user.findMany({
        where: {
            communityId,
            id: excludeUserIds.length > 0 ? { notIn: excludeUserIds } : undefined,
            verificationLevel: { not: "unverified" },
        },
        select: {
            id: true,
            notificationPrefs: true,
            fcmTokens: {
                select: { token: true },
            },
        },
    });
    const tokens = [];
    for (const user of users) {
        const prefs = user.notificationPrefs;
        // emergencyOnly users only get emergency alerts, skip batch notifications
        if (prefs?.emergencyOnly === true)
            continue;
        // pushAlerts explicitly disables - respect the preference
        if (prefs?.pushAlerts === false)
            continue;
        for (const fcm of user.fcmTokens) {
            tokens.push(fcm.token);
        }
    }
    return tokens;
}
// send immediate notification for emergency posts - bypasses windowing
async function sendEmergencyNotification(post) {
    console.log(`[Notification] Emergency: ${post.postId}`);
    const tokens = await getTokensForCommunity(post.communityId, []);
    if (tokens.length === 0)
        return;
    await (0, firebase_1.sendMulticast)(tokens, "🚨 Emergency Alert", post.title, {
        type: "emergency",
        postId: post.postId,
        communityId: post.communityId,
    });
}
// flush one community's accumulated posts as a single batched notification
async function flushCommunity(communityId, posts) {
    if (posts.length === 0)
        return;
    console.log(`[Notification] Flushing ${posts.length} posts for community ${communityId}`);
    // get IDs of users currently online - they don't need a push notification
    // they are already saw the posts in their live feed via websocket
    const redis = (0, redis_1.getRedis)();
    const presenceKey = `presence:${communityId}`;
    const onlineMap = (await redis.hgetall(presenceKey));
    const cutoff = Date.now() / 1000 - 30; // online = active in last 30s
    const onlineUserIds = new Set(Object.entries(onlineMap ?? {})
        .filter(([, ts]) => parseInt(ts, 10) > cutoff)
        .map(([userId]) => userId));
    // fetch FCM tokens for offline users in this community
    // also respect emergencyOnly preference - these users only want emergency pushes
    const tokens = await getTokensForCommunity(communityId, [...onlineUserIds]);
    if (tokens.length === 0) {
        console.log(`[Notification] No offline users to notify in ${communityId}`);
        return;
    }
    // build a human-readable summary
    const title = posts.length === 1
        ? "1 new post on your street"
        : `${posts.length} new posts on your street`;
    // show the first post title as a preview
    const body = posts.length > 1
        ? posts[0].title + ` and ${posts.length - 1} more`
        : posts[0].title;
    await (0, firebase_1.sendMulticast)(tokens, title, body, {
        type: "batch",
        communityId,
        count: String(posts.length),
    });
}
