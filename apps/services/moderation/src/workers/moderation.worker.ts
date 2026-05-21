import * as dotenv from 'dotenv'
dotenv.config()

import amqp from 'amqplib'
import { analyzeText } from '../providers/text.provider'
import { analyzeImage } from '../providers/image.provider'
import prisma from '../plugins/prisma'
import axios from 'axios'
import { getKafkaProducer } from '../plugins/kafka'

const QUEUE = 'moderation.jobs'

// the shape of every job Post Service publishes
export interface ModerationJob {
    postId: string
    text: string       // title + body combined
    imageUrls: string[]
    trustScore: number   // high trust = more lenient threshold
    communityId: string
    authorId: string
    type: string  // emergency, community, classified etc
}

async function processJob(job: ModerationJob): Promise<void> {
    console.log(`[Moderation] processing post: ${job.postId}`)

    // run text + all image checks in parallel - don't do them sequentially
    const [textResult, ...imageResults] = await Promise.all([analyzeText(job.text), ...job.imageUrls.map(url => analyzeImage(url))])

    const allResults = [textResult, ...imageResults]
    const maxScore = Math.max(...allResults.map(r => r.score))
    const anyFlagged = allResults.some(r => r.flagged) // this will be true if any result is flagged

    // trusted users get a higher flagging threshold
    // a community Pillar (score 200+) gets more benefit of the doubt
    const threshold = job.trustScore >= 100 ? 0.8 : 0.6

    const decision: 'approved' | 'flagged' = anyFlagged || maxScore >= threshold ? 'flagged' : 'approved'

    // store the decision - audit trail, useful for appeals
    await prisma.moderationDecision.create({
        data: {
            postId: job.postId,
            decision,
            score: maxScore,
        }
    })

    // call Post service to update the post's moderationStatus
    // this is service-to-service on internal network - no auth header needed 
    const postServiceUrl = process.env.POST_SERVICE_URL ?? 'http://localhost:3002'

    try {
        await axios.patch(`${postServiceUrl}/posts/${job.postId}/status`, {
            status: decision,
        })

        if (decision === 'approved') {
            const producer = await getKafkaProducer()
            await producer.send({
                topic: 'post.created',
                messages: [{
                    key: job.postId,
                    value: JSON.stringify({
                        postId: job.postId,
                        communityId: job.communityId,  // you'll need to add this to ModerationJob
                        type: job.type,
                        createdAt: new Date().toISOString(),
                    })
                }]
            })
        }

        const producer = await getKafkaProducer()
        await producer.send({
            topic: 'user.events',
            messages: [{
                key: job.authorId,
                value: JSON.stringify({
                    userId: job.authorId,
                    eventType: decision === 'approved' ? 'post_approved' : 'post_removed',
                    occuredAt: new Date().toISOString(),
                })
            }]
        })
    } catch (error: any) {
        if (error.response?.status === 404) {
            console.log(`[Moderation] Post ${job.postId} not found, skipping update`)
            return // Don't retry - the post doesn't exist
        }
        throw error // Re-throw other errors to trigger retry
    }

    console.log(`[Moderation] Post ${job.postId} → ${decision} (score : ${maxScore.toFixed(2)})`)
}



export async function startModerationWorker(): Promise<void> {
    const url = process.env.RABBITMQ_URL
    if (!url) throw new Error('RABBITMQ_URL is not set')

    console.log('[Moderation] connecting to RABBITMQ...')

    const connection = await amqp.connect(url)
    const channel = await connection.createChannel()

    // durable : true
    await channel.assertQueue(QUEUE, { durable: true })

    // one job at a time - don't receive the next until current is ACKed 
    channel.prefetch(1)

    console.log(`[Moderation] listening on queue: ${QUEUE}`)

    channel.consume(QUEUE, async (msg) => {
        if (!msg) return

        try {
            const job: ModerationJob = JSON.parse(msg.content.toString())
            await processJob(job)

            // only ACK after everything succeeded - db write + post service callback
            channel.ack(msg)
        } catch (err) {
            console.log('[Moderation] job failed', err)

            // NACK - put message back in queue for retry
            // second arg false = don't batch, third arg true = requeue
            channel.nack(msg, false, true)
        }
    })

    // graceful shutdown - finish current job before exiting
    process.on('SIGTERM', async () => {
        console.log('[Moderation] shutting down gracefully...')
        await channel.close()
        await connection.close()
        process.exit(0)
    })

    // reconnection on connection drop
    connection.on('error', (err) => {
        console.error('[Moderation] RabbitMQ connection lost:', err.message)
        console.log('[Moderation] Restarting in 5s')
        setTimeout(() => startModerationWorker(), 5000)
    })
}

