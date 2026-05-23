'use client'

import { useState, useRef, useEffect } from 'react'
import { Info } from 'lucide-react'

const TIPS = [
    'Complete postcard verification (+50 pts)',
    'Post content that passes moderation (+30 pts)',
    'Receive upvotes on your posts (+5 pts each)',
    'Vote in block polls (+15 pts)',
    'Avoid posts that get flagged or removed (penalties apply)',
]

export function TrustScoreInfo() {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function onClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onClickOutside)
        return () => document.removeEventListener('mousedown', onClickOutside)
    }, [open])

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="p-1 rounded-full text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                aria-label="How to increase trust score"
            >
                <Info size={16} />
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-2 z-50 w-64 glass-panel rounded-2xl p-4 shadow-lg border border-primary/10 text-left">
                    <p className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                        Increase your trust score
                    </p>
                    <ul className="space-y-2">
                        {TIPS.map(tip => (
                            <li key={tip} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                                <span className="text-primary font-bold">•</span>
                                {tip}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    )
}
