import * as dotenv from 'dotenv'
dotenv.config()

// Suppress TLS verification for Node.js 20 - some CloudAMQP/OS 
// builds throw UNABLE_TO_VERIFY_LEAF_SIGNATURE. Safe for dev only.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { startModerationWorker } from './workers/moderation.worker'
import { adminRoutes } from './routes/admin'
import Fastify from 'fastify'

console.log('[Moderation] Starting...')

const app = Fastify({ logger: false })

app.register(adminRoutes)


app.get('/health', async () => ({ status: 'ok', service: 'moderation' }))

async function start() {
    try {
        // start RabbitMQ consumer
        await startModerationWorker()

        // start HTTP server for admin routes
        await app.listen({ port: 3003, host: '0.0.0.0' })
        console.log('[Moderation] HTTP server on port 3003')
    } catch (err) {
        console.error('[Moderation] Fatal:', err)
        process.exit(1)
    }
}

start()
