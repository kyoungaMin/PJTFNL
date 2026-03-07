import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* ─── GET: 시뮬레이션용 SKU 데이터 (실데이터) ─── */
export async function GET() {
  try {
    // 1) production_plan 최신 날짜 조회
    const { data: latestRow } = await supabase
      .from('production_plan')
      .select('plan_date')
      .order('plan_date', { ascending: false })
      .limit(1)

    if (!latestRow || latestRow.length === 0) {
      return NextResponse.json({ skus: [], source: 'empty' })
    }
    const planDate = latestRow[0].plan_date

    // 2) 해당 날짜 생산 계획 전체 조회
    const { data: plans, error: plansErr } = await supabase
      .from('production_plan')
      .select('product_id,current_inventory,safety_stock,demand_p50,demand_p90,daily_capacity,max_capacity')
      .eq('plan_date', planDate)

    if (plansErr) throw plansErr
    if (!plans || plans.length === 0) {
      return NextResponse.json({ skus: [], source: 'empty' })
    }

    const productIds = plans.map(p => p.product_id)

    // 3) product_master — 이름·규격 매핑
    const { data: products } = await supabase
      .from('product_master')
      .select('product_code,product_name,product_specification')
      .in('product_code', productIds)

    const nameMap: Record<string, string> = {}
    const specMap: Record<string, string> = {}
    for (const p of (products ?? [])) {
      nameMap[p.product_code] = p.product_name
      specMap[p.product_code] = p.product_specification ?? ''
    }

    // 4) product_lead_time — 리드타임
    const { data: leadTimes } = await supabase
      .from('product_lead_time')
      .select('product_id,avg_lead_days')
      .in('product_id', productIds)
      .order('calc_date', { ascending: false })

    const ltMap: Record<string, number> = {}
    for (const lt of (leadTimes ?? [])) {
      if (!(lt.product_id in ltMap)) {
        ltMap[lt.product_id] = Math.round(Number(lt.avg_lead_days ?? 14))
      }
    }

    // 5) daily_order — 최근 4주 주문으로 주간 수요 산출 + 고객사 매핑
    const refDate = new Date(planDate + 'T00:00:00')
    const fourWeeksAgo = new Date(refDate)
    fourWeeksAgo.setDate(refDate.getDate() - 28)

    const { data: orders } = await supabase
      .from('daily_order')
      .select('product_id,customer_id,order_qty')
      .in('product_id', productIds)
      .gte('order_date', fourWeeksAgo.toISOString().slice(0, 10))
      .lte('order_date', planDate)

    const orderSumMap: Record<string, number> = {}
    const customerIdsPerProduct: Record<string, Set<string>> = {}
    const allCustomerIds = new Set<string>()
    for (const o of (orders ?? [])) {
      orderSumMap[o.product_id] = (orderSumMap[o.product_id] ?? 0) + Number(o.order_qty ?? 0)
      if (o.customer_id) {
        if (!customerIdsPerProduct[o.product_id]) customerIdsPerProduct[o.product_id] = new Set()
        customerIdsPerProduct[o.product_id].add(o.customer_id)
        allCustomerIds.add(o.customer_id)
      }
    }

    // 6) supplier(거래처) 테이블 — 고객명 매핑
    const customerNameMap: Record<string, string> = {}
    if (allCustomerIds.size > 0) {
      const { data: suppRows } = await supabase
        .from('supplier')
        .select('customer_code,customer_name')
        .in('customer_code', Array.from(allCustomerIds))
      for (const s of (suppRows ?? [])) {
        customerNameMap[s.customer_code] = s.customer_name
      }
    }

    // 고객사 목록 (전체)
    const customers = Array.from(allCustomerIds).map(cid => ({
      id: cid, name: customerNameMap[cid] ?? cid
    }))
    customers.sort((a, b) => a.name.localeCompare(b.name))

    // 7) 조합 — SIM_SKUS 형태로 매핑
    const skus = plans.map(p => {
      const weeklyDemandFromOrders = Math.round((orderSumMap[p.product_id] ?? 0) / 4)
      const weeklyDemandFromPlan = Math.round(Number(p.demand_p50 ?? 0) / 4.3)
      const weeklyDemand = weeklyDemandFromOrders > 0 ? weeklyDemandFromOrders : weeklyDemandFromPlan
      const custSet = customerIdsPerProduct[p.product_id]
      const custIds = custSet ? Array.from(custSet) : []

      return {
        id: p.product_id,
        name: nameMap[p.product_id] ?? p.product_id,
        spec: specMap[p.product_id] ?? '',
        safeStock: Math.round(Number(p.safety_stock ?? 0)),
        currentStock: Math.round(Number(p.current_inventory ?? 0)),
        leadTime: ltMap[p.product_id] ?? 14,
        weeklyDemand,
        productionCap: Math.round(Number(p.daily_capacity ?? 0)),
        customers: custIds.map(cid => ({ id: cid, name: customerNameMap[cid] ?? cid })),
      }
    })

    // 재고 위험도순 정렬 (현재재고/안전재고 비율 오름차순 = 위험한 SKU부터)
    skus.sort((a, b) => {
      const ratioA = a.safeStock > 0 ? a.currentStock / a.safeStock : 999
      const ratioB = b.safeStock > 0 ? b.currentStock / b.safeStock : 999
      return ratioA - ratioB
    })

    return NextResponse.json({
      skus,
      customers,
      planDate,
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] simulation-skus error:', err)
    return NextResponse.json(
      { skus: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
