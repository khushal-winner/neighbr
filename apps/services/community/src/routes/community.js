"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityRoutes = communityRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const auth_1 = require("../plugins/auth");
const requireCaptain_1 = require("../middleware/requireCaptain");
const redis_1 = require("../plugins/redis");
const presence_1 = require("../lib/presence");
async function communityRoutes(app) {
    // GET /communities/:communityId
    // public — community info page
    // shows resident count, online count, pinned post, block captain
    app.get("/communities/:communityId", async (request, reply) => {
        const { communityId } = request.params;
        const community = await prisma_1.default.microCommunity.findUnique({
            where: { id: communityId },
            select: {
                id: true,
                name: true,
                residentCount: true,
                blockCaptainId: true,
                pinnedPostId: true,
                createdAt: true,
            },
        });
        if (!community) {
            return reply.status(404).send({ error: "Community not found" });
        }
        const redis = (0, redis_1.getRedis)();
        const presenceMap = await (0, presence_1.readPresenceMap)(redis, communityId);
        const onlineCount = (0, presence_1.countOnlineFromPresence)(presenceMap);
        // fetch block captain display name if one is set
        let blockCaptain = null;
        if (community.blockCaptainId) {
            blockCaptain = await prisma_1.default.user.findUnique({
                where: { id: community.blockCaptainId },
                select: { id: true, displayName: true },
            });
        }
        return reply.send({
            community: {
                ...community,
                onlineCount,
                blockCaptain,
            },
        });
    });
    // GET /communities/:communityId/members
    // residents with online/offline status (from gateway presence hash)
    app.get("/communities/:communityId/members", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        try {
            const jwtUser = request.user;
            const { communityId } = request.params;
            const currentUser = await prisma_1.default.user.findUnique({
                where: { id: jwtUser.sub },
                select: { communityId: true },
            });
            if (!currentUser?.communityId || currentUser.communityId !== communityId) {
                return reply.status(403).send({ error: "You are not in this community" });
            }
            try {
                const redis = (0, redis_1.getRedis)();
                await redis.set(`user:${jwtUser.sub}:community`, communityId, "EX", 60 * 60 * 24 * 30);
            }
            catch {
                // non-fatal — gateway can still use JWT / client communityId
            }
            const community = await prisma_1.default.microCommunity.findUnique({
                where: { id: communityId },
                select: { name: true },
            });
            const members = await prisma_1.default.user.findMany({
                where: { communityId },
                select: { id: true, displayName: true, avatarUrl: true },
                orderBy: { displayName: "asc" },
            });
            const redis = (0, redis_1.getRedis)();
            const presenceMap = await (0, presence_1.readPresenceMap)(redis, communityId);
            const onlineIds = (0, presence_1.onlineUserIdsFromPresence)(presenceMap);
            const membersWithStatus = members.map((m) => ({
                ...m,
                online: onlineIds.has(m.id),
            }));
            const onlineUsers = membersWithStatus
                .filter((m) => m.online)
                .sort((a, b) => a.displayName.localeCompare(b.displayName));
            return reply.send({
                members: membersWithStatus,
                onlineUsers,
                onlineCount: onlineUsers.length,
                communityName: community?.name ?? null,
            });
        }
        catch (err) {
            console.error("[Community] GET /members failed:", err);
            return reply.status(500).send({ error: "Internal Server Error" });
        }
    });
    // POST /communities/:communityId/pin
    // block captain only — set the pinned post for this community
    app.post("/communities/:communityId/pin", { preHandler: [auth_1.requireAuth, requireCaptain_1.requireCaptain] }, async (request, reply) => {
        const { communityId } = request.params;
        const Schema = zod_1.z.object({
            postId: zod_1.z.string().uuid(),
        });
        const body = Schema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: "postId is required" });
        }
        // verify the post belongs to this community and is approved
        const post = await prisma_1.default.post.findUnique({
            where: { id: body.data.postId },
            select: { id: true, communityId: true, moderationStatus: true },
        });
        if (!post || post.communityId !== communityId) {
            return reply
                .status(404)
                .send({ error: "Post not found in this community" });
        }
        if (post.moderationStatus !== "approved") {
            return reply.status(400).send({ error: "Can only pin approved posts" });
        }
        await prisma_1.default.microCommunity.update({
            where: { id: communityId },
            data: { pinnedPostId: body.data.postId },
        });
        // notify all online residents that the pinned post changed
        const redis = (0, redis_1.getRedis)();
        await redis.publish(`ws:community:${communityId}`, JSON.stringify({
            type: "post_pinned",
            postId: body.data.postId,
            communityId,
        }));
        return reply.send({ message: "Post pinned" });
    });
    // DELETE /communities/:communityId/pin
    // block captain only — unpin the current pinned post
    app.delete("/communities/:communityId/pin", { preHandler: [auth_1.requireAuth, requireCaptain_1.requireCaptain] }, async (request, reply) => {
        const { communityId } = request.params;
        await prisma_1.default.microCommunity.update({
            where: { id: communityId },
            data: { pinnedPostId: null },
        });
        return reply.send({ message: "Post unpinned" });
    });
    // DELETE /communities/:communityId/posts/:postId
    // block captain only — remove a post from the community
    // calls through to Post Service internally to update status
    app.delete("/communities/:communityId/posts/:postId", { preHandler: [auth_1.requireAuth, requireCaptain_1.requireCaptain] }, async (request, reply) => {
        const { communityId, postId } = request.params;
        const post = await prisma_1.default.post.findUnique({
            where: { id: postId },
            select: { id: true, communityId: true },
        });
        if (!post || post.communityId !== communityId) {
            return reply
                .status(404)
                .send({ error: "Post not found in this community" });
        }
        // block captain removes a post — set status to removed
        await prisma_1.default.post.update({
            where: { id: postId },
            data: { moderationStatus: "removed" },
        });
        console.log(`[Community] Block captain removed post ${postId}`);
        return reply.send({ message: "Post removed" });
    });
    // POST /communities/:communityId/announce
    // block captain only — send a broadcast announcement to all online residents
    // delivers via Redis pub/sub → WebSocket Gateway
    // also creates a post in the community feed so offline users see it
    app.post("/communities/:communityId/announce", { preHandler: [auth_1.requireAuth, requireCaptain_1.requireCaptain] }, async (request, reply) => {
        const { communityId } = request.params;
        const user = request.user;
        const Schema = zod_1.z.object({
            title: zod_1.z.string().min(1).max(200),
            body: zod_1.z.string().min(1).max(2000),
        });
        const parsed = Schema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                error: "Invalid request",
                details: parsed.error.flatten().fieldErrors,
            });
        }
        // create a community post so it appears in the feed
        // moderationStatus approved immediately — captain posts skip moderation
        const post = await prisma_1.default.post.create({
            data: {
                authorId: user.sub,
                communityId,
                type: "community",
                title: parsed.data.title,
                body: parsed.data.body,
                moderationStatus: "approved",
                imageUrls: [],
            },
        });
        // push to all online residents via WebSocket
        const redis = (0, redis_1.getRedis)();
        await redis.publish(`ws:community:${communityId}`, JSON.stringify({
            type: "announcement",
            postId: post.id,
            title: parsed.data.title,
            body: parsed.data.body,
            communityId,
            captainId: user.sub,
        }));
        return reply.status(201).send({ post });
    });
    // PATCH /communities/:communityId/captain
    // promote a user to block captain — only current captain can do this
    // or any admin in a real system — for MVP only current captain
    app.patch("/communities/:communityId/captain", { preHandler: [auth_1.requireAuth, requireCaptain_1.requireCaptain] }, async (request, reply) => {
        const { communityId } = request.params;
        const Schema = zod_1.z.object({
            userId: zod_1.z.string().uuid(),
        });
        const body = Schema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: "userId is required" });
        }
        // verify new captain is a verified resident of this community
        const newCaptain = await prisma_1.default.user.findUnique({
            where: { id: body.data.userId },
            select: {
                id: true,
                communityId: true,
                verificationLevel: true,
                displayName: true,
            },
        });
        if (!newCaptain) {
            return reply.status(404).send({ error: "User not found" });
        }
        if (newCaptain.communityId !== communityId) {
            return reply.status(400).send({
                error: "User is not a resident of this community",
            });
        }
        if (newCaptain.verificationLevel === "unverified") {
            return reply.status(400).send({
                error: "Cannot promote an unverified user to block captain",
            });
        }
        await prisma_1.default.microCommunity.update({
            where: { id: communityId },
            data: { blockCaptainId: body.data.userId },
        });
        console.log(`[Community] ${newCaptain.displayName} promoted to block captain of ${communityId}`);
        return reply.send({
            message: `${newCaptain.displayName} is now the block captain`,
        });
    });
}
