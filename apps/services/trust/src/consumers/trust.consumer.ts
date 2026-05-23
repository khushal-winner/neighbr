import * as dotenv from 'dotenv'
dotenv.config()

import type { Prisma } from '@neighbr/db'
import { Kafka, logLevel } from 'kafkajs'
import prisma from '../plugins/prisma'
import { getRedis } from '../plugins/redis'
import {
    TRUST_DELTAS,
    TrustEventType,
    getTrustBand,
    SCORE_FLOOR,
} from '../services/scoring'

// shape of every event published to user.events
interface UserEvent {
    userId: string
    eventType: string
    occurredAt: string
}



// shape of every event published to user.events
interface UserEvent {
    userId: string
    eventType: string
    occurredAt: string
}

async function processEvent(event: UserEvent): Promise<void> {
    const delta = TRUST_DELTAS[event.eventType as TrustEventType]

    if (delta === undefined) {
        // unknown event type - log and skip, don't crash
        console.warn(`[Trust] Unknown event type: ${event.eventType}`)
        return
    }
    console.log(`[Trust] ${event.eventType} for user ${event.userId} -> ${delta > 0 ? '+' : ''}${delta}`)

    // atomic update - increment score and write audit event in a transaction
    // transaction ensures the score and the audit trail never diverge
    const updatedUser = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

        // write the audit event first - if anything fails, both roll back
        await tx.trustScoreEvent.create({
            data: {
                userId: event.userId,
                eventType: event.eventType,
                delta,
                occurredAt: new Date(event.occurredAt),
            }
        })

        // apply delta with floor - score never goes below SCORE_FLOOR
        // raw SQL because Prisma doesn't support Math.max in update expressions
        const result = await tx.$queryRaw<{ trust_score: number; id: string }[]>`
        UPDATE "User"
        SET "trustScore" = GREATEST("trustScore" + ${delta}, ${SCORE_FLOOR})
        WHERE id = ${event.userId}
        RETURNING id, "trustScore" as trust_score
        `

        if (!result.length) {
            throw new Error(`User not found: ${event.userId}`)
        }

        return result[0]
    })

    const newBand = getTrustBand(updatedUser.trust_score)
    console.log(`[Trust] User ${event.userId} score: ${updatedUser.trust_score} (${newBand})`)

    // Publish to user's personal WS channel — Gateway delivers it if they're online
    // If they're not online, they'll see the updated score next time they open the profile
    const redis = getRedis()
    await redis.publish(`ws:user:${event.userId}`, JSON.stringify({
        type: 'trust_updated',
        userId: event.userId,
        newScore: updatedUser.trust_score,
        trustBand: newBand,
        delta,
        eventType: event.eventType,
    }))
}

export async function startTrustConsumer(): Promise<void> {
    const kafka = new Kafka({
        clientId: 'trust-service',
        brokers: [process.env.KAFKA_BROKER as string],
        ssl: true,
        sasl: {
            mechanism: 'scram-sha-256',
            username: process.env.KAFKA_USERNAME as string,
            password: process.env.KAFKA_PASSWORD as string,
        },
        logLevel: logLevel.WARN,
    })

    const consumer = kafka.consumer({
        groupId: 'trust-score-processor',
        // if the consumer falls behind, don't reprocess ancient events on startup
        // set to 'latest' in production after initial deploy
    })

    try {
        await consumer.connect()
        await consumer.subscribe({ topic: 'user.events', fromBeginning: false })

        console.log(`[Trust] consumer connected , listenting on user.events`)

        await consumer.run({
            // proccess one message at a time - trust score updates must be ordered per user
            // eachMessage guarantees order within a partiiton (Kafka partition by key = userId)
            eachMessage: async ({ message }) => {
                if (!message.value) return

                try {
                    const event: UserEvent = JSON.parse(message.value.toString())
                    await processEvent(event)
                } catch (err) {
                    // log but don't rethrow - a bad message shouldn't stop the consumer 
                    // in production: publish to dead-letter topic for investigation
                    console.error(`[Trust] failed to process event:`, err)
                }
            }
        })
    } catch (err) {
        console.warn(`[Trust] Kafka connection/subscription failed (possibly topic authorization issue):`, err)
        console.warn(`[Trust] Trust service remains active, but scoring updates will be skipped until Kafka topics are configured.`)
    }

    process.on('SIGTERM', async () => {
        try {
            await consumer.disconnect()
        } catch {}
        process.exit(0)
    })
}