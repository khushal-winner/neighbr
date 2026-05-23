'use client'

import { useState } from 'react'
import { BarChart3, Plus, X } from 'lucide-react'
import { communityApi } from '@/lib/api'
import type { BlockPoll } from '@/lib/polls'

interface CreatePollFormProps {
    onCreated: (poll: BlockPoll) => void
}

export function CreatePollForm({ onCreated }: CreatePollFormProps) {
    const [open, setOpen] = useState(false)
    const [question, setQuestion] = useState('')
    const [options, setOptions] = useState(['', ''])
    const [closesAt, setClosesAt] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState('')

    function reset() {
        setQuestion('')
        setOptions(['', ''])
        setClosesAt('')
        setError('')
    }

    function updateOption(index: number, value: string) {
        setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
    }

    function addOption() {
        if (options.length >= 6) return
        setOptions((prev) => [...prev, ''])
    }

    function removeOption(index: number) {
        if (options.length <= 2) return
        setOptions((prev) => prev.filter((_, i) => i !== index))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')

        const trimmedQuestion = question.trim()
        const trimmedOptions = options.map((o) => o.trim()).filter(Boolean)

        if (trimmedQuestion.length < 5) {
            setError('Question must be at least 5 characters')
            return
        }
        if (trimmedOptions.length < 2) {
            setError('Add at least 2 answer options')
            return
        }

        setSubmitting(true)
        try {
            const payload: {
                question: string
                options: string[]
                closesAt?: string
            } = {
                question: trimmedQuestion,
                options: trimmedOptions,
            }

            if (closesAt) {
                payload.closesAt = new Date(closesAt).toISOString()
            }

            const res = await communityApi.post('/polls', payload)
            onCreated(res.data.poll)
            reset()
            setOpen(false)
        } catch (err: unknown) {
            const message =
                (err as { response?: { data?: { error?: string } } })?.response?.data
                    ?.error ?? 'Could not create poll'
            setError(message)
        } finally {
            setSubmitting(false)
        }
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full glass-panel rounded-2xl px-5 py-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:border-primary/30 transition-all cursor-pointer"
            >
                <BarChart3 size={18} />
                Ask your block a question
            </button>
        )
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="glass-panel rounded-2xl p-5 space-y-4 shadow-sm border border-indigo-500/15"
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-800 uppercase tracking-wider">
                    <BarChart3 size={16} />
                    New block poll
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setOpen(false)
                        reset()
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Close"
                >
                    <X size={18} />
                </button>
            </div>

            <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full soft-input rounded-xl px-4 py-3 text-sm"
                placeholder="What should neighbours vote on?"
                required
                maxLength={300}
            />

            <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                    Options (2–6)
                </p>
                {options.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                        <input
                            value={opt}
                            onChange={(e) => updateOption(i, e.target.value)}
                            className="flex-1 soft-input rounded-xl px-4 py-2.5 text-sm"
                            placeholder={`Option ${i + 1}`}
                            maxLength={100}
                        />
                        {options.length > 2 && (
                            <button
                                type="button"
                                onClick={() => removeOption(i)}
                                className="p-2.5 text-gray-400 hover:text-rose-500 cursor-pointer"
                                aria-label="Remove option"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                ))}
                {options.length < 6 && (
                    <button
                        type="button"
                        onClick={addOption}
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer pl-1"
                    >
                        <Plus size={14} />
                        Add option
                    </button>
                )}
            </div>

            <div>
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider pl-1">
                    Closes (optional)
                </label>
                <input
                    type="datetime-local"
                    value={closesAt}
                    onChange={(e) => setClosesAt(e.target.value)}
                    className="w-full soft-input rounded-xl px-4 py-2.5 text-sm mt-1.5"
                />
            </div>

            {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}

            <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-white py-3 rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
            >
                {submitting ? 'Publishing…' : 'Publish poll'}
            </button>
        </form>
    )
}
