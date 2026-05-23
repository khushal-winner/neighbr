'use client'

import { useState } from 'react'
import {
    ThumbsUp,
    Flag,
    Clock,
    MessageCircle,
    AlertTriangle,
    ShoppingBag,
    Search,
    BarChart3,
    Calendar,
    Landmark,
    ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { postApi } from '@/lib/api'
import Link from 'next/link'
import { FeedPollCard } from '@/components/FeedPollCard'

interface Post {
    id: string
    title: string
    body: string
    type: string
    pollId?: string | null
    upvotes: number
    imageUrls: string[]
    createdAt: string
    author: {
        id: string
        displayName: string
        trustBand: string
        verificationLevel: string
    }
}

const typeConfig: Record<string, { label: string; color: string; icon: typeof MessageCircle }> = {
    community: { label: 'Community', color: 'bg-primary/10 text-primary-container', icon: MessageCircle },
    emergency: { label: 'Emergency', color: 'bg-red-500/10 text-red-600', icon: AlertTriangle },
    classified: { label: 'Classified', color: 'bg-amber-500/10 text-amber-700', icon: ShoppingBag },
    lost_found: { label: 'Lost & Found', color: 'bg-purple-500/10 text-purple-700', icon: Search },
    poll: { label: 'Block Poll', color: 'bg-indigo-500/10 text-indigo-700', icon: BarChart3 },
    event: { label: 'Event', color: 'bg-emerald-500/10 text-emerald-700', icon: Calendar },
    planning_notice: { label: 'Council Notice', color: 'bg-gray-500/10 text-gray-700', icon: Landmark },
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}

interface PostCardProps {
    post: Post
    /** feed = preview only; detail = full post with poll voting on /post/[id] */
    variant?: 'feed' | 'detail'
}

export function PostCard({ post, variant = 'feed' }: PostCardProps) {
    const [upvotes, setUpvotes] = useState(post.upvotes)
    const [upvoted, setUpvoted] = useState(false)
    const [flagged, setFlagged] = useState(false)
    const type = typeConfig[post.type] ?? typeConfig.community
    const IconComponent = type.icon
    const isPoll = post.type === 'poll' && !!post.pollId
    const isFeedPoll = isPoll && variant === 'feed'

    async function handleUpvote() {
        if (upvoted) return
        setUpvoted(true)
        setUpvotes((prev) => prev + 1)
        try {
            await postApi.post(`/posts/${post.id}/upvote`)
        } catch (err: unknown) {
            if ((err as { response?: { status?: number } })?.response?.status !== 409) {
                setUpvoted(false)
                setUpvotes((prev) => prev - 1)
            }
        }
    }

    async function handleFlag() {
        if (flagged) return
        setFlagged(true)
        try {
            await postApi.post(`/posts/${post.id}/flag`)
        } catch (err: unknown) {
            if ((err as { response?: { status?: number } })?.response?.status !== 409) {
                setFlagged(false)
            }
        }
    }

    const isHighTrust =
        post.author.trustBand === 'HIGH' ||
        post.author.trustBand === 'VERIFIED' ||
        post.author.trustBand === 'Trusted Neighbour' ||
        post.author.trustBand === 'Community Pillar'
    const isMediumTrust =
        post.author.trustBand === 'MEDIUM' || post.author.trustBand === 'Resident'

    const card = (
        <div
            className={cn(
                'glass-panel rounded-2xl p-5 space-y-4 transition-all duration-300',
                variant === 'feed' && 'hover:shadow-md hover:translate-y-[-2px]',
                post.type === 'emergency' && 'border-red-500/20 bg-red-500/5',
                isFeedPoll && 'border-indigo-500/20 bg-indigo-500/[0.03]',
            )}
        >
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                    <span
                        className={cn(
                            'text-xs px-2.5 py-1 rounded-full font-medium tracking-wide flex items-center gap-1.5',
                            type.color,
                        )}
                    >
                        <IconComponent size={14} />
                        {type.label}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                    <Clock size={12} />
                    {timeAgo(post.createdAt)}
                </div>
            </div>

            {isPoll && variant === 'detail' ? (
                <div className="space-y-4">
                    <h3 className="font-display font-semibold text-gray-900 text-base leading-snug">
                        {post.title}
                    </h3>
                    <FeedPollCard pollId={post.pollId!} />
                </div>
            ) : isFeedPoll ? (
                <div className="space-y-2">
                    <h3 className="font-display font-semibold text-gray-900 text-base leading-snug">
                        {post.title}
                    </h3>
                    <p className="text-sm text-indigo-700/90 font-medium flex items-center gap-1">
                        Tap to view options and vote
                        <ChevronRight size={16} />
                    </p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    <h3 className="font-display font-semibold text-gray-900 text-base leading-snug">
                        {post.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 font-sans">
                        {post.body}
                    </p>
                </div>
            )}

            {post.imageUrls.length > 0 && (
                <div
                    className={cn(
                        'grid gap-2 rounded-xl overflow-hidden mt-2',
                        post.imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
                    )}
                >
                    {post.imageUrls.slice(0, 4).map((url, i) => (
                        <img
                            key={i}
                            src={url}
                            alt=""
                            className={cn(
                                'w-full object-cover transition-transform duration-300 hover:scale-105 rounded-xl',
                                post.imageUrls.length === 1 ? 'h-64' : 'h-32',
                            )}
                        />
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-100/50">
                <div className="flex items-center gap-2">
                    <Link
                        href={`/user/${post.author.id}`}
                        className="text-xs font-semibold text-primary hover:text-primary-container transition-colors"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {post.author.displayName}
                    </Link>
                    <span className="text-xs text-gray-300">·</span>
                    <span
                        className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider',
                            isHighTrust && 'bg-emerald-500/10 text-emerald-700',
                            isMediumTrust && 'bg-amber-500/10 text-amber-700',
                            !isHighTrust && !isMediumTrust && 'bg-rose-500/10 text-rose-700',
                        )}
                    >
                        {post.author.trustBand}
                    </span>
                </div>

                {!isPoll && (
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleUpvote}
                            disabled={upvoted}
                            className={cn(
                                'flex items-center gap-1.5 text-xs font-medium transition-all duration-200',
                                upvoted
                                    ? 'text-primary scale-110 cursor-default'
                                    : 'text-gray-400 hover:text-primary hover:scale-105',
                            )}
                        >
                            <ThumbsUp size={14} fill={upvoted ? 'currentColor' : 'none'} />
                            <span>{upvotes}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleFlag}
                            disabled={flagged}
                            className={cn(
                                'flex items-center gap-1.5 text-xs transition-all duration-200',
                                flagged
                                    ? 'text-rose-500 cursor-default scale-110'
                                    : 'text-gray-400 hover:text-red-500 hover:scale-105',
                            )}
                            title={flagged ? 'Already flagged' : 'Flag this post'}
                        >
                            <Flag size={14} fill={flagged ? 'currentColor' : 'none'} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    )

    if (isFeedPoll) {
        return (
            <Link href={`/post/${post.id}`} className="block">
                {card}
            </Link>
        )
    }

    return card
}
