import * as dotenv from 'dotenv'
dotenv.config()


console.log('[Alert] Starting fan-out consumer...')

import { startAlertConsumer } from './consumers/alert.consumer'

startAlertConsumer().catch((err: any) => {
    console.error('[Alert] Fatal:', err)
    process.exit(1)
})