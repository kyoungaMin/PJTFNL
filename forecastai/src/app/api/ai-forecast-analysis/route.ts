import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ─── 캐시 (SKU별, 12시간 유효) ────────────────────────────────────────────────
const cache = new Map<string, { result: AnalysisResult; generatedAt: number }>()
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

export interface AnalysisItem {
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple'
  title: string
  text: string
}

interface AnalysisResult {
  items: AnalysisItem[]
  skuId: string
  generatedAt: string
  source: 'gpt' | 'cache' | 'error'
}

// ─── 데이터 수집 ──────────────────────────────────────────────────────────────

async function collectForecastData(productId: string, model: 'weekly' | 'monthly') {
  const modelId = model === 'weekly' ? 'lgbm_q_v4' : 'lgbm_q_monthly_v2'
  const horizons = model === 'weekly' ? [7, 14, 28] : [30, 90, 180]

  // 1. 최신 예측 날짜
  const { data: dateRow } = await supabase
    .from('forecast_result')
    .select('forecast_date')
    .eq('product_id', productId)
    .eq('model_id', modelId)
    .order('forecast_date', { ascending: false })
    .limit(1)

  const forecastDate = dateRow?.[0]?.forecast_date
  if (!forecastDate) return null

  // 2. 예측값 (P10/P50/P90)
  const { data: forecastRows } = await supabase
    .from('forecast_result')
    .select('horizon_days, p10, p50, p90')
    .eq('product_id', productId)
    .eq('model_id', modelId)
    .eq('forecast_date', forecastDate)
    .in('horizon_days', horizons)

  // 중복 제거 (horizon별 최초 1건)
  const seen = new Set<number>()
  const forecasts: { horizon: number; p10: number; p50: number; p90: number }[] = []
  for (const r of forecastRows ?? []) {
    if (!seen.has(r.horizon_days)) {
      seen.add(r.horizon_days)
      forecasts.push({ horizon: r.horizon_days, p10: r.p10, p50: r.p50, p90: r.p90 })
    }
  }

  // 3. 모델 평가지표
  const { data: evalRow } = await supabase
    .from('model_evaluation')
    .select('mape, mae, r2_score, coverage_rate')
    .eq('product_id', productId)
    .eq('model_id', modelId)
    .order('eval_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 4. 최근 실적 (주간: 8주, 월간: 6개월)
  let recentActuals: { period: string; qty: number }[] = []
  if (model === 'weekly') {
    const { data: actRows } = await supabase
      .from('weekly_product_summary')
      .select('week_start, order_qty')
      .eq('product_id', productId)
      .gt('order_qty', 0)
      .order('week_start', { ascending: false })
      .limit(8)
    recentActuals = (actRows ?? []).map(r => ({ period: r.week_start, qty: r.order_qty })).reverse()
  } else {
    const { data: actRows } = await supabase
      .from('monthly_product_summary')
      .select('year_month, order_qty')
      .eq('product_id', productId)
      .gt('order_qty', 0)
      .order('year_month', { ascending: false })
      .limit(6)
    recentActuals = (actRows ?? []).map(r => ({ period: r.year_month, qty: r.order_qty })).reverse()
  }

  // 5. 제품 정보
  const { data: prodRow } = await supabase
    .from('product_master')
    .select('product_name, product_specification')
    .eq('product_code', productId)
    .maybeSingle()

  return {
    forecastDate,
    forecasts,
    evaluation: evalRow,
    recentActuals,
    productName: prodRow?.product_name ?? productId,
    productSpec: prodRow?.product_specification ?? '',
    model,
  }
}

async function collectExternalIndicators() {
  const now = new Date()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10)

  // 환율 (USD/KRW)
  const { data: fxRows } = await supabase
    .from('exchange_rate')
    .select('rate_date, rate')
    .eq('base_currency', 'USD')
    .eq('quote_currency', 'KRW')
    .gte('rate_date', sixMonthsAgo)
    .order('rate_date', { ascending: false })
    .limit(60)

  const latestFx = fxRows?.[0]?.rate ? Number(fxRows[0].rate) : null
  const oldFx = fxRows?.[fxRows.length - 1]?.rate ? Number(fxRows[fxRows.length - 1].rate) : null
  const fxChange6m = latestFx && oldFx ? (((latestFx - oldFx) / oldFx) * 100).toFixed(1) : null

  // 경제지표 (기준금리)
  const { data: indRows } = await supabase
    .from('economic_indicator')
    .select('indicator_code, date, value')
    .in('indicator_code', ['KR_BASE_RATE', 'US_FED_RATE'])
    .order('date', { ascending: false })
    .limit(4)

  const krRate = indRows?.find(r => r.indicator_code === 'KR_BASE_RATE')?.value
  const usRate = indRows?.find(r => r.indicator_code === 'US_FED_RATE')?.value

  return {
    usdKrw: latestFx,
    usdKrwChange6m: fxChange6m,
    krBaseRate: krRate ? Number(krRate) : null,
    usFedRate: usRate ? Number(usRate) : null,
  }
}

// ─── GPT 호출 ─────────────────────────────────────────────────────────────────

