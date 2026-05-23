import { getCookie, setCookie, deleteCookie } from 'cookies-next'
import { useAuthStore } from '@/store/auth'

// Read the access token from cookie — used by the axios interceptor
export function getAccessToken(): string | null {
    const token = getCookie('access_token')
    return typeof token === 'string' ? token : null
}

// Write the access token — syncs to both cookie (for middleware) and Zustand (for WS context)
// 15-minute maxAge matches the JWT expiry set by the Identity Service
export function setAccessToken(token: string): void {
    setCookie('access_token', token, { maxAge: 900, path: '/' })
    useAuthStore.getState().setAccessToken(token)
}

// Wipe auth state — called on logout or when refresh fails
export function clearAuth(): void {
    deleteCookie('access_token', { path: '/' })
    useAuthStore.getState().clearAuth()
}

// Decode a JWT payload client-side — NO signature verification
// Only use this for reading non-sensitive claims (sub, communityId)
// Never trust this for access control — the server verifies the signature
export function decodeToken(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1]
        return JSON.parse(atob(payload))
    } catch {
        return null
    }
}