# NeighBr

<p align="center">
  <img src="https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js" alt="Node >=18" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Turborepo-2.9-EF4444?logo=turborepo" alt="Turborepo" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

**NeighBr** is a hyperlocal neighbourhood platform built on verified residency. It delivers real-time alerts, contextual community feeds, direct messaging, and trust scoring — all scoped to a user's actual street and community boundaries.

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

## 🏗 System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph CLIENT["🖥️ Client Layer"]
        WEB["<b>Next.js 16 Frontend</b><br/>React 19 · Tailwind 4<br/>Port 3000"]
    end

    subgraph GATEWAY["🌐 Gateway Layer"]
        HTTP["<b>Fastify HTTP API</b><br/>JWT Middleware<br/>Rate Limiting"]
        WS["<b>Go WebSocket Gateway</b><br/>Real-time Presence<br/>Message Broadcasting<br/>Port 8080"]
    end

    subgraph SERVICES["⚙️ Microservices Layer"]
        IDENTITY["<b>Identity :3001</b><br/>JWT Auth · Verify<br/>Profile CRUD"]
        POST["<b>Post :3002</b><br/>Post CRUD<br/>Cloudinary Media"]
        MOD["<b>Moderation :3003</b><br/>AI Analysis<br/>Admin Verdicts"]
        FEED["<b>Feed :3004</b><br/>Redis Sorted Sets<br/>Kafka Consumer"]
        CHAT["<b>Chat :3005</b><br/>DMs · Groups<br/>Presence"]
        COMMUNITY["<b>Community :3007</b><br/>Polls · Boundaries<br/>Micro-Communities"]
        WEBHOOK["<b>Webhook :3008</b><br/>Ingest · Route"]
    end

    subgraph WORKERS["🔄 Async Workers"]
        ALERT_W["<b>Alert Worker</b><br/>PostGIS Geofence<br/>Fan-out"]
        TRUST_W["<b>Trust Worker</b><br/>Score Calc<br/>Reputation"]
        NOTIF_W["<b>Notification Worker</b><br/>FCM Batch<br/>Redis Windows"]
        DIGEST_W["<b>Digest Worker</b><br/>Weekly Emails<br/>BullMQ Cron"]
    end

    subgraph BROKERS["📨 Message Brokers"]
        KAFKA["<b>Apache Kafka</b><br/>post.created · post.approved<br/>alerts.city · trust.events"]
        RABBIT["<b>RabbitMQ</b><br/>moderation.jobs"]
        BULL["<b>BullMQ</b><br/>digest.cron<br/>notification.jobs"]
    end

    subgraph DATA["💾 Data Layer"]
        PG["<b>PostgreSQL + PostGIS</b><br/>Neon Cloud<br/>Users · Posts · Polls · Trust"]
        REDIS["<b>Redis (Upstash)</b><br/>Feed Sorted Sets · Sessions<br/>Pub/Sub · Streams"]
    end

    subgraph EXTERNAL["☁️ External Services"]
        FIREBASE["<b>Firebase</b><br/>FCM Push"]
        RESEND["<b>Resend</b><br/>Email Delivery"]
        CLOUDINARY["<b>Cloudinary</b><br/>Media CDN"]
    end

    WEB -->|REST API| HTTP
    WEB -->|WebSocket| WS
    HTTP --> IDENTITY & POST & MOD & FEED & CHAT & COMMUNITY & WEBHOOK
    SERVICES --> BROKERS
    BROKERS --> WORKERS
    SERVICES --> DATA
    WORKERS --> DATA
    WORKERS --> EXTERNAL
    WS --> REDIS

    classDef client fill:#1a1a2e,stroke:#16213e,color:#e2e8f0,stroke-width:2px
    classDef gateway fill:#0f3460,stroke:#16213e,color:#e2e8f0,stroke-width:2px
    classDef service fill:#006565,stroke:#004d4d,color:#e2e8f0,stroke-width:2px
    classDef worker fill:#533483,stroke:#3d2066,color:#e2e8f0,stroke-width:2px
    classDef broker fill:#e94560,stroke:#c73750,color:#fff,stroke-width:2px
    classDef data fill:#0a7c5a,stroke:#065e44,color:#e2e8f0,stroke-width:2px
    classDef external fill:#d4880f,stroke:#b5730d,color:#1a1a2e,stroke-width:2px

    class WEB client
    class HTTP,WS gateway
    class IDENTITY,POST,MOD,FEED,CHAT,COMMUNITY,WEBHOOK service
    class ALERT_W,TRUST_W,NOTIF_W,DIGEST_W worker
    class KAFKA,RABBIT,BULL broker
    class PG,REDIS data
    class FIREBASE,RESEND,CLOUDINARY external
