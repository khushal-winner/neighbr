import z from "zod";
import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import prisma from "../plugins/prisma";
import { requireAuth } from "../plugins/auth"


const RegisterSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(2).max(50),
})

export async function authRoutes(app: FastifyInstance) {

    // post /auth/register
    app.post('/auth/register', async (request, reply) => {
        const body = RegisterSchema.safeParse(request.body)

        if (!body.success) {
            return reply.status(400).send({
                error: 'Invalid request',
                details: body.error.flatten().fieldErrors
            })
        }

        const { email, password, displayName } = body.data

        // check if email already exists
        const existing = await prisma.user.findUnique({
            where: {
                email
            }
        })

        if (existing) {
            return reply.status(409).send({
                error: 'Email already exists'
            })
        }

        // hash password
        const passwordHash = await bcrypt.hash(password, 12)

        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                displayName,
                verificationLevel: 'unverified',
                trustScore: 0,
            },
            select: {
                id: true,
                email: true,
                displayName: true,
                verificationLevel: true,
                trustScore: true,
                createdAt: true,
            }
        })

        return reply.status(201).send({
            user
        })
    })
    // post /auth/login

    app.post('/auth/login', async (request, reply) => {
        const LoginSchema = z.object({
            email: z.string().email(),
            password: z.string().min(1),
        })

        const body = LoginSchema.safeParse(request.body)

        if (!body.success) {
            return reply.status(400).send({
                error: 'Invalid request',
                details: body.error.flatten().fieldErrors
            })
        }

        const { email, password } = body.data

        // find user
        const user = await prisma.user.findUnique({
            where: {
                email
            }
        })

        if (!user) {
            return reply.status(401).send({
                error: 'Invalid credentials'
            })
        }

        const valid = await bcrypt.compare(password, user.passwordHash)

        if (!valid) {
            return reply.status(401).send({ error: 'Invalid Credentials' })

        }

        // sign access token
        const accessToken = app.jwt.sign({
            sub: user.id,
            email: user.email,
            communityId: user.communityId,
            verificationLevel: user.verificationLevel,
        }, {
            expiresIn: '15m'
        })

        // sign refresh token
        const refreshToken = app.jwt.sign(
            { sub: user.id },
            { expiresIn: '7d' }
        )

        // store refresh token in redis so we can invalidate it on logout

        reply.setCookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 // 7 days
        })

        return reply.status(200).send({
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                verificationLevel: user.verificationLevel,
                trustScore: user.trustScore,
            }
        })
    })

    // get /auth/me
    app.get('/auth/me', { preHandler: requireAuth }, async (request, reply) => {
        // after jwtVerify passes, reques.user contains the decoded token payload
        const user = request.user as {
            sub: string
            email: string
            communityId: string | null
            verificationLevel: string
        }

        const dbUser = await prisma.user.findUnique({
            where: { id: user.sub },
            select: {
                id: true,
                email: true,
                displayName: true,
                verificationLevel: true,
                trustScore: true,
                communityId: true,
                createdAt: true,
            }
        })

        if (!dbUser) {
            return reply.status(404).send({ error: 'User not found' })
        }

        return reply.status(200).send({
            user: {
                id: user.sub,
                email: user.email,
                communityId: user.communityId,
                verificationLevel: user.verificationLevel,
            }
        })
    })

    // post /auth/refresh
    app.post('/auth/refresh', async (request, reply) => {
        const refreshToken = request.cookies?.refreshToken

        if (!refreshToken) {
            return reply.status(401).send({ error: 'No refresh token' })
        }

        // verify the refresh token
        let payload: { sub: string }

        try {
            payload = app.jwt.verify(refreshToken)
        } catch (error) {
            return reply.status(401).send({ error: 'Invalid refresh token' })
        }

        // fetch fresh user data

        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                communityId: true,
                verificationLevel: true,
                trustScore: true,
            }
        })

        if (!user) {
            return reply.status(404).send({ error: 'User not found' })
        }

        // new access token
        const newAccessToken = app.jwt.sign({
            sub: user.id,
            email: user.email,
            communityId: user.communityId,
            verificationLevel: user.verificationLevel,
        }, {
            expiresIn: '15m'
        })

        // rotate refresh token
        const newRefreshToken = app.jwt.sign(
            { sub: user.id },
            { expiresIn: '7d' }

        )

        reply.setCookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        })

        return reply.status(200).send({
            accessToken: newAccessToken

        })
    })

    // post /auth/logout

    app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {

        reply.clearCookie('refreshToken')
        return reply.send({ message: 'Logged out successfully' })
    })
}

