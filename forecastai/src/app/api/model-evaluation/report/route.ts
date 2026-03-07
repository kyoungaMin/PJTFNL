import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* ─── 인사이트 자동 생성 ──────────────────────────────────────────────────── */

interface TopProduct { product_id: string; predicted: number; actual: number; error: number }

interface Metrics { mae: number; rmse: number; r2: number; mape: number; tolerance_5_rate: number }

function generateInsights(
  metrics: Metrics,
  topErrors: TopProduct[],
  topAccurate: TopProduct[],
  nProducts: number,
  nRecords: number,
  periodType: string,
  periodKey: string,
) {
  const r2Pct = Math.round(metrics.r2 * 1000) / 10
  const periodLabel = periodType === 'weekly' ? '주간' : '월간'

  // ── 오차 패턴 분석 ──
  const overPredictCount = topErrors.filter(p => p.predicted > p.actual).length
  const zeroActualCount = topErrors.filter(p => p.actual === 0).length
  const top5ErrorSum = topErrors.slice(0, 5).reduce((s, p) => s + Math.abs(p.error), 0)
  const isOverPredict = overPredictCount >= topErrors.length / 2

  // ── 한 줄 요약 ──
  let summary: string
  if (metrics.r2 >= 0.5) {
    summary = `${periodKey} 기간 ${periodLabel} 예측 정확도 R²=${r2Pct}%로 실무 활용 가능 수준입니다. `
      + `${nProducts}개 제품, ${nRecords}건의 예측 중 ±5 적중률 ${metrics.tolerance_5_rate}%를 달성하여 `
      + `생산계획 및 발주 의사결정에 즉시 반영할 수 있습니다.`
  } else if (metrics.r2 >= 0.2) {
    summary = `${periodKey} 기간 ${periodLabel} 예측 정확도 R²=${r2Pct}%로 보조 참고 수준입니다. `
      + `단독 의사결정보다는 담당자 판단과 병행하여 활용하되, `
      + `정확 예측 상위 제품군에 한해 자동화 검토가 가능합니다.`
  } else {
    summary = `${periodKey} 기간 ${periodLabel} 예측 정확도 R²=${r2Pct}%로 예측 신뢰도가 낮습니다. `
      + `이 기간은 수주 패턴이 불규칙하거나 특수 상황(명절, 장기 휴일 등)이 있었을 수 있습니다. `
      + `예측에 의존하지 말고 담당자의 수동 판단을 우선하시기 바랍니다.`
  }

  // ── 지표별 쉬운 설명 ──
  const hitCount = Math.round(r2Pct / 10)
  const r2_explanation = metrics.r2 >= 0.5
    ? `R²=${r2Pct}%는 "10번 예측하면 약 ${hitCount}번은 방향과 크기를 맞춘다"는 의미입니다. `
      + `산업 평균(50~70%) 범위 내로, 월간 생산계획이나 원자재 발주 시 AI 예측값을 참고할 수 있는 수준입니다.`
    : metrics.r2 >= 0.2
    ? `R²=${r2Pct}%는 "10번 중 약 ${hitCount}번 맞추는" 수준입니다. `
      + `전적으로 예측에 의존하기는 어렵지만, 급격한 수주 변동을 감지하는 알림 용도로 활용할 수 있습니다.`
    : `R²=${r2Pct}%는 예측 설명력이 낮은 상태입니다. `
      + `이 기간의 수주 변동이 과거 패턴과 달라 모델이 정확히 예측하지 못했습니다. `
      + `원인 분석(특수 수주, 고객 이벤트 등)이 필요합니다.`

  const mae_explanation = `평균절대오차(MAE)는 ${metrics.mae.toFixed(1)}개입니다. `
    + `이는 "예측할 때마다 실제 수주량과 평균적으로 약 ${metrics.mae.toFixed(0)}개 차이가 난다"는 뜻입니다. `
    + (metrics.mae <= 10
      ? '소량 제품 위주로 오차가 작아 실무 적용에 문제없는 수준입니다.'
      : metrics.mae <= 50
      ? '중간 수준의 오차로, 대량 수주 제품의 예측 편차가 MAE를 높이고 있을 수 있습니다.'
      : '오차가 큰 편이며, 특정 대량 수주 제품이 전체 오차를 크게 끌어올리고 있을 가능성이 높습니다.')

  const rmse_explanation = `RMSE는 ${metrics.rmse.toFixed(1)}입니다. `
    + `MAE(${metrics.mae.toFixed(1)})보다 ${(metrics.rmse / metrics.mae).toFixed(1)}배 큰데, `
    + (metrics.rmse / metrics.mae > 2
      ? '이는 일부 제품에서 매우 큰 오차가 발생하고 있음을 의미합니다. '
        + '오차 상위 제품을 집중 관리하면 전체 예측 품질이 크게 개선될 수 있습니다.'
      : '이는 오차가 비교적 고르게 분포되어 있어 특별히 큰 이상치는 적다는 의미입니다.')

  const tolerance_explanation = `±5 적중률은 ${metrics.tolerance_5_rate.toFixed(1)}%입니다. `
    + `전체 ${nRecords}건의 예측 중 ${Math.round(nRecords * metrics.tolerance_5_rate / 100)}건이 `
    + `실제 수주량과 5개 이내 차이로 정확했습니다. `
    + (metrics.tolerance_5_rate >= 50
      ? '절반 이상의 예측이 매우 정확하여, 이 제품들은 자동 발주 연동이 가능한 수준입니다.'
      : metrics.tolerance_5_rate >= 30
      ? '적중률을 높이려면 소량·정기 발주 제품을 먼저 자동화하는 것이 효과적입니다.'
      : '대부분의 예측이 ±5 범위를 벗어나고 있어, 제품군별 특화 모델이 필요할 수 있습니다.')

  const mape_explanation = `MAPE는 ${metrics.mape.toFixed(1)}%입니다. `
    + (metrics.mape <= 20
      ? '비율 기준으로 매우 정확한 예측을 보여주고 있습니다.'
      : metrics.mape <= 50
      ? '비율 기준으로 보통 수준이며, 소량 수주 제품에서 MAPE가 높게 나타나는 경향이 있습니다.'
      : `비율 기준 오차가 큰 편입니다. 이는 실제 수주가 매우 작은 제품(예: 1~5개)에서 `
        + `예측이 조금만 벗어나도 백분율 오차가 크게 증가하기 때문입니다.`)

  // ── 오차 패턴 설명 ──
  const error_pattern = isOverPredict
    ? `상위 오차 제품 ${topErrors.length}개 중 ${overPredictCount}개가 과대 예측(실제보다 많이 예측)입니다. `
      + '이는 재고 과잉으로 이어질 수 있으므로, 해당 제품의 안전 마진을 줄이는 것이 유리합니다.'
    : `상위 오차 제품 ${topErrors.length}개 중 ${topErrors.length - overPredictCount}개가 과소 예측(실제보다 적게 예측)입니다. `
      + '이는 품절·납기 지연 위험이 있으므로, 해당 제품의 안전 재고를 높이는 것을 권장합니다.'

  const zero_actual_comment = zeroActualCount > 0
    ? `또한 실제 수주가 0건인데 예측한 경우가 ${zeroActualCount}건 있습니다. `
      + '수주 유무를 먼저 분류하는 2단계 모델(수주 여부 → 수량 예측) 도입을 검토할 필요가 있습니다.'
    : ''

  // ── 제품군 분석 ──
  const product_analysis = `오차 상위 5개 제품의 총 오차 합계는 ${top5ErrorSum.toFixed(0)}개입니다. `
    + `이 제품들만 집중 관리(담당자 수동 보정)해도 전체 예측 품질을 크게 개선할 수 있습니다. `
    + `반면, 정확 예측 상위 제품들은 오차가 ${topAccurate[0]?.error.toFixed(1) ?? 0}개 수준으로 `
    + `자동 발주·생산계획 연동에 적합합니다.`

  // ── 비즈니스 인사이트 ──
  const business_insights: string[] = []
  if (isOverPredict) {
    business_insights.push('과대 예측 경향이 있어 불필요한 생산·재고 비용이 발생할 수 있습니다. 예측값에 0.85~0.9 보정 계수를 적용하는 것을 검토하세요.')
  } else {
    business_insights.push('과소 예측 경향이 있어 품절·납기 지연 위험이 있습니다. 예측값에 1.1~1.15 보정 계수를 적용하는 것을 검토하세요.')
  }
  if (metrics.tolerance_5_rate >= 40) {
    business_insights.push(`±5 적중률 ${metrics.tolerance_5_rate.toFixed(0)}% — 적중률이 높은 제품군부터 자동 발주 파일럿 운영을 시작할 수 있습니다.`)
  }
  if (zeroActualCount > 0) {
    business_insights.push(`실제 수주 0인데 예측한 건(${zeroActualCount}건) — 해당 제품의 수주 패턴을 재검토하고, 간헐적 수주 제품은 별도 관리가 필요합니다.`)
  }
  if (metrics.rmse / metrics.mae > 2.5) {
    business_insights.push('RMSE가 MAE 대비 매우 높아 일부 제품에서 극단적 오차가 발생하고 있습니다. 해당 제품의 수주 이력을 점검해보세요.')
  }
  if (metrics.r2 >= 0.5) {
    business_insights.push(`R²=${r2Pct}%로 실무 활용 가능 수준 — ${periodLabel} 생산계획에 AI 예측값을 반영하여 계획 정확도를 높일 수 있습니다.`)
  }

  // ── 실무 권고사항 ──
  const recommendations: { area: string; action: string; priority: string; reason: string }[] = []

  if (metrics.r2 >= 0.5) {
    recommendations.push({
      area: '생산계획',
      action: `${periodLabel} 예측값을 기반으로 생산 물량을 결정하세요`,
      priority: 'high',
      reason: `R²=${r2Pct}%로 실무 적용 가능 수준`,
    })
    recommendations.push({
      area: '원자재 발주',
      action: '예측 수량에 맞춰 발주량과 발주 시점을 조정하세요',
      priority: 'high',
      reason: '예측 기반 발주로 재고 비용 절감 기대',
    })
  } else {
    recommendations.push({
      area: '생산계획',
      action: '예측값을 보조 참고자료로만 활용하고, 담당자 판단을 우선하세요',
      priority: 'medium',
      reason: `R²=${r2Pct}%로 단독 의사결정에는 부족`,
    })
  }

  recommendations.push({
    area: '오차 상위 제품 관리',
    action: `오차 상위 ${topErrors.length}개 제품은 AI 예측을 신뢰하지 말고, 담당자가 고객 정보·프로젝트 일정을 반영하여 수동 보정하세요`,
    priority: 'high',
    reason: `상위 5개 제품의 총 오차만 ${top5ErrorSum.toFixed(0)}개`,
  })

  if (metrics.tolerance_5_rate >= 30) {
    recommendations.push({
      area: '자동화 검토',
      action: '±5 이내 정확 예측 제품군부터 자동 발주·생산계획 연동 파일럿을 시작하세요',
      priority: 'medium',
      reason: `적중률 ${metrics.tolerance_5_rate.toFixed(0)}% 제품군은 자동화 적합`,
    })
  }

  if (zeroActualCount > 0) {
    recommendations.push({
      area: '모델 개선',
      action: '수주 유무를 먼저 분류하는 2-Stage 모델(분류→회귀) 도입을 검토하세요',
      priority: 'medium',
      reason: `실제 수주 0인데 예측한 건 ${zeroActualCount}건 — 불필요한 생산/발주 위험`,
    })
  }

  recommendations.push({
    area: '모니터링',
    action: '매주/매월 이 보고서를 생성하여 예측 정확도 추이를 추적하세요',
    priority: 'low',
    reason: '시간 경과에 따른 모델 성능 변화를 조기에 감지',
  })

  return {
    summary,
    r2_explanation,
    mae_explanation,
    rmse_explanation,
    tolerance_explanation,
    mape_explanation,
    error_pattern: error_pattern + (zero_actual_comment ? ' ' + zero_actual_comment : ''),
    product_analysis,
    business_insights,
    recommendations,
  }
}

