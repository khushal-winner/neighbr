# Deploy Neighbr API + workers on Render

Combined HTTP (`neighbr-api`) and background jobs (`neighbr-workers`) for production. Use Neon, Upstash, Kafka, and CloudAMQP for data (not Render Postgres).

## Local build

```bash
npm install
npm run build:deploy-api
npm run build:deploy-workers
```

Run (requires `.env` with secrets):

```bash
node apps/deploy/api/dist/index.js
node apps/deploy/workers/dist/index.js
```

## Render deploy (short)

1. Push repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect repo (uses root `render.yaml`).
3. Set **secret** env vars when prompted (`DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `KAFKA_*`, `REDIS_URL`, etc.).
4. Wait for **neighbr-api** (Web) and **neighbr-workers** (Background Worker) to deploy.
5. Open `https://<neighbr-api>.onrender.com/health` → should return `{"status":"ok","service":"neighbr-api"}`.
6. Point frontend (Vercel) env to one API URL:

   ```
   NEXT_PUBLIC_IDENTITY_URL=https://<neighbr-api>.onrender.com
   NEXT_PUBLIC_POST_URL=https://<neighbr-api>.onrender.com
   NEXT_PUBLIC_FEED_URL=https://<neighbr-api>.onrender.com
   NEXT_PUBLIC_CHAT_URL=https://<neighbr-api>.onrender.com
   NEXT_PUBLIC_COMMUNITY_URL=https://<neighbr-api>.onrender.com
   ```

7. Deploy Go gateway on Fly (WebSockets) separately; set `NEXT_PUBLIC_WS_URL`.

## Manual services (no Blueprint)

**Web service `neighbr-api`**

| Field | Value |
|-------|--------|
| Root Directory | *(repo root)* |
| Build Command | `npm ci && npm run build:deploy-api` |
| Start Command | `node apps/deploy/api/dist/index.js` |
| Health Check | `/health` |

**Background Worker `neighbr-workers`**

| Field | Value |
|-------|--------|
| Build Command | `npm ci && npm run build:deploy-workers` |
| Start Command | `node apps/deploy/workers/dist/index.js` |
| `POST_SERVICE_URL` | `https://<neighbr-api>.onrender.com` (or use Blueprint `fromService`) |

## Cost note

Render **Background Workers** have no free tier (~$7/mo Starter each). **Web** free tier sleeps after 15 min idle. For always-on MVP, use **Starter** on both (~$14/mo) or merge workers into the web process for ~$7 (not configured by default).
