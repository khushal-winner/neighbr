'use client'

import { ReactNode } from 'react'
import { AuthBackground } from '@/components/auth/AuthBackground'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'

type AuthVariant = 'login' | 'register'

export function AuthShell({
    variant,
    children,
}: {
    variant: AuthVariant
    children: ReactNode
}) {
    return (
        <div className="auth-scene min-h-screen flex relative overflow-hidden">
            <AuthBackground />

            <div className="relative z-10 flex w-full min-h-screen">
                <AuthBrandPanel variant={variant} />

                <div className="flex-1 flex flex-col min-h-screen">
                    {/* Mobile brand strip */}
                    <div className="lg:hidden px-6 pt-8 pb-2 text-center auth-mobile-brand">
                        <div className="inline-flex items-center gap-2">
                            <div className="auth-logo-mark auth-logo-mark-sm">
                                <span className="text-lg">🏘️</span>
                            </div>
                            <span className="font-display font-bold text-xl text-gray-900 tracking-tight">
                                Neighbr
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
                        <div className="w-full auth-form-enter">{children}</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