/* ─── 기간 → 날짜 범위 변환 (by-period에서 재사용) ─────────────────────────── */
function parsePeriodToDateRange(type: string, period: string) {
  if (type === 'monthly') {
    const [y, m] = period.split('-').map(Number)
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`
    const nextMonth = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1)
    const endDate = nextMonth.toISOString().slice(0, 10)
    return { startDate, endDate }
  }
  const match = period.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null
  const year = parseInt(match[1]), week = parseInt(match[2])
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const mondayOfWeek1 = new Date(jan4)
  mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1)
  const targetMonday = new Date(mondayOfWeek1)
  targetMonday.setDate(mondayOfWeek1.getDate() + (week - 1) * 7)
  const targetSunday = new Date(targetMonday)
  targetSunday.setDate(targetMonday.getDate() + 7)
  return {
    startDate: targetMonday.toISOString().slice(0, 10),
    endDate: targetSunday.toISOString().slice(0, 10),
  }
}

/* ─── GET: 저장된 보고서 조회 ──────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'weekly'
  const period = req.nextUrl.searchParams.get('period') ?? ''
  const modelId = type === 'monthly' ? 'lgbm_q_monthly_v1' : 'lgbm_q_v2'

  if (!period) {
    return NextResponse.json({ error: 'period parameter required' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('evaluation_report')
      .select('*')
      .eq('model_id', modelId)
      .eq('period_type', type)
      .eq('period_key', period)
      .single()

    if (error && error.code !== 'PGRST116') throw error  // PGRST116 = no rows

    return NextResponse.json({ report: data ?? null })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 })
  }
}

/* ─── POST: 보고서 생성·저장 ──────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const type = body.type ?? 'weekly'
    const period = body.period ?? ''
    const modelId = type === 'monthly' ? 'lgbm_q_monthly_v1' : 'lgbm_q_v2'

    if (!period) {
      return NextResponse.json({ error: 'period required' }, { status: 400 })
    }

    // 1. 기간 파싱
    const range = parsePeriodToDateRange(type, period)
    if (!range) {
      return NextResponse.json({ error: 'Invalid period format' }, { status: 400 })
    }

    // 2. forecast_result 조회
    const { data: rows, error: fetchErr } = await supabase
      .from('forecast_result')
      .select('product_id, p50, actual_qty')
      .eq('model_id', modelId)
      .gte('target_date', range.startDate)
      .lt('target_date', range.endDate)
      .not('actual_qty', 'is', null)

    if (fetchErr) throw fetchErr

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: '해당 기간에 예측 데이터가 없습니다' }, { status: 404 })
    }

    // 3. 지표 계산
    const errors = rows.map(r => ({
      pid: r.product_id,
      pred: r.p50,
      actual: r.actual_qty,
      error: Math.abs(r.p50 - r.actual_qty),
      sqError: (r.p50 - r.actual_qty) ** 2,
    }))

    const n = errors.length
    const mae = errors.reduce((s, e) => s + e.error, 0) / n
    const mse = errors.reduce((s, e) => s + e.sqError, 0) / n
    const rmse = Math.sqrt(mse)
    const meanActual = errors.reduce((s, e) => s + e.actual, 0) / n
    const ssTot = errors.reduce((s, e) => s + (e.actual - meanActual) ** 2, 0)
    const ssRes = errors.reduce((s, e) => s + e.sqError, 0)
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
    const nonZero = errors.filter(e => e.actual !== 0)
    const mape = nonZero.length > 0
      ? nonZero.reduce((s, e) => s + e.error / Math.abs(e.actual), 0) / nonZero.length * 100
      : 0
    const within5 = errors.filter(e => e.error <= 5).length
    const tolerance_5_rate = (within5 / n) * 100
    const uniqueProducts = new Set(errors.map(e => e.pid))

    const sorted = [...errors].sort((a, b) => b.error - a.error)
    const topError = sorted.slice(0, 10).map(e => ({
      product_id: e.pid,
      predicted: Math.round(e.pred * 10) / 10,
      actual: Math.round(e.actual * 10) / 10,
      error: Math.round(e.error * 10) / 10,
    }))
    const topAccurate = sorted.slice(-10).reverse().map(e => ({
      product_id: e.pid,
      predicted: Math.round(e.pred * 10) / 10,
      actual: Math.round(e.actual * 10) / 10,
      error: Math.round(e.error * 10) / 10,
    }))

    const metrics = {
      mae: Math.round(mae * 100) / 100,
      rmse: Math.round(rmse * 100) / 100,
      r2: Math.round(r2 * 10000) / 10000,
      mape: Math.round(mape * 100) / 100,
      tolerance_5_rate: Math.round(tolerance_5_rate * 100) / 100,
    }

    // 4. 인사이트 생성
    const insightResult = generateInsights(
      metrics, topError, topAccurate,
      uniqueProducts.size, n, type, period,
    )

    // 5. DB UPSERT
    const reportRow = {
      model_id: modelId,
      period_type: type,
      period_key: period,
      date_start: range.startDate,
      date_end: range.endDate,
      n_products: uniqueProducts.size,
      n_records: n,
      mae: metrics.mae,
      rmse: metrics.rmse,
      r2: metrics.r2,
      mape: metrics.mape,
      tolerance_5_rate: metrics.tolerance_5_rate,
      top_error_products: topError,
      top_accurate_products: topAccurate,
      insights: {
        summary: insightResult.summary,
        r2_explanation: insightResult.r2_explanation,
        mae_explanation: insightResult.mae_explanation,
        rmse_explanation: insightResult.rmse_explanation,
        tolerance_explanation: insightResult.tolerance_explanation,
        mape_explanation: insightResult.mape_explanation,
        error_pattern: insightResult.error_pattern,
        product_analysis: insightResult.product_analysis,
        business_insights: insightResult.business_insights,
      },
      recommendations: insightResult.recommendations,
      updated_at: new Date().toISOString(),
    }

    const { data: upserted, error: upsertErr } = await supabase
      .from('evaluation_report')
      .upsert(reportRow, { onConflict: 'model_id,period_type,period_key' })
      .select()
      .single()

    if (upsertErr) throw upsertErr

    return NextResponse.json({ report: upserted })
  } catch (err: any) {
    console.error('[API] report error:', err)
    return NextResponse.json({ error: err.message ?? String(err) }, { status: 500 })
  }
}
