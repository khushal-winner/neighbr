'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { identityApi } from '@/lib/api'
import { Nav } from '@/components/Nav'
import { TrustScoreInfo } from '@/components/TrustScoreInfo'
import { ArrowLeft, MessageSquare, Shield, Calendar, Award, MapPin } from 'lucide-react'

interface TargetUser {
    id: string
    displayName: string
    avatarUrl?: string | null
    verificationLevel: string
    communityId: string | null
    communityName?: string | null
    trustScore: number
    trustBand: string
    createdAt: string
}

const TRUST_BAND_COLORS: Record<string, string> = {
    'New Resident': 'bg-rose-500/10 text-rose-700 border border-rose-500/10 dark:text-rose-400 dark:bg-rose-500/20 dark:border-rose-500/25',
    'Resident': 'bg-amber-500/10 text-amber-700 border border-amber-500/10 dark:text-amber-400 dark:bg-amber-500/20 dark:border-amber-500/25',
    'Trusted Neighbour': 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/20 dark:border-emerald-500/25',
    'Community Pillar': 'bg-primary/15 text-primary border border-primary/20 dark:bg-primary/25 dark:text-primary-foreground',
}

const VERIFICATION_COLORS: Record<string, string> = {
    'unverified': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    'email_verified': 'bg-blue-500/10 text-blue-700 border border-blue-500/10 dark:text-blue-400 dark:bg-blue-500/20',
    'address_verified': 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/10 dark:text-emerald-400 dark:bg-emerald-500/20',
    'postcard_verified': 'bg-purple-500/10 text-purple-700 border border-purple-500/10 dark:text-purple-400 dark:bg-purple-500/20',
}

