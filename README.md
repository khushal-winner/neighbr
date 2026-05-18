# Neighbr

A hyperlocal neighbourhood platform — verified residents, real-time alerts, community feed.

## Architecture

TypeScript monorepo (Turborepo). 12 backend services + Next.js frontend + Go WebSocket Gateway.

| Service | Port | Purpose |
|---|---|---|
| Identity | 3001 | Auth, verification, user profiles |
| Post | 3002 | Content creation, moderation queue |
| Moderation | 3003 | Async content analysis worker |
| Feed | 3004 | Feed reads via Redis sorted sets |
| ... | ... | ... |

## Stack

- **Backend**: Fastify + TypeScript
- **Database**: PostgreSQL + PostGIS (Neon)
- **Queue**: RabbitMQ (CloudAMQP)
- **Cache**: Redis (Upstash)
- **ORM**: Prisma

## Getting Started

1. Clone the repo
2. Copy `.env.example` to `.env` in each service and fill in your values
3. `npm install` from root
4. `cd packages/db && npx prisma generate`
5. `cd apps/services/identity && npm run dev`

## Services Status

- [x] Identity Service
- [x] Post Service  
- [x] Moderation Service
- [ ] Feed Service
- [ ] WebSocket Gateway
