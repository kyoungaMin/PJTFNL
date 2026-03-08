import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const mode   = searchParams.get('mode')    // 'list' | null
    const search = searchParams.get('search') ?? ''
    const type   = searchParams.get('type')   ?? '전체'  // product_type 필터
    const now    = new Date()

    // ══════════════════════════════════════════════════════════════════════
    //  MODE: LIST — 검색/조회 버튼 클릭 시에만 호출
    // ══════════════════════════════════════════════════════════════════════
    if (mode === 'list') {
      // 1. product_master: 검색어 + 제품 유형 필터
      let pmQuery = supabase
        .from('product_master')
        .select('product_code, product_name, product_category, product_type')
        .limit(300)

      if (search) {
        pmQuery = pmQuery.or(`product_code.ilike.%${search}%,product_name.ilike.%${search}%`)
      }
      if (type && type !== '전체') {
        pmQuery = pmQuery.eq('product_type', type)
      }

      const { data: products, error: pmErr } = await pmQuery
      if (pmErr) throw pmErr
      if (!products || products.length === 0) {
        return NextResponse.json({ skuList: [], source: 'database' })
      }

      const productIds = products.map(p => p.product_code)
      const productMap: Record<string, { name: string; category: string; productType: string }> = {}
      for (const p of products) {
        productMap[p.product_code] = {
          name:        p.product_name      ?? p.product_code,
          category:    p.product_category  ?? p.product_type ?? '기타',
          productType: p.product_type      ?? '기타',
        }
      }

      // 2. 최신 inventory snapshot
      const { data: snapRows } = await supabase
        .from('inventory')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
      const latestSnap = snapRows?.[0]?.snapshot_date as string | undefined

      const invByProduct: Record<string, number> = {}
      if (latestSnap) {
        const { data: invRows } = await supabase
          .from('inventory')
          .select('product_id, inventory_qty')
          .eq('snapshot_date', latestSnap)
          .in('product_id', productIds)
        for (const r of invRows ?? []) {
          invByProduct[r.product_id] = (invByProduct[r.product_id] ?? 0) + Number(r.inventory_qty ?? 0)
        }
      }

      // 3. 최신 risk_score
      const { data: riskSnap } = await supabase
        .from('risk_score')
        .select('eval_date')
        .order('eval_date', { ascending: false })
        .limit(1)
      const latestRiskDate = riskSnap?.[0]?.eval_date as string | undefined
      const riskMap: Record<string, { safetyStock: number; grade: string }> = {}
      if (latestRiskDate) {
        const { data: riskRows } = await supabase
          .from('risk_score')
          .select('product_id, safety_stock, risk_grade')
          .eq('eval_date', latestRiskDate)
          .in('product_id', productIds)
        for (const r of riskRows ?? []) {
          riskMap[r.product_id] = { safetyStock: Number(r.safety_stock ?? 0), grade: r.risk_grade ?? '-' }
        }
      }

      // 4. 주간 수요 (최근 8주 평균)
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
        demandAccum[r.product_id].cnt  += 1
      }
      const weeklyDemandMap: Record<string, number> = {}
      for (const [pid, { total, cnt }] of Object.entries(demandAccum)) {
        weeklyDemandMap[pid] = cnt > 0 ? total / cnt : 0
      }

      // 5. 단가 (최근 6개월 구매발주 평균)
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
        costAccum[r.component_product_id].cnt  += 1
      }
      const unitCostMap: Record<string, number> = {}
      for (const [pid, { total, cnt }] of Object.entries(costAccum)) {
        unitCostMap[pid] = cnt > 0 ? total / cnt : 0
      }

      // 6. 주요 고객사 (최근 4주 1위)
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

      // 7. SKU 리스트 조합
      const skuList = productIds.map(pid => ({
        sku:          pid,
        name:         productMap[pid]?.name        ?? pid,
        category:     productMap[pid]?.category    ?? '기타',
        productType:  productMap[pid]?.productType ?? '기타',
        stock:        Math.round(invByProduct[pid]          ?? 0),
        safeStock:    Math.round(riskMap[pid]?.safetyStock  ?? (invByProduct[pid] ?? 0) * 0.4),
        unitCost:     Math.round(unitCostMap[pid]           ?? 0),
        weeklyDemand: Math.round(weeklyDemandMap[pid]       ?? 0),
        customer:     topCustomerMap[pid] ?? '-',
        grade:        riskMap[pid]?.grade ?? '-',
      }))

      return NextResponse.json({ skuList, source: 'database' })
    }

    // ══════════════════════════════════════════════════════════════════════
    //  MODE: DASHBOARD — 초기 빠른 로드 (KPI + Trend + 제품 유형 목록)
    // ══════════════════════════════════════════════════════════════════════

    // 1. 최신 snapshot
    const { data: snapRows } = await supabase
      .from('inventory')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
    const latestSnap = snapRows?.[0]?.snapshot_date as string | undefined

    if (!latestSnap) {
      return NextResponse.json({ source: 'no_data', trend: [], kpi: {}, productTypes: ['전체'] })
    }

    // 2. 전체 재고 합산
    const { data: invRows } = await supabase
      .from('inventory')
      .select('product_id, inventory_qty')
      .eq('snapshot_date', latestSnap)

    const invByProduct: Record<string, number> = {}
    for (const r of invRows ?? []) {
      invByProduct[r.product_id] = (invByProduct[r.product_id] ?? 0) + Number(r.inventory_qty ?? 0)
    }
    const totalStock  = Object.values(invByProduct).reduce((s, v) => s + v, 0)
    const productIds  = Object.keys(invByProduct)
    const totalSku    = productIds.length

    // 3. 제품 유형 목록 (product_master에서 distinct)
    const { data: typeRows } = await supabase
      .from('product_master')
      .select('product_type')
    const productTypes = [
      '전체',
      ...new Set((typeRows ?? []).map(r => r.product_type).filter(Boolean) as string[]),
    ]

    // 4. 평균 커버리지 (최근 8주 weekly demand)
    const eightWeeksAgo = new Date(now)
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
    const { data: wkRows } = await supabase
      .from('weekly_product_summary')
      .select('product_id, order_qty')
      .gte('week_start', eightWeeksAgo.toISOString().slice(0, 10))

    const demandByPid: Record<string, { total: number; cnt: number }> = {}
    for (const r of wkRows ?? []) {
      if (!demandByPid[r.product_id]) demandByPid[r.product_id] = { total: 0, cnt: 0 }
      demandByPid[r.product_id].total += Number(r.order_qty ?? 0)
      demandByPid[r.product_id].cnt  += 1
    }
    const totalWeeklyDemand = Object.values(demandByPid)
      .reduce((s, { total, cnt }) => s + (cnt > 0 ? total / cnt : 0), 0)
    const avgCoverageDays = totalWeeklyDemand > 0
      ? Math.round((totalStock / totalWeeklyDemand) * 7)
      : 0

    // 5. 전체 안전재고 합산 (risk_score 최신)
    const { data: riskSnap } = await supabase
      .from('risk_score')
      .select('eval_date')
      .order('eval_date', { ascending: false })
      .limit(1)
    const latestRiskDate = riskSnap?.[0]?.eval_date as string | undefined
    let totalSafeStock = 0
    if (latestRiskDate) {
      const { data: riskRows } = await supabase
        .from('risk_score')
        .select('safety_stock')
        .eq('eval_date', latestRiskDate)
      totalSafeStock = (riskRows ?? []).reduce((s, r) => s + Number(r.safety_stock ?? 0), 0)
    }

    // 6. 재고 추이 (최근 12주 일요일)
    const weekEndDates: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - d.getDay() - i * 7)
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
    const trend = weekEndDates.map((d, idx) => ({
      w:     idx === 11 ? 'W0' : `W${idx - 11}`,
      total: Math.round(trendByDate[d] ?? 0),
      safe:  Math.round(totalSafeStock),
    }))

    return NextResponse.json({
      trend,
      productTypes,
      kpi: { totalSku, avgCoverageDays, snapshotDate: latestSnap },
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] inventory error:', err)
    return NextResponse.json({ source: 'error', error: err.message }, { status: 500 })
  }
}
