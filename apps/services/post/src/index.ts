import * as dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import { postRoutes } from './routes/post'



// this means create a new fastify instance

const app = Fastify({ logger: true });

// register env jwt & cookie

app.register(jwt, {
    secret: process.env.JWT_SECRET as string
})

app.register(cookie, {
    secret: process.env.COOKIE_SECRET as string
})

// register postRoutes

app.register(postRoutes)

// health check, status: 'ok', service: 'post'

app.get('/health', async (request, reply) => ({
    status: 'ok',
    service: 'post',
}))

// start app in try catch with async await

const start = async () => {
    try {
        await app.listen({ port: Number(process.env.PORT) || 3002, host: '0.0.0.0' })
        console.log('Post Service started on 3002')
    } catch (error) {
        console.error('Error starting Post Service:', error)
        process.exit(1)
    }
}

start()