async function callGPT(
  forecast: NonNullable<Awaited<ReturnType<typeof collectForecastData>>>,
  ext: Awaited<ReturnType<typeof collectExternalIndicators>>,
): Promise<AnalysisItem[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정')

  const horizonLabels = forecast.model === 'weekly'
    ? { 7: '1주', 14: '2주', 28: '4주' }
    : { 30: '1개월', 90: '3개월', 180: '6개월' }

  const forecastLines = forecast.forecasts.map(f => {
    const label = (horizonLabels as Record<number, string>)[f.horizon] ?? `${f.horizon}일`
    const bw = f.p50 > 0 ? Math.round((f.p90 - f.p10) / f.p50 * 100) : 0
    return `  - ${label}: P50=${f.p50.toLocaleString()} EA, P10=${f.p10.toLocaleString()}, P90=${f.p90.toLocaleString()}, 불확실성=${bw}%`
  }).join('\n')

  const actualLines = forecast.recentActuals.slice(-6).map(a =>
    `  - ${a.period}: ${a.qty.toLocaleString()} EA`
  ).join('\n')

  const trendDir = (() => {
    const vals = forecast.recentActuals.map(a => a.qty)
    if (vals.length < 2) return '데이터 부족'
    const diff = vals[vals.length - 1] - vals[0]
    return diff > 0 ? `상승 (+${((diff / vals[0]) * 100).toFixed(1)}%)` : `하락 (${((diff / vals[0]) * 100).toFixed(1)}%)`
  })()

  const evalText = forecast.evaluation
    ? `MAPE ${forecast.evaluation.mape?.toFixed(1)}%, MAE ${forecast.evaluation.mae?.toFixed(0)} EA, R² ${forecast.evaluation.r2_score?.toFixed(3)}, 커버리지 ${forecast.evaluation.coverage_rate?.toFixed(1)}%`
    : '평가 데이터 없음'

  const prompt = `
당신은 반도체 부품·소재 제조업체의 수요예측 전문 AI입니다.
아래 데이터를 분석하여 생산계획팀을 위한 핵심 인사이트 4개를 생성하세요.

[제품]
- ID: ${forecast.forecastDate ? `${forecast.recentActuals[0]?.period ?? ''}~${forecast.forecastDate}` : ''}
- 이름: ${forecast.productName}
- 규격: ${forecast.productSpec}
- 예측 기준일: ${forecast.forecastDate}

[${forecast.model === 'weekly' ? '주간' : '월간'} 수요 예측]
${forecastLines}

[최근 실적 추이]
${actualLines}
- 추세: ${trendDir}

[모델 성능]
${evalText}

[현재 외부 경제 지표]
- USD/KRW 환율: ${ext.usdKrw ? `${ext.usdKrw.toLocaleString()}원` : '데이터 없음'} (최근 6개월 변화: ${ext.usdKrwChange6m ? `${ext.usdKrwChange6m}%` : '미상'})
- 한국 기준금리: ${ext.krBaseRate != null ? `${ext.krBaseRate}%` : '데이터 없음'}
- 미국 기준금리: ${ext.usFedRate != null ? `${ext.usFedRate}%` : '데이터 없음'}

[분석 지침]
1. 실적 추이와 예측값 사이의 정합성 평가
2. 예측 불확실성(밴드폭)이 높은 경우 주요 리스크 설명
3. 환율·금리 등 외부지표가 이 제품 수요에 미칠 영향 분석
4. 생산계획팀이 즉시 취해야 할 조치 권고

[출력 규칙]
- 반드시 JSON 배열만 출력 (다른 텍스트 금지)
- 4개 인사이트, 각각 title(10자 이내)과 text(1~2문장, 구체적 수치 포함)
- color: blue(정보)/red(위험)/amber(주의)/green(긍정)/purple(외부요인)
- text에 HTML 금지

[JSON 형식]
[
  {"color": "blue", "title": "예측 정합성", "text": "..."},
  {"color": "amber", "title": "불확실성", "text": "..."},
  {"color": "purple", "title": "외부 영향", "text": "..."},
  {"color": "green", "title": "권고 조치", "text": "..."}
]
`.trim()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API 오류: ${response.status} — ${err}`)
  }

  const json = await response.json()
  const raw = json.choices?.[0]?.message?.content ?? '[]'
  let parsed: any = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]))
    parsed = key ? parsed[key] : []
  }

  const allowed = ['blue', 'red', 'amber', 'green', 'purple']
  return (parsed as any[]).slice(0, 4).map((item: any) => ({
    color: allowed.includes(item.color) ? item.color : 'blue',
    title: String(item.title ?? '분석'),
    text: String(item.text ?? ''),
  })) as AnalysisItem[]
}

// ─── GET 핸들러 ───────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('product_id')
  const model = (searchParams.get('model') ?? 'weekly') as 'weekly' | 'monthly'
  const refresh = searchParams.get('refresh') === '1'

  if (!productId) {
    return NextResponse.json({ error: 'product_id 파라미터 필요' }, { status: 400 })
  }

  const cacheKey = `${productId}__${model}`

  // 캐시 확인
  if (!refresh) {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({ ...cached.result, source: 'cache' })
    }
  }

  try {
    const [forecastData, extData] = await Promise.all([
      collectForecastData(productId, model),
      collectExternalIndicators(),
    ])

    if (!forecastData || forecastData.forecasts.length === 0) {
      return NextResponse.json({
        items: [{ color: 'amber', title: '데이터 없음', text: `${productId}의 ${model} 예측 데이터가 없습니다.` }],
        skuId: productId,
        generatedAt: new Date().toISOString(),
        source: 'error',
      })
    }

    const items = await callGPT(forecastData, extData)

    if (items.length === 0) throw new Error('GPT 빈 응답')

    const result: AnalysisResult = {
      items,
      skuId: productId,
      generatedAt: new Date().toISOString(),
      source: 'gpt',
    }

    cache.set(cacheKey, { result, generatedAt: Date.now() })

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[AI-Forecast-Analysis] 오류:', err.message)
    return NextResponse.json({
      items: [{ color: 'amber', title: '분석 오류', text: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }],
      skuId: productId,
      generatedAt: new Date().toISOString(),
      source: 'error',
      error: err.message,
    }, { status: 200 })
  }
}
