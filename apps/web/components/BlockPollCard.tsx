'use client'

import { useState } from 'react'
import { BarChart3, Check, Lock } from 'lucide-react'
import { communityApi } from '@/lib/api'
import type { BlockPoll } from '@/lib/polls'
import { cn } from '@/lib/cn'

interface BlockPollCardProps {
    poll: BlockPoll
    onUpdated: (poll: BlockPoll) => void
}

export function BlockPollCard({ poll, onUpdated }: BlockPollCardProps) {
    const [votingOptionId, setVotingOptionId] = useState<string | null>(null)
    const [error, setError] = useState('')

    const canVote = !poll.isClosed && !poll.hasVoted
    const showResults = poll.hasVoted || poll.isClosed || poll.totalVotes > 0

    async function vote(optionId: string) {
        if (!canVote || votingOptionId) return

        setError('')
        setVotingOptionId(optionId)

        try {
            const res = await communityApi.post(`/polls/${poll.id}/vote`, { optionId })
            if (res.data.poll) {
                onUpdated(res.data.poll)
            } else {
                const refreshed = await communityApi.get(`/polls/${poll.id}`)
                onUpdated(refreshed.data.poll)
            }
        } catch (err: unknown) {
            const message =
                (err as { response?: { data?: { error?: string } } })?.response?.data
                    ?.error ?? 'Vote failed'
            setError(message)
        } finally {
            setVotingOptionId(null)
        }
    }

    const closesLabel = poll.closesAt
        ? new Date(poll.closesAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
          })
        : null

    return (
        <div className="glass-panel rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <BarChart3 size={16} className="text-indigo-600" />
                    </div>
                    <p className="font-semibold text-gray-900 text-sm leading-snug">
                        {poll.question}
                    </p>
                </div>
                {poll.isClosed && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-1 rounded-full flex-shrink-0">
                        <Lock size={10} />
                        Closed
                    </span>
                )}
            </div>

            <div className="space-y-2">
                {poll.options.map((opt) => {
                    const isSelected = poll.myVoteOptionId === opt.id
                    const isVoting = votingOptionId === opt.id

                    return (
                        <button
                            key={opt.id}
                            type="button"
                            disabled={!canVote || !!votingOptionId}
                            onClick={() => vote(opt.id)}
                            className={cn(
                                'w-full text-left rounded-xl text-sm transition-all duration-200 overflow-hidden relative',
                                canVote
                                    ? 'border border-gray-100 hover:border-primary/30 hover:bg-primary/5 bg-white/50 px-4 py-3 cursor-pointer active:scale-[0.99] shadow-sm'
                                    : 'border border-gray-100/80 bg-white/30 px-4 py-3 cursor-default',
                                isSelected && 'border-primary/40 bg-primary/5 ring-1 ring-primary/20',
                                isVoting && 'opacity-70',
                            )}
                        >
                            {showResults && (
                                <div
                                    className={cn(
                                        'absolute inset-y-0 left-0 transition-all duration-500',
                                        isSelected ? 'bg-primary/15' : 'bg-gray-100/80',
                                    )}
                                    style={{ width: `${opt.percentage}%` }}
                                />
                            )}
                            <div className="relative flex justify-between items-center gap-3 font-medium">
                                <span className="flex items-center gap-2 text-gray-800 min-w-0">
                                    {isSelected && (
                                        <Check size={14} className="text-primary flex-shrink-0" />
                                    )}
                                    <span className="truncate">{opt.text}</span>
                                </span>
                                {showResults && (
                                    <span className="text-xs font-bold text-primary flex-shrink-0 tabular-nums">
                                        {opt.percentage}%
                                    </span>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider pl-1">
                <span>
                    {poll.totalVotes} vote{poll.totalVotes === 1 ? '' : 's'}
                </span>
                {poll.hasVoted && !poll.isClosed && (
                    <span className="text-primary normal-case tracking-normal text-xs">
                        You voted — thanks for participating
                    </span>
                )}
                {closesLabel && !poll.isClosed && (
                    <span className="normal-case tracking-normal">
                        Closes {closesLabel}
                    </span>
                )}
            </div>

            {error && (
                <p className="text-xs text-rose-600 font-medium">{error}</p>
            )}
        </div>
    )
}
