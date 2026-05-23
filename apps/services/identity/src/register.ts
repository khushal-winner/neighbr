import type { FastifyInstance } from "fastify";
import { authRoutes } from "./routes/auth";
import { verificationRoutes } from "./routes/verification";
import { userRoutes } from "./routes/user";

export async function registerIdentityRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(verificationRoutes);
  await app.register(userRoutes);
}
