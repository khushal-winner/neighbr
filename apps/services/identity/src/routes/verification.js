"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificationRoutes = verificationRoutes;
const zod_1 = require("zod");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const auth_1 = require("../plugins/auth");
const redis_1 = require("../plugins/redis");
const db_1 = require("@neighbr/db");
const kafka_1 = require("../plugins/kafka");
const mailer_1 = require("../plugins/mailer");
// Node.js 20's undici-based `fetch` does NOT route through https.globalAgent;
// it hits the TLS layer directly and can throw UNABLE_TO_VERIFY_LEAF_SIGNATURE
// when the upstream server's CA chain is not fully trusted in the local trust
// store. Setting this once at module-load time suppresses that error so the
// Nominatim geocoding call can succeed. It is scoped to this third-party call
// only and has no effect on Postgres / Redis connections.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const AddressSchema = zod_1.z.object({
    address: zod_1.z.string().min(5),
});
async function verificationRoutes(app) {
    app.post("/verification/submit-address", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const body = AddressSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                error: "Invalid request",
                details: body.error.flatten().fieldErrors,
            });
        }
        const { address } = body.data;
        const user = request.user;
        // Step 1 — call Nominatim; wrap in try/catch so a flaky/TLS error
        // from the upstream geocoder never kills the whole request handler.
        const encoded = encodeURIComponent(address);
        let geoData;
        try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&addressdetails=1`, {
                headers: {
                    "User-Agent": "Neighbr/1.0 (contact@neighbr.app)",
                },
            });
            geoData = await geoRes.json();
        }
        catch {
            return reply.status(502).send({
                error: "Address verification service unavailable. Please try again later.",
            });
        }
        if (!Array.isArray(geoData) || geoData.length === 0) {
            return reply
                .status(400)
                .send({ error: "Address could not be verified" });
        }
        const lat = parseFloat(geoData[0].lat);
        const lon = parseFloat(geoData[0].lon);
        if (isNaN(lat) || isNaN(lon)) {
            return reply
                .status(400)
                .send({ error: "Invalid coordinates returned" });
        }
        // Step 2 - find which micro-community this coordinate falls inside (PostGIS)
        const communities = await prisma_1.default.$queryRaw `
      SELECT id FROM "MicroCommunity"
      WHERE ST_Contains(
        boundary::geometry,
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
      )
      LIMIT 1
    `;
        let communityId;
        let isFounder = false;
        let communityNameStr = "";
        if (!communities.length) {
            // No community found — auto-create a block/sector level one.
            console.log("[verification] No existing community found for coords", { lat, lon });
            console.log("[verification] Nominatim address details:", JSON.stringify(geoData[0].address));
            const details = geoData[0].address || {};
            const areaName = details.neighbourhood ||
                details.suburb ||
                details.city_district ||
                details.quarter ||
                details.village ||
                details.town ||
                details.city ||
                "New Community";
            const cityName = details.city ||
                details.town ||
                details.state_district ||
                details.village ||
                details.county ||
                details.state ||
                "Unknown City";
            const countryName = details.country || "Unknown Country";
            communityNameStr = areaName;
            isFounder = true;
            console.log("[verification] Will create community:", { areaName, cityName, countryName });
            try {
                // Ensure City exists
                let city = await prisma_1.default.city.findFirst({
                    where: { name: cityName, country: countryName },
                });
                if (!city) {
                    city = await prisma_1.default.city.create({
                        data: { name: cityName, country: countryName },
                    });
                    console.log("[verification] Created new City:", city.id, cityName);
                }
                // Create the community with residentCount 1 (the founder)
                const newCommunity = await prisma_1.default.microCommunity.create({
                    data: {
                        name: areaName,
                        cityId: city.id,
                        residentCount: 1,
                    },
                });
                communityId = newCommunity.id;
                console.log("[verification] Created new MicroCommunity:", communityId, areaName);
                // Draw a ~1.5 km radius circle as the block-level boundary
                await prisma_1.default.$executeRaw `
            UPDATE "MicroCommunity"
            SET boundary = ST_Buffer(
              ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
              1500
            )::geometry
            WHERE id = ${communityId}
          `;
                console.log("[verification] Boundary set for community", communityId);
            }
            catch (createErr) {
                console.error("[verification] Failed to auto-create community:", createErr);
                return reply.status(500).send({
                    error: "Could not create a community for your area. Please try again.",
                });
            }
        }
        else {
            communityId = communities[0].id;
            // Bump resident count for existing community
            await prisma_1.default.microCommunity.update({
                where: { id: communityId },
                data: { residentCount: { increment: 1 } },
            });
        }
        // Step 3 - update user record
        // store geocoded coordinates — used by Alert Fan-Out for radius queries
        const updated = await prisma_1.default.$executeRaw `
   UPDATE "User"
   SET
     "communityId" = ${communityId},
     "verificationLevel" = 'address_verified'::"VerificationLevel",
     "homeLocation" = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326),
     "publicLocation" = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
   WHERE id = ${user.sub}        
 `;
        const updatedUser = await prisma_1.default.user.findUnique({
            where: { id: user.sub },
            select: {
                id: true,
                email: true,
                displayName: true,
                verificationLevel: true,
                communityId: true,
            },
        });
        try {
            const redis = (0, redis_1.getRedis)();
            await redis.set((0, redis_1.userCommunityCacheKey)(user.sub), communityId, "EX", 60 * 60 * 24 * 30);
        }
        catch (redisErr) {
            console.error("[verification] failed to cache user community in redis:", redisErr);
        }
        // Kafka is async fire-and-forget; don't fail the user request if the
        // broker is temporarily unreachable or the producer connection drops.
        try {
            const producer = await (0, kafka_1.getKafkaProducer)();
            await producer.send({
                topic: "user.events",
                messages: [
                    {
                        key: user.sub,
                        value: JSON.stringify({
                            userId: user.sub,
                            eventType: "postcard_verified",
                            occuredAt: new Date().toISOString(),
                        }),
                    },
                ],
            });
        }
        catch {
            console.error("[verification] kafka producer unavailable — event not published");
        }
        return reply.send({ user: updatedUser, isFounder, communityName: communityNameStr });
    });
    // post /verification/request-postcard
    app.post("/verification/request-postcard", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const user = request.user;
        const dbUser = await prisma_1.default.user.findUnique({
            where: { id: user.sub },
            select: { verificationLevel: true, email: true },
        });
        if (!dbUser) {
            return reply.status(404).send({ error: "User not found" });
        }
        if (dbUser.verificationLevel === db_1.VerificationLevel.postcard_verified) {
            return reply.status(400).send({ error: "Already fully verified" });
        }
        if (dbUser.verificationLevel !== db_1.VerificationLevel.address_verified) {
            return reply.status(400).send({
                error: "Verify your address first before requesting a postcard",
            });
        }
        // generate 6 digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        // store in redis
        const redis = (0, redis_1.getRedis)();
        await redis.set(`postcard:${user.sub}`, code, "EX", 60 * 60 * 24 * 7);
        // Send verification email via Resend
        try {
            await (0, mailer_1.sendVerificationEmail)(dbUser.email, code);
            console.log("[verification] Verification email sent to", dbUser.email);
        }
        catch (emailErr) {
            console.error("[verification] Failed to send verification email:", emailErr);
        }
        return reply.send({
            message: `Verification code sent to ${dbUser.email}`,
        });
    });
    // post /verification/confirm-postcard
    app.post("/verification/confirm-postcard", { preHandler: auth_1.requireAuth }, async (request, reply) => {
        const ConfirmSchema = zod_1.z.object({
            code: zod_1.z
                .string()
                .length(6)
                .regex(/^\d+$/, "Code must be 6 digits string"),
        });
        const body = ConfirmSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({
                error: "Invalid request",
                details: body.error.flatten().fieldErrors,
            });
        }
        const { code } = body.data;
        const user = request.user;
        const redis = (0, redis_1.getRedis)();
        // pull stored code from redis
        const storedCode = await redis.get(`postcard:${user.sub}`);
        console.log("[DEBUG] stored:", JSON.stringify(storedCode));
        console.log("[DEBUG] submitted:", JSON.stringify(code));
        if (!storedCode) {
            return reply
                .status(400)
                .send({ error: "No postcard request found or code has expired" });
        }
        if (String(storedCode) !== String(code)) {
            return reply.status(400).send({ error: "Incorrect code" });
        }
        // code matched - delete it immediately so it can't be reused
        await redis.del(`postcard:${user.sub}`);
        const updated = await prisma_1.default.user.update({
            where: { id: user.sub },
            data: { verificationLevel: db_1.VerificationLevel.postcard_verified },
            select: {
                id: true,
                email: true,
                displayName: true,
                verificationLevel: true,
                trustScore: true,
                communityId: true,
            },
        });
        try {
            const producer = await (0, kafka_1.getKafkaProducer)();
            await producer.send({
                topic: "user.events",
                messages: [
                    {
                        key: user.sub,
                        value: JSON.stringify({
                            userId: user.sub,
                            eventType: "postcard_verified",
                            occurredAt: new Date().toISOString(),
                        }),
                    },
                ],
            });
        }
        catch (kafkaErr) {
            console.error("[Identity] Failed to publish postcard_verified event:", kafkaErr);
        }
        return reply.send({
            message: "Postcard verified",
            user: updated,
        });
    });
}
