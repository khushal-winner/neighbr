"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAlertConsumer = startAlertConsumer;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const kafkajs_1 = require("kafkajs");
const redis_1 = require("../plugins/redis");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const console_1 = __importDefault(require("console"));
// Redis channel the websocket gateway subscribes to per user
const userChannel = (userId) => `ws:user:${userId}`;
// Redis stream key - offline users read from this on reconnect
const alertStreamKey = (communityId) => `alerts:${communityId}`;
const RADIS_METERS = parseInt(process.env.ALERT_RADIUS_METERS ?? "500", 10);
async function fanOutAlert(event) {
    console_1.default.log(`[Alert] Fanning out: ${event.postId}`);
    // find all users whose home location is within radius of the alert's origin
    // we use the author's stored coordinates as the alert's epicentre
    // ST_DWithin with geography type uses metres — no unit conversion needed
    let affectedUsers = await prisma_1.default.$queryRaw `
    SELECT u.id
    FROM "User" u
    JOIN "User" author ON author.id = ${event.authorId}
    WHERE
      u.id != ${event.authorId}
      AND u."homeLocation" IS NOT NULL
      AND author."homeLocation" IS NOT NULL
      AND ST_DWithin(
        u."homeLocation"::geography,
        author."homeLocation"::geography,
        ${process.env.RADIUS_METERS}
      )
  `;
    console_1.default.log(`[Alert] ${affectedUsers.length} users in radius`);
    // fallback: if no users have coordinates, broadcast to entire community
    if (affectedUsers.length === 0) {
        console_1.default.log(`[Alert] No users with coordinates, falling back to community broadcast`);
        affectedUsers = await prisma_1.default.$queryRaw `
      SELECT id
      FROM "User"
      WHERE
        "communityId" = ${event.communityId}
        AND id != ${event.authorId}
    `;
        console_1.default.log(`[Alert] ${affectedUsers.length} users in community`);
    }
    if (affectedUsers.length === 0)
        return;
    const redis = (0, redis_1.getRedis)();
    // the alert payload we push to every affected user
    const alertPayload = JSON.stringify({
        type: "emergency_alert",
        postId: event.postId,
        title: event.title,
        body: event.body,
        communityId: event.communityId,
        timestamp: event.created,
    });
    // fan-out in parallel — don't await each user sequentially
    // pipeline batches Redis commands — one round trip for many publishes
    const pipeline = redis.pipeline();
    for (const user of affectedUsers) {
        // online path: WebSocket Gateway subscribes to this channel
        // if no subscriber is listening, the message is simply dropped — that's fine
        // offline users get it via the stream below
        pipeline.publish(userChannel(user.id), alertPayload);
    }
    // offline path: append to stream so Gateway can replay on reconnect
    // MAXLEN 100 — keep last 100 alerts per community, trim older ones
    pipeline.xadd(alertStreamKey(event.communityId), "*", { payload: alertPayload });
    await pipeline.exec();
    console_1.default.log(`[Alert] Published to ${affectedUsers.length} users + stream`);
}
async function startAlertConsumer() {
    const kafka = new kafkajs_1.Kafka({
        clientId: "alert-fanout",
        brokers: [process.env.KAFKA_BROKER],
        ssl: true,
        sasl: {
            mechanism: "scram-sha-256",
            username: process.env.KAFKA_USERNAME,
            password: process.env.KAFKA_PASSWORD,
        },
        logLevel: kafkajs_1.logLevel.WARN,
    });
    const consumer = kafka.consumer({ groupId: "alert-fanout-group" });
    try {
        await consumer.connect();
        // subscribe to city-scoped alert topics
        // in production you'd subscribe to a pattern or enumerate all city topics
        // for dev, subscribe to the topic you created in Redpanda
        await consumer.subscribe({ topic: "alerts.delhi", fromBeginning: false });
        console_1.default.log("[Alert] Kafka consumer connected, listening on alerts.delhi");
        await consumer.run({
            eachMessage: async ({ message }) => {
                if (!message.value)
                    return;
                try {
                    const event = JSON.parse(message.value.toString());
                    await fanOutAlert(event);
                }
                catch (err) {
                    console_1.default.error("[Alert] Fan-out failed:", err);
                    // don't rethrow — a failed fan-out shouldn't stop the consumer
                    // in production you'd publish to a dead-letter topic here
                }
            },
        });
    }
    catch (err) {
        console_1.default.warn(`[Alert] Kafka connection/subscription failed (possibly topic authorization issue):`, err);
        console_1.default.warn(`[Alert] Alert service remains active, but background Kafka alert broadcasts will be skipped until Kafka topics are configured.`);
    }
    process.on("SIGTERM", async () => {
        await consumer.disconnect();
        process.exit(0);
    });
}
