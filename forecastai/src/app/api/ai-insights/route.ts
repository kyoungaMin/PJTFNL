import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

let cache: { insights: InsightItem[]; generatedAt: number } | null = null
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const SYSTEM_BASE_DATE = '2026-02-28'

interface InsightItem {
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple'
  text: string
}

interface DashboardInsightData {
  thisMonthQty: number
  lastMonthQty: number
  momOrderRate: string
  coverageDays: number
  pendingPO: number
  currentFxUSD: number | null
  fxChangeRate: string | null
  dataDate: string
}

async function collectDashboardData(): Promise<DashboardInsightData> {
  const now = new Date(`${SYSTEM_BASE_DATE}T00:00:00`)
  const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10)

  const { data: monthRows } = await supabase
    .rpc('get_order_monthly_summary', { p_from_date: twoMonthsAgoStart })

  const monthMap: Record<string, number> = {}
  for (const row of monthRows ?? []) {
    monthMap[String(row.ym)] = Number(row.total_qty ?? 0)
  }

  const thisMonthYm = now.toISOString().slice(0, 7)
  const lastMonthYm = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)
  const twoMonthsYm = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 7)

  const thisMonthQty = monthMap[thisMonthYm] ?? 0
  const lastMonthQty = monthMap[lastMonthYm] ?? 0
  const twoMonthsQty = monthMap[twoMonthsYm] ?? 0
  const momOrderRate = lastMonthQty > 0 && twoMonthsQty > 0
    ? (((lastMonthQty - twoMonthsQty) / twoMonthsQty) * 100).toFixed(1)
    : '0'

  const thirtyAgo = new Date(now)
  thirtyAgo.setDate(thirtyAgo.getDate() - 30)

  const { data: covRows } = await supabase.rpc('get_inventory_coverage', {
    p_from_date: thirtyAgo.toISOString().slice(0, 10),
    p_to_date: now.toISOString().slice(0, 10),
  })

  const covRow = covRows?.[0]
  const totalInv = Number(covRow?.total_inv_qty ?? 0)
  const demand30 = Number(covRow?.total_order_qty ?? 0)
  const dailyAvg = demand30 / 30
  const coverageDays = dailyAvg > 0 ? Math.round(totalInv / dailyAvg) : 0

  const { count: pendingPO } = await supabase
    .from('purchase_order')
    .select('*', { count: 'exact', head: true })
    .in('status', ['R', 'P'])

  const thirtyAgoDate = new Date(now)
  thirtyAgoDate.setDate(thirtyAgoDate.getDate() - 30)

  const { data: latestRate } = await supabase
    .from('exchange_rate')
    .select('rate, rate_date')
    .eq('base_currency', 'USD')
    .order('rate_date', { ascending: false })
    .limit(1)

  const { data: oldRate } = await supabase
    .from('exchange_rate')
    .select('rate')
    .eq('base_currency', 'USD')
    .lte('rate_date', thirtyAgoDate.toISOString().slice(0, 10))
    .order('rate_date', { ascending: false })
    .limit(1)

  const currentFxUSD = latestRate?.[0]?.rate ? Number(latestRate[0].rate) : null
  const oldFx = oldRate?.[0]?.rate ? Number(oldRate[0].rate) : null
  const fxChangeRate = currentFxUSD && oldFx
    ? (((currentFxUSD - oldFx) / oldFx) * 100).toFixed(1)
    : null

  return {
    thisMonthQty: Math.round(thisMonthQty),
    lastMonthQty: Math.round(lastMonthQty),
    momOrderRate,
    coverageDays,
    pendingPO: pendingPO ?? 0,
    currentFxUSD,
    fxChangeRate,
    dataDate: now.toISOString().slice(0, 10),
  }
}

