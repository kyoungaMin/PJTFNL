import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* ─── GET: 구매 권고 목록 ─── */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedDate = searchParams.get('date')

    // 사용 가능한 plan_date 목록 (cursor 방식 distinct)
    const availableDates: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 100; i++) {
      let q = supabase
        .from('purchase_recommendation')
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

    const planDate = requestedDate && availableDates.includes(requestedDate)
      ? requestedDate
      : availableDates[0]

    // 해당 날짜 데이터 조회
    const { data: recs, error: recsErr } = await supabase
      .from('purchase_recommendation')
      .select('*')
      .eq('plan_date', planDate)
      .order('urgency', { ascending: true })

    if (recsErr) throw recsErr
    if (!recs || recs.length === 0) {
      return NextResponse.json({ items: [], availableDates, source: 'empty' })
    }

    // product_master 조인 — 부품명/카테고리
    const componentIds = Array.from(new Set(recs.map(r => r.component_product_id)))
    const { data: masters } = await supabase
      .from('product_master')
      .select('product_code,product_name,product_category')
      .in('product_code', componentIds)

    const masterMap: Record<string, any> = {}
    for (const m of (masters ?? [])) {
      masterMap[m.product_code] = m
    }

    // items 변환
    const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    const items = recs.map(r => {
      const m = masterMap[r.component_product_id] ?? {}
      const unitPrice = Number(r.supplier_unit_price ?? 0)
      const recQty = Math.round(Number(r.recommended_qty ?? 0))
      return {
        id: r.id,
        componentId: r.component_product_id,
        componentName: m.product_name ?? r.component_product_id,
        category: m.product_category ?? '',
        parentProducts: r.parent_product_ids ?? '',
        grossRequirement: Math.round(Number(r.gross_requirement ?? 0)),
        currentInventory: Math.round(Number(r.current_inventory ?? 0)),
        pendingPo: Math.round(Number(r.pending_po_qty ?? 0)),
        netRequirement: Math.round(Number(r.net_requirement ?? 0)),
        safetyStock: Math.round(Number(r.safety_stock ?? 0)),
        reorderPoint: Math.round(Number(r.reorder_point ?? 0)),
        recommendedQty: recQty,
        orderMethod: r.order_method ?? 'eoq',
        supplier: r.recommended_supplier ?? '-',
        supplierName: r.supplier_name ?? '-',
        leadDays: Math.round(Number(r.supplier_lead_days ?? 0)),
        unitPrice,
        orderAmount: recQty * unitPrice,
        altSupplier: r.alt_supplier ?? '-',
        altSupplierName: r.alt_supplier_name ?? '-',
        latestOrderDate: r.latest_order_date ?? '-',
        expectedReceiptDate: r.expected_receipt_date ?? '-',
        needDate: r.need_date ?? '-',
        urgency: r.urgency ?? 'medium',
        description: r.description ?? '',
        status: r.status ?? 'pending',
      }
    })

    // 긴급도 정렬
    items.sort((a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9))

    // 공급사별 발주금액 차트
    const supplierAmounts: Record<string, { supplier: string; amount: number }> = {}
    for (const item of items) {
      if (item.orderAmount <= 0) continue
      const key = item.supplierName
      if (!supplierAmounts[key]) supplierAmounts[key] = { supplier: key, amount: 0 }
      supplierAmounts[key].amount += item.orderAmount
    }
    const supplierChart = Object.values(supplierAmounts).sort((a, b) => b.amount - a.amount)

    // 긴급도 분포
    const urgencyDist = [
      { name: 'Critical', value: items.filter(i => i.urgency === 'critical').length, color: '#DC2626' },
      { name: 'High',     value: items.filter(i => i.urgency === 'high').length,     color: '#EA580C' },
      { name: 'Medium',   value: items.filter(i => i.urgency === 'medium').length,   color: '#D97706' },
      { name: 'Low',      value: items.filter(i => i.urgency === 'low').length,      color: '#059669' },
    ].filter(d => d.value > 0)

    // 공급사 목록 (필터용)
    const suppliers = Array.from(new Set(items.map(i => i.supplierName).filter(s => s !== '-'))).sort()

    return NextResponse.json({
      items,
      supplierChart,
      urgencyDist,
      suppliers,
      planDate,
      availableDates,
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] purchase-recommendation error:', err)
    return NextResponse.json(
      { items: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}

/* ─── PATCH: 상태 변경 ─── */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'id, status required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('purchase_recommendation')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    console.error('[API] purchase-recommendation PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
