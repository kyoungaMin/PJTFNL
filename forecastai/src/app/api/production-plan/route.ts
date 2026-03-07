import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* ─── Supabase 배치 조회 헬퍼 (.in() URL 길이 제한 우회) ─── */
const IN_BATCH = 400  // .in()에 한번에 보낼 ID 수 (URL 길이 제한)

async function fetchBatchIn(
  table: string, select: string, inCol: string, ids: string[],
  extra?: (q: any) => any,
): Promise<any[]> {
  const all: any[] = []
  for (let i = 0; i < ids.length; i += IN_BATCH) {
    const chunk = ids.slice(i, i + IN_BATCH)
    let q = supabase.from(table).select(select).in(inCol, chunk)
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw error
    if (data) all.push(...data)
  }
  return all
}

/* ─── risk_score 에서 dominant risk type 결정 ─── */
function dominantRiskType(row: any): string {
  const scores = [
    { type: '결품', val: Number(row.stockout_risk ?? 0) },
    { type: '과잉', val: Number(row.excess_risk ?? 0) },
    { type: '납기', val: Number(row.delivery_risk ?? 0) },
    { type: '마진', val: Number(row.margin_risk ?? 0) },
  ]
  scores.sort((a, b) => b.val - a.val)
  return scores[0].val > 0 ? scores[0].type : '결품'
}

/* ─── helper: plan_date(월요일) → 주차 라벨 ─── */
function planDateToWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const end = new Date(d.getTime() + 6 * 86400000)
  const fmt = (dt: Date) => dt.toISOString().slice(5, 10)
  return `${fmt(d)} ~ ${fmt(end)}`
}

