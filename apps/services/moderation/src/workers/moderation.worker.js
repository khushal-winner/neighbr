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
exports.startModerationWorker = startModerationWorker;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const amqplib_1 = __importDefault(require("amqplib"));
const text_provider_1 = require("../providers/text.provider");
const image_provider_1 = require("../providers/image.provider");
const prisma_1 = __importDefault(require("../plugins/prisma"));
const axios_1 = __importDefault(require("axios"));
const kafka_1 = require("../plugins/kafka");
const QUEUE = 'moderation.jobs';
async function processJob(job) {
    console.log(`[Moderation] processing post: ${job.postId}`);
    // run text + all image checks in parallel - don't do them sequentially
    const [textResult, ...imageResults] = await Promise.all([(0, text_provider_1.analyzeText)(job.text), ...job.imageUrls.map(url => (0, image_provider_1.analyzeImage)(url))]);
    const allResults = [textResult, ...imageResults];
    const maxScore = Math.max(...allResults.map(r => r.score));
    const anyFlagged = allResults.some(r => r.flagged); // this will be true if any result is flagged
    // trusted users get a higher flagging threshold
    // a community Pillar (score 200+) gets more benefit of the doubt
    const threshold = job.trustScore >= 100 ? 0.8 : 0.6;
    const decision = anyFlagged || maxScore >= threshold ? 'flagged' : 'approved';
    // store the decision - audit trail, useful for appeals
    await prisma_1.default.moderationDecision.create({
        data: {
            postId: job.postId,
            decision,
            score: maxScore,
        }
    });
    // call Post service to update the post's moderationStatus
    // this is service-to-service on internal network - no auth header needed 
    const postServiceUrl = process.env.POST_SERVICE_URL ?? 'http://localhost:3002';
    // CRITICAL PATH — patch the post status via HTTP
    // If this fails (e.g. 404), we either skip or retry the whole job
    try {
        await axios_1.default.patch(`${postServiceUrl}/posts/${job.postId}/status`, {
            status: decision,
        });
    }
    catch (error) {
        if (error.response?.status === 404) {
            console.log(`[Moderation] Post ${job.postId} not found, skipping update`);
            return; // Don't retry - the post doesn't exist
        }
        throw error; // Re-throw other errors to trigger retry
    }
    // NON-CRITICAL — Kafka event publishing is fire-and-forget
    // If the broker is unreachable or topics don't exist yet, log and move on.
    // Downstream consumers (feed, trust, notifications) will miss this event
    // but the post is already approved/flagged in the database.
    if (decision === 'approved') {
        try {
            const producer = await (0, kafka_1.getKafkaProducer)();
            await producer.send({
                topic: 'post.created',
                messages: [{
                        key: job.postId,
                        value: JSON.stringify({
                            postId: job.postId,
                            communityId: job.communityId,
                            type: job.text.split('\n')[0],
                            createdAt: new Date().toISOString(),
                        })
                    }]
            });
        }
        catch (kafkaErr) {
            console.warn(`[Moderation] Kafka post.created publish failed (non-fatal):`, kafkaErr.message);
        }
    }
    try {
        const producer = await (0, kafka_1.getKafkaProducer)();
        await producer.send({
            topic: 'user.events',
            messages: [{
                    key: job.authorId,
                    value: JSON.stringify({
                        userId: job.authorId,
                        eventType: decision === 'approved' ? 'post_approved' : 'post_removed',
                        occuredAt: new Date().toISOString(),
                    })
                }]
        });
    }
    catch (kafkaErr) {
        console.warn(`[Moderation] Kafka user.events publish failed (non-fatal):`, kafkaErr.message);
    }
    console.log(`[Moderation] Post ${job.postId} → ${decision} (score : ${maxScore.toFixed(2)})`);
}
async function startModerationWorker() {
    const url = process.env.RABBITMQ_URL;
    if (!url)
        throw new Error('RABBITMQ_URL is not set');
    console.log('[Moderation] connecting to RABBITMQ...');
    const connection = await amqplib_1.default.connect(url);
    const channel = await connection.createChannel();
    // durable : true
    await channel.assertQueue(QUEUE, { durable: true });
    // one job at a time - don't receive the next until current is ACKed 
    channel.prefetch(1);
    console.log(`[Moderation] listening on queue: ${QUEUE}`);
    channel.consume(QUEUE, async (msg) => {
        if (!msg)
            return;
        try {
            const job = JSON.parse(msg.content.toString());
            await processJob(job);
            // only ACK after everything succeeded - db write + post service callback
            channel.ack(msg);
        }
        catch (err) {
            console.log('[Moderation] job failed', err);
            // NACK - put message back in queue for retry
            // second arg false = don't batch, third arg true = requeue
            channel.nack(msg, false, true);
        }
    });
    // graceful shutdown - finish current job before exiting
    process.on('SIGTERM', async () => {
        console.log('[Moderation] shutting down gracefully...');
        await channel.close();
        await connection.close();
        process.exit(0);
    });
    // reconnection on connection drop
    connection.on('error', (err) => {
        console.error('[Moderation] RabbitMQ connection lost:', err.message);
        console.log('[Moderation] Restarting in 5s');
        setTimeout(() => startModerationWorker(), 5000);
    });
}
