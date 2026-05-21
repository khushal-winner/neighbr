import * as dotenv from 'dotenv'
dotenv.config()

import { Queue } from 'bullmq'
import { getBullRedis } from './plugins/redis'
import { startDigestWorker } from './workers/digest.worker'
import { enqueueCommunityDigests } from './jobs/master'
import { DigestJobData } from './workers/digest.worker'

async function start(): Promise<void> {
    console.log('[Digest] Starting...')

    const connection = getBullRedis()

    // register the repeatable master job — fires every Sunday at 6am UTC
    // BullMQ persists this in Redis so it survives restarts
    const schedulerQueue = new Queue<DigestJobData>('digest-scheduler', { connection })

    const cronExpression = process.env.DIGEST_CRON ?? '0 6 * * 0'

    await schedulerQueue.upsertJobScheduler(
        'weekly-digest-master',
        { pattern: cronExpression },
        {
            name: 'master',
            data: {} as DigestJobData,
        }
    )

    console.log(`[Digest] Master job scheduled: ${cronExpression}`)

    // start the worker that processes community digest jobs
    startDigestWorker()

    // also start a scheduler worker that handles the master cron job
    // when the master job fires it enqueues all community jobs
    const { Worker } = await import('bullmq')

    const schedulerWorker = new Worker(
        'digest-scheduler',
        async () => {
            await enqueueCommunityDigests()
        },
        { connection }
    )

    schedulerWorker.on('completed', () => {
        console.log('[Digest] Master job completed — all community jobs enqueued')
    })

    schedulerWorker.on('failed', (job, err) => {
        console.error('[Digest] Master job failed:', err.message)
    })

    console.log('[Digest] Running — waiting for Sunday 6am UTC')

    // graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('[Digest] Shutting down...')
        await schedulerQueue.close()
        process.exit(0)
    })
}

start().catch((err) => {
    console.error('[Digest] Fatal:', err)
    process.exit(1)
})