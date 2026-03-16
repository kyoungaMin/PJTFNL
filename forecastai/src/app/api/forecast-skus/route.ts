import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/forecast-skus?model=weekly|monthly
 * 예측 데이터가 존재하는 SKU 목록 반환 (product_master 조인)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const model = searchParams.get('model') ?? 'weekly'
  const modelId = model === 'monthly' ? 'lgbm_q_monthly_v2' : 'lgbm_q_v4'

  if (!supabase) {
    return NextResponse.json({ skus: [], source: 'no_client' }, { status: 200 })
  }

  try {
    // 1) 예측 데이터가 있는 distinct product_id 목록
    const { data: forecastRows, error: forecastErr } = await supabase
      .from('forecast_result')
      .select('product_id')
      .eq('model_id', modelId)
      .order('product_id', { ascending: true })
      .limit(2000)

    if (forecastErr) throw forecastErr
    if (!forecastRows || forecastRows.length === 0) {
      return NextResponse.json({ skus: [], source: 'no_data' }, { status: 200 })
    }

    const productIds = [...new Set(forecastRows.map(r => r.product_id as string))]

    // 2) product_master에서 이름·규격 조회 (배치 200개씩)
    const nameMap: Record<string, string> = {}
    const specMap: Record<string, string> = {}

    for (let i = 0; i < productIds.length; i += 200) {
      const chunk = productIds.slice(i, i + 200)
      const { data: products } = await supabase
        .from('product_master')
        .select('product_code, product_name, product_specification')
        .in('product_code', chunk)

      for (const p of products ?? []) {
        nameMap[p.product_code] = p.product_name ?? p.product_code
        specMap[p.product_code] = p.product_specification ?? ''
      }
    }

    const skus = productIds.map(id => ({
      id,
      name: nameMap[id] ?? id,
      spec: specMap[id] ?? '',
    }))

    return NextResponse.json({ skus, source: 'database' })
  } catch (err: any) {
    console.error('[API] forecast-skus error:', err)
    return NextResponse.json(
      { skus: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
