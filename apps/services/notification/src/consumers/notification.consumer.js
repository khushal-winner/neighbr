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
exports.startNotificationConsumer = startNotificationConsumer;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const kafkajs_1 = require("kafkajs");
const accumulator_1 = require("../services/accumulator");
const sender_1 = require("../services/sender");
// flush all accumulated posts - runs on the window timer
async function flushWindow() {
    const count = (0, accumulator_1.pendingCount)();
    if (count === 0) {
        console.log(`[Notification] window flush: nothing pending`);
        return;
    }
    console.log(`[Notification] window flush : ${count} posts across communities`);
    const snapshot = (0, accumulator_1.drain)();
    // flush all communities in parallel - independent of each other
    const flushes = Array.from(snapshot.entries()).map(([communityId, posts]) => (0, sender_1.flushCommunity)(communityId, posts));
    await Promise.allSettled(flushes);
}
async function startNotificationConsumer() {
    const kafka = new kafkajs_1.Kafka({
        clientId: "notification-service",
        brokers: [process.env.KAFKA_BROKER],
        ssl: true,
        sasl: {
            mechanism: "scram-sha-256",
            username: process.env.KAFKA_USERNAME,
            password: process.env.KAFKA_PASSWORD,
        },
        logLevel: kafkajs_1.logLevel.WARN,
    });
    const consumer = kafka.consumer({ groupId: "notification-batcher" });
    try {
        await consumer.connect();
        // consumer both topics - approved regular posts and emergency alerts
        await consumer.subscribe({
            topics: ["post.created", "alerts.delhi"],
            fromBeginning: false,
        });
        console.log(`[Notification Consumer connected]`);
        await consumer.run({
            eachMessage: async ({ topic, message }) => {
                if (!message.value)
                    return;
                try {
                    const event = JSON.parse(message.value.toString());
                    // emergency alerts bypass the window - deliver immediately
                    if (topic.startsWith("alerts") || event.type === "emergency") {
                        await (0, sender_1.sendEmergencyNotification)(event);
                        return;
                    }
                    // regular posts go into the accumulator for the next window flush
                    (0, accumulator_1.accumulate)({
                        postId: event.postId,
                        communityId: event.communityId,
                        type: event.type,
                        title: event.title,
                    });
                    console.log(`[Notification] Accumulated post ${event.postId} for community ${event.communityId}`);
                }
                catch (err) {
                    console.error(`[Notification] Message processing error:`, err);
                }
            },
        });
    }
    catch (err) {
        console.warn(`[Notification] Kafka connection/subscription failed (possibly topic authorization issue):`, err);
        console.warn(`[Notification] Service remains active, but background push notifications will be skipped until Kafka topics are configured.`);
    }
    // start the window timer - flushes every NOTIFICATION_WINDOW_MS (default 1 hr)
    const windowMs = parseInt(process.env.NOTIFICATION_WINDOW_MS ?? "3600000", 10);
    const windowTimer = setInterval(async () => {
        try {
            await flushWindow();
        }
        catch (err) {
            console.error(`[Notification] Flush error:`, err);
        }
    }, windowMs);
    console.log(`[Notification] window timer set: ${windowMs / 1000 / 60} minutes`);
    process.on("SIGTERM", async () => {
        clearInterval(windowTimer);
        // flush remaining accumulated posts before shutdown
        // don't lose the current window on a graceful restart
        console.log(`[Notification] Flushing before shutdown...`);
        await flushWindow();
        await consumer.disconnect();
        process.exit(0);
    });
}
