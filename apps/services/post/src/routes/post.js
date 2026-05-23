"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postRoutes = postRoutes;
const zod_1 = require("zod");
const auth_1 = require("../plugins/auth");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const queue_1 = require("../services/queue");
const kafka_1 = require("../plugins/kafka");
const redis_1 = require("../plugins/redis");
const cloudinary_1 = require("cloudinary");
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const PostTypeSchema = zod_1.z.enum([
    "community",
    "emergency",
    "classified",
    "lost_found",
    "poll",
    "event",
    "planning_notice",
]);
const CreatePostSchema = zod_1.z.object({
    type: PostTypeSchema,
    title: zod_1.z.string().min(1).max(200),
    body: zod_1.z.string().max(5000),
    // optional — client uploads directly to S3, passes back URLs
    imageUrls: zod_1.z.array(zod_1.z.string().url()).default([]),
});
async function postRoutes(app) {
    // POST /posts/upload
    // Upload image to Cloudinary
    app.post("/posts/upload", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ error: "No file uploaded" });
        }
        try {
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary_1.v2.uploader.upload_stream({ folder: "neighbr" }, (error, result) => {
                    if (error)
                        reject(error);
                    else
                        resolve(result);
                });
                data.file.pipe(uploadStream);
            });
            return reply.send({ url: result.secure_url });
        }
        catch (error) {
            console.error("[Post] Cloudinary upload error:", error);
            return reply.status(500).send({ error: "Failed to upload image" });
        }
    });
    // posts /posts
    // create a post stores as pending , hands off to moderaiton
    app.post("/posts", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const parsed = CreatePostSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                message: "Invalid Request",
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const user = request.user;
        if (!user.communityId) {
            return reply
                .status(400)
                .send({ error: "Verify your address before posting" });
        }
        const { type, title, body: postBody, imageUrls } = parsed.data;
        // store as pending never show unmoderated content in the feed
        const post = await prisma_1.default.post.create({
            data: {
                authorId: user.sub,
                communityId: user.communityId,
                type,
                title,
                body: postBody,
                imageUrls,
                moderationStatus: "pending",
            },
            select: {
                id: true,
                type: true,
                title: true,
                body: true,
                imageUrls: true,
                moderationStatus: true,
                authorId: true,
                communityId: true,
                createdAt: true,
            },
        });
        // publish to moderation queue — fire and forget
        // user shouldn't wait for moderation to complete
        // if this fails, log it and continue — post is already saved
        (0, queue_1.PublishToModerationQueue)({
            postId: post.id,
            text: `${title} ${postBody}`,
            imageUrls,
            trustScore: user.trustScore ?? 0,
            authorId: user.sub,
            communityId: user.communityId,
            type,
        }).catch((err) => console.error("[Post] Moderation queue publish failed:", err));
        if (type === "emergency") {
            // emergency bypass — skip moderation queue, publish directly to Kafka
            // Alert Fan-Out consumer will pick this up and deliver within 5 seconds
            try {
                const producer = await (0, kafka_1.getKafkaProducer)();
                await producer.send({
                    topic: `alerts:${post.communityId}`,
                    messages: [
                        {
                            key: post.id,
                            value: JSON.stringify({
                                postId: post.id,
                                communityId: post.communityId,
                                cityId: post.communityId,
                                title: post.title,
                                body: post.body,
                                authorId: post.authorId,
                                createdAt: post.createdAt.toISOString(),
                            }),
                        },
                    ],
                });
            }
            catch (err) {
                console.error("[Post] Kafka emergency alert publish failed:", err);
            }
        }
        return reply.status(201).send({ post });
    });
    // get /posts/:id
    // pending/flagged posts return 404, not 403
    // why 404 not 403? don't reveal that a post exists but is flagged
    app.get("/posts/:id", async (request, reply) => {
        const { id } = request.params;
        const post = await prisma_1.default.post.findUnique({
            where: { id },
            select: {
                id: true,
                type: true,
                title: true,
                body: true,
                imageUrls: true,
                moderationStatus: true,
                upvotes: true,
                flagCount: true,
                authorId: true,
                communityId: true,
                createdAt: true,
            },
        });
        if (!post || post.moderationStatus !== "approved") {
            return reply.status(404).send({ error: "Post not found" });
        }
        return reply.send({ post });
    });
    // post /posts/:id/flag
    // increment flag count - moderation service watches this
    app.post("/posts/:id/flag", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        const userId = user.sub;
        const post = await prisma_1.default.post.findUnique({
            where: { id },
            select: { id: true, authorId: true },
        });
        if (!post) {
            return reply.status(404).send({ error: "Post not found" });
        }
        const existingInteraction = await prisma_1.default.postInteraction.findUnique({
            where: {
                postId_userId_type: {
                    postId: id,
                    userId,
                    type: "flag",
                },
            },
        });
        if (existingInteraction) {
            return reply.status(409).send({ error: "Already flagged" });
        }
        const [_, updated] = await prisma_1.default.$transaction([
            prisma_1.default.postInteraction.create({
                data: {
                    postId: id,
                    userId,
                    type: "flag",
                },
            }),
            prisma_1.default.post.update({
                where: { id },
                data: { flagCount: { increment: 1 } },
                select: { id: true, flagCount: true },
            }),
        ]);
        // trust score service will deduct points from author
        try {
            const producer = await (0, kafka_1.getKafkaProducer)();
            await producer.send({
                topic: "user.events",
                messages: [
                    {
                        key: post.authorId,
                        value: JSON.stringify({
                            userId: post.authorId,
                            eventType: "flag-received",
                            occuredAt: new Date().toISOString(),
                        }),
                    },
                ],
            });
        }
        catch (err) {
            console.error("[Post] kafka flag-event publish failed:", err);
        }
        return reply.send({ flagCount: updated.flagCount });
    });
    // post /posts/:id/upvote
    app.post("/posts/:id/upvote", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        const userId = user.sub;
        const post = await prisma_1.default.post.findUnique({
            where: { id },
            select: { id: true, moderationStatus: true, authorId: true },
        });
        if (!post) {
            return reply.status(404).send({ error: "Post not found" });
        }
        if (post.moderationStatus !== "approved") {
            return reply
                .status(403)
                .send({ error: "Cannot upvote a pending post" });
        }
        const existingInteraction = await prisma_1.default.postInteraction.findUnique({
            where: {
                postId_userId_type: {
                    postId: id,
                    userId,
                    type: "upvote",
                },
            },
        });
        if (existingInteraction) {
            return reply.status(409).send({ error: "Already upvoted" });
        }
        const [_, updated] = await prisma_1.default.$transaction([
            prisma_1.default.postInteraction.create({
                data: {
                    postId: id,
                    userId,
                    type: "upvote",
                },
            }),
            prisma_1.default.post.update({
                where: { id },
                data: { upvotes: { increment: 1 } },
                select: { id: true, upvotes: true },
            }),
        ]);
        // trust score service will add points to author
        try {
            const producer = await (0, kafka_1.getKafkaProducer)();
            await producer.send({
                topic: "user.events",
                messages: [
                    {
                        key: post.authorId,
                        value: JSON.stringify({
                            userId: post.authorId,
                            eventType: "post-upvoted",
                            postId: id,
                            occuredAt: new Date().toISOString(),
                        }),
                    },
                ],
            });
        }
        catch (err) {
            console.error("[Post] kafka upvote-event publish failed:", err);
        }
        return reply.send({ upvotes: updated.upvotes });
    });
    // patch /post/:id/status
    // internal only — called by Moderation Service after review
    // no auth — internal service-to-service call on private network
    // in production: restrict to internal network via Nginx/K8s NetworkPolicy
    app.patch("/posts/:id/status", async (request, reply) => {
        const { id } = request.params;
        const StatusSchema = zod_1.z.object({
            status: zod_1.z.enum(["approved", "flagged", "removed"]),
        });
        const parsed = StatusSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ error: "Invalid status" });
        }
        try {
            const post = await prisma_1.default.post.update({
                where: { id },
                data: { moderationStatus: parsed.data.status },
                select: { id: true, moderationStatus: true, communityId: true, title: true },
            });
            if (parsed.data.status === 'approved') {
                const redis = (0, redis_1.getRedis)();
                await redis.publish(`ws:community:${post.communityId}`, JSON.stringify({
                    type: 'post_approved',
                    postId: post.id,
                    communityId: post.communityId,
                    title: post.title,
                    timestamp: new Date().toISOString(),
                }));
            }
            return reply.send({ post });
        }
        catch (error) {
            if (error.code === "P2025") {
                return reply.status(404).send({ error: "Post not found" });
            }
            throw error;
        }
    });
    // POST /internal/posts — service-to-service only, no user JWT
    // Protected by INTERNAL_SECRET header instead of JWT
    app.post("/internal/posts", async (request, reply) => {
        const secret = request.headers['x-internal-secret'];
        if (secret !== process.env.INTERNAL_SECRET) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const InternalPostSchema = zod_1.z.object({
            authorId: zod_1.z.string().uuid(), // a service account user ID
            communityId: zod_1.z.string().uuid(),
            type: zod_1.z.enum(['planning_notice', 'community']),
            title: zod_1.z.string().min(1).max(200),
            body: zod_1.z.string().max(5000),
            moderationStatus: zod_1.z.enum(['approved', 'pending']).default('approved'),
            imageUrls: zod_1.z.array(zod_1.z.string()).default([]),
        });
        const body = InternalPostSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid', details: body.error.flatten().fieldErrors });
        }
        const post = await prisma_1.default.post.create({
            data: {
                authorId: body.data.authorId,
                communityId: body.data.communityId,
                type: body.data.type,
                title: body.data.title,
                body: body.data.body,
                moderationStatus: body.data.moderationStatus,
                imageUrls: body.data.imageUrls,
            },
        });
        // Planning notices skip moderation — go straight to Kafka feed index
        if (body.data.moderationStatus === 'approved') {
            // publish to Redis for real-time notification banner
            const redis = (0, redis_1.getRedis)();
            await redis.publish(`ws:community:${post.communityId}`, JSON.stringify({
                type: 'post_approved',
                postId: post.id,
                communityId: post.communityId,
                title: post.title,
                timestamp: new Date().toISOString(),
            }));
        }
        return reply.status(201).send({ post });
    });
    app.delete("/posts/:id", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        const post = await prisma_1.default.post.findUnique({
            where: { id },
            select: { authorId: true },
        });
        if (!post)
            return reply.status(404).send({ error: "Post not found" });
        if (post.authorId !== user.sub)
            return reply.status(403).send({ error: "Forbidden" });
        await prisma_1.default.post.delete({ where: { id } });
        return reply.send({ message: "Post deleted" });
    });
}
