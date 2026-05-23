'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { chatApi } from '@/lib/api'
import { useWebSocket } from '@/contexts/websocket'
import { useAuthStore } from '@/store/auth'
import { Send, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/cn'

interface Message {
    id: string
    senderId: string
    body: string
    createdAt: string
}

export default function GroupChatPage() {
    const { communityId } = useParams<{ communityId: string }>()
    const { user } = useAuthStore()
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [threadId, setThreadId] = useState<string | null>(null)
    const bottomRef = useRef<HTMLDivElement>(null)
    const { subscribe } = useWebSocket()

    useEffect(() => {
        // GET /chat/group/:communityId — creates thread if not exists, returns thread
        chatApi.get(`/chat/group/${communityId}`).then(res => {
            const thread = res.data.thread
            setThreadId(thread.id)

            // Load message history
            chatApi.get(`/chat/group/${communityId}/messages`).then(histRes => {
                // Newest-first from server — reverse for display (oldest at top)
                setMessages([...histRes.data.messages].reverse())
            })
        })
    }, [communityId])

    // Real-time incoming group messages
    useEffect(() => {
        const unsub = subscribe('group_message', (data) => {
            if (data.communityId !== communityId) return

            setMessages(prev => [...prev, {
                id: data.messageId as string,
                senderId: data.senderId as string,
                body: data.body as string,
                createdAt: data.createdAt as string,
            }])
        })
        return unsub
    }, [subscribe, communityId])

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function sendMessage(e: React.FormEvent) {
        e.preventDefault()
        if (!input.trim() || sending) return

        setSending(true)
        const body = input.trim()
        setInput('')

        try {
            const res = await chatApi.post(`/chat/group/${communityId}/message`, { body })
            // Server broadcasts via WebSocket — don't add locally to avoid duplicates
            // if WS delivers it, it'll appear via the subscribe handler above
            // If WS is down, add it locally as fallback:
            setMessages(prev => {
                const exists = prev.some(m => m.id === res.data.message.id)
                return exists ? prev : [...prev, res.data.message]
            })
        } catch {
            setInput(body) // restore on failure
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="h-screen flex flex-col relative overflow-hidden">
            {/* Header */}
            <div className="glass-header flex-shrink-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center gap-3">
                    <Link href="/chat" className="text-gray-400 hover:text-primary transition-colors">
                        <ChevronLeft size={22} />
                    </Link>
                    <div>
                        <h1 className="text-base font-display font-bold text-gray-900 tracking-tight">Block Group Chat</h1>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-0.5">Everyone on your street</p>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto z-10 pb-6">
                <div className="max-w-lg mx-auto px-4 py-6 space-y-3.5">
                    {messages.length === 0 && (
                        <div className="glass-panel text-center py-16 text-gray-400 rounded-3xl">
                            <span className="text-4xl">👋</span>
                            <p className="text-base font-semibold text-gray-700 mt-3">No messages yet</p>
                            <p className="text-sm mt-1">Be the first to say hello to your neighbours!</p>
                        </div>
                    )}
                    {messages.map(msg => {
                        const isMe = msg.senderId === user?.id
                        return (
                            <div key={msg.id} className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}>
                                <div className={cn(
                                    'max-w-[80%] px-4.5 py-3 rounded-2xl text-sm font-medium shadow-sm leading-relaxed',
                                    isMe
                                        ? 'bg-primary text-white rounded-br-none shadow-primary/10'
                                        : 'glass-panel bg-white/70 border border-gray-100 text-gray-900 rounded-bl-none'
                                )}>
                                    {/* Show sender name for other people's messages in group chat */}
                                    {!isMe && (
                                        <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-1">
                                            Neighbour #{msg.senderId.slice(-4)}
                                        </div>
                                    )}
                                    {msg.body}
                                </div>
                            </div>
                        )
                    })}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* Input */}
            <div className="glass-header border-t-0 flex-shrink-0 z-30 pb-safe">
                <div className="max-w-lg mx-auto px-4 py-4">
                    <form onSubmit={sendMessage} className="flex gap-2.5">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            className="flex-1 soft-input rounded-full px-5 py-3 text-sm"
                            placeholder="Message your block..."
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || sending}
                            className="w-11 h-11 bg-primary text-white rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-primary-container active:scale-95 transition-all duration-200 shadow-md shadow-primary/15 cursor-pointer flex-shrink-0"
                        >
                            <Send size={16} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}