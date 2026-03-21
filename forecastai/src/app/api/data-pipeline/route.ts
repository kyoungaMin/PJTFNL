import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { alertPipelineFailure } from '@/lib/apiLogger'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────
   GET  — 파이프라인 상태 + 실행 이력 조회
   ────────────────────────────────────────────── */
export async function GET() {
  try {
    // 1) 파이프라인별 최신 실행 상태
    const { data: pipelines, error: pErr } = await supabase
      .from('pipeline_run')
      .select('pipeline_id, status, started_at, finished_at, duration_sec, message')
      .order('started_at', { ascending: false })

    if (pErr) throw pErr

    // 파이프라인별 최신 1건만 추출
    const latestMap = new Map<string, any>()
    for (const row of pipelines ?? []) {
      if (!latestMap.has(row.pipeline_id)) {
        latestMap.set(row.pipeline_id, row)
      }
    }

    const pipelineStatus = Array.from(latestMap.entries()).map(([id, row]) => ({
      pipeline_id: id,
      last_run_at: row.finished_at ?? row.started_at,
      last_status: row.status,
      last_duration_sec: row.duration_sec,
    }))

    // 2) 최근 실행 로그 50건
    const { data: logs, error: lErr } = await supabase
      .from('pipeline_run')
      .select('id, pipeline_id, pipeline_name, started_at, finished_at, status, duration_sec, message, date_from, date_to')
      .order('started_at', { ascending: false })
      .limit(50)

    if (lErr) throw lErr

    const formattedLogs = (logs ?? []).map(l => ({
      id: l.id,
      pipelineId: l.pipeline_id,
      pipelineName: l.pipeline_name ?? l.pipeline_id,
      startedAt: l.started_at,
      finishedAt: l.finished_at,
      status: l.status,
      durationSec: l.duration_sec,
      message: l.message,
      dateFrom: l.date_from ?? null,
      dateTo: l.date_to ?? null,
    }))

    return NextResponse.json({ pipelines: pipelineStatus, logs: formattedLogs })
  } catch (err: any) {
    // 테이블 미존재 시에도 빈 배열 반환 (초기 설정 전)
    console.error('[API] data-pipeline GET error:', err.message)
    return NextResponse.json({ pipelines: [], logs: [] })
  }
}

/* ──────────────────────────────────────────────
   POST — 파이프라인 수동 실행 트리거
   body: { pipelineId: string }
   ────────────────────────────────────────────── */

const PIPELINE_NAMES: Record<string, string> = {
  'forecast-weekly':  '주간 수요예측',
  'forecast-monthly': '월간 수요예측',
  'risk-analysis':    '리스크 분석',
  'inventory-sync':   '재고 현황 동기화',
  'purchase-rec':     '구매 추천',
  'production-plan':  '생산 계획',
  'model-eval':       '모델 평가',
  'ext-indicators':   '외부지표 수집',
  'industry-news':    '뉴스 수집',
  'ml-batch-weekly':  'ML 배치 (S0→S8)',
}

