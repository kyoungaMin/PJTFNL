import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/model-evaluation/periods?type=weekly|monthly
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'weekly'
  const modelId = type === 'monthly' ? 'lgbm_q_monthly_v1' : 'lgbm_q_v2'

  try {
    const { data, error } = await supabase
      .from('forecast_result')
      .select('target_date')
      .eq('model_id', modelId)
      .not('actual_qty', 'is', null)
      .order('target_date', { ascending: true })

    if (error) throw error

    // Deduplicate & convert to week/month labels
    const seen = new Set<string>()
    const periods: string[] = []

    for (const row of data ?? []) {
      const d = new Date(row.target_date)
      let label: string

      if (type === 'monthly') {
        label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      } else {
        // ISO week calculation
        const jan4 = new Date(d.getFullYear(), 0, 4)
        const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1
        const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7)
        label = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`
      }

      if (!seen.has(label)) {
        seen.add(label)
        periods.push(label)
      }
    }

    return NextResponse.json({ type, periods })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? String(err) },
      { status: 500 }
    )
  }
}
