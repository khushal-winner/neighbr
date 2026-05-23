'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { identityApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { syncSessionFromServer } from '@/lib/session'
import { MapPin, Navigation, Crown } from 'lucide-react'

export default function VerifyAddressPage() {
    const router = useRouter()
    const { updateUser } = useAuthStore()
    const [address, setAddress] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [founderData, setFounderData] = useState<{ isFounder: boolean, communityName: string } | null>(null)

    async function handleSuccess(res: any) {
        try {
            await syncSessionFromServer()
        } catch {
            updateUser({
                verificationLevel: res.data.user.verificationLevel,
                communityId: res.data.user.communityId ?? null,
                communityName: res.data.communityName ?? null,
            })
        }
        if (res.data.isFounder) {
            setFounderData({ isFounder: true, communityName: res.data.communityName })
        } else {
            router.push('/verify/postcard')
        }
    }

    async function handleVerifyLocation() {
        setError('')
        setLoading(true)

        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser')
            setLoading(false)
            return
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords
                
                try {
                    // Reverse geocode the location to get an address string for the backend
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
                    const geoData = await geoRes.json()

                    if (geoData.error) {
                        setError('Could not determine address from location')
                        setLoading(false)
                        return
                    }

                    // Submit the resolved address to our backend
                    const res = await identityApi.post('/verification/submit-address', { 
                        address: geoData.display_name 
                    })
                    
                    await handleSuccess(res)
                } catch (err: any) {
                    setError(err.response?.data?.error ?? 'Address verification failed')
                } finally {
                    setLoading(false)
                }
            },
            (err) => {
                setError('Unable to retrieve your location. Please ensure location services are enabled.')
                setLoading(false)
            }
        )
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await identityApi.post('/verification/submit-address', { address })
            await handleSuccess(res)
        } catch (err: any) {
            setError(err.response?.data?.error ?? 'Address verification failed')
        } finally {
            setLoading(false)
        }
    }

    if (founderData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm text-center">
                    <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100 shadow-sm">
                        <Crown className="text-amber-500" size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Congratulations!</h1>
                    <p className="text-gray-600 mb-6">
                        There wasn't a community in your area yet, so we created one. You are officially the founder of the <span className="font-semibold text-gray-900">{founderData.communityName}</span> community!
                    </p>
                    <button
                        onClick={() => router.push('/verify/postcard')}
                        className="w-full bg-blue-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        Continue setup
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <MapPin className="text-blue-600" size={24} />
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900">Verify your address</h1>
                    <p className="text-sm text-gray-500 mt-2">
                        To join your neighbourhood, we need to verify where you live.
                    </p>
                </div>

                <div className="space-y-6">
                    <button
                        onClick={handleVerifyLocation}
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                        <Navigation size={18} />
                        {loading ? 'Verifying...' : 'Use Current Location'}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">Or enter manually</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Home Address
                            </label>
                            <input
                                type="text"
                                value={address}
                                onChange={e => setAddress(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. 123 Main St, London"
                            />
                        </div>

                        {error && (
                            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !address}
                            className="w-full bg-gray-100 text-gray-900 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                        >
                            {loading ? 'Verifying...' : 'Submit Address'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}