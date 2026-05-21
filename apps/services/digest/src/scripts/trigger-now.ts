import * as dotenv from 'dotenv'
dotenv.config()

import { enqueueCommunityDigests } from '../jobs/master'
import { startDigestWorker } from '../workers/digest.worker'

async function main() {
    console.log('[Trigger] Running digest now for testing...')

    // start worker first so it processes jobs as they're enqueued
    startDigestWorker()

    // give worker a moment to connect
    await new Promise(resolve => setTimeout(resolve, 1000))

    // enqueue all community digests
    await enqueueCommunityDigests()

    console.log('[Trigger] Jobs enqueued — worker will process them now')
    console.log('[Trigger] Waiting for completion (check logs)...')

    // wait 30 seconds for jobs to process then exit
    await new Promise(resolve => setTimeout(resolve, 30000))
    process.exit(0)
}

main().catch(err => {
    console.error('[Trigger] Error:', err)
    process.exit(1)
})