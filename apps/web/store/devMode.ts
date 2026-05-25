'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DevModeState {
    isDevMode: boolean
    toggleDevMode: () => void
}

export const useDevModeStore = create<DevModeState>()(
    persist(
        (set) => ({
            isDevMode: true,
            toggleDevMode: () => set((s) => ({ isDevMode: !s.isDevMode })),
        }),
        { name: 'neighBr-dev-mode' }
    )
)
