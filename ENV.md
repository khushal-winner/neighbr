# Environment variables

Single reference for every environment variable in the Neighbr monorepo: which services read it, what to use locally vs in production, and how that lines up with `.gitignore` and per-service `.env.example` files.

## How secrets are managed

| Artifact | Purpose |
| -------- | ------- |
| **`.env`** (per app/service) | Real secrets on your machine or in the host environment. **Never commit.** |
| **`.env.example`** | Committed templates with placeholder values. Copy to `.env` and fill in. |
| **`ENV.md`** (this file) | Human-readable catalog and local/prod guidance. |

### `.gitignore` coverage

| Path | Ignored by |
| ---- | ---------- |
| `.env` | Root `.gitignore` |
| `.env.local` | Root `.gitignore` |
| `.env.production` | Root `.gitignore` |
| `.env*` (including `.env.local`, `.env.production`) | `apps/web/.gitignore` |
| `firebase-service-account.json` | Root `.gitignore` |

**Not ignored today (optional hardening):** `.env.development`, `.env.test`, `**/.env.*.local`, `apps/gateway/gateway.exe`, build artifacts under `apps/web/.next/`.

**Commit safely:** any `**/.env.example` file (not matched by root rules; web’s `.env*` rule would block `.env.example` under `apps/web/` if you add one there—use `.env.local.example` or adjust `apps/web/.gitignore`).

---

## Alignment summary (`.gitignore` vs `.env.example` vs code)

**These three are not perfectly aligned.** Gaps:

| Issue | Detail |
| ----- | ------ |
| **Incomplete `.env.example` coverage** | Only 6 paths exist: `identity`, `post`, `feed`, `alert`, `webhook`, `packages/db`. Missing templates for: `web`, `gateway`, `chat`, `community`, `moderation`, `notification`, `trust`, `digest`. |
| **`packages/db/.env.example` wrong scope** | Lists JWT, Redis, Upstash, `PORT=3003`, etc. The `@neighbr/db` package only needs `DATABASE_URL` (+ optional `NODE_ENV`). |
| **`identity/.env.example` vs code** | Documents `RESEND_*` but verification email uses **SMTP** (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, …). Documents `PORT` but the server **hardcodes port 3001**. |
| **`post/.env.example` gaps** | Missing `CLOUDINARY_*`, `KAFKA_*`, `UPSTASH_REDIS_*`, `FRONTEND_URL`, `COOKIE_SECRET` (used in `index.ts`). |
| **`alert` code bug** | `.env.example` has `ALERT_RADIUS_METERS`; SQL uses **`RADIUS_METERS`** (undefined). `ALERT_RADIUS_METERS` is parsed into `RADIS_METERS` but never used. |
| **Stale `packages/config`** | Zod schema expects AWS, `JWT_REFRESH_SECRET`, `GOOGLE_MAPS_API_KEY`, `FIREBASE_PROJECT_ID`, etc. **No service imports `@neighbr/config` today.** |
| **`apps/web/.gitignore`** | Pattern `.env*` blocks any future `apps/web/.env.example`. |
| **Root `.gitignore` typo** | Duplicate entry `firebase-service-account.json.json`. |

---

## Variable catalog

**Legend — Local:** typical developer machine. **Production:** hosted (Neon, Upstash, Redpanda/Confluent, CloudAMQP, Vercel, etc.).

### Core runtime

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `NODE_ENV` | All Node services | No (defaults implicit) | `development` | `production` |
| `PORT` | post, feed, chat, community, webhook, gateway | No* | See service ports below | Set per deployment (gateway often `8080`) |

\*Identity, moderation hardcode listen ports in code (`3001`, `3003`).

| Service | Default `PORT` if unset |
| ------- | --------------------- |
| identity | **3001** (hardcoded) |
| post | `3002` |
| moderation | **3003** (hardcoded) |
| feed | `3004` |
| chat | `3005` |
| community | `3007` |
| webhook | `3008` |
| gateway (Go) | `8080` |
| web (Next.js) | `3000` |

