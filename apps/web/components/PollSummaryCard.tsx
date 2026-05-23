'use client'

import Link from 'next/link'
import { BarChart3, ChevronRight, Lock } from 'lucide-react'
import type { BlockPoll } from '@/lib/polls'

interface PollSummaryCardProps {
    poll: BlockPoll
    feedPostId?: string | null
}

/** Community page — question + stats only; vote on /post/[id] */
export function PollSummaryCard({ poll, feedPostId }: PollSummaryCardProps) {
    const href = feedPostId ? `/post/${feedPostId}` : null

    const inner = (
        <>
            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center flex-shrink-0">
                    <BarChart3 size={18} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm leading-snug">
                        {poll.question}
                    </p>
                    <p className="text-xs text-gray-500 mt-1.5">
                        {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
                        {poll.isClosed && (
                            <span className="inline-flex items-center gap-1 ml-2 text-gray-400">
                                <Lock size={10} />
                                Closed
                            </span>
                        )}
                    </p>
                </div>
                {href && (
                    <ChevronRight size={18} className="text-gray-400 flex-shrink-0 mt-1" />
                )}
            </div>
            {href && (
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider mt-3 pl-1">
                    View &amp; vote on feed
                </p>
            )}
        </>
    )

    if (!href) {
        return (
            <div className="glass-panel rounded-2xl p-4 shadow-sm opacity-80">
                {inner}
            </div>
        )
    }

    return (
        <Link
            href={href}
            className="glass-panel rounded-2xl p-4 shadow-sm hover:border-primary/30 transition-all block"
        >
            {inner}
        </Link>
    )
}
