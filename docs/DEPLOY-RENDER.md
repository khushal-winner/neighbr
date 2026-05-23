# Deploy Neighbr on Render (single service)

One Render **Web Service** runs everything:

- HTTP API (identity, post, feed, chat, community, webhook, moderation admin)
- Background workers (feed, alert, trust, notification, moderation, digest)
- Go WebSocket gateway (internal `GATEWAY_PORT`, public path `/ws`)

Use external managed services: **Neon** (Postgres), **Upstash** (Redis), **Redpanda** (Kafka), **CloudAMQP** (RabbitMQ). Frontend stays on **Vercel**.

## Local build

Requires **Node 20+** and **Go** (for the gateway binary).

```bash
npm ci --include=dev
npm run build:deploy-all
```

`build:deploy-all` compiles 13 workspace packages + `apps/deploy/all/bin/gateway` (or `gateway.exe` on Windows).

If `NODE_ENV=production` locally, devDependencies (TypeScript, `@types/*`) are skipped — use `npm ci --include=dev` before building.

Run (copy `apps/deploy/all/.env.example` → `apps/deploy/all/.env` and fill secrets):

```bash
node apps/deploy/all/dist/index.js
```

Health: `http://localhost:10000/health` → `{ "status": "ok", "service": "neighbr-all", "gateway": true, ... }`

## Render dashboard (existing `neighbr` service)

| Field | Value |
|-------|--------|
| Root Directory | *(repo root)* |
| Build Command | `npm ci --include=dev && npm run build:deploy-all` |
| Start Command | `node apps/deploy/all/dist/index.js` |
| Health Check Path | `/health` |
| `NODE_ENV` | `production` |
| `GATEWAY_PORT` | `8080` (internal only) |

The build script auto-downloads Go on Linux when it is not preinstalled (Render native Node). **Docker** (`apps/deploy/all/Dockerfile`) is an alternative if you prefer a container deploy.

Env vars: merge `apps/deploy/api/.env` + worker secrets — see `apps/deploy/all/.env.example`. Set `FRONTEND_URL` to your Vercel URL. `POST_SERVICE_URL` is optional (defaults to `http://127.0.0.1:$PORT`).

Your service URL example: `https://neighbr-20tx.onrender.com`

## Vercel frontend (one host)

```
NEXT_PUBLIC_IDENTITY_URL=https://<render-host>
NEXT_PUBLIC_POST_URL=https://<render-host>
NEXT_PUBLIC_FEED_URL=https://<render-host>
NEXT_PUBLIC_CHAT_URL=https://<render-host>
NEXT_PUBLIC_COMMUNITY_URL=https://<render-host>
NEXT_PUBLIC_WS_URL=wss://<render-host>/ws
```

## Blueprint

Root `render.yaml` defines a single web service `neighbr` with the same build/start commands.

## Legacy split deploy (optional)

`apps/deploy/api` and `apps/deploy/workers` still work as separate processes if you prefer two Render services (~$14/mo with a paid worker). The unified `apps/deploy/all` path is recommended (~$7 Starter web only).

## Cost note

Render **Background Workers** are paid; the unified web service avoids a separate worker bill. Free web tier sleeps after 15 min idle.
