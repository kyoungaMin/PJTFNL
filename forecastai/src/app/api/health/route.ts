import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result: {
    status: 'healthy' | 'degraded' | 'down'
    database: { status: string; latency_ms: number }
    pipelines: { stale: number; failed: number; total: number }
    alerts: { critical: number; unread: number }
    checked_at: string
  } = {
    status: 'healthy',
    database: { status: 'healthy', latency_ms: 0 },
    pipelines: { stale: 0, failed: 0, total: 0 },
    alerts: { critical: 0, unread: 0 },
    checked_at: new Date().toISOString(),
  }

  // ─── 1. DB 연결 체크 (SELECT 1 대용) ───
  try {
    const start = Date.now()
    const { error } = await supabase.from('pipeline_run').select('id').limit(1)
    result.database.latency_ms = Date.now() - start

    if (error) {
      result.database.status = 'down'
      result.status = 'down'
    } else if (result.database.latency_ms > 3000) {
      result.database.status = 'degraded'
      if (result.status === 'healthy') result.status = 'degraded'
    }
  } catch {
    result.database.status = 'down'
    result.status = 'down'
  }

  // ─── 2. 파이프라인 상태 체크 ───
  try {
    const { data: runs } = await supabase
      .from('pipeline_run')
      .select('pipeline_id, status, finished_at')
      .order('finished_at', { ascending: false })

    if (runs?.length) {
      const latest = new Map<string, any>()
      for (const r of runs) {
        if (!latest.has(r.pipeline_id)) latest.set(r.pipeline_id, r)
      }
      result.pipelines.total = latest.size
      const now = Date.now()
      for (const [, r] of latest) {
        if (r.status === 'failed') result.pipelines.failed++
        if (!r.finished_at || now - new Date(r.finished_at).getTime() > 24 * 60 * 60 * 1000) {
          result.pipelines.stale++
        }
      }
      if (result.pipelines.failed > 0 && result.status === 'healthy') {
        result.status = 'degraded'
      }
    }
  } catch { /* 테이블 미존재 시 무시 */ }

  // ─── 3. 미읽은 알림 수 ───
  try {
    const { count: critCount } = await supabase
      .from('system_alert')
      .select('*', { count: 'exact', head: true })
      .eq('severity', 'critical')
      .eq('is_dismissed', false)
    result.alerts.critical = critCount ?? 0

    const { count: unreadCount } = await supabase
      .from('system_alert')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('is_dismissed', false)
    result.alerts.unread = unreadCount ?? 0

    if ((critCount ?? 0) > 0 && result.status === 'healthy') {
      result.status = 'degraded'
    }
  } catch { /* 테이블 미존재 시 무시 */ }

  // ─── 4. 헬스 로그 기록 ───
  try {
    const { error: logErr } = await supabase.from('system_health_log').insert({
      service: 'overall',
      status: result.status,
      latency_ms: result.database.latency_ms,
      message: result.status === 'healthy' ? null : `DB:${result.database.status}, Failed:${result.pipelines.failed}, Critical:${result.alerts.critical}`,
      metadata: { database: result.database, pipelines: result.pipelines, alerts: result.alerts },
    })
    if (logErr) console.error('[health] log insert error:', logErr.message)
  } catch { /* 테이블 미존재 시 무시 */ }

  return NextResponse.json(result)
}
