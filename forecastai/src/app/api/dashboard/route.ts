import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const now = new Date()

    // ─── 공통 날짜 범위 (최근 15개월) ─────────────────────────────────────────
    const fromDate = new Date(now)
    fromDate.setMonth(fromDate.getMonth() - 15)
    const fromStr = fromDate.toISOString().slice(0, 10)  // YYYY-MM-DD

    // ─── 1. 수주량 월별 집계 (최근 15개월) — 차트용 ─────────────────────────
    // daily_revenue(매출=후행지표) 대신 daily_order(수주=선행지표) 사용
    // 생산계획팀은 수주량을 보고 생산 투입 결정 → 더 유의미한 지표
    //
    // ⚠️ Supabase REST API 기본 limit=1000 문제:
    //    daily_order(259,684행)를 직접 조회하면 첫 1000행만 반환 → '24.12 이후 끊김
    //    → DB/23_order_monthly_rpc.sql의 get_order_monthly_summary RPC로 해결
    //       (DB에서 월별 합산 후 최대 18행만 반환)
    const { data: orderMonthRows, error: orderErr } = await supabase
      .rpc('get_order_monthly_summary', { p_from_date: fromStr })

    if (orderErr) throw orderErr

    const orderMonthMap: Record<string, number> = {}
    for (const row of (orderMonthRows ?? [])) {
      orderMonthMap[String(row.ym)] = Number(row.total_qty ?? 0)
    }

    const orderActual = Object.entries(orderMonthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, total]) => ({
        ym,
        m: `'${ym.slice(2, 4)}.${ym.slice(5, 7)}`,
        actual: Math.round(total),
      }))

    // ─── 1-b. 예측 밴드 (forecast_result 최신 기준, 전 제품 합산) ────────────
    const { data: latestFcstRow } = await supabase
      .from('forecast_result')
      .select('forecast_date, model_id')
      .order('forecast_date', { ascending: false })
      .limit(1)

    const horizonFcstMap: Record<string, { p10: number; p50: number; p90: number }> = {}
    let hasForecastData = false

    if (latestFcstRow?.[0]?.forecast_date) {
      const fcstDate   = String(latestFcstRow[0].forecast_date)
      const fcstModel  = String(latestFcstRow[0].model_id)

      // DB 집계 RPC 사용 (DB/22_dashboard_rpc.sql 참고)
      // model_id를 명시해 다른 날짜의 모델과 섞이지 않도록 보호
      const { data: horizonSums } = await supabase
        .rpc('get_forecast_summary', { p_date: fcstDate, p_model_id: fcstModel })

      // horizon_days → 대상 월 매핑 (forecast_date + horizon_days → 월)
      const baseDate = new Date(fcstDate)
      for (const row of (horizonSums ?? [])) {
        const target = new Date(baseDate)
        target.setDate(target.getDate() + Number(row.horizon_days))
        target.setDate(1)
        const tYm = target.toISOString().slice(0, 7)
        const tM = `'${tYm.slice(2, 4)}.${tYm.slice(5, 7)}`
        horizonFcstMap[tM] = {
          p10: Math.round(Number(row.p10 ?? 0)),
          p50: Math.round(Number(row.p50 ?? 0)),
          p90: Math.round(Number(row.p90 ?? 0)),
        }
      }
      hasForecastData = Object.keys(horizonFcstMap).length > 0
    }

    // ─── 1-c. 차트 데이터 통합 구성 (최근 15개월 실적 + 예측 밴드) ───────────
    // 실적 월 목록 (now 기준 최근 15개월, data.ts ORDER_FORECAST 의존 제거)
    const chartMonths: Array<{ ym: string; m: string }> = []
    for (let i = 14; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const ym = d.toISOString().slice(0, 7)
      const m = `'${ym.slice(2, 4)}.${ym.slice(5, 7)}`
      chartMonths.push({ ym, m })
    }

    // 실적/예측 경계: 마지막 실적 월
    const lastActualYm = Object.keys(orderMonthMap).sort().pop() ?? ''
    const lastActualM = lastActualYm
      ? `'${lastActualYm.slice(2, 4)}.${lastActualYm.slice(5, 7)}`
      : ''

    // 예측 전용 월 (chartMonths에 없는 미래 월만 추가)
    const chartMSet = new Set(chartMonths.map(c => c.m))
    const fcstOnlyMonths = Object.keys(horizonFcstMap)
      .filter(m => !chartMSet.has(m))
      .sort()
      .map(m => ({ ym: '', m }))

    const orderChartData = [...chartMonths, ...fcstOnlyMonths].map(({ ym, m }) => {
      const actual = ym ? orderMonthMap[ym] : undefined
      const fcst = horizonFcstMap[m]
      return {
        m,
        ...(actual !== undefined ? { actual: Math.round(actual) } : {}),
        ...(fcst ? { p10: fcst.p10, p50: fcst.p50, p90: fcst.p90 } : {}),
      }
    })

    // ─── 2. 재고 커버리지 KPI ─────────────────────────────────────────────────
    // ⚠️ inventory(617,720행) + daily_order(259,684행) 직접 조회 → limit=1000에 걸려
    //    inventory 합계·수요 분모가 모두 과소 계산 → 1,081일 오계산 버그
    //    → DB/24_coverage_rpc.sql의 get_inventory_coverage RPC로 해결
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10)

    const { data: covRows } = await supabase
      .rpc('get_inventory_coverage', {
        p_from_date: thirtyDaysStr,
        p_to_date:   now.toISOString().slice(0, 10),
      })

    const covRow            = covRows?.[0]
    const totalInventoryQty = Number(covRow?.total_inv_qty   ?? 0)
    const totalDemand30     = Number(covRow?.total_order_qty ?? 0)
    const snapshotDate      = String(covRow?.snapshot_date   ?? '')

    const dailyAvgDemand = totalDemand30 / 30
    const coverageDays   = dailyAvgDemand > 0
      ? Math.round(totalInventoryQty / dailyAvgDemand)
      : 0

    // ─── 3. 구매 발주 KPI (R=미입고, P=처리중) ───────────────────────────────
    const { count: pendingCount, error: poErr } = await supabase
      .from('purchase_order')
      .select('*', { count: 'exact', head: true })
      .in('status', ['R', 'P'])

    if (poErr) throw poErr

    // ─── 4. 위험 등급 집계 (최신 eval_date 기준) ─────────────────────────────
    // ML 미실행 시 빈 배열 반환 → 프론트에서 Mock fallback
    const { data: latestEval } = await supabase
      .from('risk_score')
      .select('eval_date')
      .order('eval_date', { ascending: false })
      .limit(1)

    let riskGrades: { grade: string; count: number }[] = []

    if (latestEval?.[0]?.eval_date) {
      const latestEvalDate = latestEval[0].eval_date as string

      // DB 집계 RPC 사용 (DB/22_dashboard_rpc.sql 참고)
      // 13K+ 행을 REST로 조회하면 기본 limit=1000에 걸려 등급 비율이 왜곡됨
      const { data: gradeSums } = await supabase
        .rpc('get_risk_grade_summary', { p_date: latestEvalDate })

      riskGrades = (gradeSums ?? [])
        .map((r: { risk_grade: string; cnt: number }) => ({
          grade: String(r.risk_grade ?? 'X'),
          count: Number(r.cnt ?? 0),
        }))
        .sort((a: { grade: string }, b: { grade: string }) => a.grade.localeCompare(b.grade))
    }

    // ─── 5. AI 생산 권고 Top3 (pending, severity 높은 순) ────────────────────
    // ML 미실행 시 빈 배열 반환 → 프론트에서 Mock fallback
    const { data: actionRows } = await supabase
      .from('action_queue')
      .select('id, product_id, risk_type, severity, action_type, description, suggested_qty, eval_date')
      .eq('status', 'pending')
      .in('severity', ['critical', 'high', 'medium'])
      .order('severity', { ascending: true })  // critical이 알파벳순 앞
      .limit(3)

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

    return NextResponse.json({
      orderActual,          // 기존 유지 (호환성)
      orderChartData,       // 신규: 실적+예측 통합 차트 데이터
      lastActualM,          // 실적/예측 구분선 기준 월 ('YY.MM)
      hasForecastData,      // 예측 밴드 실데이터 여부
      riskGrades,           // 위험 등급별 count (ML 미실행 시 빈 배열)
      actionItems,          // AI 생산 권고 Top3 (ML 미실행 시 빈 배열)
      urgentCount,          // E~F 등급 건수 (ML 미실행 시 0)
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
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] dashboard error:', err)
    return NextResponse.json(
      { source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
