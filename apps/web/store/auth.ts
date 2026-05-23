import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
    id: string
    email: string
    displayName: string
    avatarUrl?: string | null
    verificationLevel: 'unverified' | 'address_verified' | 'postcard_verified'
    trustScore: number
    trustBand: string
    communityId: string | null
    communityName?: string | null
}

interface AuthState {
    user: User | null
    accessToken: string | null   // in-memory only — NOT persisted (httpOnly cookie is the source of truth)
    setAuth: (user: User, token: string) => void
    setAccessToken: (token: string) => void   // called after refresh — updates token without touching user
    updateUser: (partial: Partial<User>) => void
    clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            accessToken: null,

            // called on login — sets both user and token
            setAuth: (user, accessToken) => set({ user, accessToken }),

            // called after token refresh — only updates the token
            setAccessToken: (accessToken) => set({ accessToken }),

            // called when user data changes (verification level, display name, etc.)
            updateUser: (partial) =>
                set((state) => ({
                    user: state.user ? { ...state.user, ...partial } : null,
                })),

            // called on logout — wipes everything
            clearAuth: () => set({ user: null, accessToken: null }),
        }),
        {
            name: 'neighbr-auth',
            // Only persist user — accessToken is re-derived on mount via /auth/refresh
            // Storing JWTs in localStorage is an XSS risk; the httpOnly cookie is safer
            partialize: (state) => ({ user: state.user }),
        }
    )
)