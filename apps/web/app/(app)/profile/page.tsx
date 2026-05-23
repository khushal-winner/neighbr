'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/auth'
import { identityApi, postApi, communityApi } from '@/lib/api'
import { clearAuth } from '@/lib/auth'
import { syncSessionFromServer } from '@/lib/session'
import { useRouter } from 'next/navigation'
import { Nav } from '@/components/Nav'
import { TrustScoreInfo } from '@/components/TrustScoreInfo'
import { LogOut, Edit2, Check, Camera, Loader2, MapPin } from 'lucide-react'

const TRUST_BAND_COLORS: Record<string, string> = {
    'New Resident': 'bg-rose-500/10 text-rose-700 border border-rose-500/10',
    'Resident': 'bg-amber-500/10 text-amber-700 border border-amber-500/10',
    'Trusted Neighbour': 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/10',
    'Community Pillar': 'bg-primary/15 text-primary border border-primary/20',
}

export default function ProfilePage() {
    const router = useRouter()
    const { user, updateUser, clearAuth: clearStore } = useAuthStore()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [communityName, setCommunityName] = useState<string | null>(user?.communityName ?? null)
    const [editing, setEditing] = useState(false)
    const [displayName, setDisplayName] = useState(user?.displayName ?? '')
    const [saving, setSaving] = useState(false)
    const [uploadingAvatar, setUploadingAvatar] = useState(false)

    useEffect(() => {
        identityApi.get('/auth/me')
            .then(async res => {
                const u = res.data.user
                let name = u.communityName ?? null

                if (u.communityId && !name) {
                    try {
                        const comm = await communityApi.get(`/communities/${u.communityId}`)
                        name = comm.data.community?.name ?? null
                    } catch {
                        // community service may be down — keep null, no fake label
                    }
                }

                updateUser({
                    trustScore: u.trustScore ?? 0,
                    trustBand: u.trustBand,
                    displayName: u.displayName,
                    avatarUrl: u.avatarUrl,
                    communityId: u.communityId,
                    communityName: name,
                })
                setCommunityName(name)
            })
            .catch(() => {})
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function saveDisplayName() {
        setSaving(true)
        try {
            const res = await identityApi.patch('/users/me', { displayName })
            updateUser({ displayName: res.data.user.displayName })
            setEditing(false)
        } catch {
            setDisplayName(user?.displayName ?? '')
        } finally {
            setSaving(false)
        }
    }

    async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 5 * 1024 * 1024) {
            alert('Image must be under 5MB')
            return
        }

        setUploadingAvatar(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const uploadRes = await postApi.post('/posts/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            })
            const res = await identityApi.patch('/users/me', {
                avatarUrl: uploadRes.data.url,
            })
            await syncSessionFromServer().catch(() => {
                updateUser({ avatarUrl: res.data.user.avatarUrl })
            })
        } catch {
            alert('Failed to update profile photo')
        } finally {
            setUploadingAvatar(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    async function logout() {
        try {
            await identityApi.post('/auth/logout')
        } finally {
            clearAuth()
            clearStore()
            router.push('/login')
        }
    }

    if (!user) return null

    const bandColor = TRUST_BAND_COLORS[user.trustBand] ?? TRUST_BAND_COLORS['New Resident']
    const trustScore = user.trustScore ?? 0

    return (
        <div className="min-h-screen pb-24">
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4">
                    <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight">Profile</h1>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
                <div className="glass-panel rounded-3xl p-6 text-center shadow-sm">
                    <div className="relative w-24 h-24 mx-auto mb-4">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadingAvatar}
                            className="w-24 h-24 rounded-3xl overflow-hidden bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-display font-bold text-3xl shadow-sm cursor-pointer group relative"
                        >
                            {user.avatarUrl ? (
                                <img
                                    src={user.avatarUrl}
                                    alt={user.displayName}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span>{user.displayName.charAt(0).toUpperCase()}</span>
                            )}
                            <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                {uploadingAvatar ? (
                                    <Loader2 size={24} className="text-white animate-spin" />
                                ) : (
                                    <Camera size={22} className="text-white" />
                                )}
                            </span>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleAvatarChange}
                        />
                    </div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                        Tap photo to change
                    </p>

                    {editing ? (
                        <div className="flex items-center gap-2 justify-center">
                            <input
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                className="soft-input rounded-xl px-4 py-2 text-sm max-w-[200px]"
                                autoFocus
                            />
                            <button
                                onClick={saveDisplayName}
                                disabled={saving}
                                className="p-2 bg-primary text-white rounded-xl active:scale-95 transition-all shadow-md shadow-primary/10 cursor-pointer"
                            >
                                <Check size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 justify-center">
                            <h2 className="text-xl font-display font-bold text-gray-900 leading-snug">
                                {user.displayName}
                            </h2>
                            <button
                                onClick={() => setEditing(true)}
                                className="p-1.5 text-gray-400 hover:text-primary transition-colors hover:bg-primary/5 rounded-lg active:scale-95"
                            >
                                <Edit2 size={13} />
                            </button>
                        </div>
                    )}

                    <span className={`inline-block mt-3 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${bandColor}`}>
                        {user.trustBand}
                    </span>
                </div>

                <div className="glass-panel rounded-3xl p-5 space-y-4 shadow-sm">
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider flex items-center gap-1">
                            Trust Score
                            <TrustScoreInfo />
                        </span>
                        <span className="font-bold text-primary">{trustScore} pts</span>
                    </div>
                    <div className="w-full h-px bg-gray-100/50" />
                    <div className="flex justify-between items-center text-sm gap-3">
                        <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider flex items-center gap-1">
                            <MapPin size={12} />
                            Community
                        </span>
                        <span className="font-semibold text-gray-900 text-sm text-right">
                            {communityName ?? (user.communityId ? 'Loading…' : 'Not assigned yet')}
                        </span>
                    </div>
                    <div className="w-full h-px bg-gray-100/50" />
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider">Verification</span>
                        <span className="font-semibold text-gray-900 capitalize text-sm bg-gray-100 px-2.5 py-0.5 rounded-lg">
                            {user.verificationLevel.replace(/_/g, ' ')}
                        </span>
                    </div>
                    <div className="w-full h-px bg-gray-100/50" />
                    <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-gray-500 uppercase text-[10px] tracking-wider">Email</span>
                        <span className="font-medium text-gray-800 text-sm truncate max-w-[180px]">{user.email}</span>
                    </div>
                </div>

                <button
                    onClick={logout}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-semibold text-rose-600 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-sm shadow-rose-500/5"
                >
                    <LogOut size={16} />
                    Sign Out
                </button>
            </div>

            <Nav />
        </div>
    )
}
