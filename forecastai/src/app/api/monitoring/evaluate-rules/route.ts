import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────
   POST — 모니터링 규칙 자동 평가
   파이프라인 실패, DB 연결 상태, API 에러율 등을
   체크하고 조건 충족 시 system_alert에 자동 등록
   ────────────────────────────────────────────── */

async function createAlertIfNew(alert: {
  alert_type: string; severity: string; title: string;
  message: string; source: string; target_page?: string; metadata?: any
}) {
  // 6시간 내 동일 제목 존재하면 스킵
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('system_alert')
    .select('id')
    .eq('title', alert.title)
    .eq('is_dismissed', false)
    .gte('created_at', sixHoursAgo)
    .limit(1)

  if (existing?.length) return null

  const { data } = await supabase
    .from('system_alert')
    .insert(alert)
    .select()
    .single()
  return data
}

export async function POST() {
  const created: any[] = []

  try {
    // ─── 1. 파이프라인 실패 체크 ───
    try {
      const { data: runs } = await supabase
        .from('pipeline_run')
        .select('pipeline_id, pipeline_name, status, finished_at, message')
        .order('finished_at', { ascending: false })

      if (runs?.length) {
        const latest = new Map<string, any>()
        for (const r of runs) {
          if (!latest.has(r.pipeline_id)) latest.set(r.pipeline_id, r)
        }
        for (const [, r] of latest) {
          if (r.status === 'failed') {
            const alert = await createAlertIfNew({
              alert_type: 'pipeline',
              severity: 'high',
              title: `파이프라인 실패: ${r.pipeline_name ?? r.pipeline_id}`,
              message: r.message ?? '실행 중 오류 발생',
              source: 'evaluate_rules',
              target_page: 'data-pipeline',
              metadata: { pipeline_id: r.pipeline_id },
            })
            if (alert) created.push(alert)
          }
        }
      }
    } catch { /* pipeline_run 테이블 미존재 */ }

    // ─── 2. DB 연결 상태 체크 ───
    try {
      const start = Date.now()
      const { error } = await supabase.from('pipeline_run').select('id').limit(1)
      const latency = Date.now() - start

      if (error) {
        const alert = await createAlertIfNew({
          alert_type: 'health',
          severity: 'critical',
          title: 'DB 연결 실패',
          message: `Supabase 쿼리 오류: ${error.message}`,
          source: 'evaluate_rules',
          metadata: { error: error.message },
        })
        if (alert) created.push(alert)
      } else if (latency > 5000) {
        const alert = await createAlertIfNew({
          alert_type: 'health',
          severity: 'high',
          title: 'DB 응답 지연',
          message: `Supabase 응답 ${latency}ms — 5초 초과`,
          source: 'evaluate_rules',
          metadata: { latency_ms: latency },
        })
        if (alert) created.push(alert)
      }
    } catch {
      const alert = await createAlertIfNew({
        alert_type: 'health',
        severity: 'critical',
        title: 'DB 연결 불가',
        message: 'Supabase 연결이 완전히 실패했습니다',
        source: 'evaluate_rules',
      })
      if (alert) created.push(alert)
    }

    // ─── 3. API 에러율 체크 (최근 1시간) ───
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

      const { count: totalCount } = await supabase
        .from('api_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)

      const { count: errorCount } = await supabase
        .from('api_log')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo)
        .gte('status_code', 500)

      const total = totalCount ?? 0
      const errors = errorCount ?? 0

      if (total >= 10 && errors / total > 0.1) {
        const rate = Math.round(errors / total * 100)
        const alert = await createAlertIfNew({
          alert_type: 'api',
          severity: rate > 30 ? 'critical' : 'high',
          title: `API 에러율 ${rate}% (최근 1시간)`,
          message: `총 ${total}건 중 ${errors}건 서버 에러 발생`,
          source: 'evaluate_rules',
          target_page: 'monitoring',
          metadata: { total, errors, rate },
        })
        if (alert) created.push(alert)
      }
    } catch { /* api_log 테이블 미존재 */ }

    // ─── 4. 24시간 이상 미갱신 파이프라인 ───
    try {
      const { data: runs } = await supabase
        .from('pipeline_run')
        .select('pipeline_id, pipeline_name, finished_at')
        .order('finished_at', { ascending: false })

      if (runs?.length) {
        const latest = new Map<string, any>()
        for (const r of runs) {
          if (!latest.has(r.pipeline_id)) latest.set(r.pipeline_id, r)
        }
        const staleList: string[] = []
        const now = Date.now()
        for (const [, r] of latest) {
          if (!r.finished_at || now - new Date(r.finished_at).getTime() > 24 * 60 * 60 * 1000) {
            staleList.push(r.pipeline_name ?? r.pipeline_id)
          }
        }
        if (staleList.length >= 3) {
          const alert = await createAlertIfNew({
            alert_type: 'pipeline',
            severity: 'medium',
            title: `파이프라인 ${staleList.length}개 24시간 미갱신`,
            message: staleList.slice(0, 3).join(', ') + (staleList.length > 3 ? ` 외 ${staleList.length - 3}개` : ''),
            source: 'evaluate_rules',
            target_page: 'data-pipeline',
          })
          if (alert) created.push(alert)
        }
      }
    } catch { /* 무시 */ }

    return NextResponse.json({ evaluated: true, alerts_created: created.length, alerts: created })
  } catch (err: any) {
    console.error('[API] monitoring/evaluate-rules error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
