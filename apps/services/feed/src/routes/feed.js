"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedRoutes = feedRoutes;
const auth_1 = require("../plugins/auth");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const redis_1 = require("../plugins/redis");
// trust band labels - same logic as Identity service
// duplicated here intentionally - services shouldn't share runtime code, only types
function getTrustBand(score) {
    if (score >= 200)
        return "Community Pillar";
    if (score >= 100)
        return "Trusted Neighbour";
    if (score >= 30)
        return "Resident";
    return "New Resident";
}
async function feedRoutes(app) {
    // get /feed
    // require auth - we read communityId from JWT so users only see their block
    app.get("/feed", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        try {
            const jwtUser = request.user;
            const dbUser = await prisma_1.default.user.findUnique({
                where: { id: jwtUser.sub },
                select: { communityId: true },
            });
            if (!dbUser?.communityId) {
                return reply.status(400).send({
                    error: "You must verify your address before viewing the feed",
                });
            }
            const communityId = dbUser.communityId;
            const query = request.query;
            const limit = Math.min(parseInt(query.limit ?? "20", 10), 50);
            const cursorScore = query.cursor ? parseInt(query.cursor, 10) : null;
            const redisMax = cursorScore !== null ? `(${cursorScore}` : "+inf";
            const key = `feed:${communityId}`;
            let postIds = [];
            let nextCursor = null;
            try {
                const redis = (0, redis_1.getRedis)();
                const raw = (await redis.zrevrangebyscore(key, redisMax, "-inf", "WITHSCORES", "LIMIT", 0, limit));
                for (let i = 0; i < raw.length; i += 2) {
                    postIds.push(raw[i]);
                }
                nextCursor =
                    raw.length >= 2 ? Math.floor(Number(raw[raw.length - 1])) : null;
            }
            catch (redisErr) {
                console.warn("[Feed] Redis unavailable, using database only:", redisErr);
                postIds = [];
            }
            if (!postIds.length) {
                // Fallback: query database directly if Redis is empty (e.g., Kafka consumer not running)
                console.log(`[Feed] Redis empty for community ${communityId}, using DB fallback`);
                const posts = await prisma_1.default.post.findMany({
                    where: {
                        communityId,
                        moderationStatus: "approved",
                        type: { not: "emergency" }, // emergencies go via WebSocket alerts, not feed
                        ...(cursorScore !== null
                            ? { createdAt: { lt: new Date(cursorScore) } }
                            : {}),
                    },
                    include: {
                        author: {
                            select: {
                                id: true,
                                displayName: true,
                                verificationLevel: true,
                                trustScore: true,
                            },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: limit,
                });
                const shaped = posts.map((post) => ({
                    ...post,
                    author: {
                        ...post.author,
                        trustBand: getTrustBand(post.author.trustScore),
                    },
                }));
                return reply.send({
                    posts: shaped,
                    nextCursor: posts.length === limit
                        ? posts[posts.length - 1].createdAt.getTime()
                        : null,
                });
            }
            // one DB query for all post IDs - never N+1
            const posts = await prisma_1.default.post.findMany({
                where: {
                    id: { in: postIds },
                    moderationStatus: "approved",
                    type: { not: "emergency" },
                },
                include: {
                    author: {
                        select: {
                            id: true,
                            displayName: true,
                            verificationLevel: true,
                            trustScore: true,
                        },
                    },
                },
            });
            // re-sort to match redis order (db query don't gurantee it)
            const orderMap = new Map(postIds.map((id, i) => [id, i]));
            posts.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
            // shape the response - add trust band to author
            const shaped = posts.map((post) => ({
                ...post,
                author: {
                    ...post.author,
                    trustBand: getTrustBand(post.author.trustScore),
                },
            }));
            // the next cursor was already extracted from the ZREVRANGEBYSCORE reply above
            // (nextCursor = score of the last returned member)
            // If Redis index missed posts (e.g. polls), merge recent approved DB posts on first page
            let merged = shaped;
            if (cursorScore === null && shaped.length < limit) {
                const dbPosts = await prisma_1.default.post.findMany({
                    where: {
                        communityId,
                        moderationStatus: "approved",
                        type: { not: "emergency" },
                    },
                    include: {
                        author: {
                            select: {
                                id: true,
                                displayName: true,
                                verificationLevel: true,
                                trustScore: true,
                            },
                        },
                    },
                    orderBy: { createdAt: "desc" },
                    take: limit,
                });
                const seen = new Set(shaped.map((p) => p.id));
                const extras = dbPosts
                    .filter((p) => !seen.has(p.id))
                    .map((post) => ({
                    ...post,
                    author: {
                        ...post.author,
                        trustBand: getTrustBand(post.author.trustScore),
                    },
                }));
                merged = [...shaped, ...extras]
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .slice(0, limit);
            }
            return reply.send({
                posts: merged,
                nextCursor: merged.length === limit && nextCursor !== null ? nextCursor : null,
            });
        }
        catch (err) {
            console.error("[Feed] GET /feed failed:", err);
            return reply.status(500).send({
                error: "Could not load feed",
            });
        }
    });
    // get /feed/post/:id
    // fetch a single approved post - used when opening a post from notification
    app.get("/feed/post/:id", async (request, reply) => {
        const { id } = request.params;
        const post = await prisma_1.default.post.findUnique({
            where: { id, moderationStatus: "approved" },
            include: {
                author: {
                    select: {
                        id: true,
                        displayName: true,
                        verificationLevel: true,
                        trustScore: true,
                    },
                },
            },
        });
        if (!post) {
            return reply.status(404).send({ error: "Post not found" });
        }
        return reply.send({
            post: {
                ...post,
                author: {
                    ...post.author,
                    trustBand: getTrustBand(post.author.trustScore),
                },
            },
        });
    });
}
