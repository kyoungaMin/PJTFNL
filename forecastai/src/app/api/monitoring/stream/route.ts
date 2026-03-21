import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────
   GET  — SSE 실시간 알림 스트림
   클라이언트가 EventSource로 연결하면,
   5초 간격으로 새 알림을 확인하여 푸시합니다.
   ────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      // 연결 확인 메시지
      controller.enqueue(encoder.encode(': connected\n\n'))

      let lastChecked = new Date().toISOString()

      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch { /* 연결 종료 시 무시 */ }
      }

      // 연결 직후 미읽은 알림 수 전송
      try {
        const { count } = await supabase
          .from('system_alert')
          .select('*', { count: 'exact', head: true })
          .eq('is_dismissed', false)
          .eq('is_read', false)

        send('init', { unreadCount: count ?? 0 })
      } catch { /* */ }

      // 5초마다 새 알림 확인
      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }

        try {
          const { data: newAlerts } = await supabase
            .from('system_alert')
            .select('*')
            .gt('created_at', lastChecked)
            .eq('is_dismissed', false)
            .order('created_at', { ascending: false })
            .limit(20)

          if (newAlerts?.length) {
            send('new-alerts', { alerts: newAlerts })
            lastChecked = new Date().toISOString()
          }

          // 30초마다 heartbeat (연결 유지)
        } catch { /* DB 일시 장애 시 무시, 다음 주기에 재시도 */ }
      }, 5000)

      // 30초마다 heartbeat
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return }
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch { /* */ }
      }, 30000)

      // AbortSignal로 연결 종료 감지
      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        try { controller.close() } catch { /* */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',  // nginx 버퍼링 방지
    },
  })
}
