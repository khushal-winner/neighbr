import type { FastifyInstance } from "fastify";
import { adminRoutes } from "./routes/admin";

export async function registerModerationRoutes(app: FastifyInstance): Promise<void> {
  await app.register(adminRoutes);
}
