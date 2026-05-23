"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.countOnlineFromPresence = countOnlineFromPresence;
exports.onlineUserIdsFromPresence = onlineUserIdsFromPresence;
exports.readPresenceMap = readPresenceMap;
const PRESENCE_WINDOW_SEC = 30;
function countOnlineFromPresence(presenceMap) {
    const cutoff = Date.now() / 1000 - PRESENCE_WINDOW_SEC;
    return Object.values(presenceMap).filter((ts) => {
        const n = parseInt(ts, 10);
        return !Number.isNaN(n) && n > cutoff;
    }).length;
}
function onlineUserIdsFromPresence(presenceMap) {
    const cutoff = Date.now() / 1000 - PRESENCE_WINDOW_SEC;
    const ids = new Set();
    for (const [userId, ts] of Object.entries(presenceMap)) {
        const n = parseInt(ts, 10);
        if (!Number.isNaN(n) && n > cutoff) {
            ids.add(userId);
        }
    }
    return ids;
}
/** Never crash the HTTP handler if Redis is down */
async function readPresenceMap(redis, communityId) {
    if (!communityId)
        return {};
    try {
        const map = await redis.hgetall(`presence:${communityId}`);
        return map ?? {};
    }
    catch (err) {
        console.error('[Community] Redis presence read failed:', err);
        return {};
    }
}
