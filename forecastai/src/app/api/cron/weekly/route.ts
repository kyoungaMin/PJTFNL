import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/cron/weekly
 * Vercel Cron: 매주 월요일 실행
 * 담당: WTI_MONTHLY (EIA API)
 */

function startDate(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

async function fetchWti(apiKey: string) {
  const start = startDate(3)
  const url = `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[series][]=RWTC&start=${start}&sort[0][column]=period&sort[0][direction]=asc&length=500`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`EIA API 오류: ${res.status}`)
  const json = await res.json()
  const rawRows = json?.response?.data ?? []

  const monthMap: Record<string, { sum: number; count: number }> = {}
  for (const r of rawRows) {
    const val = parseFloat(r.value)
    if (isNaN(val)) continue
    const ym = r.period.slice(0, 7)
    if (!monthMap[ym]) monthMap[ym] = { sum: 0, count: 0 }
    monthMap[ym].sum += val
    monthMap[ym].count++
  }

  return Object.entries(monthMap).map(([ym, { sum, count }]) => ({
    date: ym + '-01',
    indicator_code: 'WTI_MONTHLY',
    indicator_name: 'WTI Crude Oil Price',
    source: 'EIA',
    unit: 'USD/bbl',
    value: Math.round((sum / count) * 100) / 100,
  }))
}

async function upsert(rows: Record<string, unknown>[], label: string) {
  if (!rows.length) return { label, count: 0 }
  const { error } = await supabase.from('economic_indicator').upsert(rows, { onConflict: 'source,indicator_code,date' })
  if (error) throw new Error(`${label} upsert 실패: ${error.message}`)
  return { label, count: rows.length }
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const eiaKey = process.env.EIA_API_KEY
  if (!eiaKey) return NextResponse.json({ error: 'EIA_API_KEY 없음' }, { status: 500 })

  const results: Record<string, unknown> = {}

  try {
    const rows = await fetchWti(eiaKey)
    results.wti = await upsert(rows, 'WTI')
  } catch (e: any) {
    results.wti = { error: e.message }
  }

  return NextResponse.json({ ok: true, results, at: new Date().toISOString() })
}
