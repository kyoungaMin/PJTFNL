import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ─── 시스템 기준날짜 ────────────────────────────────────────────────────────
// 실데이터 최신일(2026-02-28) 기준으로 모든 날짜 계산
// → 실제 서비스 전환 시 이 상수를 제거하고 new Date()로 복원
const SYSTEM_BASE_DATE = '2026-02-28'

// ─── 인메모리 캐시 (60초) ────────────────────────────────────────────────────
let dashboardCache: { data: any; ts: number } | null = null
const CACHE_TTL = 60_000

export async function GET() {
  // 캐시 히트 시 즉시 반환
  if (dashboardCache && Date.now() - dashboardCache.ts < CACHE_TTL) {
    return NextResponse.json(dashboardCache.data)
  }

  try {
    const now = new Date(SYSTEM_BASE_DATE + 'T00:00:00')

    // ─── 날짜 유틸 (타임존 안전 처리) ────────────────────────────────────────
    // Date 객체 → 'YYYY-MM-DD' (로컬 날짜 기준)
    function toLocalDateStr(d: Date): string {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    // 'YYYY-MM-DD' → 'M/DD' 주 라벨 (e.g., '2026-03-09' → '3/09')
    function toWeekLabel(dateStr: string): string {
      const [, m, d] = dateStr.split('-')
      return `${Number(m)}/${d}`
    }

    // 이번 주 월요일 계산 (ISO 주 기준, 일=7)
    const todayDow = now.getDay() || 7
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - todayDow + 1)

    // ─── 1. 수주량 주간 집계 (최근 26주) — 차트용 ───────────────────────────
    // ⚠️ daily_order(259,684행) 직접 조회 → limit=1000 잘림
    //    → DB/25_order_weekly_rpc.sql의 get_order_weekly_summary RPC로 해결
    //       (DB에서 주별 합산 후 최대 26행만 반환)
    const fromMonday = new Date(thisMonday)
    fromMonday.setDate(thisMonday.getDate() - 25 * 7)
    const fromStr = toLocalDateStr(fromMonday)

    // ─── 병렬 실행: 독립적인 3개 쿼리를 동시에 실행 ─────────────────────────
    const [orderWeekResult, maxOrderResult, pendingResult] = await Promise.all([
      supabase.rpc('get_order_weekly_summary', { p_from_date: fromStr }),
      supabase.from('daily_order').select('order_date').order('order_date', { ascending: false }).limit(1),
      supabase.from('purchase_order').select('*', { count: 'exact', head: true }).in('status', ['R', 'P']),
    ])

    if (orderWeekResult.error) throw orderWeekResult.error
    if (pendingResult.error) throw pendingResult.error

    const orderWeekRows = orderWeekResult.data

    // week_start_date → 라벨 맵 + 정렬용 배열
    const orderWeekMap: Record<string, number> = {}
    const weekActuals: Array<{ weekStart: string; label: string }> = []
    for (const row of (orderWeekRows ?? [])) {
      const dateStr = String(row.week_start_date)
      const label = toWeekLabel(dateStr)
      orderWeekMap[label] = Number(row.total_qty ?? 0)
      weekActuals.push({ weekStart: dateStr, label })
    }
    weekActuals.sort((a, b) => a.weekStart.localeCompare(b.weekStart))

    // 기존 호환 필드 (hasDbOrderData 체크용으로 orderChartData 사용)
    const orderActual: unknown[] = []

    // ─── calendar_week 기반 기준 주차 확정 ────────────────────────────────────
    const maxOrderDate = String(maxOrderResult.data?.[0]?.order_date ?? toLocalDateStr(now))

    // ─── 병렬 실행: calendar_week + forecast 최신행 동시 조회 ─────────────
    const [refCalResult, latestFcstResult] = await Promise.all([
      supabase.from('calendar_week')
        .select('year_week, week_start, week_end, year_month')
        .lte('week_start', maxOrderDate)
        .order('week_start', { ascending: false })
        .limit(1),
      supabase.from('forecast_result')
        .select('forecast_date, model_id')
        .order('forecast_date', { ascending: false })
        .limit(1),
    ])
    const refWeek = refCalResult.data?.[0]

    // qty=0인 주(3월 초 등 미수주 주차)를 제외하고 실제 수주가 있는 마지막 주 사용
    const lastNonZeroWeek = [...weekActuals].reverse().find(w => (orderWeekMap[w.label] ?? 0) > 0)
    const latestActualDate = String(
      lastNonZeroWeek?.weekStart ?? refWeek?.week_start ?? toLocalDateStr(now)
    )

    // latestActualDate 기준 해당 주 월요일 계산
    const latestAnchor = new Date(latestActualDate + 'T00:00:00')
    const latestDow = latestAnchor.getDay() || 7
    latestAnchor.setDate(latestAnchor.getDate() - latestDow + 1)

    // ─── 1-b. 예측 밴드 (forecast_result 최신 기준, 전 제품 합산) ────────────
    const latestFcstRow = latestFcstResult.data

    const horizonFcstMap: Record<string, { p10: number; p50: number; p90: number }> = {}
    // 예측 주차 정렬용 (미래 주차 순서 보장)
    const horizonFcstEntries: Array<{ weekStart: string; label: string }> = []
    let hasForecastData = false

    if (latestFcstRow?.[0]?.forecast_date) {
      const fcstDate  = String(latestFcstRow[0].forecast_date)
      const fcstModel = String(latestFcstRow[0].model_id)

      const { data: horizonSums } = await supabase
        .rpc('get_forecast_summary', { p_date: fcstDate, p_model_id: fcstModel })

      // horizon_days → 해당 주 월요일 라벨로 매핑
      // h=7 → +1주, h=14 → +2주, h=28 → +4주
      // ⚠️ fcstDate(오늘)가 아닌 latestActualDate 기준으로 호라이즌 계산
      //    → 실데이터 마지막 주(2/23) 바로 다음부터 예측 밴드가 이어지도록
      const baseDate = new Date(latestActualDate + 'T00:00:00')
      for (const row of (horizonSums ?? [])) {
        const target = new Date(baseDate)
        target.setDate(target.getDate() + Number(row.horizon_days))
        // 해당 날짜가 속한 주 월요일
        const targetDow = target.getDay() || 7
        target.setDate(target.getDate() - targetDow + 1)
        const weekStartStr = toLocalDateStr(target)
        const tLabel = toWeekLabel(weekStartStr)
        horizonFcstMap[tLabel] = {
          p10: Math.round(Number(row.p10 ?? 0)),
          p50: Math.round(Number(row.p50 ?? 0)),
          p90: Math.round(Number(row.p90 ?? 0)),
        }
        horizonFcstEntries.push({ weekStart: weekStartStr, label: tLabel })
      }
      horizonFcstEntries.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      hasForecastData = Object.keys(horizonFcstMap).length > 0
    }

    // ─── 1-c. 차트 데이터 구성 (최근 26주 실적 + 예측 밴드) ─────────────────
    // 26주 월요일 목록 생성 (latestAnchor 기준 25주 전 ~ 최신 실데이터 주)
    const chartWeeks: Array<{ weekStart: string; label: string }> = []
    for (let i = 25; i >= 0; i--) {
      const d = new Date(latestAnchor)
      d.setDate(latestAnchor.getDate() - i * 7)
      const weekStart = toLocalDateStr(d)
      chartWeeks.push({ weekStart, label: toWeekLabel(weekStart) })
    }

    // 실적/예측 경계: 마지막 실적 주 라벨 (ReferenceLine 기준)
    const lastActualM = weekActuals[weekActuals.length - 1]?.label ?? ''

    // 예측 전용 주 (chartWeeks에 없는 미래 주만 추가, 날짜순 정렬)
    const chartWSet = new Set(chartWeeks.map(c => c.label))
    const fcstOnlyWeeks = horizonFcstEntries
      .filter(e => !chartWSet.has(e.label))
      .map(e => ({ weekStart: e.weekStart, label: e.label }))

    const orderChartData = [...chartWeeks, ...fcstOnlyWeeks].map(({ label }) => {
      const actual = orderWeekMap[label]
      const fcst   = horizonFcstMap[label]
      return {
        m: label,
        ...(actual !== undefined ? { actual: Math.round(actual) } : {}),
        ...(fcst ? { p10: fcst.p10, p50: fcst.p50, p90: fcst.p90 } : {}),
      }
    })

    // ─── 2. 재고 커버리지 + plan_date — 병렬 실행 ────────────────────────────
    const thirtyDaysBeforeLatest = new Date(latestAnchor)
    thirtyDaysBeforeLatest.setDate(latestAnchor.getDate() - 30)
    const thirtyDaysStr = toLocalDateStr(thirtyDaysBeforeLatest)
    const latestActualWeekEnd = (() => {
      const d = new Date(latestActualDate + 'T00:00:00')
      d.setDate(d.getDate() + 6)
      return toLocalDateStr(d)
    })()

    const [covResult, planDateResult] = await Promise.all([
      supabase.rpc('get_inventory_coverage', {
        p_from_date: thirtyDaysStr,
        p_to_date:   latestActualDate,
      }),
      supabase.from('purchase_recommendation')
        .select('plan_date')
        .lte('plan_date', latestActualWeekEnd)
        .order('plan_date', { ascending: false })
        .limit(1),
    ])

    const covRow            = covResult.data?.[0]
    const totalInventoryQty = Number(covRow?.total_inv_qty   ?? 0)
    const totalDemand30     = Number(covRow?.total_order_qty ?? 0)
    const snapshotDate      = String(covRow?.snapshot_date   ?? '')

    const dailyAvgDemand = totalDemand30 / 30
    const coverageDays   = dailyAvgDemand > 0
      ? Math.round(totalInventoryQty / dailyAvgDemand)
      : 0

    const planDate = String(planDateResult.data?.[0]?.plan_date ?? '')
    // planDate 주 종료일 (planDate + 6일): risk·action eval_date 범위 필터에 사용
    const planDateEnd = planDate ? (() => {
      const d = new Date(planDate + 'T00:00:00')
      d.setDate(d.getDate() + 6)
      return toLocalDateStr(d)
    })() : ''

    // ─── 3. 구매 발주 KPI (R=미입고, P=처리중) — 이미 병렬 조회 완료 ─────────
    const pendingCount = pendingResult.count

    // ─── 4. 위험 등급 집계 — monthly + weekly eval_date 병렬 조회 ────────────
    // planDate 주차 우선 → 없으면 최신 fallback
    const buildEvalQuery = (evalType: string) => {
      if (planDate && planDateEnd) {
        return supabase.from('risk_score').select('eval_date')
          .eq('eval_type', evalType)
          .gte('eval_date', planDate).lte('eval_date', planDateEnd)
          .order('eval_date', { ascending: false }).limit(1)
      }
      return supabase.from('risk_score').select('eval_date')
        .eq('eval_type', evalType)
        .order('eval_date', { ascending: false }).limit(1)
    }
    const [monthlyEvalResult, weeklyEvalResult] = await Promise.all([
      buildEvalQuery('monthly'),
      buildEvalQuery('weekly'),
    ])

    let evalDataRow = monthlyEvalResult.data?.[0] ?? null
    if (!evalDataRow && planDate) {
      const { data: fallbackEval } = await supabase.from('risk_score').select('eval_date')
        .eq('eval_type', 'monthly').order('eval_date', { ascending: false }).limit(1)
      evalDataRow = fallbackEval?.[0] ?? null
    }

    let weeklyEvalDate = weeklyEvalResult.data?.[0]?.eval_date ? String(weeklyEvalResult.data[0].eval_date) : ''
    if (!weeklyEvalDate && planDate) {
      const { data: wFallback } = await supabase.from('risk_score').select('eval_date')
        .eq('eval_type', 'weekly').order('eval_date', { ascending: false }).limit(1)
      weeklyEvalDate = wFallback?.[0]?.eval_date ? String(wFallback[0].eval_date) : ''
    }

    // ─── 헤더 표시용 기준 주차 계산 ─────────────────────────────────────────
    // ML plan_date(월요일)가 있으면 그 전날(일요일)을 헤더 기준으로 사용
    // → 구매·생산권고 상세화면과 동일한 ML 주차를 표시 (날짜 일치)
    // ML plan_date 없으면 daily_order 기준 일요일로 fallback
    const headerPlanDate: string = (() => {
      const anchor = planDate || latestActualDate  // planDate=월요일, latestActualDate=월요일
      const d = new Date(anchor + 'T00:00:00')
      d.setDate(d.getDate() - 1)  // 월요일 → 일요일
      return toLocalDateStr(d)
    })()

    let riskGrades: { grade: string; count: number }[] = []

    if (evalDataRow?.eval_date) {
      const latestEvalDate = String(evalDataRow.eval_date)

      // DB 집계 RPC 사용 (p_eval_type 파라미터가 RPC에 있을 것으로 예상되나, 
      // 만약 없으면 SQL 레벨에서 eval_type 필터링이 필요함. 
      // 여기서는 p_date 기준 등급 집계이므로, eval_date가 이미 monthly 전용임)
      const { data: gradeSums } = await supabase
        .rpc('get_risk_grade_summary', { p_date: latestEvalDate })

      riskGrades = (gradeSums ?? [])
        .map((r: { risk_grade: string; cnt: number }) => ({
          grade: String(r.risk_grade ?? 'X'),
          count: Number(r.cnt ?? 0),
        }))
        .sort((a: { grade: string }, b: { grade: string }) => a.grade.localeCompare(b.grade))
    }

    // ─── 5. AI 생산 권고 Top3 (planDate 주차 pending, severity 높은 순) ─────
    // ML 미실행 시 빈 배열 반환 → 프론트에서 Mock fallback
    // planDate 주차 내 항목 우선 → 없으면 전체 최신 pending fallback
    let actionRows: any[] | null = null
    if (planDate && planDateEnd) {
      const { data: weekActions } = await supabase
        .from('action_queue')
        .select('id, product_id, risk_type, severity, action_type, description, suggested_qty, eval_date')
        .eq('status', 'pending')
        .in('severity', ['critical', 'high', 'medium'])
        .gte('eval_date', planDate)
        .lte('eval_date', planDateEnd)
        .order('severity', { ascending: true })
        .limit(3)
      if (weekActions && weekActions.length > 0) actionRows = weekActions
    }
    if (!actionRows || actionRows.length === 0) {
      const { data: fallbackActions } = await supabase
        .from('action_queue')
        .select('id, product_id, risk_type, severity, action_type, description, suggested_qty, eval_date')
        .eq('status', 'pending')
        .in('severity', ['critical', 'high', 'medium'])
        .order('severity', { ascending: true })
        .limit(3)
      actionRows = fallbackActions ?? []
    }

    // action_queue에 나온 product_id 목록으로 product_name 일괄 조회
    const actionProductIds = (actionRows ?? []).map(r => String(r.product_id))
    let productNameMap: Record<string, string> = {}
    if (actionProductIds.length > 0) {
      const { data: pmRows } = await supabase
        .from('product_master')
        .select('product_id, product_name')
        .in('product_id', actionProductIds)
      for (const pm of (pmRows ?? [])) {
        productNameMap[String(pm.product_id)] = String(pm.product_name ?? pm.product_id)
      }
    }

    // DB 컬럼 → 프론트 카드 형식 변환
    const RISK_TYPE_KO: Record<string, string> = {
      stockout: '결품', excess: '과잉', delivery: '납기', margin: '마진',
    }
    const ACTION_TYPE_KO: Record<string, string> = {
      increase_production:  '생산 증량 권고',
      reduce_order:         '발주 감소 권고',
      expedite_po:          '긴급 발주 권고',
      expedite_production:  '긴급 생산 권고',
      adjust_price:         '가격 조정 권고',
      increase_po:          '구매 발주 증량',
      reduce_production:    '생산 감량 권고',
    }
    const SEVERITY_TO_PRIORITY: Record<string, string> = {
      critical: 'HIGH', high: 'HIGH', medium: 'MED', low: 'LOW',
    }

    const actionItems = (actionRows ?? []).map(r => ({
      id: r.id,
      priority: SEVERITY_TO_PRIORITY[String(r.severity)] ?? 'MED',
      sku: String(r.product_id),
      name: productNameMap[String(r.product_id)] ?? String(r.product_id),
      action: ACTION_TYPE_KO[String(r.action_type)] ?? String(r.action_type),
      detail: r.suggested_qty != null ? `권고 수량: ${Number(r.suggested_qty).toLocaleString()}EA` : '',
      impact: String(r.description ?? ''),
      deadline: r.eval_date ? `${String(r.eval_date).slice(5, 10)} 기준` : '',
      riskType: RISK_TYPE_KO[String(r.risk_type)] ?? String(r.risk_type),
      status: '미처리',
    }))

    // ─── KPI 상태 판정 ─────────────────────────────────────────────────────────
    const coverageStatus =
      coverageDays >= 21 ? 'achieved' : coverageDays >= 14 ? 'watch' : 'risk'
    const orderCount = pendingCount ?? 0
    const orderStatus =
      orderCount === 0 ? 'achieved' : orderCount <= 3 ? 'watch' : 'risk'

    // E/F 등급 긴급 SKU 수
    const urgentCount = riskGrades
      .filter(g => ['E', 'F'].includes(g.grade))
      .reduce((s, g) => s + g.count, 0)

    const responseData = {
      orderActual,
      orderChartData,
      lastActualM,
      hasForecastData,
      riskGrades,
      actionItems,
      urgentCount,
      inventoryCoverage: {
        totalQty: Math.round(totalInventoryQty),
        snapshotDate,
        coverageDays,
        status: coverageStatus,
      },
      purchaseOrder: {
        pendingCount: orderCount,
        status: orderStatus,
      },
      latestDataDate: latestActualDate,
      refWeekInfo: {
        yearWeek:  String(refWeek?.year_week  ?? ''),
        weekStart: latestActualDate,
        weekEnd:   (() => {
          const d = new Date(latestActualDate + 'T00:00:00')
          d.setDate(d.getDate() + 5)
          return toLocalDateStr(d)
        })(),
        yearMonth: planDate ? planDate.substring(0, 7) : String(refWeek?.year_month ?? ''),
        maxOrderDate,
        planDate: headerPlanDate,
        mlPlanDate: planDate,
        evalDate: evalDataRow?.eval_date ? String(evalDataRow.eval_date) : '',
        weeklyEvalDate,
      },
      source: 'database',
    }

    // 캐시 저장
    dashboardCache = { data: responseData, ts: Date.now() }
    return NextResponse.json(responseData)
  } catch (err: any) {
    console.error('[API] dashboard error:', err)
    return NextResponse.json(
      { source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
