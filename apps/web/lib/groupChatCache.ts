const PREFIX = 'neighbr:group-chat:'

export interface CachedChatMessage {
    id: string
    senderId: string
    senderName?: string
    sender?: { id: string; displayName: string }
    body: string
    createdAt: string
}

export function loadGroupChatCache(communityId: string): CachedChatMessage[] | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = sessionStorage.getItem(`${PREFIX}${communityId}`)
        if (!raw) return null
        const parsed = JSON.parse(raw) as CachedChatMessage[]
        return Array.isArray(parsed) ? parsed : null
    } catch {
        return null
    }
}

export function saveGroupChatCache(communityId: string, messages: CachedChatMessage[]) {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.setItem(`${PREFIX}${communityId}`, JSON.stringify(messages.slice(-80)))
    } catch {
        // storage full — ignore
    }
}