export default function PublicProfilePage() {
    const { userId } = useParams() as { userId: string }
    const router = useRouter()
    const currentUser = useAuthStore(state => state.user)

    const [targetUser, setTargetUser] = useState<TargetUser | null>(null)
    const [isOnline, setIsOnline] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!userId) return

        async function fetchProfileAndPresence() {
            try {
                const profilePromise = identityApi.get(`/users/${userId}/profile`)
                const onlinePromise = identityApi.get(`/users/${userId}/online`).catch(() => ({ data: { online: false } }))

                const [profileRes, onlineRes] = await Promise.all([profilePromise, onlinePromise])

                setTargetUser(profileRes.data.user)
                setIsOnline(onlineRes.data.online)
            } catch (err: any) {
                console.error("[Profile] Error loading user profile:", err)
                setError(err.response?.data?.error || "Failed to load user profile")
            } finally {
                setLoading(false)
            }
        }

        fetchProfileAndPresence()

        // Poll presence status every 15 seconds to keep it fresh
        const interval = setInterval(async () => {
            try {
                const onlineRes = await identityApi.get(`/users/${userId}/online`)
                setIsOnline(onlineRes.data.online)
            } catch {
                // Ignore presence check errors during polling
            }
        }, 15000)

        return () => clearInterval(interval)
    }, [userId])

    if (loading) {
        return (
            <div className="min-h-screen pb-24 flex flex-col justify-between">
                <div className="glass-header sticky top-0 z-30">
                    <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
                        <button onClick={() => router.back()} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg active:scale-95 transition-all">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="h-6 w-32 bg-gray-200 animate-pulse rounded" />
                    </div>
                </div>
                <div className="max-w-lg mx-auto w-full px-4 pt-6 space-y-4 flex-1">
                    <div className="glass-panel rounded-3xl p-6 text-center space-y-4 shadow-sm">
                        <div className="w-20 h-20 bg-gray-200 animate-pulse rounded-3xl mx-auto" />
                        <div className="h-6 w-48 bg-gray-200 animate-pulse rounded mx-auto" />
                        <div className="h-4 w-24 bg-gray-200 animate-pulse rounded mx-auto" />
                    </div>
                    <div className="glass-panel rounded-3xl p-5 space-y-4 shadow-sm">
                        <div className="h-8 w-full bg-gray-100 animate-pulse rounded" />
                        <div className="h-8 w-full bg-gray-100 animate-pulse rounded" />
                    </div>
                </div>
                <Nav />
            </div>
        )
    }

    if (error || !targetUser) {
        return (
            <div className="min-h-screen pb-24">
                <div className="glass-header sticky top-0 z-30">
                    <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
                        <button onClick={() => router.back()} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg active:scale-95 transition-all">
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight">Error</h1>
                    </div>
                </div>
                <div className="max-w-lg mx-auto px-4 pt-12 text-center space-y-4">
                    <ShieldAlert size={48} className="mx-auto text-rose-500" />
                    <h2 className="text-lg font-display font-bold text-gray-900">User Profile Unavailable</h2>
                    <p className="text-sm text-gray-500 max-w-sm mx-auto">{error || "The user you are looking for could not be found."}</p>
                </div>
                <Nav />
            </div>
        )
    }

    const bandColor = TRUST_BAND_COLORS[targetUser.trustBand] ?? TRUST_BAND_COLORS['New Resident']
    const isMe = currentUser?.id === targetUser.id
    const formattedDate = new Date(targetUser.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
    })

    return (
        <div className="min-h-screen pb-24">
            {/* Header */}
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
                    <button onClick={() => router.back()} className="p-1.5 text-gray-500 hover:text-gray-900 rounded-lg active:scale-95 transition-all">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight">
                        {targetUser.displayName}'s Profile
                    </h1>
                </div>
            </div>

            {/* Profile Info */}
            <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
                {/* Main Card */}
                <div className="glass-panel rounded-3xl p-6 text-center shadow-sm relative overflow-hidden">
                    {/* Pulsing online indicator */}
                    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/60 dark:bg-black/25 px-2.5 py-1 rounded-full border border-gray-100 shadow-sm text-[11px] font-medium text-gray-600">
                        <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                        {isOnline ? 'Online' : 'Offline'}
                    </div>

                    <div className="w-20 h-20 bg-primary/10 text-primary border border-primary/20 rounded-3xl flex items-center justify-center mx-auto mb-4 font-display font-bold text-3xl shadow-sm overflow-hidden">
                        {targetUser.avatarUrl ? (
                            <img
                                src={targetUser.avatarUrl}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span>{targetUser.displayName.charAt(0).toUpperCase()}</span>
                        )}
                    </div>

                    <h2 className="text-xl font-display font-bold text-gray-900 leading-snug">
                        {targetUser.displayName}
                    </h2>

                    <div className="flex justify-center gap-2 mt-3">
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${bandColor}`}>
                            {targetUser.trustBand}
                        </span>
                    </div>
                </div>

                {/* Details Section */}
                <div className="glass-panel rounded-3xl p-5 space-y-4 shadow-sm">
                    {/* Trust Score */}
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                            <Award size={14} className="text-gray-400" />
                            Trust Score
                            <TrustScoreInfo />
                        </span>
                        <span className="font-bold text-primary">{targetUser.trustScore ?? 0} pts</span>
                    </div>
                    <div className="w-full h-px bg-gray-100/50" />

                    {targetUser.communityName && (
                        <>
                            <div className="flex justify-between items-center text-sm gap-3">
                                <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                                    <MapPin size={14} className="text-gray-400" />
                                    Community
                                </span>
                                <span className="font-semibold text-gray-900 text-sm text-right">
                                    {targetUser.communityName}
                                </span>
                            </div>
                            <div className="w-full h-px bg-gray-100/50" />
                        </>
                    )}

                    {/* Verification Status */}
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                            <Shield size={14} className="text-gray-400" />
                            Verification
                        </span>
                        <span className={`font-semibold capitalize text-xs px-2.5 py-0.5 rounded-lg ${VERIFICATION_COLORS[targetUser.verificationLevel] || 'bg-gray-100 text-gray-700'}`}>
                            {targetUser.verificationLevel.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="w-full h-px bg-gray-100/50" />

                    {/* Member Since */}
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                            <Calendar size={14} className="text-gray-400" />
                            Member Since
                        </span>
                        <span className="font-medium text-gray-800">{formattedDate}</span>
                    </div>
                </div>

                {/* Chat/Action Button */}
                {isMe ? (
                    <button
                        onClick={() => router.push('/profile')}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/10 active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-sm shadow-primary/5"
                    >
                        Edit My Profile
                    </button>
                ) : (
                    <button
                        onClick={() => router.push(`/chat/new?recipientId=${targetUser.id}`)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/95 active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-md shadow-primary/10"
                    >
                        <MessageSquare size={16} />
                        Send Message
                    </button>
                )}
            </div>

            <Nav />
        </div>
    )
}
