import * as dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import { communityRoutes } from './routes/community'
import { pollRoutes } from './routes/polls'
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

    app.get('/health', async () => ({ status: 'ok', service: 'community' }))

    app.register(communityRoutes)
    app.register(pollRoutes)

    return app
}

if (require.main === module) {
    const app = buildApp()
    const port = parseInt(process.env.PORT ?? '3007', 10)

    app.listen({ port, host: '0.0.0.0' })
        .then(() => console.log(`[Community] Running on port ${port}`))
        .catch((err) => {
            console.error('[Community] Fatal:', err)
            process.exit(1)
        })
}