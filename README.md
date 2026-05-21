# Neighbr

<p align="center">
  <img src="https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js" alt="Node >=18" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Turborepo-2.9-EF4444?logo=turborepo" alt="Turborepo" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

**Neighbr** is a hyperlocal neighbourhood platform built on verified residency. It delivers real-time alerts, contextual community feeds, direct messaging, and trust scoring — all scoped to a user's actual street and community boundaries.

---

## ✨ Key Features

| Feature                     | Description                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| **Verified Residents Only** | JWT-authenticated identities backed by a trusted verification pipeline                           |
| **Geofenced Alerts**        | Emergency / geo-gated broadcasts delivered via geospatial PostGIS queries                        |
| **Batched Feed**            | Nomadic subscriber workers aggregate posts into per-community windows and push updates via Kafka |
| **Real-Time Messaging**     | Live DMs and group chats served over the Go WebSocket Gateway                                    |
| **Trust Scoring**           | Asynchronous trust pipeline updates user reputation scores from community actions                |
| **Weekly Digests**          | BullMQ-scheduled cron tasks compose and dispatch HTML email summaries via Resend                 |
| **Push Notifications**      | Firebase Cloud Messaging (FCM) broadcasts batched through Redis for delivery windows             |

---

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend (Next.js 16)                  │
│            React 19 · Tailwind CSS 4 · Fast Refresh          │
└───────────────┬──────────────────────┬───────────────────────┘
                │  HTTP                │  WebSocket
┌───────────────▼──────────────┐  ┌────▼──────────────────────┐
│        API Gateway           │  │  Go WebSocket Gateway      │
│         (Port 3000)          │  │  (real-time presence, WS)  │
└──────┬──────────┬────────────┘  └──────────────────────────┘
       │ RPC/HTTP │ Pub/Sub
       ▼          ▼                  ┌──────────────────────────┐
