import { FastifyInstance } from "fastify"
import { getKafkaProducer } from "../plugins/kafka"
import prisma from "../plugins/prisma"
import { z } from 'zod'
import { verifySignature } from "../services/signature"
import { getRedis } from "../plugins/redis"
import { geocodeAddress } from "../services/geocoder"
import { findAffectedCommunities } from "../services/communityFinder"




// shape of the city portal webhook payload
const CityWebhookSchema = z.object({
    noticeId: z.string(),
    type: z.enum([
        'planning_application',
        'roadworks',
        'water_shutoff',
        'council_meeting',
        'noise_permit'
    ]),
    title: z.string().min(1).max(200),
    description: z.string().max(5000),
    address: z.string().min(5), // human-readable address to geocode
    affectedRadiusMeters: z.number().default(500),
    publishedAt: z.string().datetime(),
})

type CityWebhookPayload = z.infer<typeof CityWebhookSchema>

// redis key for idempotency - 30 day ttl matches city portal retry window
const idempotencyKey = (noticeId: string) => `idempotency:webhook:${noticeId}`

// 30 days in seconds
const IDEMPOTENCY_TTL = 60 * 60 * 24 * 30

export async function webhookRoutes(app: FastifyInstance) {


    // POST /webhooks/city-data
    // receives planning notices and alerts from city portals
    // this endpoint is called by the city, not by users
    app.post('/webhooks/city-data', async (request, reply) => {
        // step 1 : verify signature 
        // city portal sends HMAC-SHA256 of the raw body in this header
        const receivedSig = request.headers['x-city-portal-signature'] as string | undefined

        if (!receivedSig) {
            return reply.status(401).send({ error: 'Missing signature' })
        }

        const rawBody = JSON.stringify(request.body)
        const secret = process.env.CITY_WEBHOOK_SECRET as string

        if (!verifySignature(rawBody, receivedSig, secret)) {
            console.warn('[Webhook] Signature verification failed')
            return reply.status(401).send({ error: 'Invalid signature' })
        }

        // step 2 validate payload shape 
        const parsed = CityWebhookSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.status(400).send({
                error: 'Invalid payload',
                details: parsed.error.flatten().fieldErrors,
            })
        }

        const payload: CityWebhookPayload = parsed.data

        // step 3 idempotency check 
        const redis = getRedis()
        const iKey = idempotencyKey(payload.noticeId)

        const alreadyProcessed = await redis.get(iKey)
        if (alreadyProcessed) {
            // city portal is retrying — this is expected behaviour
            // return 200 so they stop retrying, do nothing else
            console.log(`[Webhook] Duplicate notice ${payload.noticeId} — skipping`)
            return reply.send({ message: 'Already processed' })
        }

        // step 4 geocode the address 
        const coords = await geocodeAddress(payload.address)

        if (!coords) {
            console.warn(`[Webhook] Could not geocode: ${payload.address}`)
            return reply.status(422).send({ error: 'Address could not be geocoded' })
        }

        const radiusMeters = payload.affectedRadiusMeters ??
            parseInt(process.env.AFFECTED_RADIUS_METERS ?? '1000', 10)

        // step 5 find affected communities 
        const communities = await findAffectedCommunities(
            coords.lon,
            coords.lat,
            radiusMeters
        )

        if (communities.length === 0) {
            console.log(`[Webhook] No communities affected by notice ${payload.noticeId}`)

            // still mark as processed — we don't want to retry geocoding infinitely
            await redis.set(iKey, 'no_communities', { ex: IDEMPOTENCY_TTL })

            return reply.send({ message: 'No communities in affected area', communitiesAffected: 0 })
        }

        console.log(
            `[Webhook] Notice ${payload.noticeId} affects ${communities.length} communities`
        )

        // step 6 create one post per affected community 
        const producer = await getKafkaProducer()
        const createdPostIds: string[] = []

        // we need a system user ID to be the author of city-generated posts
        // for now we look up a special system account — in production this is
        // a seeded user with displayName "City Council" and verificationLevel "postcard_verified"
        const systemUser = await prisma.user.findFirst({
            where: { email: 'system@neighbr.app' },
            select: { id: true },
        })

        if (!systemUser) {
            console.error('[Webhook] System user not found — seed system@neighbr.app first')
            return reply.status(500).send({ error: 'System user not configured' })
        }

        // create posts for all communities in parallel
        await Promise.all(
            communities.map(async (community) => {
                const post = await prisma.post.create({
                    data: {
                        authorId: systemUser.id,
                        communityId: community.id,
                        type: 'planning_notice',
                        title: payload.title,
                        body: payload.description,
                        moderationStatus: 'approved',   // city notices skip moderation
                        imageUrls: [],
                    },
                })

                createdPostIds.push(post.id)

                // publish to Kafka so Feed Service indexes this post
                await producer.send({
                    topic: 'posts.created',
                    messages: [{
                        key: post.id,
                        value: JSON.stringify({
                            postId: post.id,
                            communityId: community.id,
                            type: 'planning_notice',
                            title: payload.title,
                            createdAt: post.createdAt.toISOString(),
                        }),
                    }],
                })

                console.log(
                    `[Webhook] Created post ${post.id} for community ${community.name}`
                )
            })
        )

        // step 7 - mark as processed in Redis 
        // only set after all posts created — if we crash mid-processing,
        // the next retry will re-run from scratch and create the posts again
        // acceptable trade-off: at-least-once delivery is fine for city notices
        await redis.set(iKey, JSON.stringify({
            processedAt: new Date().toISOString(),
            postIds: createdPostIds,
        }), { ex: IDEMPOTENCY_TTL })

        return reply.send({
            message: 'Processed',
            communitiesAffected: communities.length,
            postsCreated: createdPostIds.length,
        })
    })


    // GET /webhooks/health
    // city portals often ping this before sending real data
    app.get('/webhooks/health', async (request, reply) => {
        return reply.send({ status: 'ok', service: 'webhook-ingestion' })
    })

}