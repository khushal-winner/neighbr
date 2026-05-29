'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { identityApi } from '@/lib/api'
import { setAccessToken } from '@/lib/auth'
import { useAuthStore } from '@/store/auth'
import { AuthShell } from '@/components/AuthShell'
import { AuthFormCard } from '@/components/auth/AuthFormCard'
import { LogIn, Mail, Lock, CheckCircle2, Loader2, Info, Zap, Play, X } from 'lucide-react'

function LoginForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { setAuth } = useAuthStore()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [showRegistered, setShowRegistered] = useState(false)
    const [showQuickInfo, setShowQuickInfo] = useState(false)
    const [showDemo, setShowDemo] = useState(false)

    useEffect(() => {
        if (searchParams.get('registered') === '1') {
            setShowRegistered(true)
        }
    }, [searchParams])

    function handleQuickLogin() {
        setEmail('neighbrlogin999@gmail.com')
        setPassword('freelogin')
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await identityApi.post('/auth/login', { email, password })
            const { accessToken, user } = res.data

            setAccessToken(accessToken)
            setAuth(user, accessToken)

            if (user.verificationLevel === 'unverified') {
                router.push('/verify/address')
            } else if (user.verificationLevel === 'address_verified') {
                router.push('/verify/postcard')
            } else {
                router.push('/feed')
            }
        } catch (err: any) {
            if (!err.response) {
                setError("refresh & try again server might be sleeping\u{1F634}")
                setTimeout(() => window.location.reload(), 4000)
            } else {
                setError(err.response?.data?.error ?? 'Login failed')
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <AuthFormCard
            title="Welcome back"
            subtitle="Sign in to connect with your block"
            icon={<LogIn size={28} strokeWidth={1.75} />}
            footer={
                <p className="text-center text-sm text-gray-500 font-sans">
                    New to NeighBr?{' '}
                    <Link
                        href="/register"
                        className="font-semibold text-primary hover:text-primary-container transition-colors"
                    >
                        Create account
                    </Link>
                </p>
            }
        >
            {showRegistered && (
                <div className="auth-success-banner mb-5 flex items-center gap-2 text-sm text-emerald-800 bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl">
                    <CheckCircle2 size={18} className="flex-shrink-0" />
                    Account created — sign in below
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider pl-1">
                        Email
                    </label>
                    <div className="auth-input-wrap">
                        <Mail size={18} />
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
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
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="auth-input"
                            placeholder="••••••••"
                            required
                            autoComplete="current-password"
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
                            Signing in...
                        </>
                    ) : (
                        'Sign in'
                    )}
                </button>

                {/* Quick Login */}
                <div className="quick-login-section" id="quick-login-section">
                    <div className="quick-login-divider">
                        <span>or</span>
                    </div>
                    <div className="quick-login-row">
                        <button
                            type="button"
                            onClick={handleQuickLogin}
                            className="quick-login-btn"
                            id="quick-login-btn"
                        >
                            <Zap size={16} strokeWidth={2.5} />
                            Quick Login
                        </button>
                        <div className="quick-login-info-wrap">
                            <button
                                type="button"
                                className="quick-login-info-trigger"
                                onClick={() => setShowQuickInfo(!showQuickInfo)}
                                onMouseEnter={() => setShowQuickInfo(true)}
                                onMouseLeave={() => setShowQuickInfo(false)}
                                aria-label="What is Quick Login?"
                                id="quick-login-info-btn"
                            >
                                <Info size={17} />
                            </button>
                            {showQuickInfo && (
                                <div className="quick-login-tooltip" id="quick-login-tooltip">
                                    <strong>Public demo account</strong>
                                    <span>Skip address &amp; email verification and explore the app instantly. Credentials are shared for everyone to test.</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Demo & GitHub */}
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
            </form>

            {showDemo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowDemo(false)}>
                    <div className="relative w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl bg-black" onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setShowDemo(false)}
                            className="absolute top-3 right-3 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
                        >
                            <X size={20} />
                        </button>
                        <div className="aspect-video w-full">
                            <iframe
                                src="https://www.youtube.com/embed/nt9BL56vwAU?si=oOaDwz0K7W1bg_lO&autoplay=1"
                                title="Neighbr Demo"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                className="w-full h-full"
                            />
                        </div>
                    </div>
                </div>
            )}
        </AuthFormCard>
    )
}

export default function LoginPage() {
    return (
        <AuthShell variant="login">
            <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white/40" />}>
                <LoginForm />
            </Suspense>
        </AuthShell>
    )
}
