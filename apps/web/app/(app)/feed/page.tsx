'use client'

import { Suspense, useEffect, useState, useCallback } from 'react'
import { feedApi } from '@/lib/api'
import { syncSessionFromServer } from '@/lib/session'
import { PostCard } from '@/components/PostCard'
import { Nav } from '@/components/Nav'
import { useWebSocket } from '@/contexts/websocket'
import { Loader2, RefreshCw, X, Home, Leaf } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

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

function FeedLoading() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
    )
}

function FeedContent() {
    const [posts, setPosts] = useState<Post[]>([])
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [newPostCount, setNewPostCount] = useState(0)
    const { subscribe } = useWebSocket()
    const searchParams = useSearchParams()
    const [showSubmitted, setShowSubmitted] = useState(searchParams.get('submitted') === '1')
    const [feedError, setFeedError] = useState('')

    const fetchFeed = useCallback(async (cursor?: string) => {
        const params = cursor ? { cursor, limit: 20 } : { limit: 20 }
        const res = await feedApi.get('/feed', { params })
        return res.data
    }, [])

    useEffect(() => {
        async function load() {
            setFeedError('')
            try {
                await syncSessionFromServer()
            } catch {
                // use existing session
            }
            try {
                const data = await fetchFeed()
                setPosts(data.posts ?? [])
                setNextCursor(data.nextCursor ?? null)
            } catch (err: unknown) {
                const status = (err as { response?: { status?: number } })?.response?.status
                const message =
                    (err as { response?: { data?: { error?: string } } })?.response?.data
                        ?.error ??
                    (status === 500
                        ? 'Feed service error — check that the feed service is running.'
                        : 'Could not load your street feed')
                setFeedError(message)
                setPosts([])
                setNextCursor(null)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [fetchFeed])

    useEffect(() => {
        const unsub = subscribe('post_approved', () => {
            setNewPostCount((prev) => prev + 1)
        })
        return unsub
    }, [subscribe])

    async function loadMore() {
        if (!nextCursor || loadingMore) return
        setLoadingMore(true)
        try {
            const data = await fetchFeed(String(nextCursor))
            setPosts((prev) => [...prev, ...(data.posts ?? [])])
            setNextCursor(data.nextCursor ?? null)
        } catch {
            setFeedError('Could not load more posts')
        } finally {
            setLoadingMore(false)
        }
    }

    async function refresh() {
        setNewPostCount(0)
        setFeedError('')
        setLoading(true)
        try {
            const data = await fetchFeed()
            setPosts(data.posts ?? [])
            setNextCursor(data.nextCursor ?? null)
        } catch (err: unknown) {
            const message =
                (err as { response?: { data?: { error?: string } } })?.response?.data
                    ?.error ?? 'Could not load your street feed'
            setFeedError(message)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return <FeedLoading />
    }

    return (
        <div className="min-h-screen pb-24">
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        <Home size={20} className="text-primary" /> Your Street
                    </h1>
                    <button
                        type="button"
                        onClick={refresh}
                        className="p-2 text-500 hover:text-primary transition-colors active:scale-95 duration-200 cursor-pointer"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">
                {feedError && (
                    <div className="glass-panel rounded-2xl p-4 text-sm text-rose-700 bg-rose-500/10 border border-rose-500/20 space-y-2">
                        <p>{feedError}</p>
                        <button
                            type="button"
                            onClick={refresh}
                            className="text-sm font-semibold text-primary hover:underline cursor-pointer"
                        >
                            Try again
                        </button>
                    </div>
                )}

                {newPostCount > 0 && (
                    <button
                        type="button"
                        onClick={refresh}
                        className="w-full bg-primary text-white text-sm py-3 rounded-2xl font-semibold shadow-md shadow-primary/15 hover:bg-primary-container active:scale-[0.98] transition-all duration-200 cursor-pointer"
                    >
                        {newPostCount} new {newPostCount === 1 ? 'post' : 'posts'} — tap to refresh
                    </button>
                )}

                {!feedError && posts.length === 0 ? (
                    <div className="glass-panel text-center py-16 text-gray-400 rounded-3xl flex flex-col items-center justify-center">
                        <Leaf size={40} className="text-primary mb-4" />
                        <p className="text-base font-semibold text-gray-700">No posts yet on your block.</p>
                        <p className="text-sm mt-1">Be the first to share something!</p>
                    </div>
                ) : (
                    posts.map((post) => <PostCard key={post.id} post={post} />)
                )}

                {showSubmitted && (
                    <div className="glass-panel border-primary/20 bg-primary/5 rounded-2xl px-5 py-4 flex items-start justify-between shadow-sm">
                        <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-primary-container">Post submitted for review</p>
                            <p className="text-xs text-primary/80">
                                It&apos;ll appear here once approved — usually within a few seconds.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowSubmitted(false)}
                            className="text-primary hover:text-primary-container ml-4 flex-shrink-0 transition-colors cursor-pointer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {nextCursor && (
                    <button
                        type="button"
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="w-full glass-panel py-3.5 rounded-2xl text-sm font-semibold text-primary hover:bg-primary/5 flex items-center justify-center gap-2 transition-all active:scale-[0.98] duration-200 cursor-pointer"
                    >
                        {loadingMore ? (
                            <Loader2 size={16} className="animate-spin text-primary" />
                        ) : (
                            'Load older posts'
                        )}
                    </button>
                )}
            </div>

            <Nav />
        </div>
    )
}

export default function FeedPage() {
    return (
        <Suspense fallback={<FeedLoading />}>
            <FeedContent />
        </Suspense>
    )
}
