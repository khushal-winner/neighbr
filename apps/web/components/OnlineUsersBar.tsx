'use client'

import { UserProfileLink } from '@/components/UserProfileLink'

interface OnlineUser {
    id: string
    displayName: string
}

interface OnlineUsersBarProps {
    onlineUsers: OnlineUser[]
    onlineCount: number
}

export function OnlineUsersBar({ onlineUsers, onlineCount }: OnlineUsersBarProps) {
    if (onlineCount === 0) return null

    const shown = onlineUsers.slice(0, 4)
    const showOverflow = onlineCount > 4

    return (
        <div className="glass-panel rounded-2xl px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
                    {shown.map((u) => (
                        <div
                            key={u.id}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex-shrink-0"
                        >
                            <span className="relative flex h-2 w-2 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            <UserProfileLink
                                userId={u.id}
                                className="text-xs font-semibold text-gray-800 truncate max-w-[88px] inline-block hover:no-underline"
                            >
                                {u.displayName}
                            </UserProfileLink>
                        </div>
                    ))}
                </div>
                {showOverflow && (
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider whitespace-nowrap flex-shrink-0 px-2 py-1 bg-emerald-500/15 rounded-full border border-emerald-500/25">
                        5+ users online
                    </span>
                )}
            </div>
        </div>
    )
}
