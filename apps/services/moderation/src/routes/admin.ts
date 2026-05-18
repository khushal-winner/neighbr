
import Fastify, { FastifyInstance } from 'fastify'
import prisma from '../plugins/prisma'
import { z } from 'zod'



// admin only routes - in production these sit behind an internal network 
// or a seperate admin auth token - for MVP we leaver them open
export async function adminRoutes(app: FastifyInstance) {
    // Get /moderation/queue
    // returns all posts currently in flagged state
    // block captain or admin uses this to review
    app.get('/moderation/queue', async (request, reply) => {
        const flaggedPosts = await prisma.moderationDecision.findMany({
            where: { decision: 'flagged' },
            orderBy: { decidedAt: 'desc' },
            take: 50,
        })

        return reply.send({ posts: flaggedPosts })
    })

    // post /moderation/:postId/decision
    // human reviewer overrides auotmated decision
    app.post('/moderation/:postId/decision', async (request, reply) => {
        const { postId } = request.params as { postId: string }

        const DecisionSchema = z.object({
            decision: z.enum(['approved', 'removed']),
            reason: z.string().optional(),
        })

        const body = DecisionSchema.safeParse(request.body)
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid decision' })
        }

        const { decision, reason } = body.data

        // store the human override
        await prisma.moderationDecision.create({
            data: {
                postId,
                decision,
                score: 0, // human deciison score not applicable
            }
        })

        // call post services to update staus
        const postServiceUrl = process.env.POST_SERVICE_URL ?? 'http://localhost:3002'

        await fetch(`${postServiceUrl}/posts/${postId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: decision === 'approved' ? 'approved' : 'removed' }),
        })

        console.log(`[Moderation] Human decision: post ${postId} → ${decision}`)

        return reply.send({ message: `Post ${decision}` })
    })
}