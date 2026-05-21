import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import prisma from '../plugins/prisma'
import { requireAuth } from '../plugins/auth'
import { getRedis } from '../plugins/redis'
import { VerificationLevel } from '@neighbr/db';
import { getKafkaProducer } from '../plugins/kafka'


const AddressSchema = z.object({
    address: z.string().min(5),
})

export async function verificationRoutes(app: FastifyInstance) {

    app.post('/verification/submit-address', { preHandler: requireAuth }, async (request, reply) => {
        const body = AddressSchema.safeParse(request.body)
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten().fieldErrors })
        }

        const { address } = body.data
        const user = request.user as { sub: string }

        //step 1 - using openstreetmap
        const encoded = encodeURIComponent(address)
        const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`,
            {
                headers: {
                    'User-Agent': 'Neighbr/1.0 (contact@neighbr.app)'
                }
            }
        )

        const geoData = await geoRes.json()

        if (!Array.isArray(geoData) || geoData.length === 0) {
            return reply.status(400).send({ error: 'Address could not be verified' })
        }

        const lat = parseFloat(geoData[0].lat)
        const lon = parseFloat(geoData[0].lon)

        if (isNaN(lat) || isNaN(lon)) {
            return reply.status(400).send({ error: 'Invalid coordinates returned' })
        }

        // Step 2 - find which micro-community this coordinate falls inside (PostGIS)
        const communities = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "MicroCommunity"
      WHERE ST_Contains(
        boundary::geometry,
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
      )
      LIMIT 1
    `

        if (!communities.length) {
            return reply.status(400).send({ error: 'No community found at this address' })
        }

        const communityId = communities[0].id

        // Step 3 - update user record
        // store geocoded coordinates — used by Alert Fan-Out for radius queries
        const updated = await prisma.$executeRaw`
  UPDATE "User"
  SET
    "communityId" = ${communityId},
    "verificationLevel" = 'address_verified',
    "homeLocation" = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
    "publicLocation" = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
  WHERE id = ${user.sub}        
`




        const updatedUser = await prisma.user.findUnique({
            where: { id: user.sub },
            select: {
                id: true,
                email: true,
                displayName: true,
                verificationLevel: true,
                communityId: true,
            }
        })

        const producer = await getKafkaProducer()
        await producer.send({
            topic: 'user.events',
            messages: [{
                key: user.sub,
                value: JSON.stringify({
                    userId: user.sub,
                    eventType: 'postcard_verified',
                    occuredAt: new Date().toISOString(),
                })
            }]
        })

        return reply.send({ user: updatedUser })
    })

    // post /verification/request-postcard
    app.post('/verification/request-postcard', { preHandler: requireAuth }, async (request, reply) => {
        const user = request.user as { sub: string }

        const dbUser = await prisma.user.findUnique({
            where: { id: user.sub },
            select: { verificationLevel: true }
        })

        if (!dbUser) {
            return reply.status(404).send({ error: 'User not found' })
        }

        if (dbUser.verificationLevel === VerificationLevel.postcard_verified) {
            return reply.status(400).send({ error: 'Already fully verified' })
        }

        if (dbUser.verificationLevel !== VerificationLevel.email_verified) {
            return reply.status(400).send({ error: 'Verify your address first before requesting a postcard' })
        }

        // generate 6 digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString()

        // store in redis 
        const redis = getRedis()
        await redis.set(`postcard:${user.sub}`, code, { ex: 60 * 60 * 24 * 7 }) // 7 day expiry

        // in production : trigger mailing api here
        // for now : return code directly
        return reply.send({
            message: 'Postcard requested',
            code, // remove this in production
        })
    })

    // post /verification/confirm-postcard
    app.post('/verification/confirm-postcard', { preHandler: requireAuth }, async (request, reply) => {
        const ConfirmSchema = z.object({
            code: z.string().length(6).regex(/^\d+$/, 'Code must be 6 digits string'),
        })

        const body = ConfirmSchema.safeParse(request.body)
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid request', details: body.error.flatten().fieldErrors })
        }

        const { code } = body.data
        const user = request.user as { sub: string }

        const redis = getRedis()

        // pull stored code from redis
        const storedCode = await redis.get(`postcard:${user.sub}`)


        console.log('[DEBUG] stored:', JSON.stringify(storedCode))
        console.log('[DEBUG] submitted:', JSON.stringify(code))

        if (!storedCode) {
            return reply.status(400).send({ error: 'No postcard request found or code has expired' })
        }

        if (String(storedCode) !== String(code)) {
            return reply.status(400).send({ error: 'Incorrect code' })
        }

        // code matched - delete it immediately so it can't be reused
        await redis.del(`postcard:${user.sub}`)

        const updated = await prisma.user.update({
            where: { id: user.sub },
            data: { verificationLevel: 'postcard_verified' },
            select: {
                id: true,
                email: true,
                displayName: true,
                verificationLevel: true,
                trustScore: true,
                communityId: true,
            }
        })

        return reply.send({
            message: 'Postcard verified',
            user: updated,
        })
    })
}