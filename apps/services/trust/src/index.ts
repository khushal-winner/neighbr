import * as dotenv from 'dotenv'
dotenv.config()

import { startTrustConsumer } from './consumers/trust.consumer'

console.log('[Trust] Starting...')

startTrustConsumer().catch((err) => {
    console.error('[Trust] Fatal:', err)
    process.exit(1)
})