/* 각 파이프라인의 실제 실행 로직 — 기존 API 라우트 재활용 + 기간 파라미터 전달 */
async function executePipeline(
  pipelineId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ status: 'success' | 'failed'; message: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const qs = dateFrom && dateTo ? `?from=${dateFrom}&to=${dateTo}` : ''
  const periodLabel = dateFrom && dateTo ? ` (${dateFrom} ~ ${dateTo})` : ''

  try {
    switch (pipelineId) {
      case 'forecast-weekly': {
        const res = await fetch(`${baseUrl}/api/forecast-weekly${qs}`)
        return res.ok
          ? { status: 'success', message: `주간 예측 데이터 갱신 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'forecast-monthly': {
        const res = await fetch(`${baseUrl}/api/forecast-monthly${qs}`)
        return res.ok
          ? { status: 'success', message: `월간 예측 데이터 갱신 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'risk-analysis': {
        const res = await fetch(`${baseUrl}/api/risk${qs}`)
        return res.ok
          ? { status: 'success', message: `리스크 분석 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'inventory-sync': {
        const res = await fetch(`${baseUrl}/api/inventory${qs}`)
        return res.ok
          ? { status: 'success', message: `재고 데이터 동기화 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'purchase-rec': {
        const res = await fetch(`${baseUrl}/api/purchase-recommendation${qs}`)
        return res.ok
          ? { status: 'success', message: `구매 추천 갱신 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'production-plan': {
        const res = await fetch(`${baseUrl}/api/production-plan${qs}`)
        return res.ok
          ? { status: 'success', message: `생산 계획 갱신 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'model-eval': {
        const res = await fetch(`${baseUrl}/api/model-evaluation${qs}`)
        return res.ok
          ? { status: 'success', message: `모델 평가 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'ext-indicators': {
        const results = await Promise.allSettled([
          fetch(`${baseUrl}/api/ext-semi${qs}`),
          fetch(`${baseUrl}/api/ext-global${qs}`),
          fetch(`${baseUrl}/api/ext-fx${qs}`),
          fetch(`${baseUrl}/api/ext-supply${qs}`),
          fetch(`${baseUrl}/api/ext-raw${qs}`),
        ])
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
        return failed.length === 0
          ? { status: 'success', message: `외부지표 5종 수집 완료${periodLabel}` }
          : { status: 'failed', message: `외부지표 ${failed.length}건 실패` }
      }
      case 'industry-news': {
        const res = await fetch(`${baseUrl}/api/industry-news${qs}`)
        return res.ok
          ? { status: 'success', message: `뉴스 수집 완료${periodLabel}` }
          : { status: 'failed', message: `API 호출 실패: ${res.status}` }
      }
      case 'ml-batch-weekly':
        // ML 배치는 서버에서 Python으로 직접 실행해야 함
        // 프론트에서 트리거 시 안내 메시지 반환 (batch_weekly.py 또는 run_batch.bat 사용)
        return { status: 'success', message: 'ML 배치는 서버에서 run_batch.bat으로 실행하세요. 마지막 실행 결과는 이 페이지에서 확인됩니다.' }
      default:
        return { status: 'failed', message: `알 수 없는 파이프라인: ${pipelineId}` }
    }
  } catch (err: any) {
    return { status: 'failed', message: err.message ?? '실행 중 오류 발생' }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { pipelineId, dateFrom, dateTo } = await req.json()
    if (!pipelineId) {
      return NextResponse.json({ error: 'pipelineId 필요' }, { status: 400 })
    }

    const pipelineName = PIPELINE_NAMES[pipelineId] ?? pipelineId
    const startedAt = new Date().toISOString()

    // 실행 (기간 파라미터 전달)
    const result = await executePipeline(pipelineId, dateFrom, dateTo)

    const finishedAt = new Date().toISOString()
    const durationSec = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)

    // DB 기록 시도 (테이블 없으면 무시)
    let logEntry: any = null
    try {
      const { data, error } = await supabase
        .from('pipeline_run')
        .insert({
          pipeline_id: pipelineId,
          pipeline_name: pipelineName,
          started_at: startedAt,
          finished_at: finishedAt,
          status: result.status,
          duration_sec: durationSec,
          message: result.message,
          date_from: dateFrom ?? null,
          date_to: dateTo ?? null,
        })
        .select()
        .single()

      if (!error && data) logEntry = data
    } catch {
      // pipeline_run 테이블 미존재 — 로그 기록 생략
    }

    // 실패 시 모니터링 알림 자동 생성
    if (result.status === 'failed') {
      alertPipelineFailure(pipelineId, pipelineName, result.message).catch(() => {})
    }

    const log = logEntry ? {
      id: logEntry.id,
      pipelineId: logEntry.pipeline_id,
      pipelineName: logEntry.pipeline_name,
      startedAt: logEntry.started_at,
      finishedAt: logEntry.finished_at,
      status: logEntry.status,
      durationSec: logEntry.duration_sec,
      message: logEntry.message,
      dateFrom: logEntry.date_from ?? dateFrom ?? null,
      dateTo: logEntry.date_to ?? dateTo ?? null,
    } : {
      id: `local-${Date.now()}`,
      pipelineId,
      pipelineName,
      startedAt,
      finishedAt,
      status: result.status,
      durationSec,
      message: result.message,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
    }

    return NextResponse.json({
      status: result.status,
      finishedAt,
      durationSec,
      message: result.message,
      log,
    })
  } catch (err: any) {
    console.error('[API] data-pipeline POST error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
