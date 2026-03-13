import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Freq, groupRowsByFreq, labelFor, getWeekMonday } from '@/lib/freqUtils'

/**
 * /api/ext-supply — 물류 외부 API 프록시
 *
 * 데이터 소스:
 *   1순위: Supabase DB (economic_indicator 테이블)
 *      - BALTIC_DRY: source=MARKET (15_load_realtime_indices.py 적재)
 *   2순위: stooq.com CSV API (BDI.CO, 무료, 키 불필요)
 *   3순위: Yahoo Finance 비공식 API (^BDI)
 *
 * 응답: externalData.ts fetchSupplyData() 반환 형식과 동일
 *   [{ d: 'N월', bdi, freight }]
 */

function toMonthLabel(dateStr: string): string {
  const m = parseInt(dateStr.slice(5, 7), 10)
  return `${m}월`
}

function startDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function formatDateStooq(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

/** stooq.com CSV API — BDI 일별 원본 데이터 반환 */
async function fetchBdiStooqRaw(months: number): Promise<{ date: string; value: number }[]> {
  const start = new Date()
  start.setMonth(start.getMonth() - (months - 1))
  start.setDate(1)
  const end = new Date()
  const url = `https://stooq.com/q/d/l/?s=bdi.co&d1=${formatDateStooq(start)}&d2=${formatDateStooq(end)}&i=d`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const text = await res.text()
    if (!text || text.includes('No data') || text.length < 30) return []
    const lines = text.trim().split('\n')
    const result: { date: string; value: number }[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',')
      if (cols.length < 5) continue
      const dateStr = cols[0].trim()
      const val = parseFloat(cols[4].trim())
      if (!dateStr || isNaN(val) || val <= 0) continue
      result.push({ date: dateStr, value: val })
    }
    return result
  } catch { return [] }
}

/** Yahoo Finance 비공식 API — BDI 월간 데이터 */
async function fetchBdiYahoo(months: number): Promise<Record<string, number>> {
  const range = months <= 6 ? '1y' : months <= 24 ? '2y' : '5y'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EBDI?interval=1mo&range=${range}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return {}

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return {}

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? []
    const closes: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? []
    const start = startDate(months).slice(0, 7)

    const output: Record<string, number> = {}
    for (let i = 0; i < timestamps.length; i++) {
      const val = closes[i]
      if (!val || isNaN(val)) continue
      const d = new Date(timestamps[i] * 1000)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (ym >= start) output[ym] = Math.round(val)
    }
    return output
  } catch {
    return {}
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') ?? '12', 10)
  const freq = (searchParams.get('freq') ?? 'month') as Freq
  const start = startDate(months)

  // ── 1순위: Supabase DB ───────────────────────────────
  try {
    const { data, error } = await supabase
      .from('economic_indicator')
      .select('date, indicator_code, value')
      .eq('indicator_code', 'BALTIC_DRY')
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
        .map(([key, vals]) => {
          const bdi = vals['BALTIC_DRY'] ?? 0
          return { d: labelFor(key, freq), bdi, freight: bdi ? Math.round(bdi * 0.65) : 0 }
        })
      if (items.filter(r => r.bdi).length >= 2) {
        return NextResponse.json({ items, source: 'supabase' })
      }
    }
  } catch {
    // DB 실패 시 다음 단계로
  }

  // ── 2순위: stooq.com BDI.CO (freq별 집계) ────────────
  const rawRows = await fetchBdiStooqRaw(months)

  if (rawRows.length >= 2) {
    const map: Record<string, { sum: number; count: number }> = {}
    for (const r of rawRows) {
      let key: string
      if (freq === 'day') key = r.date.slice(0, 10)
      else if (freq === 'week') key = getWeekMonday(r.date.slice(0, 10))
      else key = r.date.slice(0, 7)
      if (!map[key]) map[key] = { sum: 0, count: 0 }
      map[key].sum += r.value
      map[key].count += 1
    }
    const items = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { sum, count }]) => {
        const bdi = Math.round(sum / count)
        return { d: labelFor(key, freq), bdi, freight: Math.round(bdi * 0.65) }
      })
    if (items.length >= 2) return NextResponse.json({ items, source: 'stooq' })
  }

  // ── 3순위: Yahoo Finance ^BDI (월별 fallback) ────────────
  const bdiMap = await fetchBdiYahoo(months)

  if (Object.keys(bdiMap).length >= 2) {
    const items = Object.entries(bdiMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, bdi]) => ({
        d: toMonthLabel(ym + '-01'),
        bdi,
        freight: Math.round(bdi * 0.65),
      }))

    return NextResponse.json({ items, source: 'yahoo' })
  }

  // ── 데이터 없음 ──────────────────────────────────────
  return NextResponse.json({ items: [], source: 'no_data' })
}
