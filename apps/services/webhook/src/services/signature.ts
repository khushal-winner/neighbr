import { createHmac, timingSafeEqual } from "crypto"


export function verifySignature(
    rawBody: string,
    receivedSignature: string,
    secret: string
): boolean {
    const expected = createHmac('sha256', secret).update(rawBody, 'utf-8').digest('hex')

    // both must be same length for timingSafeEqual to work
    if (expected.length !== receivedSignature.length) return false

    return timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(receivedSignature, 'hex')
    )
}