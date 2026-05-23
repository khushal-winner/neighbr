import type { FastifyInstance } from "fastify";
import { feedRoutes } from "./routes/feed";

export async function registerFeedRoutes(app: FastifyInstance): Promise<void> {
  await app.register(feedRoutes);
}
