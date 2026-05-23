"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = adminRoutes;
const prisma_1 = __importDefault(require("../plugins/prisma"));
const zod_1 = require("zod");
// admin only routes - in production these sit behind an internal network 
// or a seperate admin auth token - for MVP we leaver them open
async function adminRoutes(app) {
    // Get /moderation/queue
    // returns all posts currently in flagged state
    // block captain or admin uses this to review
    app.get('/moderation/queue', async (request, reply) => {
        const flaggedPosts = await prisma_1.default.moderationDecision.findMany({
            where: { decision: 'flagged' },
            orderBy: { decidedAt: 'desc' },
            take: 50,
        });
        return reply.send({ posts: flaggedPosts });
    });
    // post /moderation/:postId/decision
    // human reviewer overrides auotmated decision
    app.post('/moderation/:postId/decision', async (request, reply) => {
        const { postId } = request.params;
        const DecisionSchema = zod_1.z.object({
            decision: zod_1.z.enum(['approved', 'removed']),
            reason: zod_1.z.string().optional(),
        });
        const body = DecisionSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid decision' });
        }
        const { decision, reason } = body.data;
        // store the human override
        await prisma_1.default.moderationDecision.create({
            data: {
                postId,
                decision,
                score: 0, // human deciison score not applicable
            }
        });
        // call post services to update staus
        const postServiceUrl = process.env.POST_SERVICE_URL ?? 'http://localhost:3002';
        await fetch(`${postServiceUrl}/posts/${postId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: decision === 'approved' ? 'approved' : 'removed' }),
        });
        console.log(`[Moderation] Human decision: post ${postId} → ${decision}`);
        return reply.send({ message: `Post ${decision}` });
    });
}
