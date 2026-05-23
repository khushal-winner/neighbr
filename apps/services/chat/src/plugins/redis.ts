import * as dotenv from 'dotenv'
import Redis from 'ioredis'
dotenv.config()

let client: Redis | null = null

export function getRedis(): Redis {
    if (!client) {
        const url = process.env.REDIS_URL
        if (!url) throw new Error('REDIS_URL is not defined')
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
        client = new Redis(url)
    }
    return client
}