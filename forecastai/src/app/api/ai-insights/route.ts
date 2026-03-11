import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// ─── 인메모리 캐시 (서버 재시작 전까지 유지, 6시간마다 갱신) ────────────────
// GPT 호출은 비용이 발생하므로 매 요청마다 호출하지 않고 캐싱
let cache: { insights: InsightItem[]; generatedAt: number } | null = null
const CACHE_TTL_MS = 6 * 60 * 60 * 1000  // 6시간

interface InsightItem {
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple'
  text: string
}

// ─── DB에서 실데이터 수집 ──────────────────────────────────────────────────────
async function collectDashboardData() {
  const now = new Date()

  // 1. 최근 3개월 수주량 (이번달 / 저번달 / 전전달)
  // ⚠️ daily_order 직접 조회 → limit=1000에 걸려 월 수주량 과소 계산
  //    → get_order_monthly_summary RPC로 해결 (DB/23_order_monthly_rpc.sql)
  const twoMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10)

  const { data: monthRows } = await supabase
    .rpc('get_order_monthly_summary', { p_from_date: twoMonthsAgoStart })

  const monthMap: Record<string, number> = {}
  for (const r of (monthRows ?? [])) monthMap[String(r.ym)] = Number(r.total_qty ?? 0)

  const thisMonthYm  = now.toISOString().slice(0, 7)
  const lastMonthYm  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)
  const twoMonthsYm  = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 7)

  const thisMonthQty = monthMap[thisMonthYm] ?? 0
  const lastMonthQty = monthMap[lastMonthYm] ?? 0
  const twoMonthsQty = monthMap[twoMonthsYm] ?? 0

  // 전월 대비 증감률
  const momOrderRate = lastMonthQty > 0 && twoMonthsQty > 0
    ? (((lastMonthQty - twoMonthsQty) / twoMonthsQty) * 100).toFixed(1)
    : '0'

  // 2. 재고 커버리지 (최신 스냅샷)
  // ⚠️ inventory(617,720행) + daily_order 직접 조회 → limit=1000에 걸려 오계산
  //    → get_inventory_coverage RPC로 해결 (DB/24_coverage_rpc.sql)
  let coverageDays = 0
  const thirtyAgo = new Date(now)
  thirtyAgo.setDate(thirtyAgo.getDate() - 30)

  const { data: covRows } = await supabase
    .rpc('get_inventory_coverage', {
      p_from_date: thirtyAgo.toISOString().slice(0, 10),
      p_to_date:   now.toISOString().slice(0, 10),
    })

  const covRow   = covRows?.[0]
  const totalInv = Number(covRow?.total_inv_qty   ?? 0)
  const demand30 = Number(covRow?.total_order_qty ?? 0)
  const dailyAvg = demand30 / 30
  coverageDays   = dailyAvg > 0 ? Math.round(totalInv / dailyAvg) : 0

  // 3. 미처리 구매 발주 건수
  const { count: pendingPO } = await supabase
    .from('purchase_order')
    .select('*', { count: 'exact', head: true })
    .in('status', ['R', 'P'])

  // 4. 최근 USD/KRW 환율 (최근 1일 vs 30일 전)
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

  const currentFx   = latestRate?.[0]?.rate ? Number(latestRate[0].rate) : null
  const oldFx       = oldRate?.[0]?.rate ? Number(oldRate[0].rate) : null
  const fxChangeRate = currentFx && oldFx
    ? (((currentFx - oldFx) / oldFx) * 100).toFixed(1)
    : null

  return {
    thisMonthQty:     Math.round(thisMonthQty),
    lastMonthQty:     Math.round(lastMonthQty),
    momOrderRate,
    coverageDays,
    pendingPO:        pendingPO ?? 0,
    currentFxUSD:     currentFx,
    fxChangeRate,
    dataDate:         now.toISOString().slice(0, 10),
  }
}

