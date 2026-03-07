import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

/* ─── GET: 생산 권고 목록 ─── */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedDate = searchParams.get('date')  // ?date=2026-03-07

    // 사용 가능한 plan_date 목록 조회 (cursor 방식으로 distinct 구현)
    const availableDates: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 100; i++) {
      let q = supabase
        .from('production_plan')
        .select('plan_date')
        .order('plan_date', { ascending: false })
        .limit(1)
      if (cursor) q = q.lt('plan_date', cursor)
      const { data: row } = await q
      if (!row || row.length === 0) break
      availableDates.push(row[0].plan_date)
      cursor = row[0].plan_date
    }

    if (availableDates.length === 0) {
      return NextResponse.json({ items: [], availableDates: [], source: 'empty' })
    }

    // 요청된 날짜 또는 최신 날짜 사용
    const planDate = requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : availableDates[0]

    const { data: plans, error: plansErr } = await supabase
      .from('production_plan')
      .select('*')
      .eq('plan_date', planDate)
      .order('priority', { ascending: true })

    if (plansErr) throw plansErr
    if (!plans || plans.length === 0) {
      return NextResponse.json({ items: [], availableDates, source: 'empty' })
    }

    // 2) product_master — 이름 매핑
    const productIds = Array.from(new Set(plans.map(p => p.product_id)))
    const { data: products } = await supabase
      .from('product_master')
      .select('product_code,product_name,product_category')
      .in('product_code', productIds)

    const prodMap: Record<string, any> = {}
    for (const p of (products ?? [])) {
      prodMap[p.product_code] = p
    }

    // 3) risk_score — 최신 평가
    const { data: risks } = await supabase
      .from('risk_score')
      .select('product_id,stockout_risk,excess_risk,delivery_risk,margin_risk,risk_grade,inventory_days,demand_p90,safety_stock,eval_date')
      .in('product_id', productIds)
      .order('eval_date', { ascending: false })

    const riskMap: Record<string, any> = {}
    for (const r of (risks ?? [])) {
      if (!riskMap[r.product_id]) riskMap[r.product_id] = r
    }

    // 4) daily_production — 라인 매핑 (최신 생산 기록의 line_id)
    const { data: prodLines } = await supabase
      .from('daily_production')
      .select('product_id,line_id')
      .in('product_id', productIds)
      .order('production_date', { ascending: false })
      .limit(productIds.length * 10)

    const lineMap: Record<string, string> = {}
    for (const pl of (prodLines ?? [])) {
      if (!lineMap[pl.product_id] && pl.line_id) {
        lineMap[pl.product_id] = pl.line_id
      }
    }

    // 5) daily_order — 고객 매핑 + 미처리 수주량
    const { data: orders } = await supabase
      .from('daily_order')
      .select('product_id,customer_id,order_qty,status')
      .in('product_id', productIds)
      .eq('status', 'R')
      .limit(5000)

    const customerMap: Record<string, string> = {}
    const openOrderMap: Record<string, number> = {}
    for (const o of (orders ?? [])) {
      if (!customerMap[o.product_id] && o.customer_id) {
        customerMap[o.product_id] = o.customer_id
      }
      openOrderMap[o.product_id] = (openOrderMap[o.product_id] ?? 0) + Number(o.order_qty ?? 0)
    }

    // 6) product_lead_time
    const { data: leadTimes } = await supabase
      .from('product_lead_time')
      .select('product_id,avg_lead_days,p90_lead_days')
      .in('product_id', productIds)
      .order('calc_date', { ascending: false })

    const ltMap: Record<string, any> = {}
    for (const lt of (leadTimes ?? [])) {
      if (!ltMap[lt.product_id]) ltMap[lt.product_id] = lt
    }

    // 7) 조합
    const items = plans.map((p, idx) => {
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
        line: lineMap[p.product_id] ?? '-',
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
          avgConsume: avgConsume,
          openOrder: Math.round(openOrderMap[p.product_id] ?? 0),
          depletionDay: Math.round(invDays),
          leadTime: Math.round(Number(lt.avg_lead_days ?? 0)),
          p90Demand: Math.round(Number(p.demand_p90 ?? 0)),
        },
      }
    })

    // 우선순위 정렬: critical > high > medium > low
    const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    items.sort((a, b) => (prioOrder[a.priority] ?? 9) - (prioOrder[b.priority] ?? 9))

    // 라인별 생산 차트 데이터 생성
    const lines = Array.from(new Set(items.map(i => i.line).filter(l => l !== '-'))).sort()

    // 일별 라인별 생산량 (planDate 기준 최근 7일)
    const refDate = new Date(planDate + 'T00:00:00')
    const sevenDaysAgo = new Date(refDate)
    sevenDaysAgo.setDate(refDate.getDate() - 6)
    const { data: recentProd } = await supabase
      .from('daily_production')
      .select('production_date,line_id,produced_qty')
      .gte('production_date', sevenDaysAgo.toISOString().slice(0, 10))
      .lte('production_date', planDate)
      .order('production_date', { ascending: true })

    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    const lineChartMap: Record<string, Record<string, number>> = {}
    for (const rp of (recentProd ?? [])) {
      const d = new Date(rp.production_date)
      const dayName = dayNames[d.getDay()]
      if (!lineChartMap[dayName]) lineChartMap[dayName] = {}
      const lid = rp.line_id ?? 'etc'
      lineChartMap[dayName][lid] = (lineChartMap[dayName][lid] ?? 0) + Number(rp.produced_qty ?? 0)
    }

    const lineChart = ['월', '화', '수', '목', '금', '토', '일'].map(day => ({
      day,
      ...Object.fromEntries(lines.map(l => [l, Math.round(lineChartMap[day]?.[l] ?? 0)])),
    }))

    // 우선순위 분포
    const priorityDist = [
      { name: 'Critical', value: items.filter(i => i.priority === 'critical').length, color: '#DC2626' },
      { name: 'High',     value: items.filter(i => i.priority === 'high').length,     color: '#EA580C' },
      { name: 'Medium',   value: items.filter(i => i.priority === 'medium').length,   color: '#D97706' },
      { name: 'Low',      value: items.filter(i => i.priority === 'low').length,      color: '#059669' },
    ].filter(d => d.value > 0)

    return NextResponse.json({
      items,
      lineChart,
      lines,
      priorityDist,
      planDate,
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
