import * as dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { feedRoutes } from './routes/feed'
import { startFeedConsumer } from './consumers/feed.consumer'

export async function buildApp() {
    const app = Fastify({ logger: true })

    app.register(jwt, {
        secret: process.env.JWT_SECRET as string
    })

    app.get('/health', async () => ({ status: 'ok', service: 'feed' }))

    app.register(feedRoutes)

    return app
}

async function start() {
    const app = await buildApp()

    try {
        // kafka consumer runs alongside the http server - both in same process
        // for a high volume production system you'd split these into seperate deployments
        // for MVP they share a process cleanly
        // Start Kafka consumer in background, don't block HTTP server if it fails
        startFeedConsumer().catch(err => {
            console.error('[Feed] Kafka consumer failed to start:', err.message)
            console.error('[Feed] Continuing without Kafka consumer - feed will not be updated')
        })

        const port = parseInt(process.env.PORT ?? '3004', 10)
        await app.listen({ port, host: '0.0.0.0' })
        console.log(`[Feed] HTTP server on port ${port}`)
    } catch (err) {
        console.error('[Feed] Fatal:', err)
        process.exit(1)

    }
}

if (require.main === module) {
    start()
}
