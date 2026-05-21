import { createHmac } from 'crypto'

const secret = process.env.CITY_WEBHOOK_SECRET ?? 'a_shared_secret_between_you_and_the_city_portal'

const payload = {
    noticeId: `test-notice-${Date.now()}`,
    type: 'roadworks',
    title: 'Roadworks on Connaught Place Inner Circle',
    description: 'Water main replacement. Expect delays. One-lane traffic from 9am to 5pm.',
    address: 'Connaught Place, New Delhi, India',
    affectedRadiusMeters: 800,
    publishedAt: new Date().toISOString(),
}

const body = JSON.stringify(payload)
const sig = createHmac('sha256', secret).update(body, 'utf-8').digest('hex')

console.log('Payload:')
console.log(JSON.stringify(payload, null, 2))
console.log('\nSignature:')
console.log(sig)
console.log('\nReady to paste into test.http')