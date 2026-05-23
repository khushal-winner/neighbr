import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import httpProxy from "@fastify/http-proxy";
import { registerIdentityRoutes } from "@neighbr/identity/register";
import { registerPostRoutes } from "@neighbr/post/register";
import { registerFeedRoutes } from "@neighbr/feed/register";
import { registerChatRoutes } from "@neighbr/chat/register";
import { registerCommunityRoutes } from "@neighbr/community/register";
import { registerWebhookRoutes } from "@neighbr/webhook/register";
import { registerModerationRoutes } from "@neighbr/moderation/register";
import { gatewayUpstream, spawnGateway } from "./gateway";
import { startBackgroundWorkers } from "./workers";

async function main(): Promise<void> {
  const publicPort = String(process.env.PORT || 10000);
  const gatewayPort = process.env.GATEWAY_PORT || "8080";

  // Workers call post internal routes on the same host.
  if (!process.env.POST_SERVICE_URL) {
    process.env.POST_SERVICE_URL = `http://127.0.0.1:${publicPort}`;
  }

  const gatewayOk = spawnGateway(gatewayPort);
  startBackgroundWorkers();

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

  if (gatewayOk) {
    await app.register(httpProxy, {
      upstream: gatewayUpstream(gatewayPort),
      prefix: "/ws",
      websocket: true,
    });
  }

  await registerIdentityRoutes(app);
  await registerPostRoutes(app);
  await registerFeedRoutes(app);
  await registerChatRoutes(app);
  await registerCommunityRoutes(app);
  await registerWebhookRoutes(app);
  await registerModerationRoutes(app);

  app.get("/health", async () => ({
    status: "ok",
    service: "neighbr-all",
    api: true,
    workers: true,
    gateway: gatewayOk,
    gatewayPort,
  }));

  await app.listen({ port: Number(publicPort), host: "0.0.0.0" });
  console.log(`[neighbr-all] API on :${publicPort}, WS proxy /ws -> :${gatewayPort}`);
}

main().catch((err) => {
  console.error("[neighbr-all] Fatal:", err);
  process.exit(1);
});
