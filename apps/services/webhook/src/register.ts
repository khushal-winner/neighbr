import type { FastifyInstance } from "fastify";
import { webhookRoutes } from "./routes/webhook";

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  await app.register(webhookRoutes);
}
