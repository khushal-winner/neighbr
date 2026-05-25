'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Layers, ArrowRightLeft, GitBranch, Database } from 'lucide-react'

const TABS = [
    { id: 'overview', label: 'System Overview', icon: Layers },
    { id: 'communication', label: 'Service Comm', icon: ArrowRightLeft },
    { id: 'dataflow', label: 'Data Flow', icon: GitBranch },
    { id: 'schema', label: 'DB Schema', icon: Database },
] as const

type TabId = (typeof TABS)[number]['id']

const DIAGRAMS: Record<TabId, string> = {
    overview: `graph TB
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
    class FIREBASE,RESEND,CLOUDINARY external`,

    communication: `graph LR
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
    classDef redis fill:#0a7c5a,stroke:#065e44,color:#e2e8f0,stroke-width:2px`,

    dataflow: `graph TD
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
    class ADMIN,ALERT_SVC,KAFKA_ALERT,ALERT_WORKER,POSTGIS,REDIS_STREAM,FCM_ALERT,WS_GW,REALTIME alert`,

    schema: `erDiagram
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
    }`,
}

export function ArchitectureModal({
    isOpen,
    onClose,
}: {
    isOpen: boolean
    onClose: () => void
}) {
    const [activeTab, setActiveTab] = useState<TabId>('overview')
    const mermaidRef = useRef<HTMLDivElement>(null)
    const [rendered, setRendered] = useState(false)

    const renderDiagram = useCallback(async () => {
        if (!mermaidRef.current) return

        // Wait for mermaid to be loaded
        const win = window as unknown as { mermaid?: { initialize: (cfg: Record<string, unknown>) => void; render: (id: string, def: string) => Promise<{ svg: string }> } }
        if (!win.mermaid) return

        try {
            win.mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                themeVariables: {
                    primaryColor: '#006565',
                    primaryTextColor: '#e2e8f0',
                    primaryBorderColor: '#008080',
                    lineColor: '#4a9e9e',
                    secondaryColor: '#533483',
                    tertiaryColor: '#0f3460',
                    background: '#1a1a2e',
                    mainBkg: '#006565',
                    nodeBorder: '#008080',
                    clusterBkg: 'rgba(0,101,101,0.15)',
                    clusterBorder: 'rgba(0,128,128,0.4)',
                    titleColor: '#e2e8f0',
                    edgeLabelBackground: '#1a1a2e',
                    fontSize: '14px',
                },
                flowchart: { curve: 'basis', padding: 20 },
                er: { fontSize: 14 },
            })

            const id = `mermaid-${activeTab}-${Date.now()}`
            const { svg } = await win.mermaid.render(id, DIAGRAMS[activeTab])
            if (mermaidRef.current) {
                mermaidRef.current.innerHTML = svg
                setRendered(true)
            }
        } catch (err) {
            console.error('[Architecture] Mermaid render failed:', err)
            if (mermaidRef.current) {
                mermaidRef.current.innerHTML = `<p style="color: #f87171; padding: 2rem;">Diagram render failed. Please try again.</p>`
            }
        }
    }, [activeTab])

    // Load mermaid from CDN
    useEffect(() => {
        if (!isOpen) return

        const existing = document.getElementById('mermaid-cdn')
        if (existing) {
            renderDiagram()
            return
        }

        const script = document.createElement('script')
        script.id = 'mermaid-cdn'
        script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'
        script.onload = () => renderDiagram()
        document.head.appendChild(script)
    }, [isOpen, renderDiagram])

    // Re-render on tab change
    useEffect(() => {
        if (isOpen) {
            setRendered(false)
            renderDiagram()
        }
    }, [activeTab, isOpen, renderDiagram])

    // Escape key to close
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div className="arch-modal-overlay" onClick={onClose} id="architecture-modal">
            <div className="arch-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="arch-modal-header">
                    <div className="arch-modal-title">
                        <div className="arch-modal-title-icon">
                            <Layers size={20} />
                        </div>
                        <div>
                            <h2>NeighBr Architecture</h2>
                            <p>End-to-end system design — microservices, event streaming & data layer</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="arch-modal-close"
                        aria-label="Close architecture modal"
                        id="architecture-close-btn"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tab bar */}
                <div className="arch-tab-bar">
                    {TABS.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={`arch-tab ${activeTab === id ? 'arch-tab-active' : ''}`}
                            id={`arch-tab-${id}`}
                        >
                            <Icon size={15} />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>

                {/* Diagram area */}
                <div className="arch-diagram-area">
                    {!rendered && (
                        <div className="arch-diagram-loading">
                            <div className="arch-loading-spinner" />
                            <span>Rendering diagram…</span>
                        </div>
                    )}
                    <div
                        ref={mermaidRef}
                        className={`arch-diagram-content ${rendered ? 'arch-diagram-visible' : ''}`}
                    />
                </div>

                {/* Tech stack legend */}
                <div className="arch-legend">
                    <span className="arch-legend-item">
                        <span className="arch-legend-dot" style={{ background: '#006565' }} />
                        Services
                    </span>
                    <span className="arch-legend-item">
                        <span className="arch-legend-dot" style={{ background: '#533483' }} />
                        Workers
                    </span>
                    <span className="arch-legend-item">
                        <span className="arch-legend-dot" style={{ background: '#e94560' }} />
                        Brokers
                    </span>
                    <span className="arch-legend-item">
                        <span className="arch-legend-dot" style={{ background: '#0a7c5a' }} />
                        Data
                    </span>
                    <span className="arch-legend-item">
                        <span className="arch-legend-dot" style={{ background: '#d4880f' }} />
                        External
                    </span>
                </div>
            </div>
        </div>
    )
}