### Database

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `DATABASE_URL` | All services using `@neighbr/db` / Prisma: identity, post, feed, chat, community, webhook, moderation, alert, notification, trust, digest; `packages/db` migrations | **Yes** | `postgresql://user:pass@localhost:5432/neighbr` | Neon connection string with `?sslmode=require` |

### Auth & HTTP

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `JWT_SECRET` | identity, post, feed, chat, community, **gateway** | **Yes** (min 32 chars) | Shared dev secret across services | Strong random secret; **same value** on all services that verify JWTs |
| `COOKIE_SECRET` | identity, post | **Yes** | Long random string | Long random string (rotate with care) |
| `FRONTEND_URL` | identity, post, feed, chat, community, webhook, **gateway** (WS origin check) | No | `http://localhost:3000` | `https://app.yourdomain.com` (no trailing slash) |
| `INTERNAL_SECRET` | post (internal routes), webhook, moderation (calls post) | **Yes** in prod | `change_this_to_a_long_random_value` | Cryptographically random; shared between post ↔ webhook ↔ moderation |
| `WEBHOOK_SECRET` | webhook | No | `test_secret` | Strong secret; validates incoming webhook payloads |

### Redis

Two connection styles are used:

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `REDIS_URL` | identity, feed, chat, community, digest (BullMQ), trust, **gateway** | **Yes** where used | `redis://localhost:6379` or Upstash TCP `rediss://default:…@….upstash.io:6379` | Upstash / managed Redis `rediss://…` |
| `UPSTASH_REDIS_REST_URL` | post, alert, notification, webhook | **Yes** where used | From Upstash dashboard | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | post, alert, notification, webhook | **Yes** where used | From Upstash dashboard | Upstash REST token |

### Kafka (SASL/SSL)

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `KAFKA_BROKER` | identity, post, feed, alert, notification, trust, webhook, moderation | **Yes** where used | `localhost:9092` or dev Redpanda host | Cluster bootstrap, e.g. `seed-….redpanda.cloud:9092` |
| `KAFKA_USERNAME` | Same as above | **Yes** (when SASL enabled) | Dev username | SCRAM username |
| `KAFKA_PASSWORD` | Same as above | **Yes** (when SASL enabled) | Dev password | SCRAM password |

### RabbitMQ

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `RABBITMQ_URL` | post (publish), moderation (consume) | **Yes** | `amqp://guest:guest@localhost:5672` | CloudAMQP `amqps://…` |

### Email

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `SMTP_HOST` | identity (postcard verification) | **Yes** for verification flow | e.g. `smtp.gmail.com` | Provider SMTP host |
| `SMTP_USER` | identity | **Yes** | Gmail / Mailtrap user | Provider user |
| `SMTP_PASS` | identity | **Yes** | App password / Mailtrap | Provider password |
| `SMTP_PORT` | identity | No | `587` | `587` or `465` |
| `SMTP_SECURE` | identity | No | `false` | `true` for port 465 |
| `SMTP_FROM` | identity | No | Falls back to `SMTP_USER` | `"Neighbr" <noreply@yourdomain.com>` |
| `RESEND_API_KEY` | digest | **Yes** | Resend test key | Resend production key |
| `DIGEST_FROM_EMAIL` | digest | No | `onboarding@resend.dev` | Verified sender domain |
| `DIGEST_CRON` | digest | No | `0 6 * * 0` (Sun 06:00 UTC) | Same or prod schedule |

> **Note:** `identity/.env.example` lists `RESEND_API_KEY` / `RESEND_FROM` but the code uses **SMTP**, not Resend.

### Media & moderation

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `CLOUDINARY_CLOUD_NAME` | post | **Yes** for image uploads | Cloudinary dashboard | Production cloud |
| `CLOUDINARY_API_KEY` | post | **Yes** | Dev key | Prod key |
| `CLOUDINARY_API_SECRET` | post | **Yes** | Dev secret | Prod secret |
| `PERSPECTIVE_API_KEY` | moderation (text) | **Yes** for text moderation | Google Cloud API key | Restricted prod key |
| `POST_SERVICE_URL` | webhook, moderation | No | `http://localhost:3002` | Internal URL / service mesh |

