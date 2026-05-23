import type { FastifyInstance } from "fastify";
import { postRoutes } from "./routes/post";

export async function registerPostRoutes(app: FastifyInstance): Promise<void> {
  await app.register(postRoutes);
}
