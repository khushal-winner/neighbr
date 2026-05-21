import * as dotenv from 'dotenv'
dotenv.config()

import { Redis } from '@upstash/redis'

let client: Redis | null = null

export function getRedis(): Redis {
    if (!client) {
        const url = process.env.UPSTASH_REDIS_REST_URL
        const token = process.env.UPSTASH_REDIS_REST_TOKEN

        if (!url || !token) throw new Error('Upstash env vars not set')

        client = new Redis({ url, token })
    }
    return client
}