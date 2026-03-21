import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/* 최근 1시간 API 라우트별 요청/에러/응답시간 통계 */
export async function GET() {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('api_log')
      .select('route, status_code, duration_ms')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (error) throw error

    // 라우트별 집계
    const map = new Map<string, { total: number; errors: number; durations: number[] }>()
    for (const row of data ?? []) {
      const entry = map.get(row.route) ?? { total: 0, errors: 0, durations: [] }
      entry.total++
      if (row.status_code >= 500) entry.errors++
      if (row.duration_ms != null) entry.durations.push(row.duration_ms)
      map.set(row.route, entry)
    }

    const stats = Array.from(map.entries())
      .map(([route, s]) => ({
        route,
        total: s.total,
        errors: s.errors,
        error_rate: s.total > 0 ? (s.errors / s.total) * 100 : 0,
        avg_duration: s.durations.length > 0 ? s.durations.reduce((a, b) => a + b, 0) / s.durations.length : 0,
      }))
      .sort((a, b) => b.error_rate - a.error_rate || b.total - a.total)

    return NextResponse.json({ stats })
  } catch (err: any) {
    console.error('[API] monitoring/api-stats error:', err)
    return NextResponse.json({ stats: [] })
  }
}
