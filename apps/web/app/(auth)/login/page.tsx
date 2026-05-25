'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { identityApi } from '@/lib/api'
import { setAccessToken } from '@/lib/auth'
import { useAuthStore } from '@/store/auth'
import { AuthShell } from '@/components/AuthShell'
import { AuthFormCard } from '@/components/auth/AuthFormCard'
import { LogIn, Mail, Lock, CheckCircle2, Loader2, Info, Zap } from 'lucide-react'

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
            setError(err.response?.data?.error ?? 'Login failed')
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
            </form>
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
