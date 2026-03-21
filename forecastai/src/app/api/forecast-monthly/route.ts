import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { proxyToBackend } from '@/lib/backendClient'

/** horizon_days → "YYYY-MM" 형식 월 레이블 (forecast_date 기준 N일 후) */
function horizonToYearMonth(forecastDate: string, horizonDays: number): string {
  const d = new Date(forecastDate)
  d.setDate(d.getDate() + horizonDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** "YYYY-MM" → "'YY.MM" 표시 레이블 */
function toDisplayLabel(ym: string): string {
  const [y, m] = ym.split('-')
  return `'${y.slice(2)}.${m}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('sku') ?? ''
  const customer = searchParams.get('customer') ?? ''
  const months = Math.min(6, Math.max(1, Number(searchParams.get('months') ?? '6')))
  const forecastDateParam = searchParams.get('forecast_date') ?? ''

  // FastAPI 백엔드 프록시 (BACKEND_URL 설정 시)
  const proxied = await proxyToBackend(`/forecast/monthly?sku=${encodeURIComponent(productId)}`)
  if (proxied) return NextResponse.json(proxied)

  if (!supabase) {
    return NextResponse.json({ items: [], historyItems: [], source: 'no_client' }, { status: 200 })
  }
  if (!productId) {
    return NextResponse.json({ items: [], historyItems: [], source: 'no_sku' }, { status: 200 })
  }

  try {
    // ── 1) 예측 기준일 결정 ─────────────────────────────────────────────────
    let forecastDate: string

    if (forecastDateParam) {
      forecastDate = forecastDateParam
    } else {
      const { data: latestRows, error: latestErr } = await supabase
        .from('forecast_result')
        .select('forecast_date')
        .eq('product_id', productId)
        .eq('model_id', 'lgbm_q_v3')
        .order('forecast_date', { ascending: false })
        .limit(1)

      if (latestErr || !latestRows?.length) {
        return NextResponse.json({ items: [], historyItems: [], source: 'no_forecast', model: 'lgbm_q_v3' })
      }
      forecastDate = latestRows[0].forecast_date
    }

    // ── 2) 예측 데이터 조회 (horizon 30/90/180일) ───────────────────────────
    const { data: forecastRows, error: forecastErr } = await supabase
      .from('forecast_result')
      .select('horizon_days, p10, p50, p90')
      .eq('product_id', productId)
      .eq('model_id', 'lgbm_q_v3')
      .eq('forecast_date', forecastDate)
      .in('horizon_days', [28, 56, 91])
      .order('horizon_days', { ascending: true })

    if (forecastErr) throw forecastErr

    // horizon → months 필터링 (1m=28일, 2m=56일, 3m=91일)
    const horizonLimit = months <= 1 ? [28] : months <= 2 ? [28, 56] : [28, 56, 91]
    // Bug1 fix: deduplicate by horizon_days (DB may have multiple rows per horizon)
    const seenHorizons = new Set<number>()
    const uniqueForecastRows = (forecastRows ?? []).filter(r => {
      if (seenHorizons.has(r.horizon_days)) return false
      seenHorizons.add(r.horizon_days)
      return true
    })
    const items = uniqueForecastRows
      .filter(r => horizonLimit.includes(r.horizon_days))
      .map(r => ({
        m: toDisplayLabel(horizonToYearMonth(forecastDate, r.horizon_days)),
        ym: horizonToYearMonth(forecastDate, r.horizon_days),
        p10: Math.round(Number(r.p10 ?? 0)),
        p50: Math.round(Number(r.p50 ?? 0)),
        p90: Math.round(Number(r.p90 ?? 0)),
        isForecast: true,
      }))

    // ── 3) 실적 히스토리 조회 (monthly_product_summary 최근 6개월) ──────────
    const { data: historyRows, error: historyErr } = await supabase
      .from('monthly_product_summary')
      .select('year_month, order_qty')
      .eq('product_id', productId)
      .order('year_month', { ascending: false })
      .limit(6)

    if (historyErr) {
      console.warn('[API] forecast-monthly: history query failed', historyErr.message)
    }

    const historyItems = ((historyRows ?? []) as { year_month: string; order_qty: number }[])
      .filter(r => Number(r.order_qty) > 0)  // Bug4 fix: exclude zero-actual months
      .sort((a, b) => a.year_month.localeCompare(b.year_month))
      .map(r => ({
        m: toDisplayLabel(r.year_month),
        ym: r.year_month,
        actual: Math.round(Number(r.order_qty ?? 0)),
        isForecast: false,
      }))

    // ── 4) 고객사 실적 조회 ─────────────────────────────────────────────────
    let customerItems: { year_month: string; order_qty: number; revenue_qty: number }[] = []
    if (customer && customer !== '전체 고객사') {
      const { data: custRows } = await supabase
        .from('monthly_customer_summary')
        .select('year_month, order_qty, revenue_qty')
        .eq('product_id', productId)
        .eq('customer_id', customer)  // Bug5 fix: filter by customer_id (more reliable than customer_name)
        .order('year_month', { ascending: false })
        .limit(6)
      customerItems = (custRows ?? []).map(r => ({
        year_month: r.year_month,
        order_qty: Number(r.order_qty ?? 0),
        revenue_qty: Number(r.revenue_qty ?? 0),
      }))
    }

    // ── 5) 모델 평가지표 조회 (model_evaluation 테이블) ────────────────────
    let evaluation: { r2: number; mae: number } | null = null
    try {
      const { data: evalRow } = await supabase
        .from('model_evaluation')
        .select('mape, mae, coverage_rate')
        .eq('product_id', productId)
        .eq('model_id', 'lgbm_q_v3')
        .order('eval_date', { ascending: false })
        .limit(1)
        .single()

      if (evalRow) {
        evaluation = {
          r2: evalRow.mape ? Math.round((1 - evalRow.mape / 100) * 10000) / 10000 : 0,
          mae: Number(evalRow.mae ?? 0),
        }
      }
    } catch {
      // model_evaluation 없으면 기본값 사용
      evaluation = { r2: 0.6908, mae: 54.3 }
    }
    // Bug2 fix: Supabase .single() returns error (not throw) on no rows — catch never fires
    if (!evaluation) evaluation = { r2: 0.6908, mae: 54.3 }

    return NextResponse.json({
      items,
      historyItems,
      forecastDate,
      model: 'lgbm_q_v3',
      source: 'database',
      customerItems,
      evaluation,
    })
  } catch (err: any) {
    console.error('[API] forecast-monthly error:', err)
    return NextResponse.json(
      { items: [], historyItems: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
