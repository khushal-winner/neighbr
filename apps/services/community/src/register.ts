import type { FastifyInstance } from "fastify";
import { communityRoutes } from "./routes/community";
import { pollRoutes } from "./routes/polls";

export async function registerCommunityRoutes(app: FastifyInstance): Promise<void> {
  await app.register(communityRoutes);
  await app.register(pollRoutes);
}