### Push notifications

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | notification | **Yes** | `./firebase-service-account.json` (gitignored) | Path on server or secret mount |
| `NOTIFICATION_WINDOW_MS` | notification | No | `3600000` (1h batch window) | Tune per product |

File on disk should match root `.gitignore` entry `firebase-service-account.json`.

### Alerts

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `ALERT_RADIUS_METERS` | alert (parsed, **unused**) | No | `500` | `500`–`2000` |
| `RADIUS_METERS` | alert (SQL `ST_DWithin`) | **De facto yes** | Set same as alert radius | Same |

**Bug:** use one name in code and examples; today `.env.example` only documents `ALERT_RADIUS_METERS`.

### Frontend (Next.js — `NEXT_PUBLIC_*` exposed to browser)

| Variable | Services | Required | Local | Production |
| -------- | -------- | -------- | ----- | ---------- |
| `NEXT_PUBLIC_IDENTITY_URL` | web | No | `http://localhost:3001` | `https://api…/identity` or gateway URL |
| `NEXT_PUBLIC_POST_URL` | web | No | `http://localhost:3002` | Public post API URL |
| `NEXT_PUBLIC_FEED_URL` | web | No | `http://localhost:3004` | Public feed API URL |
| `NEXT_PUBLIC_CHAT_URL` | web | No | `http://localhost:3005` | Public chat API URL |
| `NEXT_PUBLIC_COMMUNITY_URL` | web | No | `http://localhost:3007` | Public community API URL |
| `NEXT_PUBLIC_WS_URL` | web | No | `ws://localhost:8080/ws` | `wss://gateway.yourdomain.com/ws` |

No `apps/web/.env.example` exists yet; use this table when creating `apps/web/.env.local.example`.

### Unused / legacy (`packages/config`)

These appear in `packages/config/src/index.ts` but **no runtime service loads that package**:

`JWT_REFRESH_SECRET`, `AWS_BUCKET_NAME`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GOOGLE_MAPS_API_KEY`, `FIREBASE_PROJECT_ID`

Treat as planned or deprecated unless you wire `@neighbr/config` back in.

---

## Per-service checklists

Variables marked ✓ appear in that service’s `.env.example` (if one exists). ✗ = used in code but missing from example.

### `apps/services/identity` — `.env.example` ✓

| Variable | In example | Used |
| -------- | ---------- | ---- |
| `JWT_SECRET` | ✓ | ✓ |
| `COOKIE_SECRET` | ✓ | ✓ |
| `DATABASE_URL` | ✓ | ✓ |
| `PORT` | ✓ | ✗ (hardcoded 3001) |
| `UPSTASH_REDIS_REST_URL` | ✓ | ✗ (uses `REDIS_URL`) |
| `UPSTASH_REDIS_REST_TOKEN` | ✓ | ✗ |
| `REDIS_URL` | ✓ | ✓ |
| `KAFKA_*` | ✓ | ✓ |
| `NODE_ENV` | ✓ | ✓ |
| `RESEND_*` | ✓ | ✗ |
| `SMTP_*` | ✗ | ✓ |
| `FRONTEND_URL` | ✗ | ✓ |

### `apps/services/post` — `.env.example` ✓

| Variable | In example | Used |
| -------- | ---------- | ---- |
| `JWT_SECRET`, `DATABASE_URL`, `PORT`, `RABBITMQ_URL`, `NODE_ENV` | ✓ | ✓ |
| `POST_SERVICE_URL` | ✓ (self-ref) | ✗ on post itself |
| `INTERNAL_SECRET` | ✓ | ✓ |
| `COOKIE_SECRET`, `FRONTEND_URL` | ✗ | ✓ |
| `KAFKA_*`, `UPSTASH_*`, `CLOUDINARY_*` | ✗ | ✓ |

### `apps/services/feed` — `.env.example` ✓

| Variable | In example | Used |
| -------- | ---------- | ---- |
| `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `KAFKA_*`, `JWT_SECRET`, `PORT` | ✓ | ✓ |
| `FRONTEND_URL` | ✗ | ✓ |

