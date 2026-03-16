import { NextResponse } from 'next/server'
import { Freq, labelFor, getWeekMonday } from '@/lib/freqUtils'

/**
 * /api/ext-raw — 원자재 외부 API 프록시
 *
 * 데이터 소스:
 *   - EIA API v2: WTI 원유 현물가 (RWTC 시리즈, 주간 → freq별 집계)
 *   - Gold: DB 미수집 → null 반환 (프론트에서 MOCK 병합)
 *   - Copper: EIA 미지원 → null 반환 (추후 LME API 연동 시 추가)
 *
 * 환경변수:
 *   - EIA_API_KEY: EIA 오픈 API 키 (https://www.eia.gov/opendata)
 *
 * 응답: externalData.ts fetchRawData() 반환 형식과 동일
 *   [{ d: 'N월', copper, wti, gold }]  gold/copper가 없으면 0
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

  const eiaKey = process.env.EIA_API_KEY

  if (!eiaKey) {
    return NextResponse.json({ items: [], source: 'no_api_key' })
  }

  try {
    const wtiRows = await fetchWti(eiaKey, months)

    // freq별 집계
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
        copper: 0,    // EIA 미지원 → 프론트에서 Supabase 값 또는 MOCK 사용
        wti: Math.round((sum / count) * 100) / 100,
        gold: 0,      // DB 미수집 → 프론트에서 MOCK 병합
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
