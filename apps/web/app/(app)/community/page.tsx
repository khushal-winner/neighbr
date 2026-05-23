'use client'

import { useEffect, useState, useRef } from 'react'
import { communityApi, postApi, chatApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Nav } from '@/components/Nav'
import { PostCard } from '@/components/PostCard'
import { OnlineUsersBar } from '@/components/OnlineUsersBar'
import { UserProfileLink } from '@/components/UserProfileLink'
import { PollSummaryCard } from '@/components/PollSummaryCard'
import { CreatePollForm } from '@/components/CreatePollForm'
import type { BlockPoll } from '@/lib/polls'
import { loadGroupChatCache, saveGroupChatCache } from '@/lib/groupChatCache'
import { syncSessionFromServer } from '@/lib/session'
import { Users, Pin, Megaphone, Send, MapPin, Crown, Hand } from 'lucide-react'
import { useWebSocket } from '@/contexts/websocket'

interface ChatMessage {
    id: string
    senderId: string
    senderName?: string
    sender?: {
        id: string
        displayName: string
    }
    body: string
    createdAt: string
}

interface CommunityInfo {
    id: string
    name: string
    residentCount: number
    onlineCount: number
    pinnedPostId: string | null
    blockCaptain: { id: string; displayName: string } | null
}

export default function CommunityPage() {
    const { user } = useAuthStore()
    const [community, setCommunity] = useState<CommunityInfo | null>(null)
    const [pinnedPost, setPinnedPost] = useState<any>(null)
    const [isCaptain, setIsCaptain] = useState(false)
    const [announce, setAnnounce] = useState({ title: '', body: '' })
    const [announcing, setAnnouncing] = useState(false)
    const [polls, setPolls] = useState<BlockPoll[]>([])
    const [pollsLoading, setPollsLoading] = useState(true)
    const [onlineUsers, setOnlineUsers] = useState<{ id: string; displayName: string }[]>([])
    const [onlineCount, setOnlineCount] = useState(0)
    const [loadError, setLoadError] = useState('')

    // Group Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [chatInput, setChatInput] = useState('')
    const [chatSending, setChatSending] = useState(false)
    const chatBottomRef = useRef<HTMLDivElement>(null)
    const { subscribe, isConnected } = useWebSocket()

    useEffect(() => {
        if (!user?.communityId) return

        let cancelled = false

        async function loadBlock() {
            setLoadError('')
            setPollsLoading(true)
            try {
                await syncSessionFromServer()
            } catch {
                // continue with existing session
            }

            const communityId = useAuthStore.getState().user?.communityId ?? user.communityId
            if (!communityId || cancelled) return

            const cached = loadGroupChatCache(communityId)
            if (cached?.length) setMessages(cached)

            const results = await Promise.allSettled([
                communityApi.get(`/communities/${communityId}`),
                communityApi.get(`/communities/${communityId}/members`),
                communityApi.get(`/communities/${communityId}/polls`),
                chatApi.get(`/chat/group/${communityId}/messages`, { params: { limit: 50 } }),
            ])

            if (cancelled) return

            const [commR, membersR, pollsR, chatR] = results

            if (commR.status === 'rejected') {
                setLoadError(commR.reason?.response?.data?.error ?? 'Failed to load your block')
                setPollsLoading(false)
                return
            }

            const data = commR.value.data.community
            setCommunity(data)
            setIsCaptain(data.blockCaptain?.id === user.id)

            if (membersR.status === 'fulfilled') {
                setOnlineUsers(membersR.value.data.onlineUsers ?? [])
                setOnlineCount(membersR.value.data.onlineCount ?? 0)
            }

            if (pollsR.status === 'fulfilled') {
                setPolls(pollsR.value.data.polls ?? [])
            }
            setPollsLoading(false)

            if (data.pinnedPostId) {
                postApi.get(`/posts/${data.pinnedPostId}`)
                    .then(r => setPinnedPost(r.data.post))
                    .catch(() => { })
            }

            if (chatR.status === 'fulfilled') {
                const hist = [...(chatR.value.data.messages ?? [])].reverse()
                setMessages(hist)
                saveGroupChatCache(communityId, hist)
            }
        }

        loadBlock()
        return () => { cancelled = true }
    }, [user?.communityId, user?.id])

    // Real-time incoming group messages
    useEffect(() => {
        if (!user?.communityId) return

        const unsub = subscribe('group_message', (data) => {
            if (data.communityId !== user.communityId) return

            setMessages(prev => {
                const exists = prev.some(m => m.id === data.messageId)
                if (exists) return prev
                const next = [...prev, {
                    id: data.messageId as string,
                    senderId: data.senderId as string,
                    senderName: data.senderName as string,
                    body: data.body as string,
                    createdAt: data.createdAt as string,
                }]
                saveGroupChatCache(user.communityId!, next)
                return next
            })
        })
        return unsub
    }, [subscribe, user?.communityId])

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function sendChatMessage(e: React.FormEvent) {
        e.preventDefault()
        if (!chatInput.trim() || chatSending || !user?.communityId) return

        setChatSending(true)
        const body = chatInput.trim()
        setChatInput('')

        try {
            const res = await chatApi.post(`/chat/group/${user.communityId}/message`, { body })
            setMessages(prev => {
                const exists = prev.some(m => m.id === res.data.message.id)
                const next = exists ? prev : [...prev, res.data.message]
                if (user?.communityId) saveGroupChatCache(user.communityId, next)
                return next
            })
        } catch {
            setChatInput(body)
        } finally {
            setChatSending(false)
        }
    }

    async function sendAnnouncement(e: React.FormEvent) {
        e.preventDefault()
        setAnnouncing(true)
        try {
            await communityApi.post(
                `/communities/${user!.communityId}/announce`,
                announce
            )
            setAnnounce({ title: '', body: '' })
            alert('Announcement sent to your block!')
        } catch (err: any) {
            alert(err.response?.data?.error ?? 'Failed to send announcement')
        } finally {
            setAnnouncing(false)
        }
    }

    if (!user?.communityId) {
        return (
            <div className="min-h-screen flex items-center justify-center pb-24">
                <div className="glass-panel rounded-3xl p-8 max-w-sm text-center space-y-4 flex flex-col items-center justify-center">
                    <MapPin size={40} className="text-primary mb-2" />
                    <p className="font-display font-semibold text-gray-800 text-lg leading-snug">
                        Verify Your Address
                    </p>
                    <p className="text-gray-500 text-sm font-sans">
                        Please verify your address to join your neighbourhood block and access the local discussions, polls, and maps.
                    </p>
                </div>
                <Nav />
            </div>
        )
    }

    return (
        <div className="min-h-screen pb-24">
            {/* Header */}
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4">
                    <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight">
                        {community?.name ?? 'My Block'}
                    </h1>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
                {loadError && (
                    <div className="glass-panel rounded-2xl p-4 text-sm text-rose-700 bg-rose-500/10 border border-rose-500/20">
                        {loadError}
                    </div>
                )}

                {!isConnected && (
                    <p className="text-[10px] text-center text-amber-700 font-semibold uppercase tracking-wider">
                        Connecting live chat…
                    </p>
                )}

                {/* Online neighbours */}
                {onlineCount > 0 && (
                    <OnlineUsersBar onlineUsers={onlineUsers} onlineCount={onlineCount} />
                )}

                {/* Stats */}
                {community && (
                    <div className="glass-panel rounded-2xl p-4 flex justify-around shadow-sm">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            <Users size={16} className="text-primary" />
                            <span>
                                <strong className="text-gray-800 text-sm">{community.residentCount}</strong> residents
                            </span>
                        </div>
                        <div className="w-px bg-gray-200" />
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                            <span>
                                <strong className="text-gray-800 text-sm">{community.onlineCount}</strong> online
                            </span>
                        </div>
                    </div>
                )}

                {/* Block captain info */}
                {community?.blockCaptain && (
                    <div className="glass-panel border-amber-500/20 bg-amber-500/5 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                        <div className="w-10 h-10 bg-amber-500/10 rounded-2xl flex items-center justify-center shadow-sm border border-amber-500/15">
                            <Crown size={20} className="text-amber-600" />
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-amber-800 uppercase tracking-widest">Block Captain</div>
                            <UserProfileLink
                                userId={community.blockCaptain.id}
                                className="text-sm font-semibold text-gray-900 mt-0.5 inline-block hover:no-underline"
                            >
                                {community.blockCaptain.displayName}
                            </UserProfileLink>
                        </div>
                    </div>
                )}

                {/* Pinned post */}
                {pinnedPost && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary/80 uppercase tracking-wider pl-1">
                            <Pin size={13} className="rotate-45" />
                            Pinned post
                        </div>
                        <PostCard post={pinnedPost} />
                    </div>
                )}

                {/* Block captain tools */}
                {isCaptain && (
                    <div className="glass-panel border-amber-500/30 bg-amber-500/5 rounded-2xl p-5 space-y-4 shadow-md">
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-800 uppercase tracking-wider pl-0.5">
                            <Megaphone size={16} />
                            Send Block Announcement
                        </div>
                        <form onSubmit={sendAnnouncement} className="space-y-3">
                            <input
                                type="text"
                                value={announce.title}
                                onChange={e => setAnnounce(prev => ({ ...prev, title: e.target.value }))}
                                className="w-full soft-input rounded-xl px-4 py-3 text-sm"
                                placeholder="Announcement title"
                                required
                            />
                            <textarea
                                value={announce.body}
                                onChange={e => setAnnounce(prev => ({ ...prev, body: e.target.value }))}
                                rows={3}
                                className="w-full soft-input rounded-xl px-4 py-3 text-sm resize-none"
                                placeholder="What do you want to tell your neighbours?"
                                required
                            />
                            <button
                                type="submit"
                                disabled={announcing}
                                className="w-full bg-amber-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-amber-700 active:scale-[0.98] disabled:opacity-50 transition-all duration-200 cursor-pointer shadow-sm shadow-amber-600/10"
                            >
                                {announcing ? 'Sending...' : 'Send to block'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Block polls */}
                <section className="space-y-3.5">
                    <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-1">
                        Block Polls
                    </h2>

                    <CreatePollForm
                        onCreated={(poll) => setPolls((prev) => [poll, ...prev])}
                    />

                    {pollsLoading ? (
                        <div className="glass-panel rounded-2xl p-6 animate-pulse">
                            <div className="h-4 bg-gray-200/50 rounded w-2/3 mb-4" />
                            <div className="space-y-2">
                                <div className="h-10 bg-gray-200/40 rounded-xl" />
                                <div className="h-10 bg-gray-200/40 rounded-xl" />
                            </div>
                        </div>
                    ) : polls.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4 px-2">
                            No polls yet — be the first to ask your block a question.
                        </p>
                    ) : (
                        polls.map((poll) => (
                            <PollSummaryCard
                                key={poll.id}
                                poll={poll}
                                feedPostId={poll.feedPostId}
                            />
                        ))
                    )}
                </section>

                {/* Block Group Chat Card */}
                <div className="glass-panel rounded-2xl flex flex-col h-[500px] overflow-hidden shadow-md border border-white/20">
                    {/* Chat Header */}
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-white/30 backdrop-blur-sm flex-shrink-0">
                        <div>
                            <h2 className="text-sm font-bold text-gray-900 font-display">Block Live Chat</h2>
                            <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mt-0.5">Live with neighbours</p>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Live</span>
                        </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white/20">
                        {messages.length === 0 ? (
                            <div className="text-center py-20 text-gray-400 flex flex-col items-center justify-center">
                                <Hand size={32} className="text-gray-400 mb-2" />
                                <p className="text-xs font-semibold text-gray-700">No messages yet</p>
                                <p className="text-[10px] mt-0.5">Say hello to your street!</p>
                            </div>
                        ) : (
                            messages.map(msg => {
                                const isMe = msg.senderId === user?.id
                                return (
                                    <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs font-medium shadow-sm leading-relaxed ${
                                            isMe 
                                                ? 'bg-primary text-white rounded-br-none shadow-primary/10'
                                                : 'glass-panel bg-white/80 border border-gray-100 text-gray-900 rounded-bl-none'
                                        }`}>
                                            {!isMe && (
                                                <div className="text-[9px] font-bold text-primary uppercase tracking-wider mb-0.5">
                                                    <UserProfileLink
                                                        userId={msg.sender?.id ?? msg.senderId}
                                                        className="hover:no-underline"
                                                    >
                                                        {msg.sender?.displayName ?? msg.senderName ?? `Neighbour #${msg.senderId.slice(-4)}`}
                                                    </UserProfileLink>
                                                </div>
                                            )}
                                            {msg.body}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                        <div ref={chatBottomRef} />
                    </div>

                    {/* Chat Input */}
                    <div className="p-3 border-t border-gray-100 bg-white/30 backdrop-blur-sm flex-shrink-0">
                        <form onSubmit={sendChatMessage} className="flex gap-2">
                            <input
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                className="flex-1 soft-input rounded-xl px-4 py-2 text-xs"
                                placeholder="Message your block..."
                            />
                            <button
                                type="submit"
                                disabled={!chatInput.trim() || chatSending}
                                className="w-9 h-9 bg-primary text-white rounded-xl flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 active:scale-95 transition-all duration-200 shadow-md shadow-primary/15 cursor-pointer flex-shrink-0"
                            >
                                <Send size={14} />
                            </button>
                        </form>
                    </div>
                </div>

            </div>

            <Nav />
        </div>
    )
}