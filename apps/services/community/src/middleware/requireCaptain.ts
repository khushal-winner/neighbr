import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../plugins/prisma'

// extracts communityId from route params and verifies
// the requesting user is the block captain of that community
// used as a preHandler on captain-only routes
export async function requireCaptain(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const user = request.user as { sub: string }
    const { communityId } = request.params as { communityId: string }

    if (!communityId) {
        return reply.status(400).send({ error: 'communityId param required' })
    }

    const community = await prisma.microCommunity.findUnique({
        where: { id: communityId },
        select: { blockCaptainId: true },
    })

    if (!community) {
        return reply.status(404).send({ error: 'Community not found' })
    }

    if (community.blockCaptainId !== user.sub) {
        return reply.status(403).send({ error: 'Block captain access required' })
    }
}