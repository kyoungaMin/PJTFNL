import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'monthly'

    // 1. product_master 전체 페이징 (2500행 이상 대응)
    const catSet = new Set<string>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from('product_master')
        .select('product_type')
        .range(offset, offset + 999)
      if (error) throw error
      if (!data?.length) break
      data.forEach(r => { if (r.product_type) catSet.add(String(r.product_type)) })
      if (data.length < 1000) break
    }

    // 2. eval_date: 커서 기반 유니크 날짜 순회 (eval_type 필터 추가)
    const evalDates: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 365; i++) {
      let q = supabase
        .from('risk_score')
        .select('eval_date')
        .eq('eval_type', type) // 주간/월간 구분 필터
        .order('eval_date', { ascending: false })
        .limit(1)
      if (cursor) q = (q as any).lt('eval_date', cursor)
      const { data, error } = await q
      if (error) throw error
      if (!data?.[0]?.eval_date) break
      evalDates.push(String(data[0].eval_date))
      cursor = String(data[0].eval_date)
    }

    return NextResponse.json({ categories: Array.from(catSet).sort(), dates: evalDates })
  } catch (err: any) {
    console.error('[API] filters error:', err)
    return NextResponse.json({ categories: [], dates: [], error: err.message }, { status: 500 })
  }
}
