'use client'

import { Shield, MessageCircle, MapPin, Sparkles } from 'lucide-react'

type AuthVariant = 'login' | 'register'

const COPY: Record<AuthVariant, { headline: string; sub: string }> = {
    login: {
        headline: 'Your block, connected.',
        sub: 'Pick up where you left off — chats, posts, and neighbours waiting on your street.',
    },
    register: {
        headline: 'Welcome to the neighbourhood.',
        sub: 'Join verified locals on your block. Safe, friendly, and built for real communities.',
    },
}

const FEATURES = [
    { icon: MapPin, label: 'Address-verified neighbours only' },
    { icon: MessageCircle, label: 'Block chat & direct messages' },
    { icon: Shield, label: 'Trust scores & postcard verification' },
]

export function AuthBrandPanel({ variant }: { variant: AuthVariant }) {
    const { headline, sub } = COPY[variant]

    return (
        <div className="auth-brand-panel hidden lg:flex flex-col justify-between p-10 xl:p-12 text-white relative overflow-hidden">
            <div className="auth-brand-glow" aria-hidden />

            <div className="relative z-10">
                <div className="flex items-center gap-2.5 mb-10">
                    <div className="auth-logo-mark">
                        <span className="text-xl">🏘️</span>
                    </div>
                    <span className="font-display font-bold text-2xl tracking-tight">NeighBr</span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold uppercase tracking-widest mb-6 auth-badge-shimmer">
                    <Sparkles size={12} />
                    Your local network
                </div>

                <h2 className="font-display text-3xl xl:text-4xl font-bold leading-tight tracking-tight max-w-sm">
                    {headline}
                </h2>
                <p className="mt-4 text-sm text-white/75 leading-relaxed max-w-sm font-sans">
                    {sub}
                </p>
            </div>

            <ul className="relative z-10 space-y-4 mt-12">
                {FEATURES.map(({ icon: Icon, label }, i) => (
                    <li
                        key={label}
                        className="flex items-center gap-3 auth-feature-item"
                        style={{ animationDelay: `${0.15 * i}s` }}
                    >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm">
                            <Icon size={16} className="text-teal-200" />
                        </span>
                        <span className="text-sm font-medium text-white/90">{label}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}
