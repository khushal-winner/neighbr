'use client'

import React, {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useCallback,
} from 'react'
import { useAuthStore } from '@/store/auth'

type MessageHandler = (data: Record<string, unknown>) => void

interface WebSocketContextValue {
    isConnected: boolean
    subscribe: (type: string, handler: MessageHandler) => () => void
    send: (data: Record<string, unknown>) => void
}

const WebSocketContext = createContext<WebSocketContextValue>({
    isConnected: false,
    subscribe: () => () => { },
    send: () => { },
})

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
    const [isConnected, setIsConnected] = useState(false)
    const wsRef = useRef<WebSocket | null>(null)
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map())
    const { accessToken, user } = useAuthStore()

    const subscribe = useCallback(
        (type: string, handler: MessageHandler) => {
            if (!handlersRef.current.has(type)) {
                handlersRef.current.set(type, new Set())
            }
            handlersRef.current.get(type)!.add(handler)
            return () => {
                handlersRef.current.get(type)?.delete(handler)
            }
        },
        []
    )

    const send = useCallback((data: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data))
        }
    }, [])

    const connect = useCallback(() => {
        if (!accessToken) return

        if (wsRef.current) {
            wsRef.current.onclose = null
            wsRef.current.close()
            wsRef.current = null
        }

        const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws')

        ws.onopen = () => {
            ws.send(
                JSON.stringify({
                    type: 'auth',
                    token: accessToken,
                    communityId: user?.communityId ?? undefined,
                }),
            )
            setIsConnected(true)
        }

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                const type = data.type as string
                handlersRef.current.get(type)?.forEach(handler => handler(data))
                handlersRef.current.get('*')?.forEach(handler => handler(data))
            } catch {
                console.warn('[WS] failed to parse message')
            }
        }

        ws.onclose = () => {
            setIsConnected(false)
            wsRef.current = null
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
            reconnectTimer.current = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
            ws.close()
        }

        wsRef.current = ws
    }, [accessToken, user?.communityId])

    useEffect(() => {
        connect()
        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
            if (wsRef.current) {
                wsRef.current.onclose = null
                wsRef.current.close()
                wsRef.current = null
            }
            setIsConnected(false)
        }
    }, [connect])

    return (
        <WebSocketContext.Provider value={{ isConnected, subscribe, send }}>
            {children}
        </WebSocketContext.Provider>
    )
}

export function useWebSocket() {
    return useContext(WebSocketContext)
}
