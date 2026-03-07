import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/model-scenario?model=lgbm_q_v2&product=ALL&weeks=8
export async function GET(req: NextRequest) {
  const modelId = req.nextUrl.searchParams.get('model') ?? 'lgbm_q_v2'
  const productId = req.nextUrl.searchParams.get('product') ?? ''
  const weeks = parseInt(req.nextUrl.searchParams.get('weeks') ?? '8')

  try {
    // 1) 제품 목록 조회 (product 파라미터가 없거나 ALL이면)
    if (!productId || productId === 'ALL') {
      // forecast_result에서 해당 모델의 고유 product_id 목록
      const { data: prodRows, error: prodErr } = await supabase
        .from('forecast_result')
        .select('product_id')
        .eq('model_id', modelId)

      if (prodErr) throw prodErr

      const uniqueIds = [...new Set((prodRows ?? []).map(r => r.product_id))]

      // product_master에서 이름 조회
      const { data: masterRows } = await supabase
        .from('product_master')
        .select('product_code,product_name,product_specification')
        .in('product_code', uniqueIds.slice(0, 500))

      const nameMap: Record<string, string> = {}
      const specMap: Record<string, string> = {}
      for (const m of (masterRows ?? [])) {
        nameMap[m.product_code] = m.product_name
        specMap[m.product_code] = m.product_specification ?? ''
      }

      const products = uniqueIds.map(id => ({
        id,
        name: nameMap[id] ?? id,
        spec: specMap[id] ?? '',
      }))
      products.sort((a, b) => a.name.localeCompare(b.name))

      return NextResponse.json({ products, modelId })
    }

    // 2) 특정 제품의 예측 시계열 조회
    const { data: rows, error } = await supabase
      .from('forecast_result')
      .select('target_date, p10, p50, p90, actual_qty')
      .eq('model_id', modelId)
      .eq('product_id', productId)
      .order('target_date', { ascending: true })

    if (error) throw error

    const allRows = rows ?? []
    if (allRows.length === 0) {
      return NextResponse.json({ product: null, predictions: [], modelId, source: 'empty' })
    }

    // 주별 그룹핑
    const weekMap = new Map<string, { dates: string[], p10: number[], p50: number[], p90: number[], actual: number[] }>()
    for (const r of allRows) {
      const d = new Date(r.target_date + 'T00:00:00')
      const yearStart = new Date(d.getFullYear(), 0, 1)
      const dayOfYear = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1
      const weekNum = Math.ceil(dayOfYear / 7)
      const weekKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { dates: [], p10: [], p50: [], p90: [], actual: [] })
      }
      const entry = weekMap.get(weekKey)!
      entry.dates.push(r.target_date)
      entry.p10.push(Number(r.p10 ?? 0))
      entry.p50.push(Number(r.p50 ?? 0))
      entry.p90.push(Number(r.p90 ?? 0))
      if (r.actual_qty != null) entry.actual.push(Number(r.actual_qty))
    }

    // 주별 집계 (합계)
    const weekKeys = [...weekMap.keys()].sort()
    const targetWeeks = weekKeys.slice(-weeks)
    const predictions = targetWeeks.map((wk, idx) => {
      const entry = weekMap.get(wk)!
      const sumP10 = entry.p10.reduce((s, v) => s + v, 0)
      const sumP50 = entry.p50.reduce((s, v) => s + v, 0)
      const sumP90 = entry.p90.reduce((s, v) => s + v, 0)
      const sumActual = entry.actual.length > 0 ? entry.actual.reduce((s, v) => s + v, 0) : null
      return {
        week: `W${String(idx + 1).padStart(2, '0')}`,
        weekKey: wk,
        targetDate: entry.dates[0],
        p10: Math.round(sumP10),
        p50: Math.round(sumP50),
        p90: Math.round(sumP90),
        actual: sumActual != null ? Math.round(sumActual) : null,
        nDays: entry.dates.length,
      }
    })

    // 3) 제품 정보 (production_plan, product_master)
    const { data: masterRow } = await supabase
      .from('product_master')
      .select('product_code,product_name,product_specification')
      .eq('product_code', productId)
      .limit(1)

    const { data: planRow } = await supabase
      .from('production_plan')
      .select('current_inventory,safety_stock,daily_capacity,demand_p50')
      .eq('product_id', productId)
      .order('plan_date', { ascending: false })
      .limit(1)

    const hasPlan = planRow && planRow.length > 0 && Number(planRow[0].current_inventory ?? 0) > 0
    let currentStock: number, safeStock: number, productionCap: number
    let dataEstimated = false
    const usedTables = ['forecast_result', 'product_master']

    if (hasPlan) {
      currentStock = Math.round(Number(planRow![0].current_inventory ?? 0))
      safeStock = Math.round(Number(planRow![0].safety_stock ?? 0))
      productionCap = Math.round(Number(planRow![0].daily_capacity ?? 0))
      usedTables.push('production_plan')
    } else {
      // production_plan에 데이터 없음 → 예측 데이터 기반 추정
      dataEstimated = true
      const avgWeeklyP50 = predictions.length > 0
        ? Math.round(predictions.reduce((s, p) => s + p.p50, 0) / predictions.length)
        : 0
      currentStock = avgWeeklyP50 * 3       // 3주치 수요를 현재 재고로 추정
      safeStock = avgWeeklyP50 * 2           // 2주치 수요를 안전재고로 추정
      productionCap = Math.round(avgWeeklyP50 / 5)  // 주5일 기준 일 생산능력 추정
    }

    const product = {
      id: productId,
      name: masterRow?.[0]?.product_name ?? productId,
      spec: masterRow?.[0]?.product_specification ?? '',
      currentStock,
      safeStock,
      productionCap,
      estimated: dataEstimated,
    }

    // 데이터 메타 정보
    const dateRange = predictions.length > 0
      ? { start: predictions[0].targetDate, end: predictions[predictions.length - 1].targetDate }
      : null
    const totalRecords = allRows.length

    return NextResponse.json({
      product,
      predictions,
      modelId,
      source: 'database',
      meta: {
        totalRecords,
        weekCount: predictions.length,
        dateRange,
        tables: usedTables,
        modelDesc: modelId === 'lgbm_q_v2' ? 'LightGBM 주간 수요예측 모델 v2' : 'LightGBM 월간 수요예측 모델 v1',
        estimated: dataEstimated,
      },
    })
  } catch (err: any) {
    console.error('[API] model-scenario error:', err)
    return NextResponse.json(
      { error: err.message ?? String(err) },
      { status: 500 }
    )
  }
}
