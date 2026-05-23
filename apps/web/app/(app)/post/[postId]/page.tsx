'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { feedApi } from '@/lib/api'
import { PostCard } from '@/components/PostCard'
import { Nav } from '@/components/Nav'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { syncSessionFromServer } from '@/lib/session'

interface FeedPost {
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

export default function PostDetailPage() {
    const { postId } = useParams() as { postId: string }
    const router = useRouter()
    const [post, setPost] = useState<FeedPost | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false

        async function load() {
            setError('')
            try {
                await syncSessionFromServer()
            } catch {
                // continue
            }

            try {
                const res = await feedApi.get(`/feed/post/${postId}`)
                if (!cancelled) setPost(res.data.post)
            } catch (err: unknown) {
                if (!cancelled) {
                    const status = (err as { response?: { status?: number } })?.response
                        ?.status
                    setError(
                        status === 404
                            ? 'This post was not found or is not available yet.'
                            : 'Could not load this post.',
                    )
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        load()
        return () => {
            cancelled = true
        }
    }, [postId])

    return (
        <div className="min-h-screen pb-24">
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="text-gray-400 hover:text-primary transition-colors cursor-pointer"
                        aria-label="Go back"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <h1 className="text-lg font-display font-bold text-gray-900 tracking-tight">
                        Post
                    </h1>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-5">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : error ? (
                    <div className="glass-panel rounded-2xl p-6 text-center space-y-4">
                        <p className="text-sm text-rose-600">{error}</p>
                        <Link
                            href="/feed"
                            className="text-sm font-semibold text-primary hover:underline"
                        >
                            Back to your street
                        </Link>
                    </div>
                ) : post ? (
                    <PostCard post={post} variant="detail" />
                ) : null}
            </div>

            <Nav />
        </div>
    )
}
