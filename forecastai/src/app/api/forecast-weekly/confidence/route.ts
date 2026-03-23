import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/forecast-weekly/confidence?limit=6
 *
 * feature_store_weekly에서 최신 주차 기준 제품별 예측 불확실성 지표를 반환.
 * 간헐적 수요(zero_ratio) + 고변동성(cv4) 기반으로 점수 산출,
 * 상위 N개 제품을 "주의 제품"으로 반환.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '6', 10), 20)

  if (!supabase) {
    return NextResponse.json({ items: [], source: 'no_client' })
  }

  try {
    const { data: latestWeekRows, error: latestWeekErr } = await supabase
      .from('feature_store_weekly')
      .select('year_week')
      .order('year_week', { ascending: false })
      .limit(1)

    if (latestWeekErr || !latestWeekRows?.[0]?.year_week) {
      return NextResponse.json({ items: [], source: 'no_data' })
    }

    const latestWeek = latestWeekRows[0].year_week
    const latest: {
      product_id: string
      year_week: string
      order_qty_nonzero_13w: number | null
      order_qty_cv4: number | null
    }[] = []

    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from('feature_store_weekly')
        .select('product_id, year_week, order_qty_nonzero_13w, order_qty_cv4')
        .eq('year_week', latestWeek)
        .order('product_id', { ascending: true })
        .range(offset, offset + 999)

      if (error) throw error
      if (!data?.length) break
      latest.push(...data)
      if (data.length < 1000) break
    }

    // 신뢰도 점수 계산
    //   zeroRatio: 최근 13주 중 수요가 없는 주 비율 (높을수록 간헐적)
    //   cv4:       최근 4주 변동계수 (높을수록 불안정)
    //   score:     zeroRatio 60% + cv4 기여 40%
    type Scored = {
      productId: string
      zeroRatio: number   // 0~100 (%)
      cv: number
      score: number
      level: 'high' | 'medium'
    }

    const scored: Scored[] = latest.map(r => {
      const nonzero13 = Number(r.order_qty_nonzero_13w ?? 0)
      const zeroRatio = Math.max(0, Math.min(1, 1 - nonzero13 / 13))
      const cv4 = Number(r.order_qty_cv4 ?? 0)
      const score = zeroRatio * 0.6 + Math.min(cv4 / 2, 1) * 0.4
      return {
        productId: r.product_id,
        zeroRatio: Math.round(zeroRatio * 100),
        cv: Math.round(cv4 * 100) / 100,
        score,
        level: (zeroRatio >= 0.7 || cv4 >= 1.0) ? 'high' : 'medium',
      }
    })

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.productId.localeCompare(b.productId)
    })
    const topN = scored.slice(0, limit)

    return NextResponse.json({ items: topN, source: 'database' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[API] forecast-weekly/confidence error:', msg)
    return NextResponse.json({ items: [], source: 'error', error: msg }, { status: 500 })
  }
}
