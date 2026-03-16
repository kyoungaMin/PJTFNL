import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface ReportInput {
  targetWeek: string
  weekStart: string
  weekEnd: string
  weekOrderQty: number
  weekProducedQty: number
  weekOrderAmt: number
  changeRate: string | null
  coverageDays: number
  pendingPO: number
  riskSummary: Record<string, number>
  topActions: { product_id: string; action_type: string; priority: string; reason: string }[]
  forecastAccuracy: number | null
  topProducts: { product_id: string; order_qty: number }[]
}

async function callGPT(data: ReportInput) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.')

  const riskText = Object.entries(data.riskSummary)
    .filter(([, c]) => c > 0)
    .map(([g, c]) => `${g}등급 ${c}건`)
    .join(', ') || '데이터 없음'

  const actionsText = data.topActions.length > 0
    ? data.topActions.map(a => `${a.product_id}: ${a.action_type} (${a.priority}급) — ${a.reason}`).join('\n')
    : '없음'

  const topProductsText = data.topProducts.length > 0
    ? data.topProducts.map(p => `${p.product_id} ${p.order_qty.toLocaleString()}EA`).join(', ')
    : '데이터 없음'

  const changeText = data.changeRate != null
    ? ` (전주 대비 ${Number(data.changeRate) >= 0 ? '+' : ''}${data.changeRate}%)`
    : ''

  const prompt = `당신은 반도체 부품·소재 제조업체의 임원 보고서 작성 AI 어시스턴트입니다.
아래 실제 운영 데이터를 바탕으로 임원(C레벨)에게 보고하는 주간 보고서를 작성해주세요.

[보고 기간]: ${data.targetWeek} (${data.weekStart} ~ ${data.weekEnd})

[주간 실적 데이터]
- 주간 수주량: ${data.weekOrderQty.toLocaleString()} EA${changeText}
- 주간 생산량: ${data.weekProducedQty.toLocaleString()} EA
- 재고 커버리지: ${data.coverageDays}일 (목표 21일)
- 미처리 구매 발주: ${data.pendingPO}건
- 예측 정확도: ${data.forecastAccuracy != null ? `${data.forecastAccuracy}%` : '데이터 없음'}
- 리스크 현황: ${riskText}
- 주요 수주 품목 Top5: ${topProductsText}
- AI 권고 액션 (critical/high 우선순위):
${actionsText}

[출력 규칙]
- 반드시 아래 JSON 형식으로만 답변 (다른 텍스트 절대 금지)
- 한국어, 임원 보고서 톤 (간결하고 명확하게)
- summary: 이번 주 전체 흐름 요약 2~3문장 (핵심 수치 포함)
- changes: 주요 변화 3~5개 (각 항목 "- "로 시작, 구체적 수치 포함)
- risks: 리스크 항목 2~4개 (각 항목 "- "로 시작)
- actions: 추천 액션 2~4개 (각 항목 "- "로 시작, 구체적 조치 명시)

[JSON 형식]
{
  "summary": "...",
  "changes": ["- ...", "- ...", "- ..."],
  "risks": ["- ...", "- ..."],
  "actions": ["- ...", "- ..."]
}`.trim()

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
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API 오류: ${response.status} — ${err}`)
  }

  const json = await response.json()
  const raw = json.choices?.[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw)

  return {
    summary: String(parsed.summary ?? ''),
    changes: Array.isArray(parsed.changes) ? parsed.changes.map(String) : [],
    risks:   Array.isArray(parsed.risks)   ? parsed.risks.map(String)   : [],
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
  }
}

// ─── 날짜 유틸 ───────────────────────────────────────────────────────────────
// ISO 주 번호 계산 (week_start_date = 월요일 기준)
function toISOWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + 3)           // 월요일 + 3 = 목요일 (ISO 기준)
  const year = thursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${year}-W${String(weekNo).padStart(2, '0')}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// GET /api/executive-report?week=2026-W09
// GET /api/executive-report?optionsOnly=true  ← 주차 목록만 반환 (GPT 미호출)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requestedWeek = searchParams.get('week')
  const optionsOnly   = searchParams.get('optionsOnly') === 'true'

  // 시스템 기준일 (daily_order 최신 데이터 기준)
  const SYSTEM_BASE_DATE = '2026-02-28'

  try {
    // ─── 1. 주차 목록 — daily_order 기반 26주 ────────────────────────────────
    // weekly_product_summary는 최근 2주분만 있어 부족 → daily_order RPC 사용
    const fromDate = addDays(SYSTEM_BASE_DATE, -7 * 7)  // 8주 전

    const { data: rpcRows, error: rpcErr } = await supabase
      .rpc('get_order_weekly_summary', { p_from_date: fromDate })

    if (rpcErr) throw rpcErr

    // RPC 결과 → weekOptions 변환 (최신 순 정렬)
    const weekOptions: { value: string; label: string; start: string; end: string; totalQty: number }[] = (rpcRows ?? [])
      .filter((r: any) => r.week_start_date)
      .map((r: any) => {
        const start = String(r.week_start_date)
        const end   = addDays(start, 6)
        const value = toISOWeek(start)
        return {
          value,
          label: `${value}  (${start} ~ ${end})`,
          start,
          end,
          totalQty: Number(r.total_qty ?? 0),
        }
      })
      .reverse()  // 최신 주차가 앞에 오도록

    if (weekOptions.length === 0) throw new Error('daily_order에 데이터가 없습니다.')

    // optionsOnly 모드: GPT 없이 주차 목록만 반환
    if (optionsOnly) {
      return NextResponse.json({ weekOptions })
    }

    const targetWeek = requestedWeek ?? weekOptions[0].value
    const targetInfo = weekOptions.find(w => w.value === targetWeek) ?? weekOptions[0]
    const weekStart  = targetInfo.start
    const weekEnd    = targetInfo.end

    // ─── 2. 해당 주차 수주량 ─────────────────────────────────────────────────
    // RPC에서 이미 total_qty를 가져왔으므로 재활용
    const weekOrderQty = targetInfo.totalQty

    // 전주 대비 변화율 (RPC 데이터 내에서 바로 계산)
    const targetIdx   = weekOptions.indexOf(targetInfo)
    const prevWeekQty = targetIdx < weekOptions.length - 1 ? weekOptions[targetIdx + 1].totalQty : 0
    const changeRate: string | null = prevWeekQty > 0
      ? (((weekOrderQty - prevWeekQty) / prevWeekQty) * 100).toFixed(1)
      : null

    // ─── 3. weekly_product_summary 보조 KPI (있을 때만) ─────────────────────
    // 생산량·금액은 weekly_product_summary에만 있음 → 없으면 0으로 fallback
    const { data: weeklyRows } = await supabase
      .from('weekly_product_summary')
      .select('product_id, order_qty, order_amount, produced_qty')
      .eq('year_week', targetWeek)
      .order('order_qty', { ascending: false })
      .limit(200)

    const wRows         = weeklyRows ?? []
    const weekProducedQty = wRows.reduce((s, r) => s + Number(r.produced_qty ?? 0), 0)
    const weekOrderAmt    = wRows.reduce((s, r) => s + Number(r.order_amount ?? 0), 0)
    const topProducts     = wRows.slice(0, 5).map(r => ({
      product_id: String(r.product_id ?? ''),
      order_qty:  Math.round(Number(r.order_qty ?? 0)),
    }))

    // ─── 4. 재고 커버리지 ────────────────────────────────────────────────────
    const thirtyAgoStr = new Date(
      new Date(weekEnd).getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString().slice(0, 10)

    const { data: covRows } = await supabase.rpc('get_inventory_coverage', {
      p_from_date: thirtyAgoStr,
      p_to_date:   weekEnd,
    })
    const covRow      = covRows?.[0]
    const totalInv    = Number(covRow?.total_inv_qty   ?? 0)
    const demand30    = Number(covRow?.total_order_qty ?? 0)
    const dailyAvg    = demand30 / 30
    const coverageDays = dailyAvg > 0 ? Math.round(totalInv / dailyAvg) : 0

    // ─── 5. 미처리 구매 발주 ─────────────────────────────────────────────────
    const { count: pendingPO } = await supabase
      .from('purchase_order')
      .select('*', { count: 'exact', head: true })
      .in('status', ['R', 'P'])

    // ─── 6. 리스크 등급 요약 ─────────────────────────────────────────────────
    let riskSummary: Record<string, number> = {}
    try {
      const { data: riskRows } = await supabase
        .rpc('get_risk_grade_summary', { p_date: weekEnd })
      if (riskRows) {
        for (const r of riskRows) {
          if (r.grade != null) riskSummary[String(r.grade)] = Number(r.cnt ?? 0)
        }
      }
    } catch { /* 리스크 데이터 실패 시 빈 객체 유지 */ }

    // ─── 7. Top critical/high 액션 ──────────────────────────────────────────
    const { data: actionRows } = await supabase
      .from('action_queue')
      .select('product_id, action_type, priority, reason')
      .in('priority', ['critical', 'high'])
      .in('status', ['pending', 'in_progress'])
      .order('priority', { ascending: true })
      .limit(5)

    const topActions = (actionRows ?? []).map(r => ({
      product_id:  String(r.product_id  ?? ''),
      action_type: String(r.action_type ?? ''),
      priority:    String(r.priority    ?? ''),
      reason:      String(r.reason      ?? ''),
    }))

    // ─── 8. 예측 정확도 (MAPE 기반) ─────────────────────────────────────────
    const { data: mapeRows } = await supabase
      .from('model_evaluation')
      .select('wmape')
      .order('eval_date', { ascending: false })
      .limit(100)

    const mapeValues = (mapeRows ?? [])
      .map(r => Number(r.wmape ?? 0))
      .filter(v => v > 0 && v < 100)
    const avgMape = mapeValues.length > 0
      ? mapeValues.reduce((s, v) => s + v, 0) / mapeValues.length
      : null
    const forecastAccuracy = avgMape != null ? Math.round(100 - avgMape) : null

    // ─── 9. GPT 보고서 생성 ──────────────────────────────────────────────────
    const reportInput: ReportInput = {
      targetWeek, weekStart, weekEnd,
      weekOrderQty:    Math.round(weekOrderQty),
      weekProducedQty: Math.round(weekProducedQty),
      weekOrderAmt:    Math.round(weekOrderAmt),
      changeRate,
      coverageDays,
      pendingPO:  pendingPO ?? 0,
      riskSummary,
      topActions,
      forecastAccuracy,
      topProducts,
    }

    const report = await callGPT(reportInput)

    return NextResponse.json({
      meta: {
        targetWeek,
        weekStart,
        weekEnd,
        generatedAt: new Date().toISOString(),
      },
      weekOptions,
      kpi: {
        weekOrderQty:    Math.round(weekOrderQty),
        weekProducedQty: Math.round(weekProducedQty),
        weekOrderAmt:    Math.round(weekOrderAmt),
        changeRate,
        coverageDays,
        coverageStatus: coverageDays >= 21 ? '달성' : coverageDays >= 14 ? '관찰' : '위험',
        pendingPO:      pendingPO ?? 0,
        forecastAccuracy,
      },
      topProducts,
      topActions,
      riskSummary,
      report,
    })
  } catch (err: any) {
    console.error('[executive-report] 오류:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
