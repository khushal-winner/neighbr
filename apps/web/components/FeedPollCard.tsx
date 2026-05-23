'use client'

import { useEffect, useState } from 'react'
import { communityApi } from '@/lib/api'
import { BlockPollCard } from '@/components/BlockPollCard'
import type { BlockPoll } from '@/lib/polls'

interface FeedPollCardProps {
    pollId: string
}

export function FeedPollCard({ pollId }: FeedPollCardProps) {
    const [poll, setPoll] = useState<BlockPoll | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        setError('')

        communityApi
            .get(`/polls/${pollId}`)
            .then((res) => {
                if (!cancelled) setPoll(res.data.poll)
            })
            .catch(() => {
                if (!cancelled) setError('Could not load poll')
            })

        return () => {
            cancelled = true
        }
    }, [pollId])

    if (error) {
        return <p className="text-xs text-rose-600">{error}</p>
    }

    if (!poll) {
        return (
            <div className="space-y-2 animate-pulse">
                <div className="h-4 bg-gray-200/50 rounded w-3/4" />
                <div className="h-10 bg-gray-200/40 rounded-xl" />
                <div className="h-10 bg-gray-200/40 rounded-xl" />
            </div>
        )
    }

    return <BlockPollCard poll={poll} onUpdated={setPoll} />
}
