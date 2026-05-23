'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { postApi } from '@/lib/api'
import { Nav } from '@/components/Nav'
import { 
    ChevronLeft, 
    Image as ImageIcon, 
    X, 
    Loader2,
    MessageCircle,
    AlertTriangle,
    ShoppingBag,
    Search,
    Calendar,
    BarChart3
} from 'lucide-react'
import Link from 'next/link'

const POST_TYPES = [
    { value: 'community', label: 'Community', icon: MessageCircle },
    { value: 'emergency', label: 'Emergency', icon: AlertTriangle },
    { value: 'classified', label: 'Classified', icon: ShoppingBag },
    { value: 'lost_found', label: 'Lost & Found', icon: Search },
    { value: 'event', label: 'Event', icon: Calendar },
    { value: 'poll', label: 'Poll', icon: BarChart3 },
]

export default function NewPostPage() {
    const router = useRouter()
    const [form, setForm] = useState({
        type: 'community',
        title: '',
        body: '',
        imageUrls: [] as string[],
    })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [uploadingImage, setUploadingImage] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    function handleChange(
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be under 5MB')
            return
        }

        setError('')
        setUploadingImage(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const res = await postApi.post('/posts/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
            setForm(prev => ({
                ...prev,
                imageUrls: [...prev.imageUrls, res.data.url]
            }))
        } catch (err: any) {
            setError(err.response?.data?.error ?? 'Failed to upload image')
        } finally {
            setUploadingImage(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    function removeImage(index: number) {
        setForm(prev => ({
            ...prev,
            imageUrls: prev.imageUrls.filter((_, i) => i !== index)
        }))
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            await postApi.post('/posts', form)
            router.push('/feed?submitted=1')
        } catch (err: any) {
            setError(err.response?.data?.error ?? 'Failed to create post')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen pb-24">
            {/* Header */}
            <div className="glass-header sticky top-0 z-30">
                <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
                    <Link href="/feed" className="text-gray-400 hover:text-primary transition-colors">
                        <ChevronLeft size={22} />
                    </Link>
                    <h1 className="text-xl font-display font-bold text-gray-900 tracking-tight">New Post</h1>
                </div>
            </div>

            <div className="max-w-lg mx-auto px-4 pt-5">
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Post type selector */}
                    <div className="space-y-2.5">
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider pl-1">
                            What type of post?
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {POST_TYPES.map(pt => {
                                const isActive = form.type === pt.value
                                const isEmergency = pt.value === 'emergency'
                                const Icon = pt.icon
                                return (
                                    <button
                                        key={pt.value}
                                        type="button"
                                        onClick={() => setForm(prev => ({ ...prev, type: pt.value }))}
                                        className={`py-3 rounded-2xl text-xs font-semibold transition-all duration-200 flex flex-col items-center gap-2 cursor-pointer active:scale-95 ${
                                            isActive
                                                ? isEmergency
                                                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                                                    : 'bg-primary text-white shadow-md shadow-primary/20'
                                                : 'glass-panel text-gray-600 hover:border-primary/40 hover:text-primary'
                                        }`}
                                    >
                                        <Icon size={20} className={isActive ? 'text-white' : 'text-gray-500'} />
                                        <span className="tracking-wide">{pt.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Emergency warning */}
                    {form.type === 'emergency' && (
                        <div className="glass-panel border-rose-500/20 bg-rose-500/5 rounded-2xl p-4 animate-pulse">
                            <p className="text-xs text-rose-800 font-semibold leading-relaxed flex items-center gap-1.5">
                                <AlertTriangle size={14} className="text-rose-800" /> EMERGENCY ALERT
                            </p>
                            <p className="text-xs text-rose-700/90 mt-1 leading-relaxed">
                                This post will be sent immediately to all neighbours within 500m via push notifications. Only use for active safety concerns, hazards, or immediate emergencies.
                            </p>
                        </div>
                    )}

                    {/* Title */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider pl-1">
                            Title
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={form.title}
                            onChange={handleChange}
                            className="w-full soft-input rounded-xl px-4 py-3 text-sm"
                            placeholder="What's happening?"
                            maxLength={200}
                            required
                        />
                    </div>

                    {/* Body */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider pl-1">
                            Details
                        </label>
                        <textarea
                            name="body"
                            value={form.body}
                            onChange={handleChange}
                            rows={6}
                            className="w-full soft-input rounded-xl px-4 py-3 text-sm resize-none"
                            placeholder="Tell your neighbours more..."
                            maxLength={5000}
                            required
                        />
                        <p className="text-[10px] font-medium text-gray-400 text-right pr-1">
                            {form.body.length} / 5000
                        </p>
                    </div>

                    {/* Media Upload */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider pl-1">
                            Media
                        </label>
                        <div className="flex flex-wrap gap-3">
                            {form.imageUrls.map((url, i) => (
                                <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-gray-200">
                                    <img src={url} alt="upload" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(i)}
                                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingImage}
                                className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {uploadingImage ? (
                                    <Loader2 size={24} className="animate-spin" />
                                ) : (
                                    <>
                                        <ImageIcon size={24} className="mb-1" />
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">Add Photo</span>
                                    </>
                                )}
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-rose-600 bg-rose-500/10 border border-rose-500/10 px-4 py-3 rounded-xl font-medium">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading || uploadingImage}
                        className={`w-full text-white py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all duration-200 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                            form.type === 'emergency'
                                ? 'bg-rose-600 hover:bg-rose-700 hover:shadow-md hover:shadow-rose-600/10'
                                : 'bg-primary hover:bg-primary-container hover:shadow-md hover:shadow-primary/10'
                        }`}
                    >
                        {loading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : form.type === 'emergency' ? (
                            <>
                                <AlertTriangle size={16} />
                                <span>Send Emergency Alert</span>
                            </>
                        ) : (
                            <span>Post to my street</span>
                        )}
                    </button>
                </form>
            </div>

            <Nav />
        </div>
    )
}