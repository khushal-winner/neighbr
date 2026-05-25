'use client'

import { ReactNode, useState, useEffect } from 'react'
import { AuthBackground } from '@/components/auth/AuthBackground'
import { AuthBrandPanel } from '@/components/auth/AuthBrandPanel'
import { DevModeToggle } from '@/components/DevModeToggle'
import { ArchitectureModal } from '@/components/ArchitectureModal'
import { useDevModeStore } from '@/store/devMode'
import { Network, X } from 'lucide-react'

type AuthVariant = 'login' | 'register'

export function AuthShell({
    variant,
    children,
}: {
    variant: AuthVariant
    children: ReactNode
}) {
    const { isDevMode } = useDevModeStore()
    const [showArch, setShowArch] = useState(false)
    const [showTooltip, setShowTooltip] = useState(false)

    // Hydration-safe load of dismissed state from localStorage
    useEffect(() => {
        const dismissed = localStorage.getItem('neighBr-arch-tooltip-dismissed')
        if (!dismissed) {
            setShowTooltip(true)
        }
    }, [])

    const handleDismissTooltip = (e: React.MouseEvent) => {
        e.stopPropagation()
        localStorage.setItem('neighBr-arch-tooltip-dismissed', 'true')
        setShowTooltip(false)
    }

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
                                NeighBr
                            </span>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
                        <div className="w-full auth-form-enter">{children}</div>
                    </div>
                </div>
            </div>

            {/* Dev Mode Toggle — bottom right */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
                {isDevMode && (
                    <div className="arch-tooltip-wrapper">
                        {showTooltip && (
                            <div className="arch-tooltip" id="architecture-tooltip">
                                <p>Explore the architecture of this website to know more</p>
                                <button
                                    onClick={handleDismissTooltip}
                                    className="arch-tooltip-close"
                                    aria-label="Dismiss architecture tooltip"
                                    id="close-arch-tooltip-btn"
                                >
                                    <X size={12} strokeWidth={2.5} />
                                </button>
                                <div className="arch-tooltip-arrow" />
                            </div>
                        )}
                        <button
                            onClick={() => setShowArch(true)}
                            className="arch-trigger-btn"
                            id="architecture-btn"
                        >
                            <Network size={16} strokeWidth={2.5} />
                            Architecture
                        </button>
                    </div>
                )}
                <DevModeToggle />
            </div>

            {/* Architecture Modal */}
            <ArchitectureModal isOpen={showArch} onClose={() => setShowArch(false)} />
        </div>
    )
}

