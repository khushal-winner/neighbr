"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRoutes = webhookRoutes;
const zod_1 = require("zod");
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = require("../plugins/redis");
const geocoding_1 = require("../services/geocoding");
const postgis_1 = require("../services/postgis");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const axios_1 = __importDefault(require("axios"));
const WebhookPayloadSchema = zod_1.z.object({
    noticeId: zod_1.z.string(),
    title: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().max(5000),
    location: zod_1.z.string(),
    affectedRadiusMeters: zod_1.z.number().positive(),
    startDate: zod_1.z.string(),
});
async function webhookRoutes(app) {
    app.post('/webhook', async (request, reply) => {
        // 1. Verify HMAC-SHA256 signature
        const signature = request.headers['x-webhook-signature'];
        if (!signature) {
            return reply.status(401).send({ error: 'Missing signature' });
        }
        const secret = process.env.WEBHOOK_SECRET ?? 'test_secret';
        const payload = JSON.stringify(request.body);
        const expectedSignature = crypto_1.default
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
        if (!signature.startsWith('sha256=')) {
            return reply.status(401).send({ error: 'Invalid signature format' });
        }
        const receivedHash = signature.replace('sha256=', '');
        if (receivedHash !== expectedSignature) {
            return reply.status(401).send({ error: 'Invalid signature' });
        }
        // 2. Validate payload
        const parsed = WebhookPayloadSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: 'Invalid payload',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const { noticeId, title, description, location, affectedRadiusMeters, startDate } = parsed.data;
        // 3. Check idempotency key in Redis (30-day TTL)
        const redis = (0, redis_1.getRedis)();
        const idempotencyKey = `webhook:notice:${noticeId}`;
        const existing = await redis.get(idempotencyKey);
        if (existing) {
            return reply.status(200).send({ message: 'Already processed', noticeId });
        }
        // 4. Geocode the location via Nominatim
        let geoResult;
        try {
            geoResult = await (0, geocoding_1.geocodeLocation)(location);
        }
        catch (error) {
            console.error('[Webhook] Geocoding failed:', error);
            return reply.status(400).send({ error: 'Location not found' });
        }
        // 5. Find affected communities using ST_Intersects
        const affectedCommunities = await (0, postgis_1.findAffectedCommunities)(geoResult.lat, geoResult.lon, affectedRadiusMeters);
        if (affectedCommunities.length === 0) {
            console.warn('[Webhook] No affected communities found for location:', location);
            // Still mark as processed to avoid retries
            await redis.set(idempotencyKey, 'processed', { ex: 30 * 24 * 60 * 60 }); // 30 days
            return reply.status(200).send({ message: 'No affected communities', noticeId });
        }
        // 6. Create planning_notice post per community via internal Post Service endpoint
        const internalSecret = process.env.INTERNAL_SECRET;
        if (!internalSecret) {
            throw new Error('INTERNAL_SECRET not set');
        }
        const postServiceUrl = process.env.POST_SERVICE_URL ?? 'http://localhost:3002';
        const createdPosts = [];
        // Get a service account user ID for creating posts
        const serviceAccount = await prisma_1.default.user.findFirst({
            where: { email: 'service@neighbr.local' },
        });
        if (!serviceAccount) {
            throw new Error('Service account not found. Please create a service account user.');
        }
        for (const community of affectedCommunities) {
            try {
                const response = await axios_1.default.post(`${postServiceUrl}/internal/posts`, {
                    authorId: serviceAccount.id,
                    communityId: community.id,
                    type: 'planning_notice',
                    title,
                    body: `${description}\n\nStart Date: ${startDate}\n\nCouncil Notice ID: ${noticeId}`,
                    moderationStatus: 'approved',
                    imageUrls: [],
                }, {
                    headers: {
                        'x-internal-secret': internalSecret,
                        'Content-Type': 'application/json',
                    },
                });
                createdPosts.push({
                    communityId: community.id,
                    postId: response.data.post.id,
                });
                console.log(`[Webhook] Created post for community ${community.id}`);
            }
            catch (error) {
                console.error(`[Webhook] Failed to create post for community ${community.id}:`, error);
            }
        }
        // 7. Mark as processed in Redis with 30-day TTL
        await redis.set(idempotencyKey, 'processed', { ex: 30 * 24 * 60 * 60 });
        return reply.status(200).send({
            message: 'Webhook processed',
            noticeId,
            affectedCommunities: affectedCommunities.length,
            postsCreated: createdPosts.length,
        });
    });
}
