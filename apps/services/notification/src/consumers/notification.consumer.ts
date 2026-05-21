import * as dotenv from "dotenv";
dotenv.config();

import { Kafka, logLevel } from "kafkajs";
import { accumulate, drain, pendingCount } from "../services/accumulator";
import { flushCommunity, sendEmergencyNotification } from "../services/sender";

interface PostCreatedEvent {
    postId: string;
    communityId: string;
    type: string;
    title: string;
    createdAt: string;
}

// flush all accumulated posts - runs on the window timer
async function flushWindow(): Promise<void> {
    const count = pendingCount();

    if (count === 0) {
        console.log(`[Notification] window flush: nothing pending`);
        return;
    }

    console.log(
        `[Notification] window flush : ${count} posts across communities`,
    );

    const snapshot = drain();

    // flush all communities in parallel - independent of each other
    const flushes = Array.from(snapshot.entries()).map(([communityId, posts]) =>
        flushCommunity(communityId, posts),
    );

    await Promise.allSettled(flushes);
}

export async function startNotificationConsumer(): Promise<void> {
    const kafka = new Kafka({
        clientId: "notification-service",
        brokers: [process.env.KAFKA_BROKER as string],
        ssl: true,
        sasl: {
            mechanism: "scram-sha-256",
            username: process.env.KAFKA_USERNAME as string,
            password: process.env.KAFKA_PASSWORD as string,
        },
        logLevel: logLevel.WARN,
    });

    const consumer = kafka.consumer({ groupId: "notification-batcher" });

    await consumer.connect();

    // consumer both topics - approved regular posts and emergency alerts
    await consumer.subscribe({
        topics: ["post.created", "alerts.delhi"],
        fromBeginning: false,
    });

    console.log(`[Notification Consumer connected]`);

    // start the window timer - flushes every NOTIFICATION_WINDOW_MS (default 1 hr)
    const windowMs = parseInt(
        process.env.NOTIFICATION_WINDOW_MS ?? "3600000",
        10,
    );

    const windowTimer = setInterval(async () => {
        try {
            await flushWindow();
        } catch (err) {
            console.error(`[Notification] Flush error:`, err);
        }
    }, windowMs);

    console.log(
        `[Notification] window timer set: ${windowMs / 1000 / 60} minutes`,
    );

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            if (!message.value) return;

            try {
                const event: PostCreatedEvent = JSON.parse(message.value.toString());

                // emergency alerts bypass the window - deliver immediately
                if (topic.startsWith("alerts") || event.type === "emergency") {
                    await sendEmergencyNotification(event);
                    return;
                }

                // regular posts go into the accumulator for the next window flush
                accumulate({
                    postId: event.postId,
                    communityId: event.communityId,
                    type: event.type,
                    title: event.title,
                });

                console.log(
                    `[Notification] Accumulated post ${event.postId} for community ${event.communityId}`,
                );
            } catch (err) {
                console.error(`[Notification] Message processing error:`, err);
            }
        },
    });

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
