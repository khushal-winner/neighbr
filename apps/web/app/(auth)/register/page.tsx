'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { identityApi } from '@/lib/api'
import { AuthShell } from '@/components/AuthShell'
import { AuthFormCard } from '@/components/auth/AuthFormCard'
import { UserPlus, User, Mail, Lock, Loader2 } from 'lucide-react'

export default function RegisterPage() {
    const router = useRouter()
    const [form, setForm] = useState({
        email: '',
        password: '',
        displayName: '',
    })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

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
                </form>
            </AuthFormCard>
        </AuthShell>
    )
}
