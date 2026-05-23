'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Nav } from '@/components/Nav'
import { useAuthStore } from '@/store/auth'
import { ShieldCheck, Mail, MapPin, ChevronRight } from 'lucide-react'

export default function PostPage() {
    const { user } = useAuthStore()
    const router = useRouter()

    const isPostcardVerified = user?.verificationLevel === 'postcard_verified'

    useEffect(() => {
        if (isPostcardVerified) {
            router.replace('/post/new')
        }
    }, [isPostcardVerified, router])

    if (!user) return null

    if (isPostcardVerified) {
        return null
    }

    const needsAddress = user.verificationLevel === 'unverified'

    return (
        <div className="min-h-screen pb-24">
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4">
                    <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight">Create a Post</h1>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-8">
                <div className="glass-panel rounded-3xl p-8 text-center space-y-6 shadow-md">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15">
                        <ShieldCheck size={32} className="text-primary" />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-lg font-display font-bold text-gray-900">
                            Postcard verification required
                        </h2>
                        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
                            To keep your block safe, only postcard-verified neighbours can share posts with the community.
                        </p>
                    </div>

                    <div className="text-left space-y-3 pt-2">
                        <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                            needsAddress ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80'
                        }`}>
                            <MapPin size={18} className={needsAddress ? 'text-amber-700' : 'text-emerald-600'} />
                            <div className="flex-1">
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Address</p>
                                <p className="text-sm font-medium text-gray-800">
                                    {needsAddress ? 'Not verified yet' : 'Verified'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                            <Mail size={18} className="text-primary" />
                            <div className="flex-1">
                                <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Postcard code</p>
                                <p className="text-sm font-medium text-gray-800">Complete email verification</p>
                            </div>
                        </div>
                    </div>

                    <Link
                        href={needsAddress ? '/verify/address' : '/verify/postcard'}
                        className="inline-flex items-center justify-center gap-2 w-full bg-primary text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-primary-container transition-all active:scale-[0.98] shadow-md shadow-primary/15"
                    >
                        {needsAddress ? 'Verify your address' : 'Complete postcard verification'}
                        <ChevronRight size={18} />
                    </Link>
                </div>
            </div>

            <Nav />
        </div>
    )
}