```


### Backend Architecture Deep Dive

#### Service Communication Patterns

```mermaid
graph LR
    subgraph SYNC["🔄 Synchronous - HTTP/RPC"]
        FE["Next.js Frontend"]
        API["Fastify API Gateway"]
        ID["Identity Service"]
        PS["Post Service"]
        FS["Feed Service"]
        CS["Chat Service"]
        CM["Community Service"]
        WH["Webhook Service"]

        FE -->|"REST + JWT"| API
        API -->|"Route"| ID & PS & FS & CS & CM & WH
        ID -->|"JWT Validate"| PS & FS & CS & CM
    end

    subgraph ASYNC_KAFKA["📡 Async - Kafka Event Streaming"]
        K_POST["post.created"]
        K_APPROVED["post.approved"]
        K_ALERT["alerts.city"]
        K_TRUST["trust.events"]

        PS2["Post Service"] -->|"publish"| K_POST
        MOD2["Moderation"] -->|"publish"| K_APPROVED
        K_APPROVED -->|"consume"| FEED2["Feed Worker"]
        K_APPROVED -->|"consume"| NOTIF2["Notification Worker"]
        K_POST -->|"consume"| TRUST2["Trust Worker"]
        K_ALERT -->|"consume"| ALERT2["Alert Worker"]
    end

    subgraph ASYNC_RABBIT["🐇 Point-to-Point - RabbitMQ"]
        MQ["moderation.jobs queue"]
        PS3["Post Service"] -->|"enqueue"| MQ
        MQ -->|"consume"| MOD3["Moderation Worker"]
    end

    subgraph ASYNC_BULL["⏰ Job Queue - BullMQ + Redis"]
        BQ["digest.cron"]
        NQ["notification.jobs"]
        BQ -->|"weekly"| DIG["Digest Worker"]
        NQ -->|"batch"| NOT["Notification Worker"]
    end

    subgraph PUBSUB["📢 Pub/Sub - Redis"]
        RPUB["Redis Pub/Sub"]
        GW["Go WebSocket Gateway"] <-->|"subscribe"| RPUB
        ALERT3["Alert Service"] -->|"publish"| RPUB
    end

    classDef sync fill:#006565,stroke:#004d4d,color:#e2e8f0,stroke-width:2px
    classDef kafka fill:#e94560,stroke:#c73750,color:#fff,stroke-width:2px
    classDef rabbit fill:#ff8c42,stroke:#e07535,color:#1a1a2e,stroke-width:2px
    classDef bull fill:#533483,stroke:#3d2066,color:#e2e8f0,stroke-width:2px
    classDef redis fill:#0a7c5a,stroke:#065e44,color:#e2e8f0,stroke-width:2px
