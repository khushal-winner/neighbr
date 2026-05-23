import * as dotenv from 'dotenv'
dotenv.config()

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { webhookRoutes } from './routes/webhook'

const app = Fastify({ logger: true })

// CORS configuration
app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
})

// Register webhook routes
app.register(webhookRoutes)

// Health check
app.get('/health', async () => ({
  status: 'ok',
  service: 'webhook',
}))

const start = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT) || 3008,
      host: '0.0.0.0',
    })
    console.log('[Webhook] Running on port', process.env.PORT || 3008)
  } catch (error) {
    console.error('[Webhook] Fatal:', error)
    process.exit(1)
  }
}

start()