// ─── GPT 호출 ──────────────────────────────────────────────────────────────────
async function callGPT(data: Awaited<ReturnType<typeof collectDashboardData>>): Promise<InsightItem[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.')

  const prompt = `
당신은 반도체 부품·소재 제조업체의 생산계획팀을 위한 AI 어시스턴트입니다.
아래 실제 운영 데이터를 분석하여 생산계획팀이 즉시 활용할 수 있는 핵심 인사이트 5개를 작성해주세요.

[오늘 날짜]: ${data.dataDate}

[실데이터 요약]
- 이번 달 누적 수주량: ${data.thisMonthQty.toLocaleString()} EA
- 전월 수주량: ${data.lastMonthQty.toLocaleString()} EA
- 전전월 대비 전월 수주 증감률: ${data.momOrderRate}%
- 현재 재고 커버리지: ${data.coverageDays}일 (목표: 21일)
- 미처리 구매 발주 건수: ${data.pendingPO}건
- 현재 USD/KRW 환율: ${data.currentFxUSD ? `${data.currentFxUSD.toLocaleString()}원` : '데이터 없음'}
- 최근 30일 환율 변동: ${data.fxChangeRate != null ? `${data.fxChangeRate}%` : '데이터 없음'}

[출력 규칙]
- 반드시 아래 JSON 배열 형식으로만 답변 (다른 텍스트 절대 금지)
- 총 5개 인사이트
- color는 blue/red/amber/green/purple 중 하나 (중요도·감정에 따라 선택)
- text는 한국어 1~2문장, 구체적 수치 포함, 생산계획팀이 바로 쓸 수 있는 내용
- text에 HTML 태그 사용 금지, 수치 강조는 텍스트로 표현

[JSON 형식]
[
  {"color": "blue", "text": "..."},
  {"color": "red", "text": "..."},
  {"color": "amber", "text": "..."},
  {"color": "green", "text": "..."},
  {"color": "purple", "text": "..."}
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
      temperature: 0.4,       // 낮을수록 일관성 있는 분석
      max_tokens: 800,
      response_format: { type: 'json_object' },  // JSON 모드 강제
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API 오류: ${response.status} — ${err}`)
  }

  const json = await response.json()
  const raw  = json.choices?.[0]?.message?.content ?? '[]'

  // JSON 파싱 — GPT가 배열을 객체로 감쌀 수 있어 양쪽 처리
  let parsed: any = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    // { insights: [...] } 형태로 감싸서 올 경우 처리
    const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]))
    parsed = key ? parsed[key] : []
  }

  // color 값 검증 — 허용 목록 외 값이면 'blue'로 교체
  const allowed = ['blue', 'red', 'amber', 'green', 'purple']
  return (parsed as any[]).slice(0, 5).map((item: any) => ({
    color: allowed.includes(item.color) ? item.color : 'blue',
    text:  String(item.text ?? ''),
  })) as InsightItem[]
}

// ─── GET 핸들러 ───────────────────────────────────────────────────────────────
export async function GET() {
  try {
    // 캐시 유효 시 바로 반환
    if (cache && Date.now() - cache.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        insights:    cache.insights,
        source:      'cache',
        generatedAt: new Date(cache.generatedAt).toISOString(),
      })
    }

    // DB 실데이터 수집
    const data = await collectDashboardData()

    // GPT 호출
    const insights = await callGPT(data)

    // 빈 배열 캐시 방지 — GPT가 빈 응답을 반환하면 캐시하지 않고 에러 처리
    if (insights.length === 0) throw new Error('GPT가 빈 인사이트를 반환했습니다.')

    // 캐시 저장
    cache = { insights, generatedAt: Date.now() }

    return NextResponse.json({
      insights,
      source:      'gpt',
      generatedAt: new Date(cache.generatedAt).toISOString(),
    })
  } catch (err: any) {
    console.error('[AI-Insights] 오류:', err.message)

    // GPT 실패 시 기본 폴백 반환 (UI가 빈 화면이 되지 않도록)
    return NextResponse.json(
      {
        insights: [
          { color: 'amber', text: 'AI 인사이트를 불러오는 중 오류가 발생했습니다. 잠시 후 새로고침 해주세요.' },
        ],
        source: 'error',
        error:  err.message,
      },
      { status: 200 }  // 프론트가 에러 처리하기 쉽도록 200 반환
    )
  }
}