/* ─── GET: 생산 권고 목록 (주차 기반) ─── */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedWeek = searchParams.get('week')
    const requestedDate = searchParams.get('date')

    // 1) 사용 가능한 plan_date 목록 — cursor 방식으로 distinct 조회
    const availableDates: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 20; i++) {
      let q = supabase.from('production_plan').select('plan_date')
        .order('plan_date', { ascending: false }).limit(1)
      if (cursor) q = q.lt('plan_date', cursor)
      const { data: row } = await q
      if (!row || row.length === 0) break
      availableDates.push(row[0].plan_date)
      cursor = row[0].plan_date
    }

    if (availableDates.length === 0) {
      return NextResponse.json({ items: [], availableWeeks: [], availableDates: [], source: 'empty' })
    }

    const availableWeeks = availableDates.map(d => ({
      date: d,
      label: planDateToWeekLabel(d),
    }))

    const planDate = (requestedWeek && availableDates.includes(requestedWeek))
      ? requestedWeek
      : (requestedDate && availableDates.includes(requestedDate))
        ? requestedDate
        : availableDates[0]

    // 2) 해당 주차 데이터 전체 조회 (페이지네이션)
    const plans: any[] = []
    const PAGE = 1000
    for (let off = 0; ; off += PAGE) {
      const { data: batch, error: batchErr } = await supabase
        .from('production_plan')
        .select('*')
        .eq('plan_date', planDate)
        .order('priority', { ascending: true })
        .range(off, off + PAGE - 1)
      if (batchErr) throw batchErr
      if (!batch || batch.length === 0) break
      plans.push(...batch)
      if (batch.length < PAGE) break
    }

    if (plans.length === 0) {
      return NextResponse.json({ items: [], availableWeeks, availableDates, source: 'empty' })
    }

    // 3) 조인 쿼리 — 병렬 실행
    const productIds = Array.from(new Set(plans.map(p => p.product_id)))

    // 조회주차 기간 기준 차트 범위 (planDate ~ planDate+6)
    const chartStartDate = planDate
    const chartEndDt = new Date(planDate + 'T00:00:00')
    chartEndDt.setDate(chartEndDt.getDate() + 6)
    const chartEndDate = chartEndDt.toISOString().slice(0, 10)

    const [products, risks, orders, leadTimes] = await Promise.all([
      fetchBatchIn('product_master', 'product_code,product_name,product_category', 'product_code', productIds),
      fetchBatchIn('risk_score', 'product_id,stockout_risk,excess_risk,delivery_risk,margin_risk,risk_grade,inventory_days,demand_p90,safety_stock,eval_date', 'product_id', productIds),
      fetchBatchIn('daily_order', 'product_id,customer_id,order_qty,status', 'product_id', productIds, q => q.eq('status', 'R')),
      fetchBatchIn('product_lead_time', 'product_id,avg_lead_days,p90_lead_days', 'product_id', productIds),
    ])
    // 차트용 생산 데이터 — 페이지네이션 필요 (주당 4000건+)
    const recentProd: any[] = []
    for (let off = 0; ; off += 1000) {
      const { data: batch, error: bErr } = await supabase.from('daily_production')
        .select('production_date,product_id,produced_qty')
        .gte('production_date', chartStartDate)
        .lte('production_date', chartEndDate)
        .range(off, off + 999)
      if (bErr) throw bErr
      if (!batch || batch.length === 0) break
      recentProd.push(...batch)
      if (batch.length < 1000) break
    }

    // 4) 매핑 구축
    const prodMap: Record<string, any> = {}
    for (const p of (products ?? [])) prodMap[p.product_code] = p

    const riskMap: Record<string, any> = {}
    for (const r of (risks ?? [])) {
      if (!riskMap[r.product_id] || r.eval_date > riskMap[r.product_id].eval_date) riskMap[r.product_id] = r
    }

    const customerMap: Record<string, string> = {}
    const openOrderMap: Record<string, number> = {}
    for (const o of (orders ?? [])) {
      if (!customerMap[o.product_id] && o.customer_id) customerMap[o.product_id] = o.customer_id
      openOrderMap[o.product_id] = (openOrderMap[o.product_id] ?? 0) + Number(o.order_qty ?? 0)
    }

    const ltMap: Record<string, any> = {}
    for (const lt of (leadTimes ?? [])) {
      if (!ltMap[lt.product_id] || (lt.calc_date && lt.calc_date > (ltMap[lt.product_id].calc_date ?? ''))) ltMap[lt.product_id] = lt
    }

    // 5) items 조합
    const items = plans.map(p => {
      const prod = prodMap[p.product_id] ?? {}
      const risk = riskMap[p.product_id] ?? {}
      const lt = ltMap[p.product_id] ?? {}
      const dailyCap = Number(p.daily_capacity ?? 0)
      const invDays = Number(risk.inventory_days ?? 0)
      const avgConsume = dailyCap > 0 ? Math.round(Number(p.current_inventory ?? 0) / (invDays || 1)) : 0

      return {
        id: p.id,
        sku: p.product_id,
        name: prod.product_name ?? p.product_id,
        category: prod.product_category ?? '',
        line: '-',
        demandP50: Math.round(Number(p.demand_p50 ?? 0)),
        demandP90: Math.round(Number(p.demand_p90 ?? 0)),
        currentStock: Math.round(Number(p.current_inventory ?? 0)),
        safetyStock: Math.round(Number(p.safety_stock ?? 0)),
        dailyCapacity: Math.round(dailyCap),
        maxCapacity: Math.round(Number(p.max_capacity ?? 0)),
        plannedQty: Math.round(Number(p.planned_qty ?? 0)),
        minQty: Math.round(Number(p.min_qty ?? 0)),
        maxQty: Math.round(Number(p.max_qty ?? 0)),
        priority: p.priority,
        planType: p.plan_type,
        riskGrade: p.risk_grade ?? 'A',
        stockoutRisk: Math.round(Number(risk.stockout_risk ?? 0)),
        excessRisk: Math.round(Number(risk.excess_risk ?? 0)),
        targetStart: p.target_start,
        targetEnd: p.target_end,
        description: p.description ?? '',
        status: p.status ?? 'draft',
        riskType: dominantRiskType(risk),
        customer: customerMap[p.product_id] ?? '-',
        aiReason: {
          avgConsume,
          openOrder: Math.round(openOrderMap[p.product_id] ?? 0),
          depletionDay: Math.round(invDays),
          leadTime: Math.round(Number(lt.avg_lead_days ?? 0)),
          p90Demand: Math.round(Number(p.demand_p90 ?? 0)),
        },
      }
    })

    // 우선순위 정렬
    const prioOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    items.sort((a, b) => (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9))

    // 카테고리별 생산 차트 — recentProd에서 product_id → category 매핑
    const recentProdIds = new Set((recentProd ?? []).map(r => r.product_id))
    const missingIds = Array.from(recentProdIds).filter(id => !prodMap[id])
    let extraMap: Record<string, any> = {}
    if (missingIds.length > 0) {
      const batchSize = IN_BATCH
      for (let i = 0; i < missingIds.length; i += batchSize) {
        const batch = missingIds.slice(i, i + batchSize)
        const { data: extras } = await supabase.from('product_master')
          .select('product_code,product_name,product_category')
          .in('product_code', batch)
        for (const e of (extras ?? [])) extraMap[e.product_code] = e
      }
    }
    const allProdMap = { ...prodMap, ...extraMap }

    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    const catChartMap: Record<string, Record<string, number>> = {}
    const catSet = new Set<string>()
    const productQtyMap: Record<string, number> = {}

    for (const rp of (recentProd ?? [])) {
      const d = new Date(rp.production_date + 'T00:00:00')
      const dayName = dayNames[d.getDay()]
      const qty = Number(rp.produced_qty ?? 0)
      const cat = allProdMap[rp.product_id]?.product_category ?? '기타'
      const shortCat = cat.replace(/\s*\(.*?\)\s*/g, '').trim() || '기타'

      catSet.add(shortCat)
      if (!catChartMap[dayName]) catChartMap[dayName] = {}
      catChartMap[dayName][shortCat] = (catChartMap[dayName][shortCat] ?? 0) + qty

      // Top 제품 집계
      productQtyMap[rp.product_id] = (productQtyMap[rp.product_id] ?? 0) + qty
    }

    const categories = Array.from(catSet).sort()
    const categoryChart = ['월', '화', '수', '목', '금', '토', '일'].map(day => ({
      day,
      ...Object.fromEntries(categories.map(c => [c, Math.round(catChartMap[day]?.[c] ?? 0)])),
    }))

    // Top 5 제품 생산실적
    const topProducts = Object.entries(productQtyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pid, qty]) => ({
        id: pid,
        name: allProdMap[pid]?.product_name ?? pid,
        qty: Math.round(qty),
        category: (allProdMap[pid]?.product_category ?? '').replace(/\s*\(.*?\)\s*/g, '').trim() || '기타',
      }))

    const planWeek = plans[0]?.plan_horizon ?? planDate

    return NextResponse.json({
      items,
      categoryChart,
      categories,
      topProducts,
      planDate,
      planWeek,
      planWeekLabel: planDateToWeekLabel(planDate),
      availableWeeks,
      availableDates,
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] production-plan error:', err)
    return NextResponse.json(
      { items: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}

/* ─── PATCH: 상태 변경 (승인/수정) ─── */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'id, status required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('production_plan')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('[API] production-plan PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