### `apps/services/alert` — `.env.example` ✓

| Variable | In example | Used |
| -------- | ---------- | ---- |
| `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`†, `KAFKA_*`, `ALERT_RADIUS_METERS` | ✓ / partial | ✓ / bug |
| `UPSTASH_REDIS_*` | ✗ | ✓ (not `REDIS_URL`) |
| `RADIUS_METERS` | ✗ | ✓ (SQL) |

†Example says `REDIS_URL`; plugin uses Upstash REST vars.

### `apps/services/webhook` — `.env.example` ✓

| Variable | In example | Used |
| -------- | ---------- | ---- |
| `PORT`, `WEBHOOK_SECRET`, `INTERNAL_SECRET`, `DATABASE_URL`, `UPSTASH_*`, `KAFKA_*`, `POST_SERVICE_URL` | ✓ | ✓ |
| `FRONTEND_URL` | ✗ | ✓ |

### `packages/db` — `.env.example` ✓ (should be minimal)

| Variable | In example | Used |
| -------- | ---------- | ---- |
| `DATABASE_URL` | ✓ | ✓ |
| `NODE_ENV` | ✓ | ✓ |
| All others in file | ✓ | ✗ |

### Services without `.env.example`

| Service | Required variables (minimum to run) |
| ------- | ----------------------------------- |
| **gateway** | `JWT_SECRET`, `REDIS_URL`; optional `PORT`, `FRONTEND_URL` |
| **chat** | `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`; optional `PORT`, `FRONTEND_URL` |
| **community** | `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`; optional `PORT`, `FRONTEND_URL` |
| **moderation** | `DATABASE_URL`, `RABBITMQ_URL`, `KAFKA_*`, `PERSPECTIVE_API_KEY`; optional `POST_SERVICE_URL` |
| **notification** | `DATABASE_URL`, `KAFKA_*`, `UPSTASH_*`, `FIREBASE_SERVICE_ACCOUNT_PATH`; optional `NOTIFICATION_WINDOW_MS` |
| **trust** | `DATABASE_URL`, `KAFKA_*`, `REDIS_URL` |
| **digest** | `DATABASE_URL`, `REDIS_URL`, `RESEND_API_KEY`; optional `DIGEST_CRON`, `DIGEST_FROM_EMAIL` |
| **web** | All `NEXT_PUBLIC_*` URLs (see Frontend table) |

---

## Quick copy: shared local `.env` blocks

Use one **shared** `JWT_SECRET` and `DATABASE_URL` across services. Redis/Kafka often differ between TCP (`REDIS_URL`) and Upstash REST pairs.

```bash
# Shared
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/neighbr
JWT_SECRET=minimum_32_characters_long_secret_here
COOKIE_SECRET=minimum_32_characters_long_secret_here
FRONTEND_URL=http://localhost:3000
INTERNAL_SECRET=change_this_to_a_long_random_value

# Redis TCP (identity, feed, chat, community, digest, trust, gateway)
REDIS_URL=redis://localhost:6379

# Upstash REST (post, alert, notification, webhook)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_USERNAME=
KAFKA_PASSWORD=

# RabbitMQ (post + moderation)
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

---

## Maintenance

When adding a new `process.env.*` reference:

1. Add the variable to this file.
2. Add a placeholder to the service’s `.env.example` (create the file if missing).
3. Confirm root `.gitignore` still excludes real `.env` files but not `.env.example`.
4. For `apps/web`, avoid committing secrets; prefer `.env.local` and document public vars here.

See also [README.md](./README.md) architecture and ports (note: README lists webhook as `:3006` in one diagram but code uses **3008**).