function buildRuleBasedInsights(data: DashboardInsightData): InsightItem[] {
  const thisMonthText = data.thisMonthQty.toLocaleString()
  const lastMonthText = data.lastMonthQty.toLocaleString()
  const orderDiff = data.thisMonthQty - data.lastMonthQty
  const orderDirection = orderDiff > 0 ? '증가' : orderDiff < 0 ? '감소' : '유지'
  const orderColor: InsightItem['color'] = orderDiff > 0 ? 'blue' : orderDiff < 0 ? 'amber' : 'green'

  const coverageColor: InsightItem['color'] =
    data.coverageDays === 0 ? 'amber' :
    data.coverageDays < 14 ? 'red' :
    data.coverageDays <= 28 ? 'green' :
    'purple'

  const coverageText =
    data.coverageDays === 0
      ? '최근 30일 수요 기준 커버리지를 계산할 수 없습니다. 최근 주문 집계와 재고 데이터 적재 상태를 함께 확인해 주세요.'
      : data.coverageDays < 14
        ? `재고 커버리지가 ${data.coverageDays}일로 짧습니다. 단납기 품목과 안전재고 하회 SKU를 우선 점검하는 편이 좋습니다.`
        : data.coverageDays <= 28
          ? `재고 커버리지가 ${data.coverageDays}일로 목표 범위에 가깝습니다. 위험 품목 중심의 미세 조정 위주로 운영해도 무리가 적습니다.`
          : `재고 커버리지가 ${data.coverageDays}일로 넉넉합니다. 저회전 품목은 과잉 재고로 전환되지 않도록 감산 후보를 같이 보시는 편이 좋습니다.`

  const poColor: InsightItem['color'] =
    data.pendingPO >= 20 ? 'red' :
    data.pendingPO >= 10 ? 'amber' :
    'green'

  const poText =
    data.pendingPO > 0
      ? `미처리 구매발주가 ${data.pendingPO}건 남아 있습니다. 결품 위험 SKU와 겹치는 발주 건부터 납기 확인을 우선 진행하세요.`
      : '현재 미처리 구매발주가 없습니다. 긴급 발주보다 기존 재고와 생산 계획 재배치에 집중할 수 있는 상태입니다.'

  const fxDelta = data.fxChangeRate == null ? null : Number(data.fxChangeRate)
  const fxColor: InsightItem['color'] =
    fxDelta == null ? 'green' :
    fxDelta >= 3 ? 'red' :
    fxDelta <= -3 ? 'blue' :
    'amber'

  const fxText =
    data.currentFxUSD == null
      ? '환율 데이터가 없어 원가 영향 판단을 생략했습니다. 환율 적재 상태를 먼저 확인해 주세요.'
      : fxDelta == null
        ? `USD/KRW 환율은 ${data.currentFxUSD.toLocaleString()}원 수준입니다. 최근 비교 데이터가 없어 절대 수준 기준으로만 모니터링 중입니다.`
        : `USD/KRW 환율은 ${data.currentFxUSD.toLocaleString()}원이고 최근 30일 대비 ${data.fxChangeRate}% 변동했습니다. 수입 원재료 비중이 큰 품목은 단가와 발주 시점을 함께 점검하세요.`

  return [
    {
      color: orderColor,
      text: `당월 수주량은 ${thisMonthText} EA로 전월 ${lastMonthText} EA 대비 ${orderDirection} 흐름입니다. 생산 우선순위는 최근 수주 변화가 큰 품목부터 재확인하는 편이 좋습니다.`,
    },
    {
      color: orderDiff >= 0 ? 'green' : 'amber',
      text: `전월 기준 수주 증감률은 ${data.momOrderRate}%입니다. 급격한 변동 구간에서는 고정 생산량보다 주간 재조정 주기를 짧게 가져가는 편이 안정적입니다.`,
    },
    {
      color: coverageColor,
      text: coverageText,
    },
    {
      color: poColor,
      text: poText,
    },
    {
      color: fxColor,
      text: fxText,
    },
  ]
}

async function callGPT(data: DashboardInsightData): Promise<InsightItem[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')

  const prompt = `
당신은 반도체 부품소재 제조업체의 생산계획과 구매를 위한 AI 어시스턴트입니다.
아래 실제 운영 데이터를 분석하여 생산계획팀이 바로 사용할 수 있는 짧은 인사이트 5개를 작성해 주세요.

[기준일]: ${data.dataDate}

[데이터 요약]
- 당월 누적 수주량: ${data.thisMonthQty.toLocaleString()} EA
- 전월 수주량: ${data.lastMonthQty.toLocaleString()} EA
- 전월 기준 수주 증감률: ${data.momOrderRate}%
- 현재 재고 커버리지: ${data.coverageDays}일
- 미처리 구매발주 건수: ${data.pendingPO}건
- 현재 USD/KRW 환율: ${data.currentFxUSD ? `${data.currentFxUSD.toLocaleString()}원` : '데이터 없음'}
- 최근 30일 환율 변화: ${data.fxChangeRate != null ? `${data.fxChangeRate}%` : '데이터 없음'}

[출력 규칙]
- 반드시 JSON 배열만 반환
- 총 5개 인사이트
- color는 blue/red/amber/green/purple 중 하나
- text는 1~2문장, 숫자를 포함하고 실행 가능한 표현 사용

[JSON 형식]
[
  {"color": "blue", "text": "..."},
  {"color": "red", "text": "..."}
]
`.trim()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${err}`)
  }

  const json = await response.json()
  const raw = json.choices?.[0]?.message?.content ?? '[]'

  let parsed: any = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    const key = Object.keys(parsed).find((item) => Array.isArray(parsed[item]))
    parsed = key ? parsed[key] : []
  }

  const allowed = ['blue', 'red', 'amber', 'green', 'purple']
  return (parsed as any[]).slice(0, 5).map((item: any) => ({
    color: allowed.includes(item.color) ? item.color : 'blue',
    text: String(item.text ?? ''),
  })) as InsightItem[]
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        insights: cache.insights,
        source: 'cache',
        generatedAt: `${SYSTEM_BASE_DATE}T00:00:00`,
      })
    }

    const data = await collectDashboardData()

    if (!process.env.OPENAI_API_KEY) {
      const insights = buildRuleBasedInsights(data)
      cache = { insights, generatedAt: Date.now() }
      return NextResponse.json({
        insights,
        source: 'rule-based',
        generatedAt: `${SYSTEM_BASE_DATE}T00:00:00`,
      })
    }

    const insights = await callGPT(data)
    if (insights.length === 0) throw new Error('GPT returned an empty insight set.')

    cache = { insights, generatedAt: Date.now() }
    return NextResponse.json({
      insights,
      source: 'gpt',
      generatedAt: `${SYSTEM_BASE_DATE}T00:00:00`,
    })
  } catch (err: any) {
    console.error('[AI-Insights] error:', err.message)

    try {
      const data = await collectDashboardData()
      const insights = buildRuleBasedInsights(data)
      return NextResponse.json(
        {
          insights,
          source: 'rule-based',
          generatedAt: `${SYSTEM_BASE_DATE}T00:00:00`,
          error: err.message,
        },
        { status: 200 }
      )
    } catch (fallbackErr: any) {
      console.error('[AI-Insights] fallback error:', fallbackErr.message)
    }

    return NextResponse.json(
      {
        insights: [
          { color: 'amber', text: 'AI 인사이트를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
        ],
        source: 'error',
        error: err.message,
      },
      { status: 200 }
    )
  }
}
