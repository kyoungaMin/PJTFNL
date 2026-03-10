import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
    const { data: orderRows, error: orderErr } = await supabase
      .from('daily_order')
      .select('order_date, order_qty')
      .gte('order_date', fromStr)
      .order('order_date', { ascending: true })

    if (orderErr) throw orderErr

    const orderMonthMap: Record<string, number> = {}
    for (const row of (orderRows ?? [])) {
      const d = String(row.order_date)
      const ym = d.slice(0, 7)
      orderMonthMap[ym] = (orderMonthMap[ym] ?? 0) + Number(row.order_qty ?? 0)
    }

    const orderActual = Object.entries(orderMonthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, total]) => ({
        ym,
        m: `'${ym.slice(2, 4)}.${ym.slice(5, 7)}`,
        actual: Math.round(total),
      }))

    // ─── 2. 재고 커버리지 KPI ─────────────────────────────────────────────────
    const { data: latestSnap } = await supabase
      .from('inventory')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)

    const latestDate = latestSnap?.[0]?.snapshot_date as string | undefined

    let coverageDays = 0
    let totalInventoryQty = 0
    let snapshotDate = ''

    if (latestDate) {
      snapshotDate = latestDate

      const { data: invRows } = await supabase
        .from('inventory')
        .select('inventory_qty')
        .eq('snapshot_date', latestDate)

      totalInventoryQty = (invRows ?? []).reduce(
        (sum, r) => sum + Number(r.inventory_qty ?? 0), 0
      )

      // 최근 30일 일평균 수주량 기준으로 커버리지 계산
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10)

      const { data: demandRows } = await supabase
        .from('daily_order')
        .select('order_qty')
        .gte('order_date', thirtyDaysStr)

      const totalDemand30 = (demandRows ?? []).reduce(
        (sum, r) => sum + Number(r.order_qty ?? 0), 0
      )
      const dailyAvgDemand = totalDemand30 / 30

      coverageDays = dailyAvgDemand > 0
        ? Math.round(totalInventoryQty / dailyAvgDemand)
        : 0
    }

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
      const { data: gradeRows } = await supabase
        .from('risk_score')
        .select('risk_grade')
        .eq('eval_date', latestEvalDate)

      const gradeMap: Record<string, number> = {}
      for (const r of (gradeRows ?? [])) {
        const g = String(r.risk_grade ?? 'X')
        gradeMap[g] = (gradeMap[g] ?? 0) + 1
      }
      riskGrades = Object.entries(gradeMap)
        .map(([grade, count]) => ({ grade, count }))
        .sort((a, b) => a.grade.localeCompare(b.grade))
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
      orderActual,          // 수주량 차트 (이전: revenueActual)
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
