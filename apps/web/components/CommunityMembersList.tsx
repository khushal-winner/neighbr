'use client'

import Link from 'next/link'
import { MessageSquare } from 'lucide-react'
import { UserProfileLink } from '@/components/UserProfileLink'

export interface CommunityMember {
    id: string
    displayName: string
    online: boolean
    avatarUrl?: string | null
}

interface CommunityMembersListProps {
    members: CommunityMember[]
    currentUserId?: string
    onStartDm?: (userId: string) => void
}

export function CommunityMembersList({
    members,
    currentUserId,
    onStartDm,
}: CommunityMembersListProps) {
    const others = members.filter((m) => m.id !== currentUserId)

    if (others.length === 0) {
        return (
            <p className="text-sm text-gray-500 text-center py-6">
                No neighbours on your block yet.
            </p>
        )
    }

    return (
        <div className="space-y-2">
            {others.map((member) => (
                <div
                    key={member.id}
                    className="glass-panel rounded-2xl flex items-center gap-4 px-5 py-3.5 shadow-sm"
                >
                    <div className="relative flex-shrink-0">
                        <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/10 font-display font-bold text-primary text-sm overflow-hidden">
                            {member.avatarUrl ? (
                                <img
                                    src={member.avatarUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                member.displayName.charAt(0).toUpperCase()
                            )}
                        </div>
                        <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                                member.online ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                        />
                    </div>
                    <div className="flex-1 min-w-0">
                        <UserProfileLink
                            userId={member.id}
                            className="text-sm font-semibold text-gray-900 font-display truncate block hover:no-underline hover:text-primary"
                        >
                            {member.displayName}
                        </UserProfileLink>
                        <div className={`text-xs mt-0.5 ${member.online ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {member.online ? 'Online' : 'Offline'}
                        </div>
                    </div>
                    {onStartDm ? (
                        <button
                            type="button"
                            onClick={() => onStartDm(member.id)}
                            className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                            aria-label={`Message ${member.displayName}`}
                        >
                            <MessageSquare size={18} />
                        </button>
                    ) : (
                        <Link
                            href={`/chat/new?recipientId=${member.id}`}
                            className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            aria-label={`Message ${member.displayName}`}
                        >
                            <MessageSquare size={18} />
                        </Link>
                    )}
                </div>
            ))}
        </div>
    )
}
