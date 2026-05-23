import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

// CloudAMQP / some managed brokers need this on certain Node builds (dev-friendly).
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { registerIdentityRoutes } from "@neighbr/identity/register";
import { registerPostRoutes } from "@neighbr/post/register";
import { registerFeedRoutes } from "@neighbr/feed/register";
import { registerChatRoutes } from "@neighbr/chat/register";
import { registerCommunityRoutes } from "@neighbr/community/register";
import { registerWebhookRoutes } from "@neighbr/webhook/register";
import { registerModerationRoutes } from "@neighbr/moderation/register";

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET as string,
  });

  await app.register(cookie, {
    secret: process.env.COOKIE_SECRET as string,
  });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  await registerIdentityRoutes(app);
  await registerPostRoutes(app);
  await registerFeedRoutes(app);
  await registerChatRoutes(app);
  await registerCommunityRoutes(app);
  await registerWebhookRoutes(app);
  await registerModerationRoutes(app);

  app.get("/health", async () => ({
    status: "ok",
    service: "neighbr-api",
  }));

  const port = Number(process.env.PORT) || 10000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`[neighbr-api] Listening on port ${port}`);
}

main().catch((err) => {
  console.error("[neighbr-api] Fatal:", err);
  process.exit(1);
});
