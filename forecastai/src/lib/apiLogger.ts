import { supabase } from '@/lib/supabase'

/**
 * API 요청 로그를 api_log 테이블에 기록
 * 에러율 / 응답시간 추적용 — 실패해도 예외를 던지지 않음
 */
export async function logApiRequest(entry: {
  route: string
  method: string
  status_code: number
  duration_ms: number
  error_message?: string
}) {
  try {
    await supabase.from('api_log').insert({
      route: entry.route,
      method: entry.method,
      status_code: entry.status_code,
      duration_ms: entry.duration_ms,
      error_message: entry.error_message ?? null,
    })
  } catch {
    // api_log 테이블 미존재 시 무시
  }
}

/**
 * 파이프라인 실패 시 system_alert에 자동 등록
 */
export async function alertPipelineFailure(pipelineId: string, pipelineName: string, message: string) {
  try {
    // 6시간 내 동일 알림 중복 방지
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const title = `파이프라인 실패: ${pipelineName}`

    const { data: existing } = await supabase
      .from('system_alert')
      .select('id')
      .eq('title', title)
      .eq('is_dismissed', false)
      .gte('created_at', sixHoursAgo)
      .limit(1)

    if (existing?.length) return

    await supabase.from('system_alert').insert({
      alert_type: 'pipeline',
      severity: 'high',
      title,
      message,
      source: 'data_pipeline',
      target_page: 'data-pipeline',
      metadata: { pipeline_id: pipelineId },
    })
  } catch {
    // system_alert 테이블 미존재 시 무시
  }
}
