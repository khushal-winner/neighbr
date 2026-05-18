import { z } from 'zod'
import * as dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_URL: z.string().url(),

    // Kafka
    KAFKA_BROKER: z.string(),

    // RabbitMQ
    RABBITMQ_URL: z.string().url(),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),

    // AWS S3
    AWS_BUCKET_NAME: z.string(),
    AWS_REGION: z.string(),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),

    // Google Maps
    GOOGLE_MAPS_API_KEY: z.string(),

    // Firebase
    FIREBASE_PROJECT_ID: z.string(),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error('Invalid environment variables:')
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const env = parsed.data
export type Env = typeof parsed.data