import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/forecast-monthly/dates?sku=...
 * 해당 SKU의 사용 가능한 월간 예측 날짜 목록 반환 (최대 12개월)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('sku') ?? ''

  if (!supabase) {
    return NextResponse.json({ dates: [], source: 'no_client' }, { status: 200 })
  }
  if (!productId) {
    return NextResponse.json({ dates: [], source: 'no_sku' }, { status: 200 })
  }

  try {
    const { data, error } = await supabase
      .from('forecast_result')
      .select('forecast_date')
      .eq('product_id', productId)
      .eq('model_id', 'lgbm_q_v3')
      .order('forecast_date', { ascending: false })
      .limit(36) // horizon 3개(28/56/91) × 최대 12개월

    if (error) throw error

    // 중복 제거 후 최대 12개
    const unique = [...new Set((data ?? []).map(r => r.forecast_date as string))].slice(0, 12)

    return NextResponse.json({ dates: unique, source: 'database' })
  } catch (err: any) {
    console.error('[API] forecast-monthly/dates error:', err)
    return NextResponse.json(
      { dates: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
