import * as dotenv from 'dotenv'
dotenv.config()

import Redis from 'ioredis'

let client: Redis | null = null

/** TCP Redis — same instance as gateway (presence, pub/sub, session keys) */
export function getRedis(): Redis {
    if (!client) {
        const url = process.env.REDIS_URL
        if (!url) {
            throw new Error('REDIS_URL is not set')
        }
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        client = new Redis(url, {
            maxRetriesPerRequest: 2,
            lazyConnect: true,
        })
    }
    return client
}

export function userCommunityCacheKey(userId: string): string {
    return `user:${userId}:community`
}
