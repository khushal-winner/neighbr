'use client'

import { useEffect, useState } from 'react'
import { useWebSocket } from '@/contexts/websocket'
import { X } from 'lucide-react'

interface Alert {
    id: string
    title: string
    body: string
    timestamp: string
}

export function AlertBanner() {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const { subscribe } = useWebSocket()

    useEffect(() => {
        // subscribe to emergency alerts from WebSocket Gateway
        const unsub = subscribe('emergency_alert', (data) => {
            const alert: Alert = {
                id: data.postId as string,
                title: data.title as string,
                body: data.body as string,
                timestamp: data.timestamp as string,
            }

            setAlerts(prev => [alert, ...prev.slice(0, 2)])   // keep max 3 alerts
        })

        return unsub
    }, [subscribe])

    if (alerts.length === 0) return null

    return (
        <div className="fixed top-3 left-0 right-0 z-50 space-y-2 pointer-events-none">
            {alerts.map((alert) => (
                <div
                    key={alert.id}
                    className="max-w-lg mx-auto pointer-events-auto glass-panel bg-rose-600/90 text-white backdrop-blur-md border-rose-500/20 shadow-xl rounded-2xl px-5 py-4 flex items-start justify-between gap-4 mx-4 animate-in fade-in slide-in-from-top duration-300"
                >
                    <div className="space-y-1">
                        <div className="font-display font-bold text-sm tracking-wide flex items-center gap-2">
                            <span>🚨</span> {alert.title}
                        </div>
                        <div className="text-xs text-rose-100/90 leading-relaxed">{alert.body}</div>
                    </div>
                    <button
                        onClick={() =>
                            setAlerts(prev => prev.filter(a => a.id !== alert.id))
                        }
                        className="p-1 text-rose-200 hover:text-white flex-shrink-0 transition-colors cursor-pointer hover:bg-white/10 rounded-lg"
                    >
                        <X size={16} />
                    </button>
                </div>
            ))}
        </div>
    )
}