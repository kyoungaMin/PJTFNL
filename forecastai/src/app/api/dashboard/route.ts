import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date()

    // ─── 1. 월별 매출 실적 (최근 15개월) ─────────────────────────────────────
    const fromDate = new Date(now)
    fromDate.setMonth(fromDate.getMonth() - 15)
    const fromStr = fromDate.toISOString().slice(0, 10)  // YYYY-MM-DD

    const { data: revenueRows, error: revErr } = await supabase
      .from('daily_revenue')
      .select('revenue_date,revenue_amount')
      .gte('revenue_date', fromStr)
      .order('revenue_date', { ascending: true })

    if (revErr) throw revErr

    // JS에서 월별 집계 (단위: 백만원)
    const monthMap: Record<string, number> = {}
    for (const row of (revenueRows ?? [])) {
      const d = String(row.revenue_date)          // 'YYYY-MM-DD'
      const ym = d.slice(0, 7)                    // 'YYYY-MM'
      monthMap[ym] = (monthMap[ym] ?? 0) + Number(row.revenue_amount ?? 0)
    }

    const revenueActual = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, total]) => ({
        ym,
        m: `'${ym.slice(2, 4)}.${ym.slice(5, 7)}`,  // "'24.01" 형식
        actual: Math.round(total / 1_000_000),
      }))

    // ─── 2. 재고 커버리지 KPI ─────────────────────────────────────────────────
    // 2a. 최신 snapshot_date 조회
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

      // 2b. 최신 snapshot 전체 재고량 합산
      const { data: invRows } = await supabase
        .from('inventory')
        .select('inventory_qty')
        .eq('snapshot_date', latestDate)

      totalInventoryQty = (invRows ?? []).reduce(
        (sum, r) => sum + Number(r.inventory_qty ?? 0), 0
      )

      // 2c. 최근 30일 일평균 수요 (daily_revenue.quantity 기준)
      const thirtyDaysAgo = new Date(now)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10)

      const { data: demandRows } = await supabase
        .from('daily_revenue')
        .select('quantity')
        .gte('revenue_date', thirtyDaysStr)

      const totalDemand30 = (demandRows ?? []).reduce(
        (sum, r) => sum + Number(r.quantity ?? 0), 0
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

    // ─── KPI 상태 판정 ─────────────────────────────────────────────────────────
    const coverageStatus =
      coverageDays >= 21 ? 'achieved' : coverageDays >= 14 ? 'watch' : 'risk'
    const orderCount = pendingCount ?? 0
    const orderStatus =
      orderCount === 0 ? 'achieved' : orderCount <= 3 ? 'watch' : 'risk'

    return NextResponse.json({
      revenueActual,
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
