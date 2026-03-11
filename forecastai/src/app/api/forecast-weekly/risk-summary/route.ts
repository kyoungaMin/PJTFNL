import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/** 리스크 등급 → 한글 레이블 */
const GRADE_LABEL: Record<string, string> = {
  A: '안전',
  B: '양호',
  C: '주의',
  D: '경고',
  F: '위험',
}

/** 리스크 등급 → 색상 토큰 */
const GRADE_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  A: { color: '#059669', bg: '#ECFDF5', border: '#D1FAE5' },
  B: { color: '#65A30D', bg: '#F7FEE7', border: '#ECFCCB' },
  C: { color: '#D97706', bg: '#FFFBEB', border: '#FEF3C7' },
  D: { color: '#EA580C', bg: '#FFF7ED', border: '#FFEDD5' },
  F: { color: '#DC2626', bg: '#FEF2F2', border: '#FEE2E2' },
}

type RiskScoreRow = {
  eval_date: string
  risk_grade: string
  total_risk: number
  stockout_risk: number
  excess_risk: number
  delivery_risk: number
  margin_risk: number
  inventory_days: number
  demand_p90: number
  safety_stock: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('sku') ?? ''

  if (!supabase) {
    return NextResponse.json({ data: null, source: 'no_client' }, { status: 200 })
  }
  if (!productId) {
    return NextResponse.json({ data: null, source: 'no_sku' }, { status: 200 })
  }

  try {
    const { data: rawData, error } = await supabase
      .from('risk_score')
      .select(
        'eval_date, stockout_risk, excess_risk, delivery_risk, margin_risk, ' +
        'total_risk, risk_grade, inventory_days, demand_p90, safety_stock'
      )
      .eq('product_id', productId)
      .order('eval_date', { ascending: false })
      .limit(1)
      .single()

    if (error || !rawData) {
      return NextResponse.json({ data: null, source: 'no_data' }, { status: 200 })
    }

    const data = rawData as unknown as RiskScoreRow
    const grade: string = data.risk_grade ?? 'A'

    return NextResponse.json({
      data: {
        evalDate: data.eval_date,
        grade,
        gradeLabel: GRADE_LABEL[grade] ?? '—',
        gradeColor: GRADE_COLOR[grade] ?? GRADE_COLOR['A'],
        totalRisk: Number(data.total_risk ?? 0),
        stockoutRisk: Number(data.stockout_risk ?? 0),
        excessRisk: Number(data.excess_risk ?? 0),
        deliveryRisk: Number(data.delivery_risk ?? 0),
        marginRisk: Number(data.margin_risk ?? 0),
        inventoryDays: Number(data.inventory_days ?? 0),
        demandP90: Number(data.demand_p90 ?? 0),
        safetyStock: Number(data.safety_stock ?? 0),
      },
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] risk-summary error:', err)
    return NextResponse.json(
      { data: null, source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
