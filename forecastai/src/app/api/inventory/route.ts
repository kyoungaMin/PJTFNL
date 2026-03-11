import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/* ─── 페이지네이션 전체 조회 ─── */
async function fetchAll(
  table: string, select: string,
  filter: (q: any) => any,
): Promise<any[]> {
  const PAGE = 1000
  const all: any[] = []
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await filter(
      supabase.from(table).select(select).range(off, off + PAGE - 1)
    )
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
  }
  return all
}

/* ─── 배치 .in() 헬퍼 (각 배치에 페이지네이션 적용) ─── */
const IN_BATCH = 300
async function batchIn(
  table: string, select: string, col: string, ids: string[],
  extra?: (q: any) => any,
): Promise<any[]> {
  const all: any[] = []
  for (let i = 0; i < ids.length; i += IN_BATCH) {
    const chunk = ids.slice(i, i + IN_BATCH)
    const rows = await fetchAll(table, select, q => {
      let qq = q.in(col, chunk)
      return extra ? extra(qq) : qq
    })
    all.push(...rows)
  }
  return all
}

/* ─── YYYYMM → '25.11' 라벨 ─── */
function monthLabel(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const mode       = searchParams.get('mode')
    const monthParam = searchParams.get('month')
    const typeParam  = searchParams.get('type') ?? '전체'
    const search     = searchParams.get('search') ?? ''
    const now        = new Date()

    // ── 사용 가능한 월 목록 (cursor, 최대 24개월) ──────────────────────────
    const availableMonths: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 24; i++) {
      let q = supabase.from('inventory')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
      if (cursor) q = q.lt('snapshot_date', cursor)
      const { data } = await q
      if (!data?.length) break
      availableMonths.push(String(data[0].snapshot_date))
      cursor = String(data[0].snapshot_date)
    }

    if (!availableMonths.length) {
      return NextResponse.json({ availableMonths: [], selectedMonth: null, trend: [], kpi: {}, typeStats: {}, productTypes: ['전체'], skuList: [], source: 'empty' })
    }

    const selectedMonth = (monthParam && availableMonths.includes(monthParam))
      ? monthParam : availableMonths[0]

    // ══════════════════════════════════════════════════════════════════════
    //  MODE: LIST — SKU 상세 목록
    // ══════════════════════════════════════════════════════════════════════
    if (mode === 'list') {
      // 1. 해당 월 재고 전체 (페이지네이션)
      const invRows = await fetchAll('inventory', 'product_id,inventory_qty',
        q => q.eq('snapshot_date', selectedMonth))

      const invByProduct: Record<string, number> = {}
      for (const r of invRows) {
        invByProduct[r.product_id] = (invByProduct[r.product_id] ?? 0) + Number(r.inventory_qty ?? 0)
      }
      let productIds = Object.keys(invByProduct)
      if (!productIds.length) return NextResponse.json({ skuList: [], selectedMonth, source: 'database' })

      // 2. product_master (검색 + 유형 필터)
      let pmQuery = supabase
        .from('product_master')
        .select('product_code,product_name,product_category,product_type')
        .in('product_code', productIds.slice(0, IN_BATCH))
        .limit(2000)
      if (search) pmQuery = pmQuery.or(`product_code.ilike.%${search}%,product_name.ilike.%${search}%`)
      if (typeParam && typeParam !== '전체') pmQuery = pmQuery.eq('product_type', typeParam)

      // 검색/필터가 있으면 전체 product_ids를 넣을 수 없으므로 별도 처리
      let products: any[] = []
      if (search || (typeParam && typeParam !== '전체')) {
        const PAGE = 1000
        for (let off = 0; ; off += PAGE) {
          let q = supabase
            .from('product_master')
            .select('product_code,product_name,product_category,product_type')
            .range(off, off + PAGE - 1)
          if (search) q = q.or(`product_code.ilike.%${search}%,product_name.ilike.%${search}%`)
          if (typeParam && typeParam !== '전체') q = q.eq('product_type', typeParam)
          const { data } = await q
          if (!data?.length) break
          // inventory에 있는 것만 필터
          products.push(...data.filter((p: any) => invByProduct[p.product_code] !== undefined))
          if (data.length < PAGE) break
        }
      } else {
        products = await batchIn('product_master', 'product_code,product_name,product_category,product_type', 'product_code', productIds)
      }

      const productMap: Record<string, any> = {}
      for (const p of products) productMap[p.product_code] = p
      productIds = products.map((p: any) => p.product_code)
      if (!productIds.length) return NextResponse.json({ skuList: [], selectedMonth, source: 'database' })

      // 3~6: 병렬 처리로 속도 개선
      const eightWeeksAgo = new Date(now); eightWeeksAgo.setDate(now.getDate() - 56)
      const sixMonthsAgo = new Date(now); sixMonthsAgo.setMonth(now.getMonth() - 6)
      const fourWeeksAgo = new Date(now); fourWeeksAgo.setDate(now.getDate() - 28)

      const riskMapPromise = supabase.from('risk_score')
        .select('eval_date').order('eval_date', { ascending: false }).limit(1)
        .then(async ({ data: riskSnap }) => {
          const latestRiskDate = riskSnap?.[0]?.eval_date
          const map: Record<string, { safetyStock: number; grade: string }> = {}
          if (latestRiskDate) {
            const riskRows = await batchIn('risk_score', 'product_id,safety_stock,risk_grade', 'product_id', productIds,
              q => q.eq('eval_date', latestRiskDate))
            for (const r of riskRows) map[r.product_id] = { safetyStock: Number(r.safety_stock ?? 0), grade: r.risk_grade ?? '-' }
          }
          return map
        })

      const wkPromise = batchIn('weekly_product_summary', 'product_id,order_qty', 'product_id', productIds,
        q => q.gte('week_start', eightWeeksAgo.toISOString().slice(0, 10)))

      const poPromise = batchIn('purchase_order', 'component_product_id,unit_price', 'component_product_id', productIds,
        q => q.gte('po_date', sixMonthsAgo.toISOString().slice(0, 10)).not('unit_price', 'is', null))

      const custPromise = batchIn('weekly_customer_summary', 'product_id,customer_id,order_qty', 'product_id', productIds,
        q => q.gte('week_start', fourWeeksAgo.toISOString().slice(0, 10)))

      const [riskMap, wkRows, poRows, custRows] = await Promise.all([riskMapPromise, wkPromise, poPromise, custPromise])

      // 4. 주간 수요 집계
      const demandAcc: Record<string, { total: number; cnt: number }> = {}
      for (const r of wkRows) {
        if (!demandAcc[r.product_id]) demandAcc[r.product_id] = { total: 0, cnt: 0 }
        demandAcc[r.product_id].total += Number(r.order_qty ?? 0)
        demandAcc[r.product_id].cnt++
      }

      // 5. 단가 집계
      const costAcc: Record<string, { total: number; cnt: number }> = {}
      for (const r of poRows) {
        if (!costAcc[r.component_product_id]) costAcc[r.component_product_id] = { total: 0, cnt: 0 }
        costAcc[r.component_product_id].total += Number(r.unit_price ?? 0)
        costAcc[r.component_product_id].cnt++
      }

      // 6. 주요 고객사 집계
      const custAcc: Record<string, Record<string, number>> = {}
      for (const r of custRows) {
        if (!custAcc[r.product_id]) custAcc[r.product_id] = {}
        custAcc[r.product_id][r.customer_id] = (custAcc[r.product_id][r.customer_id] ?? 0) + Number(r.order_qty ?? 0)
      }
      const custMap: Record<string, string> = {}
      for (const [pid, cmap] of Object.entries(custAcc)) {
        const top = Object.entries(cmap).sort(([, a], [, b]) => b - a)[0]
        if (top) custMap[pid] = top[0]
      }

      const skuList = productIds.map(pid => ({
        sku:         pid,
        name:        productMap[pid]?.product_name     ?? pid,
        category:    productMap[pid]?.product_category ?? '기타',
        productType: productMap[pid]?.product_type     ?? '기타',
        stock:       Math.round(invByProduct[pid] ?? 0),
        safeStock:   Math.round(riskMap[pid]?.safetyStock ?? (invByProduct[pid] ?? 0) * 0.4),
        unitCost:    costAcc[pid] ? Math.round(costAcc[pid].total / costAcc[pid].cnt) : 0,
        weeklyDemand: demandAcc[pid] ? Math.round(demandAcc[pid].total / demandAcc[pid].cnt) : 0,
        customer:    custMap[pid] ?? '-',
        grade:       riskMap[pid]?.grade ?? '-',
      }))

      return NextResponse.json({ skuList, selectedMonth, source: 'database' })
    }

    // ══════════════════════════════════════════════════════════════════════
    //  MODE: DASHBOARD — KPI + 트렌드 + 타입 통계
    // ══════════════════════════════════════════════════════════════════════

    // 1 & 2. 월 재고 + 트렌드 병렬 호출
    const trendMonths = availableMonths.slice(0, 12).reverse()
    const [invRows, trendInvRows] = await Promise.all([
      fetchAll('inventory', 'product_id,inventory_qty', q => q.eq('snapshot_date', selectedMonth)),
      fetchAll('inventory', 'product_id,snapshot_date,inventory_qty', q => q.in('snapshot_date', trendMonths))
    ])

    // 1.5 맵 구성
    const invByProduct: Record<string, number> = {}
    for (const r of invRows) {
      invByProduct[r.product_id] = (invByProduct[r.product_id] ?? 0) + Number(r.inventory_qty ?? 0)
    }
    const selectedMonthIds = Object.keys(invByProduct)

    // 3. product_master — 선택 월 + 트렌드 전체 product_id 합산
    const allProductIdSet = new Set([
      ...selectedMonthIds,
      ...trendInvRows.map((r: any) => r.product_id),
    ])
    const allProductIds = Array.from(allProductIdSet)

    // 병렬로 상품 마스터와 위험 점수 조회
    const productsPromise = batchIn(
      'product_master', 'product_code,product_type,product_category,product_name',
      'product_code', allProductIds,
    )

    const riskPromise = supabase.from('risk_score')
      .select('eval_date').order('eval_date', { ascending: false }).limit(1)
      .then(async ({ data: riskSnap }) => {
        const latestRiskDate = riskSnap?.[0]?.eval_date
        const safetyMap: Record<string, number> = {}
        if (latestRiskDate) {
          const riskRows = await batchIn('risk_score', 'product_id,safety_stock', 'product_id', selectedMonthIds,
            q => q.eq('eval_date', latestRiskDate))
          for (const r of riskRows) safetyMap[r.product_id] = Number(r.safety_stock ?? 0)
        }
        return safetyMap
      })

    const [allProducts, safetyMap] = await Promise.all([productsPromise, riskPromise])
    
    const productMap: Record<string, any> = {}
    for (const p of allProducts) productMap[p.product_code] = p

    // 5. 트렌드 집계 (month → productType → totalQty)
    const trendMap: Record<string, Record<string, number>> = {}
    for (const r of trendInvRows) {
      const m = String(r.snapshot_date)
      const pType = productMap[r.product_id]?.product_type ?? '기타'
      if (!trendMap[m]) trendMap[m] = {}
      trendMap[m][pType] = (trendMap[m][pType] ?? 0) + Number(r.inventory_qty ?? 0)
    }
    const trend = trendMonths.map(m => ({
      month: m,
      label: monthLabel(m),
      ...trendMap[m] ?? {},
    }))

    // 6. 제품 유형 목록 (선택 월 기준)
    const typeSet = new Set<string>()
    for (const pid of selectedMonthIds) {
      const pt = productMap[pid]?.product_type
      if (pt) typeSet.add(pt)
    }
    const productTypes = ['전체', ...Array.from(typeSet).sort()]

    // 7. 유형별 KPI 통계 (선택 월)
    const typeStats: Record<string, { qty: number; skuCount: number; riskCount: number; shortCount: number }> = {}
    let totalQty = 0; let totalRisk = 0; let totalShort = 0

    for (const [pid, qty] of Object.entries(invByProduct)) {
      const pType = productMap[pid]?.product_type ?? '기타'
      if (!typeStats[pType]) typeStats[pType] = { qty: 0, skuCount: 0, riskCount: 0, shortCount: 0 }
      typeStats[pType].qty += qty
      typeStats[pType].skuCount++
      totalQty += qty
      const ss = safetyMap[pid] ?? 0
      if (ss > 0) {
        if (qty < ss * 0.5) { typeStats[pType].riskCount++; totalRisk++ }
        else if (qty < ss)  { typeStats[pType].shortCount++; totalShort++ }
      }
    }
    typeStats['전체'] = { qty: totalQty, skuCount: selectedMonthIds.length, riskCount: totalRisk, shortCount: totalShort }

    // 8. 평균 커버리지 (선택 유형 기준, 최근 8주 수요)
    const eightWeeksAgo = new Date(now); eightWeeksAgo.setDate(now.getDate() - 56)
    const filteredIds = typeParam !== '전체'
      ? selectedMonthIds.filter(pid => productMap[pid]?.product_type === typeParam)
      : selectedMonthIds
    let avgCoverageDays = 0
    if (filteredIds.length > 0) {
      const wkRows = await batchIn('weekly_product_summary', 'product_id,order_qty', 'product_id', filteredIds,
        q => q.gte('week_start', eightWeeksAgo.toISOString().slice(0, 10)))
      const demandByPid: Record<string, { total: number; cnt: number }> = {}
      for (const r of wkRows) {
        if (!demandByPid[r.product_id]) demandByPid[r.product_id] = { total: 0, cnt: 0 }
        demandByPid[r.product_id].total += Number(r.order_qty ?? 0)
        demandByPid[r.product_id].cnt++
      }
      const typeInv = filteredIds.reduce((s, pid) => s + (invByProduct[pid] ?? 0), 0)
      const weeklyDemand = Object.values(demandByPid)
        .reduce((s, { total, cnt }) => s + (cnt > 0 ? total / cnt : 0), 0)
      avgCoverageDays = weeklyDemand > 0 ? Math.round((typeInv / weeklyDemand) * 7) : 0
    }

    const sel = typeStats[typeParam] ?? typeStats['전체']
    const kpi = {
      totalSku:        sel.skuCount,
      totalQty:        Math.round(sel.qty),
      riskCount:       sel.riskCount,
      shortCount:      sel.shortCount,
      avgCoverageDays,
      snapshotDate:    selectedMonth,
    }

    return NextResponse.json({
      availableMonths,
      selectedMonth,
      productTypes,
      kpi,
      trend,
      typeStats,
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] inventory error:', err)
    return NextResponse.json({ source: 'error', error: err.message }, { status: 500 })
  }
}
