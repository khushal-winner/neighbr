'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserProfileLink } from '@/components/UserProfileLink'
import { chatApi, communityApi } from '@/lib/api'
import { Nav } from '@/components/Nav'
import { CommunityMembersList, type CommunityMember } from '@/components/CommunityMembersList'
import { useWebSocket } from '@/contexts/websocket'
import { MessageSquare, Users, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { syncSessionFromServer } from '@/lib/session'

interface Thread {
    id: string
    type: string
    createdAt: string
    messages: { body: string; createdAt: string }[]
    participants: { userId: string }[]
    recipientId?: string
    recipientName?: string
}

function getOtherUserId(thread: Thread, currentUserId?: string): string | undefined {
    return (
        thread.recipientId ??
        thread.participants.find((p) => p.userId !== currentUserId)?.userId
    )
}

/** Client-side safety net if duplicate threads exist in the DB */
function dedupeThreads(threads: Thread[], currentUserId?: string): Thread[] {
    const byOther = new Map<string, Thread>()

    for (const thread of threads) {
        const otherId = getOtherUserId(thread, currentUserId)
        if (!otherId) continue

        const existing = byOther.get(otherId)
        if (!existing) {
            byOther.set(otherId, thread)
            continue
        }

        const threadTime = new Date(
            thread.messages[0]?.createdAt ?? thread.createdAt,
        ).getTime()
        const existingTime = new Date(
            existing.messages[0]?.createdAt ?? existing.createdAt,
        ).getTime()
        if (threadTime > existingTime) {
            byOther.set(otherId, thread)
        }
    }

    return Array.from(byOther.values()).sort((a, b) => {
        const aTime = new Date(a.messages[0]?.createdAt ?? a.createdAt).getTime()
        const bTime = new Date(b.messages[0]?.createdAt ?? b.createdAt).getTime()
        return bTime - aTime
    })
}

export default function ChatPage() {
    const [threads, setThreads] = useState<Thread[]>([])
    const [members, setMembers] = useState<CommunityMember[]>([])
    const [communityName, setCommunityName] = useState<string | null>(null)
    const [loadingThreads, setLoadingThreads] = useState(true)
    const [loadingMembers, setLoadingMembers] = useState(true)
    const [membersError, setMembersError] = useState('')
    const { user } = useAuthStore()
    const { subscribe } = useWebSocket()
    const router = useRouter()

    const loadMembers = useCallback(async () => {
        if (!user?.communityId) {
            setMembers([])
            setLoadingMembers(false)
            return
        }

        setLoadingMembers(true)
        setMembersError('')

        try {
            await syncSessionFromServer()
        } catch {
            // use existing token
        }

        const communityId = useAuthStore.getState().user?.communityId ?? user.communityId
        if (!communityId) {
            setLoadingMembers(false)
            return
        }

        try {
            const res = await communityApi.get(`/communities/${communityId}/members`)
            setMembers(res.data.members ?? [])
            setCommunityName(res.data.communityName ?? null)
        } catch (err: any) {
            setMembers([])
            setMembersError(
                err.response?.data?.error ?? 'Could not load community members',
            )
        } finally {
            setLoadingMembers(false)
        }
    }, [user?.communityId])

    const applyThreads = useCallback(
        (raw: Thread[]) => setThreads(dedupeThreads(raw, user?.id)),
        [user?.id],
    )

    useEffect(() => {
        chatApi.get('/chat/threads')
            .then((res) => applyThreads(res.data.threads ?? []))
            .finally(() => setLoadingThreads(false))
    }, [applyThreads])

    useEffect(() => {
        loadMembers()
    }, [loadMembers])

    useEffect(() => {
        const unsub = subscribe('chat_message', () => {
            chatApi
                .get('/chat/threads')
                .then((res) => applyThreads(res.data.threads ?? []))
        })
        return unsub
    }, [subscribe, applyThreads])

    const chattedUserIds = new Set(
        threads
            .map((t) => getOtherUserId(t, user?.id))
            .filter((id): id is string => !!id),
    )

    const membersWithoutExistingChat = members.filter(
        (m) => m.id !== user?.id && !chattedUserIds.has(m.id),
    )

    function startDm(recipientId: string) {
        router.push(`/chat/new?recipientId=${recipientId}`)
    }

    return (
        <div className="min-h-screen pb-24">
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight">Messages</h1>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-5 space-y-6">
                <section className="space-y-3">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-1">
                        Your conversations
                    </h2>

                    {loadingThreads ? (
                        <div className="glass-panel text-center py-10 text-gray-400 rounded-2xl">
                            <div className="animate-pulse space-y-2">
                                <div className="h-4 bg-gray-200/50 rounded w-1/3 mx-auto" />
                                <div className="h-3 bg-gray-200/50 rounded w-1/2 mx-auto" />
                            </div>
                        </div>
                    ) : threads.length === 0 ? (
                        <div className="glass-panel text-center py-10 text-gray-400 rounded-2xl flex flex-col items-center">
                            <MessageSquare size={32} className="text-primary/60 mb-3" />
                            <p className="text-sm font-semibold text-gray-700">No direct messages yet</p>
                            <p className="text-xs mt-1 max-w-[240px] leading-relaxed">
                                Message a neighbour below to start a conversation.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {threads.map(thread => {
                                const lastMsg = thread.messages[0]
                                const otherId = getOtherUserId(thread, user?.id)

                                return (
                                    <div
                                        key={thread.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => router.push(`/chat/dm/${thread.id}`)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault()
                                                router.push(`/chat/dm/${thread.id}`)
                                            }
                                        }}
                                        className="glass-panel shadow-sm hover:scale-[1.01] hover:border-primary/40 active:scale-[0.99] duration-200 transition-all cursor-pointer rounded-2xl flex items-center gap-4 px-5 py-4"
                                    >
                                        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 border border-primary/10">
                                            <MessageSquare size={18} className="text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {otherId ? (
                                                <UserProfileLink
                                                    userId={otherId}
                                                    className="text-sm font-semibold text-gray-900 font-display hover:no-underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {thread.recipientName ?? 'Direct Message'}
                                                </UserProfileLink>
                                            ) : (
                                                <div className="text-sm font-semibold text-gray-900 font-display">
                                                    {thread.recipientName ?? 'Direct Message'}
                                                </div>
                                            )}
                                            {lastMsg && (
                                                <div className="text-xs text-gray-500 truncate mt-0.5">
                                                    {lastMsg.body}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>

                {user?.communityId && (
                    <Link
                        href="/community"
                        className="glass-panel shadow-sm hover:scale-[1.01] hover:border-primary/40 active:scale-[0.99] duration-200 transition-all cursor-pointer rounded-2xl flex items-center gap-4 px-5 py-4"
                    >
                        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/10 shadow-sm flex-shrink-0">
                            <Users size={20} className="text-primary" />
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-gray-900 font-display">Block group chat</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                {communityName ? `${communityName} — live chat` : 'Live chat with everyone on your street'}
                            </div>
                        </div>
                    </Link>
                )}

                {user?.communityId ? (
                    <section className="space-y-3">
                        <div className="flex items-center justify-between pl-1 pr-1">
                            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                Chat with your community members
                            </h2>
                            <button
                                type="button"
                                onClick={loadMembers}
                                className="p-1.5 text-gray-400 hover:text-primary rounded-lg transition-colors cursor-pointer"
                                aria-label="Refresh members"
                            >
                                <RefreshCw size={14} className={loadingMembers ? 'animate-spin' : ''} />
                            </button>
                        </div>
                        {communityName && (
                            <p className="text-xs text-primary font-semibold pl-1 -mt-1">{communityName}</p>
                        )}

                        {loadingMembers ? (
                            <div className="glass-panel text-center py-10 rounded-2xl animate-pulse">
                                <div className="h-10 bg-gray-200/40 rounded-xl mx-4" />
                            </div>
                        ) : membersError ? (
                            <div className="glass-panel rounded-2xl p-5 text-center space-y-3">
                                <p className="text-sm text-rose-600">{membersError}</p>
                                <button
                                    type="button"
                                    onClick={loadMembers}
                                    className="text-sm font-semibold text-primary hover:underline cursor-pointer"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : membersWithoutExistingChat.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-6 px-2">
                                You&apos;re already chatting with everyone on your block.
                            </p>
                        ) : (
                            <CommunityMembersList
                                members={membersWithoutExistingChat}
                                currentUserId={user.id}
                                onStartDm={startDm}
                            />
                        )}
                    </section>
                ) : (
                    <div className="glass-panel rounded-2xl p-5 text-center text-sm text-gray-500">
                        Verify your address to see neighbours on your block.
                    </div>
                )}
            </div>

            <Nav />
        </div>
    )
}
