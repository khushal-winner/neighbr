'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { identityApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { syncSessionFromServer } from '@/lib/session'
import { Mail, ShieldCheck } from 'lucide-react'

export default function VerifyPostcardPage() {
    const router = useRouter()
    const { updateUser } = useAuthStore()
    const [code, setCode] = useState('')
    const [requested, setRequested] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function requestPostcard() {
        setLoading(true)
        setError('')
        try {
            const res = await identityApi.post('/verification/request-postcard')
            setRequested(true)
            setMessage(res.data.message || 'Verification code sent!')
        } catch (err: any) {
            setError(err.response?.data?.error ?? 'Failed to send verification code')
        } finally {
            setLoading(false)
        }
    }

    async function confirmCode(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            await identityApi.post('/verification/confirm-postcard', { code })
            try {
                await syncSessionFromServer()
            } catch {
                updateUser({ verificationLevel: 'postcard_verified' })
            }
            router.push('/feed')
        } catch (err: any) {
            setError(err.response?.data?.error ?? 'Invalid code')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ShieldCheck className="text-green-600" size={24} />
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900">Email verification</h1>
                    <p className="text-sm text-gray-500 mt-2">
                        We&apos;ll send a 6-digit code to your email to confirm your identity
                    </p>
                </div>

                {!requested ? (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 text-center">
                            Click below to receive your verification code via email
                        </p>

                        {error && (
                            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                {error}
                            </p>
                        )}

                        <button
                            onClick={requestPostcard}
                            disabled={loading}
                            className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <Mail size={16} />
                            {loading ? 'Sending...' : 'Send verification code'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-center">
                            <p className="text-sm text-green-800 font-medium">{message}</p>
                            <p className="text-xs text-green-600 mt-1">Check your inbox and spam folder</p>
                        </div>

                        <form onSubmit={confirmCode} className="space-y-4">
                            <input
                                type="text"
                                value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-full border border-gray-300 rounded-lg px-3 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500"
                                placeholder="000000"
                                maxLength={6}
                                required
                            />

                            {error && (
                                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                    {error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={loading || code.length !== 6}
                                className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                                {loading ? 'Verifying...' : 'Confirm code'}
                            </button>
                        </form>

                        <button
                            onClick={requestPostcard}
                            disabled={loading}
                            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors py-1"
                        >
                            Didn&apos;t receive it? Send again
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
