'use client'

import Link from 'next/link'
import { cn } from '@/lib/cn'

interface UserProfileLinkProps {
    userId: string
    children: React.ReactNode
    className?: string
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

export function UserProfileLink({ userId, children, className, onClick }: UserProfileLinkProps) {
    return (
        <Link
            href={`/user/${userId}`}
            className={cn(
                'hover:text-primary hover:underline underline-offset-2 transition-colors',
                className,
            )}
            onClick={onClick}
        >
            {children}
        </Link>
    )
}
