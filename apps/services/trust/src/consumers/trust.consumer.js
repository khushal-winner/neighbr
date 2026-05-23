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
exports.startTrustConsumer = startTrustConsumer;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const kafkajs_1 = require("kafkajs");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const redis_1 = require("../plugins/redis");
const scoring_1 = require("../services/scoring");
async function processEvent(event) {
    const delta = scoring_1.TRUST_DELTAS[event.eventType];
    if (delta === undefined) {
        // unknown event type - log and skip, don't crash
        console.warn(`[Trust] Unknown event type: ${event.eventType}`);
        return;
    }
    console.log(`[Trust] ${event.eventType} for user ${event.userId} -> ${delta > 0 ? '+' : ''}${delta}`);
    // atomic update - increment score and write audit event in a transaction
    // transaction ensures the score and the audit trail never diverge
    const updatedUser = await prisma_1.default.$transaction(async (tx) => {
        // write the audit event first - if anything fails, both roll back
        await tx.trustScoreEvent.create({
            data: {
                userId: event.userId,
                eventType: event.eventType,
                delta,
                occurredAt: new Date(event.occurredAt),
            }
        });
        // apply delta with floor - score never goes below SCORE_FLOOR
        // raw SQL because Prisma doesn't support Math.max in update expressions
        const result = await tx.$queryRaw `
        UPDATE "User"
        SET "trustScore" = GREATEST("trustScore" + ${delta}, ${scoring_1.SCORE_FLOOR})
        WHERE id = ${event.userId}
        RETURNING id, "trustScore" as trust_score
        `;
        if (!result.length) {
            throw new Error(`User not found: ${event.userId}`);
        }
        return result[0];
    });
    const newBand = (0, scoring_1.getTrustBand)(updatedUser.trust_score);
    console.log(`[Trust] User ${event.userId} score: ${updatedUser.trust_score} (${newBand})`);
    // Publish to user's personal WS channel — Gateway delivers it if they're online
    // If they're not online, they'll see the updated score next time they open the profile
    const redis = (0, redis_1.getRedis)();
    await redis.publish(`ws:user:${event.userId}`, JSON.stringify({
        type: 'trust_updated',
        userId: event.userId,
        newScore: updatedUser.trust_score,
        trustBand: newBand,
        delta,
        eventType: event.eventType,
    }));
}
async function startTrustConsumer() {
    const kafka = new kafkajs_1.Kafka({
        clientId: 'trust-service',
        brokers: [process.env.KAFKA_BROKER],
        ssl: true,
        sasl: {
            mechanism: 'scram-sha-256',
            username: process.env.KAFKA_USERNAME,
            password: process.env.KAFKA_PASSWORD,
        },
        logLevel: kafkajs_1.logLevel.WARN,
    });
    const consumer = kafka.consumer({
        groupId: 'trust-score-processor',
        // if the consumer falls behind, don't reprocess ancient events on startup
        // set to 'latest' in production after initial deploy
    });
    try {
        await consumer.connect();
        await consumer.subscribe({ topic: 'user.events', fromBeginning: false });
        console.log(`[Trust] consumer connected , listenting on user.events`);
        await consumer.run({
            // proccess one message at a time - trust score updates must be ordered per user
            // eachMessage guarantees order within a partiiton (Kafka partition by key = userId)
            eachMessage: async ({ message }) => {
                if (!message.value)
                    return;
                try {
                    const event = JSON.parse(message.value.toString());
                    await processEvent(event);
                }
                catch (err) {
                    // log but don't rethrow - a bad message shouldn't stop the consumer 
                    // in production: publish to dead-letter topic for investigation
                    console.error(`[Trust] failed to process event:`, err);
                }
            }
        });
    }
    catch (err) {
        console.warn(`[Trust] Kafka connection/subscription failed (possibly topic authorization issue):`, err);
        console.warn(`[Trust] Trust service remains active, but scoring updates will be skipped until Kafka topics are configured.`);
    }
    process.on('SIGTERM', async () => {
        try {
            await consumer.disconnect();
        }
        catch { }
        process.exit(0);
    });
}
