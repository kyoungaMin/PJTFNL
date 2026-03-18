import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* ─── helper: ISO week Monday 계산 ─── */
function isoWeekMonday(d: Date): Date {
  const day = d.getDay() || 7 // 일=7
  const mon = new Date(d)
  mon.setDate(d.getDate() - day + 1)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function isoWeekNum(d: Date): number {
  const tmp = new Date(d.getTime())
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function fmtShort(d: Date) {
  return d.toISOString().slice(5, 10)  // "03-10"
}

// GET /api/model-evaluation/periods?type=weekly|monthly
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'weekly'
  const modelId = 'lgbm_q_v3'

  try {
    const { data, error } = await supabase
      .from('forecast_result')
      .select('target_date')
      .eq('model_id', modelId)
      .not('actual_qty', 'is', null)
      .order('target_date', { ascending: false })

    if (error) throw error

    const seen = new Set<string>()
    const periods: { key: string; label: string; dateRange: string }[] = []

    for (const row of data ?? []) {
      const d = new Date(row.target_date + 'T00:00:00')

      if (type === 'monthly') {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (seen.has(key)) continue
        seen.add(key)

        const year = d.getFullYear(), month = d.getMonth()
        const start = new Date(year, month, 1)
        const end = new Date(year, month + 1, 0)
        periods.push({
          key,
          label: `${year}년 ${month + 1}월`,
          dateRange: `${fmtDate(start)} ~ ${fmtDate(end)}`,
        })
      } else {
        const mon = isoWeekMonday(d)
        const sun = new Date(mon.getTime() + 6 * 86400000)
        const wn = isoWeekNum(d)
        const key = `${mon.getFullYear()}-W${String(wn).padStart(2, '0')}`
        if (seen.has(key)) continue
        seen.add(key)

        periods.push({
          key,
          label: `${fmtShort(mon)} ~ ${fmtShort(sun)}`,
          dateRange: `${fmtDate(mon)} ~ ${fmtDate(sun)}`,
        })
      }
    }

    // 최신순 정렬 (이미 desc로 가져왔으므로 순서 유지)
    return NextResponse.json({ type, modelId, periods })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? String(err) },
      { status: 500 }
    )
  }
}
