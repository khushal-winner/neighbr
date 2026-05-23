import type Redis from 'ioredis'

const PRESENCE_WINDOW_SEC = 30

export function countOnlineFromPresence(
    presenceMap: Record<string, string>,
): number {
    const cutoff = Date.now() / 1000 - PRESENCE_WINDOW_SEC
    return Object.values(presenceMap).filter((ts) => {
        const n = parseInt(ts, 10)
        return !Number.isNaN(n) && n > cutoff
    }).length
}

export function onlineUserIdsFromPresence(
    presenceMap: Record<string, string>,
): Set<string> {
    const cutoff = Date.now() / 1000 - PRESENCE_WINDOW_SEC
    const ids = new Set<string>()
    for (const [userId, ts] of Object.entries(presenceMap)) {
        const n = parseInt(ts, 10)
        if (!Number.isNaN(n) && n > cutoff) {
            ids.add(userId)
        }
    }
    return ids
}

/** Never crash the HTTP handler if Redis is down */
export async function readPresenceMap(
    redis: Redis,
    communityId: string,
): Promise<Record<string, string>> {
    if (!communityId) return {}
    try {
        const map = await redis.hgetall(`presence:${communityId}`)
        return map ?? {}
    } catch (err) {
        console.error('[Community] Redis presence read failed:', err)
        return {}
    }
}
