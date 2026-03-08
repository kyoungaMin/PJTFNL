import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date()

    // ── 1. 최신 inventory snapshot_date ──────────────────────────────────────
    const { data: snapRows } = await supabase
      .from('inventory')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)

    const latestSnap = snapRows?.[0]?.snapshot_date as string | undefined

    if (!latestSnap) {
      return NextResponse.json({ source: 'no_data', skuList: [], trend: [], kpi: {} })
    }

    // ── 2. 최신 snapshot 재고 (상위 200개, 창고별 합산) ────────────────────────
    const { data: invRows, error: invErr } = await supabase
      .from('inventory')
      .select('product_id, inventory_qty')
      .eq('snapshot_date', latestSnap)
      .order('inventory_qty', { ascending: false })
      .limit(200)

    if (invErr) throw invErr

    // 창고별 합산
    const invByProduct: Record<string, number> = {}
    for (const r of invRows ?? []) {
      invByProduct[r.product_id] = (invByProduct[r.product_id] ?? 0) + Number(r.inventory_qty ?? 0)
    }

    const productIds = Object.keys(invByProduct)
    if (productIds.length === 0) {
      return NextResponse.json({ source: 'no_data', skuList: [], trend: [], kpi: {} })
    }

    // ── 3. 제품 마스터 ───────────────────────────────────────────────────────
    const { data: products } = await supabase
      .from('product_master')
      .select('product_code, product_name, product_category, product_type')
      .in('product_code', productIds)

    const productMap: Record<string, { name: string; category: string }> = {}
    for (const p of products ?? []) {
      productMap[p.product_code] = {
        name: p.product_name ?? p.product_code,
        category: p.product_category ?? p.product_type ?? '기타',
      }
    }

    // ── 4. 최신 risk_score ───────────────────────────────────────────────────
    const { data: riskSnap } = await supabase
      .from('risk_score')
      .select('eval_date')
      .order('eval_date', { ascending: false })
      .limit(1)

    const latestRiskDate = riskSnap?.[0]?.eval_date as string | undefined
    let riskMap: Record<string, { safetyStock: number; grade: string }> = {}
    let totalSafeStock = 0

    if (latestRiskDate) {
      const { data: riskRows } = await supabase
        .from('risk_score')
        .select('product_id, safety_stock, risk_grade')
        .eq('eval_date', latestRiskDate)
        .in('product_id', productIds)

      for (const r of riskRows ?? []) {
        const ss = Number(r.safety_stock ?? 0)
        riskMap[r.product_id] = { safetyStock: ss, grade: r.risk_grade ?? 'B' }
        totalSafeStock += ss
      }
    }

    // ── 5. 주간 수요 (최근 8주 평균 수주량) ─────────────────────────────────
    const eightWeeksAgo = new Date(now)
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)

    const { data: wkRows } = await supabase
      .from('weekly_product_summary')
      .select('product_id, order_qty')
      .gte('week_start', eightWeeksAgo.toISOString().slice(0, 10))
      .in('product_id', productIds)

    const demandAccum: Record<string, { total: number; cnt: number }> = {}
    for (const r of wkRows ?? []) {
      if (!demandAccum[r.product_id]) demandAccum[r.product_id] = { total: 0, cnt: 0 }
      demandAccum[r.product_id].total += Number(r.order_qty ?? 0)
      demandAccum[r.product_id].cnt += 1
    }
    const weeklyDemandMap: Record<string, number> = {}
    for (const [pid, { total, cnt }] of Object.entries(demandAccum)) {
      weeklyDemandMap[pid] = cnt > 0 ? total / cnt : 0
    }

    // ── 6. 단가 (최근 6개월 구매발주 평균) ──────────────────────────────────
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: poRows } = await supabase
      .from('purchase_order')
      .select('component_product_id, unit_price')
      .gte('po_date', sixMonthsAgo.toISOString().slice(0, 10))
      .in('component_product_id', productIds)
      .not('unit_price', 'is', null)

    const costAccum: Record<string, { total: number; cnt: number }> = {}
    for (const r of poRows ?? []) {
      if (!costAccum[r.component_product_id]) costAccum[r.component_product_id] = { total: 0, cnt: 0 }
      costAccum[r.component_product_id].total += Number(r.unit_price ?? 0)
      costAccum[r.component_product_id].cnt += 1
    }
    const unitCostMap: Record<string, number> = {}
    for (const [pid, { total, cnt }] of Object.entries(costAccum)) {
      unitCostMap[pid] = cnt > 0 ? total / cnt : 0
    }

    // ── 7. 주요 고객사 (최근 4주 수주량 1위) ────────────────────────────────
    const fourWeeksAgo = new Date(now)
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

    const { data: custRows } = await supabase
      .from('weekly_customer_summary')
      .select('product_id, customer_id, order_qty')
      .gte('week_start', fourWeeksAgo.toISOString().slice(0, 10))
      .in('product_id', productIds)

    const custAccum: Record<string, Record<string, number>> = {}
    for (const r of custRows ?? []) {
      if (!custAccum[r.product_id]) custAccum[r.product_id] = {}
      custAccum[r.product_id][r.customer_id] =
        (custAccum[r.product_id][r.customer_id] ?? 0) + Number(r.order_qty ?? 0)
    }
    const topCustomerMap: Record<string, string> = {}
    for (const [pid, cmap] of Object.entries(custAccum)) {
      const top = Object.entries(cmap).sort(([, a], [, b]) => b - a)[0]
      if (top) topCustomerMap[pid] = top[0]
    }

    // ── 8. SKU 리스트 조합 ───────────────────────────────────────────────────
    const skuList = Object.entries(invByProduct).map(([pid, stock]) => ({
      sku: pid,
      name: productMap[pid]?.name ?? pid,
      category: productMap[pid]?.category ?? '기타',
      stock: Math.round(stock),
      safeStock: Math.round(riskMap[pid]?.safetyStock ?? stock * 0.4),
      unitCost: Math.round(unitCostMap[pid] ?? 0),
      weeklyDemand: Math.round(weeklyDemandMap[pid] ?? 0),
      customer: topCustomerMap[pid] ?? '-',
      grade: riskMap[pid]?.grade ?? '-',
    }))

    // ── 9. 재고 추이 (최근 12주 일요일 기준) ────────────────────────────────
    // 가장 최근 일요일부터 12주 거슬러 올라가며 날짜 계산
    const weekEndDates: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now)
      const dayOfWeek = d.getDay() // 0=Sun
      d.setDate(d.getDate() - dayOfWeek - i * 7)
      weekEndDates.push(d.toISOString().slice(0, 10))
    }

    const { data: trendRows } = await supabase
      .from('daily_inventory_estimated')
      .select('target_date, estimated_qty')
      .in('target_date', weekEndDates)

    const trendByDate: Record<string, number> = {}
    for (const r of trendRows ?? []) {
      const d = String(r.target_date).slice(0, 10)
      trendByDate[d] = (trendByDate[d] ?? 0) + Number(r.estimated_qty ?? 0)
    }

    const trend = weekEndDates.map((d, idx) => {
      const relIdx = idx - 11
      return {
        w: relIdx === 0 ? 'W0' : `W${relIdx}`,
        total: Math.round(trendByDate[d] ?? 0),
        safe: Math.round(totalSafeStock),
      }
    })

    // ── 10. KPI 계산 ─────────────────────────────────────────────────────────
    const totalStock = Object.values(invByProduct).reduce((s, v) => s + v, 0)
    const totalWeeklyDemand = Object.values(weeklyDemandMap).reduce((s, v) => s + v, 0)
    const avgCoverageDays = totalWeeklyDemand > 0
      ? Math.round((totalStock / totalWeeklyDemand) * 7)
      : 0

    return NextResponse.json({
      skuList,
      trend,
      kpi: {
        totalSku: skuList.length,
        avgCoverageDays,
        snapshotDate: latestSnap,
      },
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] inventory error:', err)
    return NextResponse.json({ source: 'error', error: err.message }, { status: 500 })
  }
}