```

**1. Synchronous HTTP/RPC**
- **Identity → All Services**: JWT token validation via shared middleware
- **Frontend → API Gateway**: RESTful API calls with Fastify
- **Service → Service**: Direct HTTP calls for non-critical operations

**2. Asynchronous Event Streaming (Kafka)**
- **Post → Feed**: `post.created` event triggers feed sorted-set insertion
- **Post → Notification**: `post.created` event triggers notification batching
- **Post → Trust**: `post.created` event triggers trust score calculation
- **Alert → WebSocket**: `alerts.{city}` topic triggers real-time push
- **Moderation → Feed**: `post.approved`/`post.removed` events update feed state

**3. Point-to-Point Messaging (RabbitMQ)**
- **Post → Moderation**: New posts queued for AI analysis
- **Moderation → Post**: Approval/rejection results returned

**4. Job Queues (BullMQ + Redis)**
- **Digest Worker**: Scheduled weekly cron jobs for email digests
- **Notification Worker**: Batching FCM pushes within time windows

**5. Pub/Sub (Redis)**
- **WebSocket Gateway**: Real-time presence updates
- **Alert Service**: Community-specific alert streams

#### Data Flow Patterns

```mermaid
graph TD
    USER["👤 User Creates Post"] --> VALIDATE

    subgraph POST_SVC["📝 Post Service :3002"]
        VALIDATE["Validate JWT + Zod"] --> UPLOAD["Upload Media → Cloudinary"]
        UPLOAD --> SAVE_DB["Save to PostgreSQL"]
        SAVE_DB --> PUBLISH_RMQ["Publish → RabbitMQ"]
    end

    PUBLISH_RMQ --> CONSUME_MOD

    subgraph MOD_SVC["🛡️ Moderation Service :3003"]
        CONSUME_MOD["Consume from RabbitMQ"] --> AI["AI Content Analysis<br/>Perspective API"]
        AI -->|"APPROVED"| PUB_KAFKA_OK["Publish → Kafka<br/>post.approved"]
        AI -->|"FLAGGED"| PUB_KAFKA_FLAG["Publish → Kafka<br/>post.flagged"]
        AI --> UPDATE_STATUS["Update Post Status<br/>in PostgreSQL"]
    end

    PUB_KAFKA_OK --> FEED_CONSUME & NOTIF_CONSUME & TRUST_CONSUME

    subgraph FEED_SVC["📰 Feed Service :3004"]
        FEED_CONSUME["Consume post.approved"] --> REDIS_INSERT["Insert → Redis<br/>Sorted Set<br/>score = timestamp"]
        REDIS_INSERT --> FEED_READY["Feed Ready<br/>for Pagination"]
    end

    subgraph NOTIF_SVC["🔔 Notification Worker"]
        NOTIF_CONSUME["Consume post.approved"] --> BATCH["Batch by Community<br/>Redis Time Window"]
        BATCH --> FCM["Send via Firebase<br/>FCM Push"]
    end

    subgraph TRUST_SVC["⭐ Trust Worker"]
        TRUST_CONSUME["Consume post.created"] --> CALC["Calculate Score Delta"]
        CALC --> UPDATE_TRUST["Update CommunityTrust<br/>in PostgreSQL"]
        UPDATE_TRUST --> CACHE_INVAL["Publish Updated Score<br/>→ Cache Invalidation"]
    end

    subgraph ALERT_FLOW["🚨 Alert Flow"]
        ADMIN["Admin Triggers Alert"] --> ALERT_SVC["Alert Service"]
        ALERT_SVC --> KAFKA_ALERT["Publish → Kafka<br/>alerts.city"]
        KAFKA_ALERT --> ALERT_WORKER["Alert Worker"]
        ALERT_WORKER --> POSTGIS["PostGIS Geofence<br/>Radius Query"]
        POSTGIS --> REDIS_STREAM["Push → Redis Stream"]
        POSTGIS --> FCM_ALERT["Immediate FCM Push"]
        REDIS_STREAM --> WS_GW["Go WebSocket Gateway"]
        WS_GW --> REALTIME["Real-time Push<br/>to Connected Users"]
    end

    classDef user fill:#1a1a2e,stroke:#16213e,color:#e2e8f0,stroke-width:2px
    classDef post fill:#006565,stroke:#004d4d,color:#e2e8f0,stroke-width:2px
    classDef mod fill:#e94560,stroke:#c73750,color:#fff,stroke-width:2px
    classDef feed fill:#0a7c5a,stroke:#065e44,color:#e2e8f0,stroke-width:2px
    classDef notif fill:#533483,stroke:#3d2066,color:#e2e8f0,stroke-width:2px
    classDef trust fill:#d4880f,stroke:#b5730d,color:#1a1a2e,stroke-width:2px
    classDef alert fill:#ff8c42,stroke:#e07535,color:#1a1a2e,stroke-width:2px

    class USER user
    class VALIDATE,UPLOAD,SAVE_DB,PUBLISH_RMQ post
    class CONSUME_MOD,AI,PUB_KAFKA_OK,PUB_KAFKA_FLAG,UPDATE_STATUS mod
    class FEED_CONSUME,REDIS_INSERT,FEED_READY feed
    class NOTIF_CONSUME,BATCH,FCM notif
    class TRUST_CONSUME,CALC,UPDATE_TRUST,CACHE_INVAL trust
    class ADMIN,ALERT_SVC,KAFKA_ALERT,ALERT_WORKER,POSTGIS,REDIS_STREAM,FCM_ALERT,WS_GW,REALTIME alert
