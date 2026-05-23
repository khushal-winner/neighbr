import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosError } from 'axios'
import { getCookie, setCookie } from 'cookies-next'

// ─────────────────────────────────────────────────────────────────
// Refresh lock — prevents parallel requests from each firing their
// own refresh when the token expires. Only the first 401 fires the
// refresh; the rest queue up and get the new token when it arrives.
// ─────────────────────────────────────────────────────────────────
let isRefreshing = false
let refreshQueue: Array<{
    resolve: (token: string) => void
    reject: (err: unknown) => void
}> = []

function flushQueue(token: string | null, err: unknown = null) {
    refreshQueue.forEach(({ resolve, reject }) =>
        token ? resolve(token) : reject(err)
    )
    refreshQueue = []
}

// ─────────────────────────────────────────────────────────────────
// A raw axios client used ONLY for the refresh call.
// It cannot go through the interceptor chain — that would recurse.
// ─────────────────────────────────────────────────────────────────
const refreshClient = axios.create({
    baseURL: process.env.NEXT_PUBLIC_IDENTITY_URL ?? 'http://localhost:3001',
    withCredentials: true,  // must send the httpOnly refresh_token cookie
    timeout: 8_000,
})

// ─────────────────────────────────────────────────────────────────
// Attach request + response interceptors to any axios instance.
// Request: inject Bearer token from cookie.
// Response: on 401, refresh once and retry the original request.
// ─────────────────────────────────────────────────────────────────
function withInterceptors(instance: AxiosInstance): AxiosInstance {
    instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        const token = getCookie('access_token')
        if (token) {
            config.headers.Authorization = `Bearer ${token}`
        }
        return config
    })

    instance.interceptors.response.use(
        (res) => res,
        async (error: AxiosError) => {
            const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

            // Only handle 401. Never retry the refresh call itself.
            if (
                error.response?.status !== 401 ||
                original._retry ||
                original.url?.includes('/auth/refresh')
            ) {
                return Promise.reject(error)
            }

            // If already refreshing, queue this request and wait for the new token
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    refreshQueue.push({
                        resolve: (token) => {
                            original.headers.Authorization = `Bearer ${token}`
                            resolve(instance(original))
                        },
                        reject,
                    })
                })
            }

            original._retry = true
            isRefreshing = true

            try {
                // Call /auth/refresh — the httpOnly cookie is sent automatically
                const { data } = await refreshClient.post('/auth/refresh')
                const newToken: string = data.accessToken

                // Persist new token — 15 minutes, matching server-side JWT expiry
                setCookie('access_token', newToken, { maxAge: 900, path: '/' })

                // Also sync to Zustand so the WebSocket context picks it up immediately
                // Dynamic import avoids SSR issues — store is client-only
                if (typeof window !== 'undefined') {
                    const { useAuthStore } = await import('@/store/auth')
                    useAuthStore.getState().setAccessToken(newToken)
                }

                flushQueue(newToken)
                original.headers.Authorization = `Bearer ${newToken}`
                return instance(original)
            } catch (refreshErr) {
                flushQueue(null, refreshErr)
                // Refresh failed — session is truly over, go to login
                if (typeof window !== 'undefined') {
                    const { useAuthStore } = await import('@/store/auth')
                    useAuthStore.getState().clearAuth()
                    // Clear the cookie flag so middleware redirects correctly
                    document.cookie = 'access_token=; path=/; max-age=0'
                    window.location.href = '/login'
                }
                return Promise.reject(refreshErr)
            } finally {
                isRefreshing = false
            }
        }
    )

    return instance
}

// ─────────────────────────────────────────────────────────────────
// One named instance per service. Import the specific one you need.
// identityApi gets withCredentials — it handles httpOnly cookies.
// ─────────────────────────────────────────────────────────────────

// Auth, verification, user profiles
export const identityApi = withInterceptors(
    axios.create({
        baseURL: process.env.NEXT_PUBLIC_IDENTITY_URL ?? 'http://localhost:3001',
        withCredentials: true,  // ← sends refresh_token cookie on /auth/logout too
        timeout: 10_000,
    })
)

// Create, read, upvote, flag posts
export const postApi = withInterceptors(
    axios.create({
        baseURL: process.env.NEXT_PUBLIC_POST_URL ?? 'http://localhost:3002',
        timeout: 10_000,
    })
)

// Curated, approved post feed per community
export const feedApi = withInterceptors(
    axios.create({
        baseURL: process.env.NEXT_PUBLIC_FEED_URL ?? 'http://localhost:3004',
        timeout: 10_000,
    })
)

// DM threads, group chat, message history
export const chatApi = withInterceptors(
    axios.create({
        baseURL: process.env.NEXT_PUBLIC_CHAT_URL ?? 'http://localhost:3005',
        timeout: 10_000,
    })
)

// Community info, block captain tools, polls
export const communityApi = withInterceptors(
    axios.create({
        baseURL: process.env.NEXT_PUBLIC_COMMUNITY_URL ?? 'http://localhost:3007',
        timeout: 10_000,
    })
)