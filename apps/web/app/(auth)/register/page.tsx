'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { identityApi } from '@/lib/api'
import { AuthShell } from '@/components/AuthShell'
import { AuthFormCard } from '@/components/auth/AuthFormCard'
import { UserPlus, User, Mail, Lock, Loader2, Play, X } from 'lucide-react'

export default function RegisterPage() {
    const router = useRouter()
    const [form, setForm] = useState({
        email: '',
        password: '',
        displayName: '',
    })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showDemo, setShowDemo] = useState(false)

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            await identityApi.post('/auth/register', form)
            router.push('/login?registered=1')
        } catch (err: any) {
            setError(err.response?.data?.error ?? 'Registration failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthShell variant="register">
            <AuthFormCard
                title="Join your street"
                subtitle="Create your verified neighbourhood profile"
                icon={<UserPlus size={28} strokeWidth={1.75} />}
                footer={
                    <p className="text-center text-sm text-gray-500 font-sans">
                        Already have an account?{' '}
                        <Link
                            href="/login"
                            className="font-semibold text-primary hover:text-primary-container transition-colors"
                        >
                            Sign in
                        </Link>
                    </p>
                }
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider pl-1">
                            Display name
                        </label>
                        <div className="auth-input-wrap">
                            <User size={18} />
                            <input
                                type="text"
                                name="displayName"
                                value={form.displayName}
                                onChange={handleChange}
                                className="auth-input"
                                placeholder="How neighbours see you"
                                required
                                autoComplete="nickname"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider pl-1">
                            Email
                        </label>
                        <div className="auth-input-wrap">
                            <Mail size={18} />
                            <input
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                className="auth-input"
                                placeholder="you@example.com"
                                required
                                autoComplete="email"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider pl-1">
                            Password
                        </label>
                        <div className="auth-input-wrap">
                            <Lock size={18} />
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                className="auth-input"
                                placeholder="Min 8 characters"
                                minLength={8}
                                required
                                autoComplete="new-password"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-rose-600 bg-rose-500/10 border border-rose-500/15 px-4 py-3 rounded-xl font-medium">
                            {error}
                        </p>
                    )}

                    <button type="submit" disabled={loading} className="auth-submit flex items-center justify-center gap-2">
                        {loading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Creating account...
                            </>
                        ) : (
                            'Create account'
                        )}
                    </button>

                    {/* Demo & GitHub */}
                    <div className="quick-login-section">
                        <div className="quick-login-divider">
                            <span>or</span>
                        </div>
                        <div className="quick-login-row">
                            <button
                                type="button"
                                onClick={() => setShowDemo(true)}
                                className="quick-login-btn"
                            >
                                <Play size={15} strokeWidth={2.5} />
                                Demo
                            </button>
                            <a
                                href="https://github.com/khushal-winner/neighbr"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="quick-login-btn"
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                                </svg>
                                GitHub
                            </a>
                        </div>
                    </div>
                </form>

                {showDemo && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowDemo(false)}>
                        <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={() => setShowDemo(false)}
                                className="absolute top-3 right-3 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <video
                                controls
                                autoPlay
                                className="w-full h-auto max-h-[80vh] object-contain bg-black"
                            >
                                <source src="/export-1779746769464.mp4" type="video/mp4" />
                            </video>
                        </div>
                    </div>
                )}
            </AuthFormCard>
        </AuthShell>
    )
}
