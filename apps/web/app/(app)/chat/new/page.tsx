'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { chatApi } from '@/lib/api'

// This page doesn't render — it creates the DM thread and immediately
// redirects to it. Keeps the URL structure clean.
export default function NewDMPage() {
    const params = useSearchParams()
    const router = useRouter()
    const recipientId = params.get('recipientId')

    useEffect(() => {
        if (!recipientId) {
            router.replace('/chat')
            return
        }

        chatApi.post('/chat/dm', { recipientId })
            .then(res => {
                const threadId = res.data.threadId ?? res.data.thread?.id
                if (!threadId) {
                    router.replace('/chat')
                    return
                }
                router.replace(`/chat/dm/${threadId}`)
            })
            .catch(() => {
                router.replace('/chat')
            })
    }, [recipientId]) // eslint-disable-line

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
        </div>
    )
}