'use client'

import { useEffect, useState } from 'react'
import { feedApi } from '@/lib/api'
import { Nav } from '@/components/Nav'
import dynamic from 'next/dynamic'

// Leaflet doesn't work with SSR — import dynamically client-only
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false })

export default function MapPage() {
    const [posts, setPosts] = useState([])

    useEffect(() => {
        feedApi.get('/feed', { params: { limit: 50 } })
            .then(res => setPosts(res.data.posts))
    }, [])

    return (
        <div className="h-screen w-screen relative overflow-hidden">
            {/* Floating Glass Header */}
            <div className="absolute top-4 left-4 right-4 z-40 max-w-lg mx-auto">
                <div className="glass-panel px-5 py-3.5 rounded-2xl shadow-lg flex items-center justify-between border border-white/40">
                    <h1 className="text-lg font-display font-bold text-gray-900 tracking-tight flex items-center gap-2">
                        <span>📍</span> Neighbourhood Map
                    </h1>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/10">
                        {posts.filter((p: any) => p.lat && p.lon).length} markers
                    </span>
                </div>
            </div>

            {/* Map Canvas */}
            <div className="absolute inset-0 z-10">
                <MapView posts={posts} />
            </div>

            <Nav />
        </div>
    )
}