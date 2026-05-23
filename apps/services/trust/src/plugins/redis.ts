import Redis from 'ioredis'

let client: Redis | null = null

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL as string, {
      maxRetriesPerRequest: 3,
      retryStrategy: (t) => Math.min(t * 200, 2000),
    })
    client.on('error', (e) => console.error('[Redis]', e.message))
  }
  return client
}
