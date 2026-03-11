import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { proxyToBackend } from '@/lib/backendClient'

/** horizon_days → 주차 레이블 */
const HORIZON_LABEL: Record<number, string> = { 7: 'W1', 14: 'W2', 28: 'W4' }

/** 허용된 horizon 값 */
const VALID_HORIZONS = [7, 14, 28]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('sku') ?? ''
  const customerId = searchParams.get('customer') ?? ''
  const historyWeeks = Math.min(8, Math.max(1, parseInt(searchParams.get('history_weeks') ?? '4', 10)))
  const requestedDate = searchParams.get('forecast_date') ?? '' // 특정 기준 주차 (빈 값 = 최신)

  // horizons 파라미터 파싱 (예: "7,14,28" → [7, 14, 28])
  const horizonsParam = searchParams.get('horizons') ?? '7,14,28'
  const horizons = horizonsParam
    .split(',')
    .map(h => parseInt(h.trim(), 10))
    .filter(h => VALID_HORIZONS.includes(h))
  const validHorizons = horizons.length > 0 ? horizons : VALID_HORIZONS

  // FastAPI 백엔드 프록시 (BACKEND_URL 설정 시)
  const proxyPath =
    `/forecast/weekly?sku=${encodeURIComponent(productId)}` +
    (customerId ? `&customer=${encodeURIComponent(customerId)}` : '') +
    (requestedDate ? `&forecast_date=${encodeURIComponent(requestedDate)}` : '') +
    `&horizons=${validHorizons.join(',')}&history_weeks=${historyWeeks}`
  const proxied = await proxyToBackend(proxyPath)
  if (proxied) return NextResponse.json(proxied)

  if (!supabase) {
    return NextResponse.json({ items: [], source: 'no_client' }, { status: 200 })
  }
  if (!productId) {
    return NextResponse.json({ items: [], source: 'no_sku' }, { status: 200 })
  }

  try {
    // 1) forecast_date 결정: 지정 날짜 우선, 없으면 최신
    let forecastDate: string

    if (requestedDate) {
      forecastDate = requestedDate
    } else {
      const { data: latestRow, error: latestErr } = await supabase
        .from('forecast_result')
        .select('forecast_date')
        .eq('product_id', productId)
        .eq('model_id', 'lgbm_q_v2')
        .order('forecast_date', { ascending: false })
        .limit(1)
        .single()

      if (latestErr || !latestRow) {
        return NextResponse.json({ items: [], source: 'no_forecast', model: 'lgbm_q_v2' })
      }
      forecastDate = latestRow.forecast_date
    }

    // 2) 선택된 horizon 기준 예측 행 조회
    const { data: forecastRows, error: forecastErr } = await supabase
      .from('forecast_result')
      .select('horizon_days, p10, p50, p90')
      .eq('product_id', productId)
      .eq('model_id', 'lgbm_q_v2')
      .eq('forecast_date', forecastDate)
      .in('horizon_days', validHorizons)
      .order('horizon_days', { ascending: true })

    if (forecastErr) throw forecastErr

    // 3) 실적 조회 — 고객사 지정 시 weekly_customer_summary, 없으면 weekly_product_summary
    let actuals: { w: string; p50: number; p10: null; p90: null; actual: number }[] = []

    if (customerId) {
      const { data: customerRows } = await supabase
        .from('weekly_customer_summary')
        .select('week_start, order_qty')
        .eq('product_id', productId)
        .eq('customer_id', customerId)
        .order('week_start', { ascending: false })
        .limit(historyWeeks)

      actuals = (customerRows ?? [])
        .filter(r => Number(r.order_qty) > 0)
        .slice(0, historyWeeks)
        .reverse()
        .map((r, i, arr) => ({
          w: `W-${arr.length - i}`,
          p50: Number(r.order_qty ?? 0),
          p10: null,
          p90: null,
          actual: Number(r.order_qty ?? 0),
        }))
    } else {
      const { data: actualRows } = await supabase
        .from('weekly_product_summary')
        .select('week_start, order_qty')
        .eq('product_id', productId)
        .order('week_start', { ascending: false })
        .limit(historyWeeks)

      actuals = (actualRows ?? [])
        .filter(r => Number(r.order_qty) > 0)
        .slice(0, historyWeeks)
        .reverse()
        .map((r, i, arr) => ({
          w: `W-${arr.length - i}`,
          p50: Number(r.order_qty ?? 0),
          p10: null,
          p90: null,
          actual: Number(r.order_qty ?? 0),
        }))
    }

    // 4) 예측 행 변환 (horizon_days 기준 중복 제거)
    const seenHorizons = new Set<number>()
    const forecasts = (forecastRows ?? [])
      .filter(r => {
        if (seenHorizons.has(r.horizon_days)) return false
        seenHorizons.add(r.horizon_days)
        return true
      })
      .map(r => ({
        w: HORIZON_LABEL[r.horizon_days] ?? `W${Math.round(r.horizon_days / 7)}`,
        p10: Math.round(Number(r.p10 ?? 0)),
        p50: Math.round(Number(r.p50 ?? 0)),
        p90: Math.round(Number(r.p90 ?? 0)),
        actual: null as number | null,
      }))

    // 5) 모델 평가 지표 조회 (MAPE / coverage_rate / MAE)
    type EvalRow = { mape: number; coverage_rate: number; mae: number }
    const { data: evalRaw } = await supabase
      .from('model_evaluation')
      .select('mape, coverage_rate, mae')
      .eq('product_id', productId)
      .eq('model_id', 'lgbm_q_v2')
      .order('eval_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    const evalRow = evalRaw as unknown as EvalRow | null
    const evaluation = evalRow
      ? {
          mape: Math.round(Number(evalRow.mape ?? 0) * 10) / 10,
          coverageRate: Math.round(Number(evalRow.coverage_rate ?? 0) * 10) / 10,
          mae: Math.round(Number(evalRow.mae ?? 0)),
        }
      : null

    return NextResponse.json({
      items: [...actuals, ...forecasts],
      forecastDate,
      model: 'lgbm_q_v2',
      source: 'database',
      params: { customerId: customerId || null, horizons: validHorizons, historyWeeks },
      evaluation,
    })
  } catch (err: any) {
    console.error('[API] forecast-weekly error:', err)
    return NextResponse.json(
      { items: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
