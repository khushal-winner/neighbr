import * as dotenv from "dotenv";
dotenv.config();

// Suppress TLS verification for Node.js 20 - some CloudAMQP/OS
// builds throw UNABLE_TO_VERIFY_LEAF_SIGNATURE. Safe for dev only.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import Fastify from "fastify";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { postRoutes } from "./routes/post";

// this means create a new fastify instance

const app = Fastify({ logger: true });

app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// CORS
app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: false,  // no cookies needed for these services
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
})

// register env jwt & cookie

app.register(jwt, {
  secret: process.env.JWT_SECRET as string,
});

app.register(cookie, {
  secret: process.env.COOKIE_SECRET as string,
});

// register postRoutes

app.register(postRoutes);

// health check, status: 'ok', service: 'post'

app.get("/health", async (request, reply) => ({
  status: "ok",
  service: "post",
}));

// start app in try catch with async await

const start = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT) || 3002,
      host: "0.0.0.0",
    });
    console.log("Post Service started on 3002");
  } catch (error) {
    console.error("Error starting Post Service:", error);
    process.exit(1);
  }
};

start();