```

#### Scalability Design

**Horizontal Scaling**
- **Stateless Services**: Identity, Post, Feed, Chat, Community, Webhook can scale horizontally
- **Worker Services**: Alert, Trust, Notification, Digest scale via consumer group configuration
- **Database**: PostgreSQL connection pooling + read replicas (Neon handles this)
- **Redis**: Cluster mode for high availability (Upstash handles this)

**Vertical Scaling**
- **WebSocket Gateway**: Go-based for high concurrency (100k+ connections)
- **Feed Service**: Redis sorted-sets for O(log N) feed operations
- **Alert Service**: PostGIS spatial indexes for fast geospatial queries

**Caching Strategy**
- **Feed**: Redis sorted-sets with TTL (per-community caching)
- **User Sessions**: Redis with 24-hour expiration
- **API Responses**: Fastify in-memory cache for frequently accessed data
- **Static Assets**: Cloudinary CDN for media delivery

---

## 🔧 Technology Stack

### Core Infrastructure

| Technology | Purpose | Version |
|------------|---------|---------|
| **Fastify** | High-performance HTTP framework | ^5.8.5 |
| **PostgreSQL + PostGIS** | Relational database with geospatial querying | Neon Cloud |
| **Prisma ORM** | Type-safe database access layer | ^7.8.0 |
| **Redis (Upstash)** | Pub/Sub, presence, sorted-set feed ordering, alert streams | ^5.10.1 |
| **BullMQ** | Scheduled / recurring background jobs | Latest |
| **RabbitMQ (CloudAMQP)** | Point-to-point moderation queue | ^2.0.1 |
| **Kafka** | Event log across services (alerts, trust, notifications) | ^2.2.4 |
| **Firebase Admin SDK** | FCM push notification delivery | Latest |
| **Resend** | Transactional and digest email mailer | Latest |
| **Cloudinary** | Media storage and CDN delivery | ^2.10.0 |
| **Turborepo** | Monorepo orchestration (build / dev / lint / type-check) | ^2.9.14 |
| **TypeScript** | Strict type safety across all services | ^5.9.2 |
| **Zod** | Runtime input validation | ^4.4.3 |
| **bcrypt** | Password hashing | ^6.0.0 |

### Frontend Stack

| Technology | Purpose | Version |
|------------|---------|---------|
| **Next.js** | React framework with App Router | 16 |
| **React** | UI library | 19 |
| **Tailwind CSS** | Utility-first styling | 4 |
| **Lucide React** | Icon library | Latest |

### Development Tools

| Technology | Purpose |
|------------|---------|
| **ESLint** | Linting with shared config |
| **Prettier** | Code formatting |
| **ts-node** | TypeScript execution |
| **Prisma Studio** | Database GUI |

---

## 📦 Repository Layout

```
neighbr/
├── apps/
│   ├── web/                          → Next.js frontend (port 3000)
│   │   ├── app/                      → React App Router pages
│   │   ├── components/               → React components
│   │   └── lib/                      → Utilities and helpers
│   │
│   ├── services/
│   │   ├── identity/                 → Auth, verification, user profiles   (port 3001)
│   │   │   ├── src/
│   │   │   │   ├── routes/           → Fastify route handlers
│   │   │   │   ├── plugins/          → Fastify plugins (JWT, Redis, Kafka)
│   │   │   │   └── middleware/       → Custom middleware
│   │   │   └── .env.example          → Environment variables template
│   │   │
│   │   ├── post/                     → Content creation, moderation ingress  (port 3002)
│   │   │   ├── src/
│   │   │   │   ├── routes/           → Post CRUD endpoints
│   │   │   │   └── plugins/          → RabbitMQ producer
│   │   │   └── .env.example
│   │   │
│   │   ├── moderation/               → AI moderation worker + admin API     (port 3003)
│   │   │   ├── src/
│   │   │   │   ├── routes/           → Admin verdict API
│   │   │   │   ├── workers/          → RabbitMQ consumer
│   │   │   │   └── ai/               → Content analysis logic
│   │   │   └── .env.example
│   │   │
│   │   ├── feed/                     → Feed reads · Kafka consumer          (port 3004)
│   │   │   ├── src/
│   │   │   │   ├── routes/           → Feed pagination endpoints
│   │   │   │   ├── consumers/        → Kafka event consumers
│   │   │   │   └── cache/            → Redis sorted-set operations
│   │   │   └── .env.example
│   │   │
│   │   ├── chat/                     → Direct & group messaging             (port 3005)
│   │   │   ├── src/
│   │   │   │   ├── routes/           → Chat API endpoints
│   │   │   │   └── presence/         → User presence tracking
│   │   │   └── .env.example
│   │   │
│   │   ├── webhook/                  → Incoming webhook endpoint            (port 3008)
│   │   │   ├── src/
│   │   │   │   └── routes/           → Webhook handlers
│   │   │   └── .env.example
│   │   │
│   │   ├── community/                → Micro-communities & polls            (port 3007)
│   │   │   ├── src/
│   │   │   │   ├── routes/           → Community & poll endpoints
│   │   │   │   └── geospatial/       → PostGIS boundary operations
│   │   │   └── .env.example
│   │   │
│   │   ├── notification/             → FCM push · batching · Redis windows  (worker)
│   │   │   ├── src/
│   │   │   │   ├── consumers/        → Kafka event consumers
│   │   │   │   ├── batching/         → Time window batching logic
│   │   │   │   └── fcm/              → Firebase integration
│   │   │   └── .env.example
│   │   │
│   │   ├── alert/                    → Geofenced alert fan-out worker       (worker)
│   │   │   ├── src/
│   │   │   │   ├── consumers/        → Kafka alert consumers
│   │   │   │   ├── geospatial/       → PostGIS geofence queries
│   │   │   │   └── fanout/           → Multi-channel alert distribution
│   │   │   └── .env.example
│   │   │
│   │   ├── trust/                    → Trust-score computation worker       (worker)
│   │   │   ├── src/
│   │   │   │   ├── consumers/        → Kafka trust event consumers
│   │   │   │   ├── scoring/          → Trust score calculation algorithms
│   │   │   │   └── reputation/       → Reputation management logic
│   │   │   └── .env.example
│   │   │
│   │   └── digest/                   → Weekly email digest worker           (worker)
│   │       ├── src/
│   │       │   ├── jobs/             → BullMQ cron job definitions
│   │       │   ├── templates/        → Email HTML templates
│   │       │   └── resend/           → Resend API integration
│   │       └── .env.example
│   │
│   └── deploy/
│       ├── api/                      → Production API deployment bundle
│       │   ├── package.json
│       │   └── .env.example
│       └── workers/                  → Production workers deployment bundle
│           ├── package.json
│           └── .env.example
│
├── packages/
│   ├── db/                           → Prisma schema · generated client
│   │   ├── prisma/
│   │   │   ├── schema.prisma        → Database schema definition
│   │   │   └── seed.ts              → Database seeding script
│   │   └── scripts/
│   │       └── build.mjs            → Prisma client build script
│   │
│   ├── config/                       → Shared environment / config types
│   │   ├── index.ts                 → Config validation
│   │   └── env.ts                   → Environment variable schemas
│   │
│   ├── ui/                           → Shared React component library
│   │   ├── components/               → Reusable UI components
│   │   └── styles/                  → Shared styles
│   │
│   ├── eslint-config/                → Shared ESLint configuration
│   │   ├── index.js                 → Base ESLint config
│   │   └── next.js                  → Next.js specific rules
│   │
│   └── typescript-config/            → Shared tsconfig presets
│       ├── base.json                → Base TypeScript config
│       ├── nextjs.json              → Next.js specific config
│       └── react-library.json       → React library config
│
├── package.json                      → Root workspace manifest
├── turbo.json                        → Turborepo pipeline config
├── render.yaml                       → Render deployment configuration
├── .gitignore                        → Git ignore rules
├── .node-version                     → Required Node.js version
├── .npmrc                            → npm configuration
└── README.md                         → This file
```

---

## 🗄 Database Schema (Prisma)

### Core Models

| Model | Description | Key Fields |
|-------|-------------|------------|
| `City` | Top-level geographic container | `id`, `name`, `country`, `timezone` |
| `MicroCommunity` | A named street / block within a city (PostGIS geometry boundary) | `id`, `cityId`, `name`, `boundary` (PostGIS), `population` |
| `User` | Resident profile — JWT identity, verification status, notification settings | `id`, `email`, `passwordHash`, `isVerified`, `communityId`, `trustScore` |
| `Post` | A feed item authored by a user within a micro-community | `id`, `authorId`, `communityId`, `content`, `mediaUrls`, `createdAt` |
| `Poll` | Community surveys created by members | `id`, `postId`, `question`, `options`, `expiresAt` |
| `Vote` | Individual poll response | `id`, `pollId`, `userId`, `selectedOption` |
| `FcmToken` | Push-notification device tokens per user | `id`, `userId`, `token`, `deviceInfo` |
| `PinnedPost` | Block-captain sticky posts per micro-community | `id`, `communityId`, `postId`, `pinnedBy` |
| `EventLog` | Audit log for all important actions | `id`, `userId`, `action`, `metadata`, `timestamp` |
| `AlertBroadcast` | Geofenced emergency alert records | `id`, `cityId`, `message`, `severity`, `radiusMeters`, `centerPoint` |
| `CommunityTrust` | Per-community trust metric for each user | `id`, `userId`, `communityId`, `score`, `lastUpdated` |

### Relationships

```mermaid
erDiagram
    City ||--o{ MicroCommunity : contains
    City ||--o{ AlertBroadcast : triggers
    MicroCommunity ||--o{ User : "residents"
    MicroCommunity ||--o{ Post : "scoped to"
    MicroCommunity ||--o{ PinnedPost : has
    User ||--o{ Post : authors
    User ||--o{ FcmToken : "push tokens"
    User ||--o{ EventLog : "audit trail"
    User ||--o{ CommunityTrust : "trust score"
    User ||--o{ Vote : casts
    Post ||--o| Poll : "may have"
    Poll ||--o{ Vote : receives

    City {
        uuid id PK
        string name
        string country
        string timezone
    }

    MicroCommunity {
        uuid id PK
        uuid cityId FK
        string name
        geometry boundary "PostGIS"
        int population
    }

    User {
        uuid id PK
        string email UK
        string passwordHash
        string displayName
        string verificationLevel
        uuid communityId FK
        float trustScore
        string trustBand
        datetime createdAt
    }

    Post {
        uuid id PK
        uuid authorId FK
        uuid communityId FK
        text content
        json mediaUrls "Cloudinary"
        string status "pending|approved|removed"
        datetime createdAt
    }

    Poll {
        uuid id PK
        uuid postId FK
        string question
        json options
        datetime expiresAt
    }

    Vote {
        uuid id PK
        uuid pollId FK
        uuid userId FK
        int selectedOption
    }

    FcmToken {
        uuid id PK
        uuid userId FK
        string token
        string deviceInfo
    }

    PinnedPost {
        uuid id PK
        uuid communityId FK
        uuid postId FK
        uuid pinnedBy FK
    }

    EventLog {
        uuid id PK
        uuid userId FK
        string action
        json metadata
        datetime timestamp
    }

    AlertBroadcast {
        uuid id PK
        uuid cityId FK
        text message
        string severity
        int radiusMeters
        point centerPoint "PostGIS"
    }

    CommunityTrust {
        uuid id PK
        uuid userId FK
        uuid communityId FK
        float score
        datetime lastUpdated
    }
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** `>= 18` (install via [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm))
- **npm** `10.8.2` (use the root `.npmrc` version)
- **PostgreSQL** — local instance or [Neon](https://neon.tech) connection string
- **Redis** — local instance or [Upstash](https://upstash.com)
- **Kafka** broker — local [confluent platform](https://www.confluent.io/) or [Redpanda](https://redpanda.com/)
- **RabbitMQ** broker — local or [CloudAMQP](https://www.cloudamqp.com/) (for moderation queue only)
- **Google Cloud** — service account key for FCM (notification service only)
- **Resend API Key** — for email delivery (digest & verification)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/khushal-winner/neighbr.git
cd neighbr

# 2. Install all workspace dependencies
npm install

# 3. Generate the Prisma client from the shared schema
cd packages/db && npx prisma generate

# 4. Push schema changes to your database
cd packages/db && npx prisma migrate dev

# 5. (Optional) Seed database with sample data
cd packages/db && npx prisma db seed

# 6. (Optional) Open Prisma Studio for database inspection
cd packages/db && npx prisma studio
```

### Environment Variables

Each service exposes a `.env.example` file. Copy it to `.env` in the same directory and fill in the required secrets.

#### Shared Variables (Used Across Most Services)

| Variable | Required | Used By | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | ✅ | All DB-backed services | Neon PostgreSQL connection string |
| `REDIS_URL` | ✅ | Feed, Notification, Trust, Identity | Redis connection string |
| `KAFKA_BROKER` | ✅ | Feed, Alert, Notification, Trust, Post | Kafka bootstrap server |
| `JWT_SECRET` | ✅ | Identity, Post, Feed, Chat, Community | JWT signing secret (min 32 chars) |
| `COOKIE_SECRET` | ✅ | Identity | Cookie encryption secret (min 32 chars) |
| `NODE_ENV` | ✅ | All | Runtime environment (`development` or `production`) |
| `FRONTEND_URL` | ✅ | Identity, Post, Chat | Frontend URL for CORS |
| `INTERNAL_SECRET` | ✅ | All services | Internal service communication secret |

#### Service-Specific Variables

**Identity Service**
| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | ✅ | Resend API key for verification emails |
| `EMAIL_FROM` | ✅ | Sender email address for verification emails |

**Post Service**
| Variable | Required | Purpose |
|----------|----------|---------|
| `RABBITMQ_URL` | ✅ | RabbitMQ connection string for moderation queue |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | ✅ | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | ✅ | Cloudinary API secret |

**Moderation Service**
| Variable | Required | Purpose |
|----------|----------|---------|
| `RABBITMQ_URL` | ✅ | RabbitMQ connection string |
| `PERSPECTIVE_API_KEY` | ❌ | Google Perspective API key for content analysis |

**Notification Service**
| Variable | Required | Purpose |
|----------|----------|---------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | ✅ | Path to Firebase service account JSON |
| `NOTIFICATION_WINDOW_MS` | ❌ | Batching time window in milliseconds (default: 3600000) |

**Digest Service**
| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | ✅ | Resend API key for digest emails |
| `DIGEST_FROM_EMAIL` | ✅ | Sender email for digests |
| `DIGEST_CRON` | ❌ | Cron schedule for weekly digests (default: `0 6 * * 0`) |

**Alert Service**
| Variable | Required | Purpose |
|----------|----------|---------|
| `RADIUS_METERS` | ❌ | Default alert radius in meters (default: 500) |

> **Tip:** Start with the Identity service first — it does not depend on Kafka or RabbitMQ — then add external services one at a time to confirm connectivity.

### Running Locally

#### Development Mode (All Services)

```bash
# Start all services and the web app via Turborepo (parallelised)
turbo run dev
```

#### Individual Services

```bash
# HTTP Services
cd apps/services/identity && npm run dev     # Identity  — port 3001
cd apps/services/post     && npm run dev     # Post      — port 3002
cd apps/services/moderation && npm run dev   # Moderation — port 3003
cd apps/services/feed      && npm run dev     # Feed      — port 3004
cd apps/services/chat      && npm run dev     # Chat      — port 3005
cd apps/services/webhook   && npm run dev     # Webhook   — port 3008
cd apps/services/community && npm run dev     # Community — port 3007

# Worker Services
cd apps/services/notification && npm run dev  # Notification worker
cd apps/services/alert     && npm run dev     # Alert worker
cd apps/services/trust     && npm run dev     # Trust worker
cd apps/services/digest    && npm run dev     # Digest worker

# Frontend
cd apps/web                && npm run dev     # Next.js frontend — port 3000
```

#### Production Build

```bash
# Build all packages and services in topological dependency order
turbo run build

# Build specific deployment bundles
npm run build:deploy-api      # API services bundle
npm run build:deploy-workers  # Worker services bundle
```

### Code Quality

```bash
# Lint all packages (uses shared eslint-config)
turbo run lint

# Type-check all packages (uses shared typescript-config)
turbo run check-types

# Format code with Prettier
npm run format
```

---

## 📡 Event Flow

```mermaid
graph TD
    USER["👤 User Creates Post"] --> VALIDATE

    subgraph POST_SVC["📝 Post Service :3002"]
        VALIDATE["Validate JWT + Zod"] --> UPLOAD["Upload Media → Cloudinary"]
        UPLOAD --> SAVE_DB["Save to PostgreSQL"]
        SAVE_DB --> PUBLISH_RMQ["Publish → RabbitMQ"]
    end

    PUBLISH_RMQ --> CONSUME_MOD

    subgraph MOD_SVC["🛡️ Moderation Service :3003"]
        CONSUME_MOD["Consume from RabbitMQ"] --> AI["AI Content Analysis<br/>Perspective API"]
        AI -->|"APPROVED"| PUB_KAFKA_OK["Publish → Kafka<br/>post.approved"]
        AI -->|"FLAGGED"| PUB_KAFKA_FLAG["Publish → Kafka<br/>post.flagged"]
        AI --> UPDATE_STATUS["Update Post Status<br/>in PostgreSQL"]
    end

    PUB_KAFKA_OK --> FEED_CONSUME & NOTIF_CONSUME & TRUST_CONSUME

    subgraph FEED_SVC["📰 Feed Service :3004"]
        FEED_CONSUME["Consume post.approved"] --> REDIS_INSERT["Insert → Redis<br/>Sorted Set<br/>score = timestamp"]
        REDIS_INSERT --> FEED_READY["Feed Ready<br/>for Pagination"]
    end

    subgraph NOTIF_SVC["🔔 Notification Worker"]
        NOTIF_CONSUME["Consume post.approved"] --> BATCH["Batch by Community<br/>Redis Time Window"]
        BATCH --> FCM["Send via Firebase<br/>FCM Push"]
    end

    subgraph TRUST_SVC["⭐ Trust Worker"]
        TRUST_CONSUME["Consume post.created"] --> CALC["Calculate Score Delta"]
        CALC --> UPDATE_TRUST["Update CommunityTrust<br/>in PostgreSQL"]
        UPDATE_TRUST --> CACHE_INVAL["Publish Updated Score<br/>→ Cache Invalidation"]
    end

    subgraph ALERT_FLOW["🚨 Alert Flow"]
        ADMIN["Admin Triggers Alert"] --> ALERT_SVC["Alert Service"]
        ALERT_SVC --> KAFKA_ALERT["Publish → Kafka<br/>alerts.city"]
        KAFKA_ALERT --> ALERT_WORKER["Alert Worker"]
        ALERT_WORKER --> POSTGIS["PostGIS Geofence<br/>Radius Query"]
        POSTGIS --> REDIS_STREAM["Push → Redis Stream"]
        POSTGIS --> FCM_ALERT["Immediate FCM Push"]
        REDIS_STREAM --> WS_GW["Go WebSocket Gateway"]
        WS_GW --> REALTIME["Real-time Push<br/>to Connected Users"]
    end

    classDef user fill:#1a1a2e,stroke:#16213e,color:#e2e8f0,stroke-width:2px
    classDef post fill:#006565,stroke:#004d4d,color:#e2e8f0,stroke-width:2px
    classDef mod fill:#e94560,stroke:#c73750,color:#fff,stroke-width:2px
    classDef feed fill:#0a7c5a,stroke:#065e44,color:#e2e8f0,stroke-width:2px
    classDef notif fill:#533483,stroke:#3d2066,color:#e2e8f0,stroke-width:2px
    classDef trust fill:#d4880f,stroke:#b5730d,color:#1a1a2e,stroke-width:2px
    classDef alert fill:#ff8c42,stroke:#e07535,color:#1a1a2e,stroke-width:2px

    class USER user
    class VALIDATE,UPLOAD,SAVE_DB,PUBLISH_RMQ post
    class CONSUME_MOD,AI,PUB_KAFKA_OK,PUB_KAFKA_FLAG,UPDATE_STATUS mod
    class FEED_CONSUME,REDIS_INSERT,FEED_READY feed
    class NOTIF_CONSUME,BATCH,FCM notif
    class TRUST_CONSUME,CALC,UPDATE_TRUST,CACHE_INVAL trust
    class ADMIN,ALERT_SVC,KAFKA_ALERT,ALERT_WORKER,POSTGIS,REDIS_STREAM,FCM_ALERT,WS_GW,REALTIME alert
```

---

## 🗺 Service Reference

### HTTP Services

| Service | Port | Dependencies | Endpoints | Description |
|---------|------|--------------|-----------|-------------|
| `@neighbr/identity` | 3001 | PostgreSQL, Redis, Resend | `/auth/*`, `/verification/*`, `/users/*` | JWT auth, resident verification, user profile CRUD |
| `@neighbr/post` | 3002 | PostgreSQL, RabbitMQ, Kafka, Cloudinary | `/posts/*`, `/media/*` | Post CRUD, moderation routing to RabbitMQ |
| `@neighbr/moderation` | 3003 | PostgreSQL, RabbitMQ, Kafka | `/moderation/*` | AI content analysis via RabbitMQ consumer; admin verdict API |
| `@neighbr/feed` | 3004 | PostgreSQL, Redis, Kafka | `/feed/*` | Feed reads through Redis sorted-sets; Kafka consumer for post events |
| `@neighbr/chat` | 3005 | PostgreSQL, Redis | `/chats/*`, `/messages/*` | Direct messages, group chat rooms, presence |
| `@neighbr/webhook` | 3008 | PostgreSQL | `/webhooks/*` | Incoming webhook endpoint |
| `@neighbr/community` | 3007 | PostgreSQL, Kafka | `/communities/*`, `/polls/*` | Micro-community CRUD, community polls |

### Worker Services

| Service | Dependencies | Kafka Topics | Description |
|---------|--------------|--------------|-------------|
| `@neighbr/notification` | Redis, Kafka, Firebase | `post.created`, `alerts.*` | Firebase FCM push, batched per community through configurable time window |
| `@neighbr/alert` | PostgreSQL, Redis, Kafka | `alerts.*` | PostGIS radius-based emergency alert fan-out per user |
| `@neighbr/trust` | PostgreSQL, Kafka | `post.created`, `post.removed`, `trust.events` | Async trust-score updates from Kafka events |
| `@neighbr/digest` | PostgreSQL, Resend, BullMQ | — | BullMQ weekly digest jobs; HTML render + Resend delivery |

### Frontend

| Service | Port | Technology | Description |
|---------|------|------------|-------------|
| **web** | 3000 | Next.js 16, React 19, Tailwind CSS 4 | React App Router, server components, client components |

---

## 🚢 Deployment

### Production Deployment (Render + Vercel)

#### Backend Deployment (Render)

**API Services Bundle**
```bash
# Build the API deployment bundle
npm run build:deploy-api

# Deploy to Render
cd apps/deploy/api
# Follow Render deployment instructions
```

**Workers Bundle**
```bash
# Build the workers deployment bundle
npm run build:deploy-workers

# Deploy to Render
cd apps/deploy/workers
# Follow Render deployment instructions
```

**Required Environment Variables on Render**

See `apps/deploy/api/.env.example` and `apps/deploy/workers/.env.example` for the complete list.

#### Frontend Deployment (Vercel)

```bash
# Deploy to Vercel
cd apps/web
vercel
```

**Required Environment Variables on Vercel**

- `NEXT_PUBLIC_API_URL` — Production API URL
- `NEXT_PUBLIC_WS_URL` — Production WebSocket Gateway URL

### Infrastructure Requirements

| Service | Provider | Minimum Plan |
|---------|----------|--------------|
| PostgreSQL | Neon | Free tier |
| Redis | Upstash | Free tier |
| Kafka | Redpanda Cloud | Free tier |
| RabbitMQ | CloudAMQP | Little Lemur tier |
| API Services | Render | Free tier |
| Workers | Render | Free tier |
| Frontend | Vercel | Hobby tier |

---

## 🔒 Security Considerations

### Authentication & Authorization

- **JWT Tokens**: Short-lived access tokens (15min) + refresh tokens (7 days)
- **Password Hashing**: bcrypt with cost factor 10
- **API Key Management**: Environment variables only, never committed
- **CORS**: Configured per service with allowed origins
- **Rate Limiting**: Implemented on critical endpoints

### Data Protection

- **Encryption**: TLS 1.3 for all external communications
- **PII**: User emails and personal data stored securely
- **Media**: Uploaded to Cloudinary with transformation rules
- **Audit Logging**: All critical actions logged to EventLog table

### Network Security

- **Internal Communication**: Services communicate via `INTERNAL_SECRET`
- **Database Access**: Connection pooling + SSL required
- **Message Brokers**: SASL authentication for Kafka, AMQP for RabbitMQ

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

---

## 📞 Support

For questions or issues, please open a GitHub issue or contact the maintainers.
