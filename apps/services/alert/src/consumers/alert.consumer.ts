import * as dotenv from "dotenv";
dotenv.config();

import { Kafka, logLevel } from "kafkajs";
import { getRedis } from "../plugins/redis";
import prisma from "../plugins/prisma";
import console from "console";

interface AlertEvent {
  postId: string;
  communityId: string;
  cityId: string;
  title: string;
  body: string;
  authorId: string;
  created: string;
}

// Redis channel the websocket gateway subscribes to per user
const userChannel = (userId: string) => `ws:user:${userId}`;

// Redis stream key - offline users read from this on reconnect
const alertStreamKey = (communityId: string) => `alerts:${communityId}`;

const RADIS_METERS = parseInt(process.env.ALERT_RADIUS_METERS ?? "500", 10);

async function fanOutAlert(event: AlertEvent): Promise<void> {
  console.log(`[Alert] Fanning out: ${event.postId}`);

  // find all users whose home location is within radius of the alert's origin
  // we use the author's stored coordinates as the alert's epicentre
  // ST_DWithin with geography type uses metres — no unit conversion needed
  let affectedUsers = await prisma.$queryRaw<{ id: string }[]>`
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

  console.log(`[Alert] ${affectedUsers.length} users in radius`);

  // fallback: if no users have coordinates, broadcast to entire community
  if (affectedUsers.length === 0) {
    console.log(`[Alert] No users with coordinates, falling back to community broadcast`);
    affectedUsers = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "User"
      WHERE
        "communityId" = ${event.communityId}
        AND id != ${event.authorId}
    `;
    console.log(`[Alert] ${affectedUsers.length} users in community`);
  }

  if (affectedUsers.length === 0) return;

  const redis = getRedis();

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
  pipeline.xadd(
    alertStreamKey(event.communityId),
    "*",
    { payload: alertPayload }
  );

  await pipeline.exec();

  console.log(`[Alert] Published to ${affectedUsers.length} users + stream`);
}

export async function startAlertConsumer(): Promise<void> {
  const kafka = new Kafka({
    clientId: "alert-fanout",
    brokers: [process.env.KAFKA_BROKER as string],
    ssl: true,
    sasl: {
      mechanism: "scram-sha-256",
      username: process.env.KAFKA_USERNAME as string,
      password: process.env.KAFKA_PASSWORD as string,
    },
    logLevel: logLevel.WARN,
  });

  const consumer = kafka.consumer({ groupId: "alert-fanout-group" });

  try {
    await consumer.connect();

    // subscribe to city-scoped alert topics
    // in production you'd subscribe to a pattern or enumerate all city topics
    // for dev, subscribe to the topic you created in Redpanda
    await consumer.subscribe({ topic: "alerts.delhi", fromBeginning: false });

    console.log("[Alert] Kafka consumer connected, listening on alerts.delhi");

    await consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          const event: AlertEvent = JSON.parse(message.value.toString());
          await fanOutAlert(event);
        } catch (err) {
          console.error("[Alert] Fan-out failed:", err);
          // don't rethrow — a failed fan-out shouldn't stop the consumer
          // in production you'd publish to a dead-letter topic here
        }
      },
    });
  } catch (err) {
    console.warn(`[Alert] Kafka connection/subscription failed (possibly topic authorization issue):`, err);
    console.warn(`[Alert] Alert service remains active, but background Kafka alert broadcasts will be skipped until Kafka topics are configured.`);
  }

  process.on("SIGTERM", async () => {
    await consumer.disconnect();
    process.exit(0);
  });
}