┌──────────┐ ┌──────────┐           │        Kafka Broker       │
│ Identity │ │   Post   │◄──────────│  (events, alerts, trust)  │
│  :3001   │ │  :3002   │           └──────────────────────────┘
├──────────┤ └──────────┘
│ Feed     │               ┌──────────────────────────┐
│  :3004   │               │       RabbitMQ Broker     │
├──────────┤               │  (moderation queue only)   │
│ Chat     │               └──────────────────────────┘
│  :3005   │
├──────────┤               ┌──────────────────────────┐
│Webhook   │               │  BullMQ (Redis queues)    │
│  :3006   │               │  (digest + notification)  │
├──────────┤               └──────────────────────────┘
│Community │
│  :3007   │               ┌──────────────────────────┐
├──────────┤               │         Redis             │
│ Modera-  │               │  (cache, sorted-sets, WS) │
│   tion   │               └──────────────────────────┘
│  :3003   │                             │
└──────────┴                             ▼
┌──────────┐               ┌──────────────────────────┐
│  Alert   │               │   PostgreSQL + PostGIS   │
│ (Worker) │               │     (Neon Cloud)          │
├──────────┤               └──────────────────────────┘
│ Trust    │
│(Worker)  │               ┌──────────────────────────┐
├──────────┤               │    External Services      │
│Notifica- │               │  ─ Firebase (FCM)         │
│  tion    │               │  ─ Resend (email)         │
│(Worker)  │               └──────────────────────────┘
├──────────┤
│  Digest  │
│(Worker)  │
└──────────┘
```

---

## 🔧 Technology Stack

### Core Infrastructure

- **Fastify** — High-performance HTTP framework (Node.js)
- **PostgreSQL + PostGIS** — Relational database with geospatial querying (hosted on Neon)
- **Prisma ORM** — Type-safe database access layer (`@neighbr/db`)
- **Redis (Upstash)** — Pub/Sub, presence, sorted-set feed ordering, alert streams
- **BullMQ** — Scheduled / recurring background jobs (weekly digests)
- **RabbitMQ (CloudAMQP)** — Point-to-point moderation queue
- **Kafka** — Event log across remaining services (alerts, trust, notifications)
- **Firebase Admin SDK** — FCM push notification delivery
- **Resend** — Transactional and digest email mailer
- **Turborepo** — Monorepo orchestration (build / dev / lint / type-check pipelines)
- **TypeScript 5.9** — Strict type safety across all services
- **Zod** — Runtime input validation

### Frontend

- **Next.js 16** — React App Router
- **React 19** — UI layer
- **Tailwind CSS 4** — Utility-first styling

---

## 📦 Repository Layout

```
neighbr/
├── apps/
│   ├── web/                          → Next.js frontend (port 3000)
│   └── services/
│       ├── identity/                 → Auth, verification, user profiles   (port 3001)
│       ├── post/                     → Content creation, moderation ingress  (port 3002)
│       ├── moderation/               → AI moderation worker + admin API     (port 3003)
│       ├── feed/                     → Feed reads · Kafka consumer          (port 3004)
│       ├── chat/                     → Direct & group messaging             (port 3005)
│       ├── webhook/                  → Incoming webhook endpoint            (port 3006)
│       ├── community/                → Micro-communities & polls            (port 3007)
│       ├── notification/             → FCM push · batching · Redis windows  (worker)
│       ├── alert/                    → Geofenced alert fan-out worker       (worker)
│       ├── trust/                    → Trust-score computation worker       (worker)
│       └── digest/                   → Weekly email digest worker           (worker)
│
├── packages/
│   ├── db/                           → Prisma schema · generated client
│   ├── config/                       → Shared environment / config types
│   ├── ui/                           → Shared React component library
│   ├── eslint-config/                → Shared ESLint configuration
│   └── typescript-config/            → Shared tsconfig presets
│
├── package.json                      → Root workspace manifest
├── turbo.json                        → Turborepo pipeline config
└── README.md
```

---

## 🗄 Database Schema (Prisma)

| Model            | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `City`           | Top-level geographic container                                              |
| `MicroCommunity` | A named street / block within a city (PostGIS geometry boundary)            |
| `User`           | Resident profile — JWT identity, verification status, notification settings |
| `Post`           | A feed item authored by a user within a micro-community                     |
| `Poll`           | Community surveys created by members                                        |
| `Vote`           | Individual poll response                                                    |
| `FcmToken`       | Push-notification device tokens per user                                    |
| `PinnedPost`     | Block-captain sticky posts per micro-community                              |
| `EventLog`       | Audit log for all important actions                                         |
| `AlertBroadcast` | Geofenced emergency alert records                                           |
| `CommunityTrust` | Per-community trust metric for each user                                    |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** `>= 18`
- **npm** `10.8.2` (use the root `.npmrc` version)
- **PostgreSQL** — or a Neon connection string
- **Redis** — local instance or Upstash
- **Kafka** broker
- **RabbitMQ** broker (for moderation queue only)
- **Google Cloud** — service account key for FCM (notification service only)

### Installation

```bash
# 1. Install all workspace dependencies
npm install

# 2. Generate the Prisma client from the shared schema
cd packages/db && npx prisma generate

# 3. Push schema changes to your database
cd packages/db && npx prisma migrate dev

