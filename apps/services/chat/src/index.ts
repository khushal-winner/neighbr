import * as dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { dmRoutes } from './routes/dm'
import { groupRoutes } from './routes/group'
import cors from '@fastify/cors'

export function buildApp() {
    const app = Fastify({ logger: false })

    app.register(cors, {
        origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
        credentials: false,  // no cookies needed for these services
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    })


    app.register(jwt, {
        secret: process.env.JWT_SECRET as string,
    })

    app.get('/health', async () => ({ status: 'ok', service: 'chat' }))

    app.register(dmRoutes)
    app.register(groupRoutes)

    return app
}

if (require.main === module) {
    const app = buildApp()
    const port = parseInt(process.env.PORT ?? '3005', 10)

    app.listen({ port, host: '0.0.0.0' })
        .then(() => console.log(`[Chat] Running on port ${port}`))
        .catch((err) => {
            console.error('[Chat] Fatal:', err)
            process.exit(1)
        })
}