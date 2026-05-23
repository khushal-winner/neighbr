import * as dotenv from "dotenv";
dotenv.config();

import { Kafka, logLevel } from "kafkajs";
import { getRedis } from "../plugins/redis";

// 7 days in seconds - feed entries older than this expire automatically
const FEED_TTL_SECONDS = 60 * 60 * 24 * 7;

// redis key pattern: feed:{communityId}
// sorted set - score is Unix timestamp, member is postId
const feedKey = (communityId: string) => `feed:${communityId}`;

export interface PostCreatedEvent {
  postId: string;
  communityId: string;
  type: string;
  createdAt: string; // ISO string from moderation service , ISO means this format 2023-10-27T14:30:00Z
}

export async function startFeedConsumer(): Promise<void> {
  const kafka = new Kafka({
    clientId: "feed-service",
    brokers: [process.env.KAFKA_BROKER as string],
    ssl: true,
    sasl: {
      mechanism: "scram-sha-256",
      username: process.env.KAFKA_USERNAME as string,
      password: process.env.KAFKA_PASSWORD as string,
    },
    logLevel: logLevel.WARN, // silence INFO noise in dev
  });

  const consumer = kafka.consumer({ groupId: "feed-indexer" });

  try {
    await consumer.connect();
    await consumer.subscribe({ topic: "post.created", fromBeginning: false });

    console.log("[Feed] kafka consumer connected, listening on posts.created");

    const redis = getRedis();

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        const event: PostCreatedEvent = JSON.parse(message.value.toString());

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

          console.log(
            `[Feed] indexed post ${event.postId} in community ${event.communityId}`,
          );
        } catch (err) {
          console.error("[Feed] failed to index post:", event.postId, err);
        }
      },
    });
  } catch (err) {
    console.warn(`[Feed] Kafka connection/subscription failed (possibly topic authorization issue):`, err);
    console.warn(`[Feed] Feed service remains active, but background Kafka feed indexers will be skipped until Kafka topics are configured.`);
  }

  // clean shutdown - commit offsets before exiting
  process.on("SIGTERM", async () => {
    await consumer.disconnect();
    process.exit(0);
  });
}