# 4. (Optional) Seed data / open Prisma Studio
cd packages/db && npx prisma studio
```

### Environment Variables

Each service exposes a `.env.example` file. Copy it to `.env` in the same directory and fill in the required secrets. The shared variables used across most services are:

| Variable       | Used By                               | Purpose                           |
| -------------- | ------------------------------------- | --------------------------------- |
| `DATABASE_URL` | All DB-backed services                | Neon PostgreSQL connection string |
| `REDIS_URL`    | Feed, Notification, Trust             | Redis connection string           |
| `KAFKA_BROKER` | Feed, Alert, Notification, Trust      | Kafka bootstrap server            |
| `JWT_SECRET`   | Identity, Post, Feed, Chat, Community | JWT signing secret                |
| `NODE_ENV`     | All                                   | Runtime environment flag          |

> **Tip:** Start with the Identity service first — it does not depend on Kafka or Redis — then add external services one at a time to confirm connectivity.

### Running Locally

```bash
# Start all services and the web app via Turborepo (parallelised)
turbo run dev
```

Or run individual services:

```bash
cd apps/services/identity && npm run dev     # Identity  — port 3001
cd apps/services/post     && npm run dev     # Post      — port 3002
cd apps/services/moderation && npm run dev   # Moderation — port 3003
cd apps/services/feed      && npm run dev     # Feed      — port 3004
cd apps/services/chat      && npm run dev     # Chat      — port 3005
cd apps/services/webhook   && npm run dev     # Webhook   — port 3006
cd apps/services/community && npm run dev     # Community — port 3007
cd apps/services/notification && npm run dev  # Notification worker
cd apps/services/alert     && npm run dev     # Alert worker
cd apps/services/trust     && npm run dev     # Trust worker
cd apps/services/digest    && npm run dev     # Digest worker
cd apps/web                && npm run dev     # Next.js frontend
```

### Building

```bash
# Build all packages and services in topological dependency order
turbo run build
```

### Code Quality

```bash
# Lint all packages (uses shared eslint-config)
turbo run lint

# Type-check all packages (uses shared typescript-config)
turbo run check-types
```

---

## 📡 Event Flow

```
Post created ──► Kafka: post.created ──► Moderation (RabbitMQ)
                                        │
                                        ├──► Kafka: post.approved ──► Feed (sorted-set insert)
                                        │                                   │
                                        │                                   └──► Kafka: post.created ──► Notification (window + FCM batch)
                                        │                                                                  │
                                        │                                                                  └──► Kafka: post.created ──► Trust (score update)
                                        │
                                        └──► Kafka: post.flagged ──► Moderation (admin verdict)
                                                                │
                                                                └──► Kafka: post.removed ──► Feed (remove), Trust (penalise)

Alert triggers ──► Kafka: alerts.delhi ──► Alert service (PostGIS geofence fan-out)
                                                      │
                                                      ├──► Redis stream per community  ──► WebSocket Gateway (push to online users)
                                                      └──► Notification worker (immediate FCM bypass)
```

---

## 🗺 Service Reference

| Service                 | Port | Kind          | Description                                                                 |
| ----------------------- | ---- | ------------- | --------------------------------------------------------------------------- |
| `@neighbr/identity`     | 3001 | HTTP          | JWT auth, resident verification, user profile CRUD                          |
| `@neighbr/post`         | 3002 | HTTP          | Post CRUD, moderation routing to RabbitMQ                                   |
| `@neighbr/moderation`   | 3003 | HTTP + Worker | AI content analysis via RabbitMQ consumer; admin verdict API                |
| `@neighbr/feed`         | 3004 | HTTP + Worker | Feed reads through Redis sorted-sets; Kafka consumer for post events        |
| `@neighbr/chat`         | 3005 | HTTP          | Direct messages, group chat rooms, presence                                 |
| `@neighbr/webhook`      | 3006 | HTTP          | Incoming webhook endpoint                                                   |
| `@neighbr/community`    | 3007 | HTTP          | Micro-community CRUD, community polls                                       |
| `@neighbr/notification` | —    | Worker        | Firebase FCM push, batched per community through a configurable time window |
| `@neighbr/alert`        | —    | Worker        | PostGIS radius-based emergency alert fan-out per user                       |
| `@neighbr/trust`        | —    | Worker        | Async trust-score updates from Kafka events                                 |
| `@neighbr/digest`       | —    | Worker        | BullMQ weekly digest jobs; HTML render + Resend delivery                    |
| **web (frontend)**      | 3000 | Next.js 16    | React App Router, Tailwind CSS 4                                            |

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
