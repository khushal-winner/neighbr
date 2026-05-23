"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = userRoutes;
const prisma_1 = __importDefault(require("../plugins/prisma"));
const trustBand_1 = require("../services/trustBand");
const auth_1 = require("../plugins/auth");
const zod_1 = __importDefault(require("zod"));
const redis_1 = require("../plugins/redis");
async function userRoutes(app) {
    // get /users/:id/profile - public id (intentionally public)
    app.get("/users/:id/profile", async (request, reply) => {
        const { id } = request.params;
        const user = await prisma_1.default.user.findUnique({
            where: { id },
            select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                verificationLevel: true,
                communityId: true,
                trustScore: true,
                createdAt: true,
            },
        });
        if (!user) {
            return reply.status(404).send({ error: "User not found" });
        }
        let communityName = null;
        if (user.communityId) {
            const community = await prisma_1.default.microCommunity.findUnique({
                where: { id: user.communityId },
                select: { name: true },
            });
            communityName = community?.name ?? null;
        }
        return reply.send({
            user: {
                ...user,
                communityName,
                trustBand: (0, trustBand_1.getTrustBand)(user.trustScore),
            },
        });
    });
    // get /users/:id/online
    app.get("/users/:id/online", async (request, reply) => {
        const { id } = request.params;
        const user = await prisma_1.default.user.findUnique({
            where: { id },
            select: { communityId: true },
        });
        if (!user || !user.communityId) {
            return reply.send({ online: false });
        }
        const redis = (0, redis_1.getRedis)();
        const isOnline = await redis.hexists(`presence:${user.communityId}`, id);
        return reply.send({ online: isOnline === 1 });
    });
    // patch /users/me
    app.patch("/users/me", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const UpdateSchema = zod_1.default.object({
            displayName: zod_1.default.string().min(2).max(50).optional(),
            avatarUrl: zod_1.default.string().url().nullable().optional(),
            notificationPrefs: zod_1.default
                .object({
                emailDigest: zod_1.default.boolean().optional(),
                pushAlerts: zod_1.default.boolean().optional(),
                emergencyOnly: zod_1.default.boolean().optional(),
            })
                .optional(),
        });
        const body = UpdateSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                error: "Invalid request body",
                details: body.error.flatten().fieldErrors,
            });
        }
        // nothing provided - don't hit the db for no reason
        if (!body.data.displayName &&
            body.data.avatarUrl === undefined &&
            !body.data.notificationPrefs) {
            return reply.status(400).send({ error: "No updates provided" });
        }
        const user = request.user;
        const updateData = {};
        if (body.data.displayName) {
            updateData.displayName = body.data.displayName;
        }
        if (body.data.avatarUrl !== undefined) {
            updateData.avatarUrl = body.data.avatarUrl;
        }
        if (body.data.notificationPrefs) {
            // merge with existing prefs instead of replacing entirely
            const existing = await prisma_1.default.user.findUnique({
                where: { id: user.sub },
                select: {
                    notificationPrefs: true,
                },
            });
            const currentPrefs = existing?.notificationPrefs ?? {};
            updateData.notificationPrefs = {
                ...currentPrefs,
                ...body.data.notificationPrefs,
            };
        }
        const updated = await prisma_1.default.user.update({
            where: { id: user.sub },
            data: updateData,
            select: {
                id: true,
                email: true,
                verificationLevel: true,
                trustScore: true,
                communityId: true,
                displayName: true,
                avatarUrl: true,
                notificationPrefs: true,
            },
        });
        return reply.send({
            user: {
                ...updated,
                trustBand: (0, trustBand_1.getTrustBand)(updated.trustScore),
            },
        });
    });
    // POST /users/me/fcm-token
    // called by frontend after firebase gives it a device token
    // one user can have multiple token - one per device
    app.post("/users/me/fcm-token", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const Schema = zod_1.default.object({
            token: zod_1.default.string().min(1),
        });
        const body = Schema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: "Invalid Token" });
        }
        const user = request.user;
        // upsert - if token already registered for this ser, update timestamp
        await prisma_1.default.fcmToken.upsert({
            where: { token: body.data.token },
            create: { userId: user.sub, token: body.data.token },
            update: { userId: user.sub },
        });
        return reply.send({ message: "Token registered" });
    });
}
