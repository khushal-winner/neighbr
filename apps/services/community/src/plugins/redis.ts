import * as dotenv from 'dotenv'
dotenv.config()

import Redis from 'ioredis'

let client: Redis | null = null

/** Same Redis protocol client as gateway/chat (REDIS_URL / Upstash TCP) */
export function getRedis(): Redis {
    if (!client) {
        const url = process.env.REDIS_URL
        if (!url) {
            throw new Error(
                'REDIS_URL is not set — add it to apps/services/community/.env',
            )
        }
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        client = new Redis(url, {
            maxRetriesPerRequest: 2,
            lazyConnect: true,
        })
    }
    return client
}
