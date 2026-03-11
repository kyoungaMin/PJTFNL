import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // 상품 유형(제품, 반제품 등) 유니크 값 가져오기
    const { data: catData, error: catErr } = await supabase
      .from('product_master')
      .select('product_type')
    
    if (catErr) throw catErr

    const categories = Array.from(new Set(catData?.map(d => d.product_type).filter(Boolean)))

    // 위험 평가가 있었던 유니크 날짜들 가져오기
    const { data: dateData, error: dateErr } = await supabase
      .from('risk_score')
      .select('eval_date')

    if (dateErr) throw dateErr

    const dates = Array.from(new Set(dateData?.map(d => d.eval_date).filter(Boolean))).sort((a, b) => (b as string).localeCompare(a as string))

    return NextResponse.json({ categories, dates })
  } catch (err: any) {
    console.error('[API] filters error:', err)
    return NextResponse.json({ categories: [], dates: [], error: err.message }, { status: 500 })
  }
}
