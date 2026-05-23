import type { FastifyInstance } from "fastify";
import { dmRoutes } from "./routes/dm";
import { groupRoutes } from "./routes/group";

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  await app.register(dmRoutes);
  await app.register(groupRoutes);
}
