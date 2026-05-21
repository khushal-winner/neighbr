import * as dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'
import { webhookRoutes } from './routes/webhook'

export function buildApp() {
    const app = Fastify({ logger: false })

    app.get('/health', async () => ({ status: 'ok', service: 'webhook' }))

    app.register(webhookRoutes)

    return app
}

if (require.main === module) {
    const app = buildApp()
    const port = parseInt(process.env.PORT ?? '3006', 10)

    app.listen({ port, host: '0.0.0.0' })
        .then(() => console.log(`[Webhook] Running on port ${port}`))
        .catch((err) => {
            console.error('[Webhook] Fatal:', err)
            process.exit(1)
        })
}