"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = __importDefault(require("zod"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = __importDefault(require("../plugins/prisma"));
const auth_1 = require("../plugins/auth");
const trustBand_1 = require("../services/trustBand");
const RegisterSchema = zod_1.default.object({
    email: zod_1.default.string().email(),
    password: zod_1.default.string().min(8),
    displayName: zod_1.default.string().min(2).max(50),
});
async function withCommunityName(user) {
    if (!user.communityId) {
        return { ...user, communityName: null };
    }
    const community = await prisma_1.default.microCommunity.findUnique({
        where: { id: user.communityId },
        select: { name: true },
    });
    return { ...user, communityName: community?.name ?? null };
}
async function authRoutes(app) {
    // post /auth/register
    app.post("/auth/register", async (request, reply) => {
        const body = RegisterSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                error: "Invalid request",
                details: body.error.flatten().fieldErrors,
            });
        }
        const { email, password, displayName } = body.data;
        // check if email already exists
        const existing = await prisma_1.default.user.findUnique({
            where: {
                email,
            },
        });
        if (existing) {
            return reply.status(409).send({
                error: "Email already exists",
            });
        }
        // hash password
        const passwordHash = await bcrypt_1.default.hash(password, 12);
        const user = await prisma_1.default.user.create({
            data: {
                email,
                passwordHash,
                displayName,
                verificationLevel: "unverified",
                trustScore: 0,
            },
            select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                verificationLevel: true,
                trustScore: true,
                communityId: true,
                createdAt: true,
            },
        });
        return reply.status(201).send({
            user: { ...user, trustBand: (0, trustBand_1.getTrustBand)(user.trustScore) },
        });
    });
    // post /auth/login
    app.post("/auth/login", async (request, reply) => {
        const LoginSchema = zod_1.default.object({
            email: zod_1.default.string().email(),
            password: zod_1.default.string().min(1),
        });
        const body = LoginSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                error: "Invalid request",
                details: body.error.flatten().fieldErrors,
            });
        }
        const { email, password } = body.data;
        // find user
        const user = await prisma_1.default.user.findUnique({
            where: {
                email,
            },
        });
        if (!user) {
            return reply.status(401).send({
                error: "Invalid credentials",
            });
        }
        const valid = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!valid) {
            return reply.status(401).send({ error: "Invalid Credentials" });
        }
        // sign access token
        const accessToken = app.jwt.sign({
            sub: user.id,
            email: user.email,
            communityId: user.communityId,
            verificationLevel: user.verificationLevel,
        }, {
            expiresIn: "15m",
        });
        // sign refresh token
        const refreshToken = app.jwt.sign({ sub: user.id }, { expiresIn: "7d" });
        // store refresh token in redis so we can invalidate it on logout
        // different dev ports (3000 → 3001) are cross-site in the browser spec;
        // 'none' lets the cookie be sent on cross-site POSTs; Secure is true only in prod.
        const cookieAttrs = {
            httpOnly: true,
            sameSite: "none",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 7 * 24 * 60 * 60,
        };
        reply.setCookie("refreshToken", refreshToken, cookieAttrs);
        const fullUser = await prisma_1.default.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                verificationLevel: true,
                trustScore: true,
                communityId: true,
            },
        });
        const userWithCommunity = await withCommunityName(fullUser);
        return reply.status(200).send({
            accessToken,
            user: {
                ...userWithCommunity,
                trustBand: (0, trustBand_1.getTrustBand)(userWithCommunity.trustScore),
            },
        });
    });
    // get /auth/me
    app.get("/auth/me", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        // after jwtVerify passes, reques.user contains the decoded token payload
        const user = request.user;
        const dbUser = await prisma_1.default.user.findUnique({
            where: { id: user.sub },
            select: {
                id: true,
                email: true,
                displayName: true,
                avatarUrl: true,
                verificationLevel: true,
                trustScore: true,
                communityId: true,
                createdAt: true,
            },
        });
        if (!dbUser) {
            return reply.status(404).send({ error: "User not found" });
        }
        const userWithCommunity = await withCommunityName(dbUser);
        return reply.status(200).send({
            user: {
                ...userWithCommunity,
                trustBand: (0, trustBand_1.getTrustBand)(dbUser.trustScore),
            },
        });
    });
    // post /auth/refresh
    app.post("/auth/refresh", async (request, reply) => {
        const refreshToken = request.cookies?.refreshToken;
        if (!refreshToken) {
            return reply.status(401).send({ error: "No refresh token" });
        }
        // verify the refresh token
        let payload;
        try {
            payload = app.jwt.verify(refreshToken);
        }
        catch (error) {
            return reply.status(401).send({ error: "Invalid refresh token" });
        }
        // fetch fresh user data
        const user = await prisma_1.default.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                communityId: true,
                verificationLevel: true,
                trustScore: true,
            },
        });
        if (!user) {
            return reply.status(404).send({ error: "User not found" });
        }
        // new access token
        const newAccessToken = app.jwt.sign({
            sub: user.id,
            email: user.email,
            communityId: user.communityId,
            verificationLevel: user.verificationLevel,
        }, {
            expiresIn: "15m",
        });
        // rotate refresh token
        const newRefreshToken = app.jwt.sign({ sub: user.id }, { expiresIn: "7d" });
        reply.setCookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
            path: "/",
            maxAge: 60 * 60 * 24 * 7, // 7 days
        });
        return reply.status(200).send({
            accessToken: newAccessToken,
            trustBand: (0, trustBand_1.getTrustBand)(user.trustScore),
        });
    });
    // post /auth/logout
    app.post("/auth/logout", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        reply.clearCookie("refreshToken");
        return reply.send({ message: "Logged out successfully" });
    });
}
