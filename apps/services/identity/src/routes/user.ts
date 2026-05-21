import { FastifyInstance } from "fastify"
import prisma from '../plugins/prisma'
import { getTrustBand } from "../services/trustBand"
import { requireAuth } from "../plugins/auth"
import z from "zod"


export async function userRoutes(app: FastifyInstance) {


    // get /users/:id/profile - public id (intentionally public)
    app.get('/users/:id/profile', async (request, reply) => {
        const { id } = request.params as { id: string }

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                displayName: true,
                verificationLevel: true,
                communityId: true,
                trustScore: true,
                createdAt: true,

            }
        })

        if (!user) {
            return reply.status(404).send({ error: 'User not found' })
        }

        // trustBand is a derived state based on trustScore
        return reply.send({
            user: {
                ...user,
                trustBand: getTrustBand(user.trustScore)
            }
        })
    })

    // patch /users/me
    app.patch('/users/me', { preHandler: requireAuth }, async (request, reply) => {
        const UpdateSchema = z.object({
            displayName: z.string().min(2).max(50).optional(),
            notificationPrefs: z.object({
                emailDigest: z.boolean().optional(),
                pushAlerts: z.boolean().optional(),
                emergencyOnly: z.boolean().optional(),
            }).optional(),
        })

        const body = UpdateSchema.safeParse(request.body)
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid request body', details: body.error.flatten().fieldErrors })
        }

        // nothing provided - don't hit the db for no reason
        if (!body.data.displayName && !body.data.notificationPrefs) {
            return reply.status(400).send({ error: 'No updates provided' })
        }

        const user = request.user as { sub: string }
        const updateData: Record<string, any> = {}

        if (body.data.displayName) {
            updateData.displayName = body.data.displayName
        }

        if (body.data.notificationPrefs) {
            // merge with existing prefs instead of replacing entirely 
            const existing = await prisma.user.findUnique({
                where: { id: user.sub },
                select: {
                    notificationPrefs: true
                }
            })

            const currentPrefs = (existing?.notificationPrefs as Record<string, unknown>) ?? {} // this syntax means "if existing.notificationPrefs is not null, cast it to Record<string, unknown>, otherwise use an empty object"

            updateData.notificationPrefs = {
                ...currentPrefs,
                ...body.data.notificationPrefs
            }

            const updated = await prisma.user.update({
                where: { id: user.sub },
                data: updateData,
                select: {
                    id: true,
                    email: true,
                    verificationLevel: true,
                    trustScore: true,
                    communityId: true,
                    displayName: true,
                    notificationPrefs: true,
                }
            })

            return reply.send({ user: updated })
        }

    })

    // POST /users/me/fcm-toke
    // called by frontend after firebase gives it a device token
    // one user can have multiple token - one per device
    app.post('users/me/fcm-token', { preHandler: requireAuth }, async (request, reply) => {
        const Schema = z.object({
            token: z.string().min(1),
        })

        const body = Schema.safeParse(request.body)
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid Token' })
        }

        const user = request.user as { sub: string }

        // upsert - if token already registered for this ser, update timestamp

        await prisma.fcmToken.upsert({
            where: { token: body.data.token },
            create: { userId: user.sub, token: body.data.token },
            update: { userId: user.sub },
        })

        return reply.send({ message: 'Token registered' })
    })
}