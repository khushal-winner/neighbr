import * as dotenv from 'dotenv'
dotenv.config()

import { startNotificationConsumer } from './consumers/notification.consumer'

console.log(`[Notification] Starting...`)


startNotificationConsumer().catch((err) => {
    console.error(`[Notification] fatal:`, err)
    process.exit(1)
})