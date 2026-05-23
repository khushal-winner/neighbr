import * as dotenv from "dotenv";
dotenv.config();

import Redis from "ioredis";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is not defined");
    // Node.js 20's undici-based fetch cannot verify some Upstash certs on
    // certain builds; suppress the TLS check globally before any HTTPS
    // connection is made so the client can connect in dev.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    client = new Redis(url);
  }
  return client;
}
