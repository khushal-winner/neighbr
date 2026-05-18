import { FastifyRequest, FastifyReply } from 'fastify'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    try {
        await request.jwtVerify()
    } catch (error) {
        reply.status(401).send({ error: 'Unauthorized' })
    }
}