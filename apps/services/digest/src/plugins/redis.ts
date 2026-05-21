import Redis from 'ioredis'

// BullMQ needs its own Redis connection separate from general use
// it uses blocking commands that can't share a connection
let bullConnection: Redis | null = null

export function getBullRedis(): Redis {
  if (!bullConnection) {
    const url = process.env.REDIS_URL
    if (!url) throw new Error('REDIS_URL is not set')

    // maxRetriesPerRequest must be null for BullMQ blocking commands
    bullConnection = new Redis(url, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    })

    bullConnection.on('error', (err) => console.error('[Redis/Bull]', err.message))
    bullConnection.on('connect', () => console.log('[Redis/Bull] connected'))
  }

  return bullConnection
}