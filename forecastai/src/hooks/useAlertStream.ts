'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

/* ──────── 타입 ──────── */
export interface StreamAlert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string | null
  source: string | null
  target_page: string | null
  is_read: boolean
  is_dismissed: boolean
  created_at: string
}

interface UseAlertStreamReturn {
  /** 실시간으로 수신된 새 알림 목록 (최신순) */
  realtimeAlerts: StreamAlert[]
  /** 미읽은 알림 수 (SSE init 시 서버에서 받은 값 + 실시간 수신분) */
  unreadCount: number
  /** SSE 연결 상태 */
  connected: boolean
  /** 알림 목록 초기화 (읽음 처리 후 호출) */
  clearAlerts: () => void
  /** 미읽은 수 직접 세팅 (외부에서 fetch 후 동기화용) */
  setUnreadCount: (n: number) => void
}

const RECONNECT_DELAY = 3000   // 재연결 대기 (ms)
const MAX_ALERTS = 50          // 메모리에 보관할 최대 알림 수

export function useAlertStream(): UseAlertStreamReturn {
  const [realtimeAlerts, setRealtimeAlerts] = useState<StreamAlert[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [connected, setConnected] = useState(false)
  const retriesRef = useRef(0)
  const esRef = useRef<EventSource | null>(null)

  const clearAlerts = useCallback(() => {
    setRealtimeAlerts([])
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let unmounted = false

    function connect() {
      if (unmounted) return
      const es = new EventSource('/api/monitoring/stream')
      esRef.current = es

      es.onopen = () => {
        setConnected(true)
        retriesRef.current = 0
      }

      // 초기 미읽은 수
      es.addEventListener('init', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          setUnreadCount(data.unreadCount ?? 0)
        } catch { /* */ }
      })

      // 새 알림 수신
      es.addEventListener('new-alerts', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          const alerts: StreamAlert[] = data.alerts ?? []
          if (!alerts.length) return

          setRealtimeAlerts(prev => {
            const merged = [...alerts, ...prev].slice(0, MAX_ALERTS)
            return merged
          })
          setUnreadCount(prev => prev + alerts.length)
        } catch { /* */ }
      })

      es.onerror = () => {
        es.close()
        esRef.current = null
        setConnected(false)

        if (!unmounted) {
          // 지수 백오프 (최대 30초)
          const delay = Math.min(RECONNECT_DELAY * 2 ** retriesRef.current, 30000)
          retriesRef.current += 1
          timer = setTimeout(connect, delay)
        }
      }
    }

    connect()

    return () => {
      unmounted = true
      if (timer) clearTimeout(timer)
      esRef.current?.close()
      esRef.current = null
    }
  }, [])

  return { realtimeAlerts, unreadCount, connected, clearAlerts, setUnreadCount }
}
