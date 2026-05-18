import * as dotenv from "dotenv";
import fastify from "fastify";
import jwt from "@fastify/jwt"
import cookie from "@fastify/cookie"
import { authRoutes } from "./routes/auth";
import { verificationRoutes } from "./routes/verification";
import { userRoutes } from "./routes/user";

dotenv.config();

const app = fastify({
    logger: true
});

// plugins
app.register(jwt, {
    secret: process.env.JWT_SECRET as string
});

app.register(cookie, {
    secret: process.env.COOKIE_SECRET as string
})

app.register(authRoutes)

app.register(verificationRoutes)

app.register(userRoutes)

// health
app.get('/health', async () => {
    return { status: 'ok', service: 'identity' }
})

// start

const start = async () => {
    try {
        await app.listen({ port: 3001, host: '0.0.0.0' })
        console.log('Identity service started on port 3001');
    } catch (error) {
        console.error(error)
        process.exit(1)
    }
}

start()