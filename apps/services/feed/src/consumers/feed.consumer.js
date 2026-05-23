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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startFeedConsumer = startFeedConsumer;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const kafkajs_1 = require("kafkajs");
const redis_1 = require("../plugins/redis");
// 7 days in seconds - feed entries older than this expire automatically
const FEED_TTL_SECONDS = 60 * 60 * 24 * 7;
// redis key pattern: feed:{communityId}
// sorted set - score is Unix timestamp, member is postId
const feedKey = (communityId) => `feed:${communityId}`;
async function startFeedConsumer() {
    const kafka = new kafkajs_1.Kafka({
        clientId: "feed-service",
        brokers: [process.env.KAFKA_BROKER],
        ssl: true,
        sasl: {
            mechanism: "scram-sha-256",
            username: process.env.KAFKA_USERNAME,
            password: process.env.KAFKA_PASSWORD,
        },
        logLevel: kafkajs_1.logLevel.WARN, // silence INFO noise in dev
    });
    const consumer = kafka.consumer({ groupId: "feed-indexer" });
    try {
        await consumer.connect();
        await consumer.subscribe({ topic: "post.created", fromBeginning: false });
        console.log("[Feed] kafka consumer connected, listening on posts.created");
        const redis = (0, redis_1.getRedis)();
        await consumer.run({
            eachMessage: async ({ message }) => {
                if (!message.value)
                    return;
                const event = JSON.parse(message.value.toString());
                const score = new Date(event.createdAt).getTime();
                const key = feedKey(event.communityId);
                try {
                    // add this post to the community's feed index
                    await redis.zadd(key, score, event.postId);
                    // keep the sorted set alive - reset TTL on every new post
                    await redis.expire(key, FEED_TTL_SECONDS);
                    // trim to 500 entries - keep only the newest 500
                    const count = await redis.zcard(key);
                    if (count > 500) {
                        await redis.zremrangebyrank(key, 0, count - 501);
                    }
                    console.log(`[Feed] indexed post ${event.postId} in community ${event.communityId}`);
                }
                catch (err) {
                    console.error("[Feed] failed to index post:", event.postId, err);
                }
            },
        });
    }
    catch (err) {
        console.warn(`[Feed] Kafka connection/subscription failed (possibly topic authorization issue):`, err);
        console.warn(`[Feed] Feed service remains active, but background Kafka feed indexers will be skipped until Kafka topics are configured.`);
    }
    // clean shutdown - commit offsets before exiting
    process.on("SIGTERM", async () => {
        await consumer.disconnect();
        process.exit(0);
    });
}
