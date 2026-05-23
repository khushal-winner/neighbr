'use client'

/** Layered animated backdrop for login / register — theme: teal + warm coral */
export function AuthBackground() {
    return (
        <div className="auth-bg-root" aria-hidden>
            <div className="auth-bg-mesh" />
            <div className="auth-bg-aurora" />
            <div className="auth-bg-grid" />

            {/* Floating neighbourhood motifs */}
            <div className="auth-float auth-float-1">
                <HouseIcon className="w-10 h-10 text-primary/25" />
            </div>
            <div className="auth-float auth-float-2">
                <TreeIcon className="w-8 h-8 text-primary/20" />
            </div>
            <div className="auth-float auth-float-3">
                <HouseIcon className="w-7 h-7 text-tertiary/25" />
            </div>
            <div className="auth-float auth-float-4">
                <ChatIcon className="w-9 h-9 text-primary-container/20" />
            </div>

            {/* Soft particles */}
            {PARTICLES.map((p, i) => (
                <span
                    key={i}
                    className="auth-particle"
                    style={{
                        left: p.x,
                        top: p.y,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                    }}
                />
            ))}

            <div className="auth-bg-noise" />
            <div className="auth-bg-vignette" />
        </div>
    )
}

const PARTICLES = [
    { x: '12%', y: '18%', delay: 0, duration: 7 },
    { x: '78%', y: '22%', delay: 1.2, duration: 9 },
    { x: '88%', y: '62%', delay: 0.6, duration: 8 },
    { x: '24%', y: '72%', delay: 2, duration: 10 },
    { x: '52%', y: '12%', delay: 1.8, duration: 7.5 },
    { x: '6%', y: '48%', delay: 0.9, duration: 8.5 },
    { x: '64%', y: '84%', delay: 2.4, duration: 9 },
    { x: '42%', y: '38%', delay: 1.5, duration: 11 },
]

function HouseIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3zm0 2.8L18 11v7h-2v-5H8v5H6v-7l6-5.2z" />
        </svg>
    )
}

function TreeIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2c-1 3-3 4.5-3 7a3 3 0 006 0c0-2.5-2-4-3-7zm-5 9c-1.5 2-2 3.5-2 5.5A5.5 5.5 0 0012 22a5.5 5.5 0 007-5.5c0-2-0.5-3.5-2-5.5-1 1.5-2.5 2.5-5 2.5S6 12.5 7 11z" />
        </svg>
    )
}

function ChatIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z" />
        </svg>
    )
}
