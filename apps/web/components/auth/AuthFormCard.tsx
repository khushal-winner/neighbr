'use client'

import { ReactNode } from 'react'

interface AuthFormCardProps {
    title: string
    subtitle: string
    icon: ReactNode
    children: ReactNode
    footer: ReactNode
}

export function AuthFormCard({ title, subtitle, icon, children, footer }: AuthFormCardProps) {
    return (
        <div className="auth-card-wrapper w-full max-w-[420px] mx-auto">
            <div className="auth-card-glow-ring" aria-hidden />
            <div className="auth-card">
                <div className="text-center mb-8">
                    <div className="auth-card-icon mx-auto">{icon}</div>
                    <h1 className="text-2xl font-display font-bold text-gray-900 tracking-tight mt-5">
                        {title}
                    </h1>
                    <p className="text-sm text-gray-500 mt-2 font-sans">{subtitle}</p>
                </div>

                {children}

                <div className="mt-8 pt-6 border-t border-gray-200/60">{footer}</div>
            </div>
        </div>
    )
}
