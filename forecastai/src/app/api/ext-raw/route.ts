import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Freq, labelFor, getWeekMonday, groupRowsByFreq } from '@/lib/freqUtils'

/**
 * /api/ext-raw — 원자재 외부 API 프록시
 *
 * 데이터 소스:
 *   1순위: Supabase DB (economic_indicator 테이블)
 *      - COPPER_LME : FRED PCOPPUSDM 적재 (seed-indicators)
 *      - WTI_MONTHLY: EIA 적재
 *      - GOLD_LBMA  : Yahoo Finance GC=F 적재 (seed-indicators)
 *   2순위: EIA API v2 (WTI만 실데이터, Copper/Gold 0)
 *
 * 환경변수:
 *   - EIA_API_KEY: EIA 오픈 API 키 (https://www.eia.gov/opendata)
 */

const EIA_BASE = 'https://api.eia.gov/v2'

function startDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

/** EIA API v2 — WTI 주간 현물가 (USD/bbl) */
async function fetchWti(apiKey: string, months: number) {
  const start = startDate(months)
  const url = `${EIA_BASE}/petroleum/pri/spt/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[series][]=RWTC&start=${start}&sort[0][column]=period&sort[0][direction]=asc&length=500`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const json = await res.json()
  return (json?.response?.data ?? []) as { period: string; value: string }[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') ?? '12', 10)
  const freq = (searchParams.get('freq') ?? 'month') as Freq
  const start = startDate(months)

  // ── 1순위: Supabase DB ────────────────────────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('economic_indicator')
      .select('date, indicator_code, value')
      .in('indicator_code', ['COPPER_LME', 'WTI_MONTHLY', 'GOLD_LBMA'])
      .gte('date', start)
      .order('date', { ascending: true })
      .limit(10000)

    if (!error && data?.length) {
      const rows = data.map(r => ({
        date: r.date as string,
        indicator_code: r.indicator_code as string,
        value: Number(r.value),
      }))
      const map = groupRowsByFreq(rows, freq)
      const items = Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, vals]) => ({
          d: labelFor(key, freq),
          copper: vals['COPPER_LME'] ?? 0,
          wti: vals['WTI_MONTHLY'] ?? 0,
          gold: vals['GOLD_LBMA'] ?? 0,
        }))
      if (items.filter(r => r.copper || r.wti || r.gold).length >= 2) {
        return NextResponse.json({ items, source: 'supabase' })
      }
    }
  } catch {
    // DB 실패 시 다음 단계로
  }

  // ── 2순위: EIA API (WTI만, Copper/Gold = 0) ───────────────────────────────
  const eiaKey = process.env.EIA_API_KEY
  if (!eiaKey) {
    return NextResponse.json({ items: [], source: 'no_api_key' })
  }

  try {
    const wtiRows = await fetchWti(eiaKey, months)

    const wtiMap: Record<string, { sum: number; count: number }> = {}
    for (const r of wtiRows) {
      const val = parseFloat(r.value)
      if (isNaN(val)) continue
      const dateStr = r.period.slice(0, 10)
      let key: string
      if (freq === 'day') key = dateStr
      else if (freq === 'week') key = getWeekMonday(dateStr)
      else key = r.period.slice(0, 7)
      if (!wtiMap[key]) wtiMap[key] = { sum: 0, count: 0 }
      wtiMap[key].sum += val
      wtiMap[key].count += 1
    }

    const items = Object.entries(wtiMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { sum, count }]) => ({
        d: labelFor(key, freq),
        copper: 0,
        wti: Math.round((sum / count) * 100) / 100,
        gold: 0,
      }))

    if (items.length < 2) {
      return NextResponse.json({ items: [], source: 'insufficient_data' })
    }

    return NextResponse.json({ items, source: 'eia' })
  } catch (err: any) {
    console.error('[API] ext-raw error:', err)
    return NextResponse.json({ items: [], source: 'error', error: err.message }, { status: 500 })
  }
}
