'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { Home, MessageSquare, PlusSquare, User, Users } from 'lucide-react'
import { cn } from '@/lib/cn'

const navItems = [
    { href: '/feed', icon: Home, label: 'Feed' },
    { href: '/chat', icon: MessageSquare, label: 'Chat' },
    { href: '/post', icon: PlusSquare, label: 'Post' },
    { href: '/community', icon: Users, label: 'Block' },
    { href: '/profile', icon: User, label: 'Profile' },
]

export function Nav() {
    const pathname = usePathname()
    const { user } = useAuthStore()

    if (!user) return null

    return (
        <nav className="fixed bottom-0 left-0 right-0 glass-nav z-40">
            <div className="max-w-lg mx-auto flex justify-around">
                {navItems.map(({ href, icon: Icon, label }) => {
                    const active = pathname.startsWith(href)
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                'flex-1 flex flex-col items-center py-2.5 text-[10px] font-medium transition-all duration-200',
                                active ? 'text-primary scale-105 font-semibold' : 'text-gray-400 hover:text-primary/70 hover:scale-102'
                            )}
                        >
                            <Icon size={20} strokeWidth={active ? 2.5 : 1.75} className="transition-transform duration-200" />
                            <span className="mt-1 tracking-wide">{label}</span>
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}