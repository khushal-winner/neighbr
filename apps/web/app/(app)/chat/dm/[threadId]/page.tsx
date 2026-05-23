'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { chatApi, identityApi } from '@/lib/api'
import { useWebSocket } from '@/contexts/websocket'
import { useAuthStore } from '@/store/auth'
import { Send, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { UserProfileLink } from '@/components/UserProfileLink'

interface Message {
    id: string
    senderId: string
    body: string
    createdAt: string
    readAt: string | null
}

export default function DMThreadPage() {
    const { threadId } = useParams<{ threadId: string }>()
    const { user } = useAuthStore()
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const [recipientName, setRecipientName] = useState('Direct Message')
    const [recipientId, setRecipientId] = useState<string | null>(null)
    const [isOnline, setIsOnline] = useState(false)
    const [isRecipientTyping, setIsRecipientTyping] = useState(false)
    const [isLocalTyping, setIsLocalTyping] = useState(false)
    
    const bottomRef = useRef<HTMLDivElement>(null)
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const { subscribe, send } = useWebSocket()

    useEffect(() => {
        chatApi.get(`/chat/dm/${threadId}/messages`).then(res => {
            // messages come newest first — reverse for display
            setMessages([...res.data.messages].reverse())
            if (res.data.recipientName) {
                setRecipientName(res.data.recipientName)
            }
            if (res.data.recipientId) {
                setRecipientId(res.data.recipientId)
            }
        })

        // mark as read on open
        chatApi.patch(`/chat/dm/${threadId}/read`).catch(() => { })
    }, [threadId])

    // Fetch recipient presence
    useEffect(() => {
        if (!recipientId) return

        const fetchPresence = async () => {
            try {
                const res = await identityApi.get(`/users/${recipientId}/online`)
                setIsOnline(res.data.online)
            } catch {
                // Ignore presence check errors
            }
        }

        fetchPresence()

        const interval = setInterval(fetchPresence, 15000)
        return () => clearInterval(interval)
    }, [recipientId])

    // Real-time incoming messages & typing indicators
    useEffect(() => {
        const unsubMessage = subscribe('chat_message', (data) => {
            if (data.threadId !== threadId) return

            const msg: Message = {
                id: data.messageId as string,
                senderId: data.senderId as string,
                body: data.body as string,
                createdAt: data.createdAt as string,
                readAt: null,
            }

            setMessages(prev => [...prev, msg])
        })

        const unsubTyping = subscribe('user_typing', (data) => {
            if (data.senderId === recipientId) {
                setIsRecipientTyping(data.isTyping as boolean)
            }
        })

        return () => {
            unsubMessage()
            unsubTyping()
        }
    }, [subscribe, threadId, recipientId])

    // Clear timeouts and reset typing state on unmount or input change
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
            }
            if (isLocalTyping && recipientId) {
                send({
                    type: 'typing',
                    recipientId,
                    isTyping: false,
                })
            }
        }
    }, [isLocalTyping, recipientId, send])

    // scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isRecipientTyping])

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value)

        if (!recipientId) return

        if (!isLocalTyping) {
            setIsLocalTyping(true)
            send({
                type: 'typing',
                recipientId,
                isTyping: true,
            })
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        }

        typingTimeoutRef.current = setTimeout(() => {
            setIsLocalTyping(false)
            send({
                type: 'typing',
                recipientId,
                isTyping: false,
            })
        }, 2000)
    }

    async function sendMessage(e: React.FormEvent) {
        e.preventDefault()
        if (!input.trim() || sending) return

        setSending(true)
        const body = input.trim()
        setInput('')

        // immediately stop typing indicator locally on send
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current)
        }
        setIsLocalTyping(false)
        if (recipientId) {
            send({
                type: 'typing',
                recipientId,
                isTyping: false,
            })
        }

        try {
            const res = await chatApi.post(`/chat/dm/${threadId}/message`, { body })
            setMessages(prev => [...prev, res.data.message])
        } catch {
            setInput(body)   // restore on failure
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="h-screen flex flex-col relative overflow-hidden">
            {/* Header */}
            <div className="glass-header flex-shrink-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/chat" className="text-gray-400 hover:text-primary transition-colors">
                            <ChevronLeft size={22} />
                        </Link>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                {recipientId ? (
                                    <UserProfileLink
                                        userId={recipientId}
                                        className="text-base font-display font-bold text-gray-900 tracking-tight hover:no-underline"
                                    >
                                        {recipientName}
                                    </UserProfileLink>
                                ) : (
                                    <h1 className="text-base font-display font-bold text-gray-900 tracking-tight">{recipientName}</h1>
                                )}
                                {recipientId && (
                                    <span 
                                        className={cn(
                                            "w-2 h-2 rounded-full",
                                            isOnline ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                                        )}
                                        title={isOnline ? "Online" : "Offline"}
                                    />
                                )}
                            </div>
                            {isRecipientTyping && (
                                <span className="text-[11px] text-primary animate-pulse font-normal leading-none mt-0.5">
                                    typing...
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto z-10 pb-6">
                <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
                    {messages.map(msg => {
                        const isMe = msg.senderId === user?.id
                        return (
                            <div
                                key={msg.id}
                                className={cn('flex w-full', isMe ? 'justify-end' : 'justify-start')}
                            >
                                <div
                                    className={cn(
                                        'max-w-[80%] px-4.5 py-3 rounded-2xl text-sm font-medium shadow-sm leading-relaxed',
                                        isMe
                                            ? 'bg-primary text-white rounded-br-none shadow-primary/10'
                                            : 'glass-panel bg-white/70 border border-gray-100 text-gray-900 rounded-bl-none'
                                    )}
                                >
                                    {msg.body}
                                </div>
                            </div>
                        )
                    })}
                    {isRecipientTyping && (
                        <div className="flex w-full justify-start animate-fade-in">
                            <div className="glass-panel bg-white/50 border border-gray-100 text-gray-500 rounded-2xl rounded-bl-none px-4 py-3 text-xs flex items-center gap-1 shadow-sm">
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* Input */}
            <div className="glass-header border-t-0 flex-shrink-0 z-30 pb-safe">
                <div className="max-w-lg mx-auto px-4 py-4">
                    <form onSubmit={sendMessage} className="flex gap-2.5">
                        <input
                            value={input}
                            onChange={handleInputChange}
                            className="flex-1 soft-input rounded-full px-5 py-3 text-sm"
                            placeholder="Type a message..."
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