import { identityApi } from '@/lib/api'
import { setAccessToken } from '@/lib/auth'
import { useAuthStore } from '@/store/auth'
import type { User } from '@/store/auth'

/** Refresh JWT (picks up communityId / verification changes) and sync user into Zustand */
export async function syncSessionFromServer(): Promise<User> {
    const refreshRes = await identityApi.post('/auth/refresh')
    const newToken: string = refreshRes.data.accessToken
    setAccessToken(newToken)

    const meRes = await identityApi.get('/auth/me')
    const user = meRes.data.user as User
    useAuthStore.getState().setAuth(user, newToken)
    return user
}
