'use client'

import { useDevModeStore } from '@/store/devMode'
import { Code2, User } from 'lucide-react'

export function DevModeToggle() {
    const { isDevMode, toggleDevMode } = useDevModeStore()

    return (
        <div className="dev-toggle-pill" id="dev-mode-toggle">
            <div className="dev-toggle-label">
                {isDevMode ? (
                    <>
                        <Code2 size={13} strokeWidth={2.5} />
                        <span>Dev Mode</span>
                    </>
                ) : (
                    <>
                        <User size={13} strokeWidth={2.5} />
                        <span>User Mode</span>
                    </>
                )}
            </div>
            <button
                onClick={toggleDevMode}
                className={`dev-toggle-track ${isDevMode ? 'dev-toggle-on' : 'dev-toggle-off'}`}
                role="switch"
                aria-checked={isDevMode}
                aria-label="Toggle developer mode"
                id="dev-mode-switch"
            >
                <span className="dev-toggle-thumb" />
            </button>
        </div>
    )
}
