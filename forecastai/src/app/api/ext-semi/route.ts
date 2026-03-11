import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Freq, groupRowsByFreq, labelFor } from '@/lib/freqUtils'

/**
 * /api/ext-semi — 반도체 산업지표 API 프록시
 *
 * 데이터 소스:
 *   1순위: Supabase DB (economic_indicator 테이블)
 *      - SOX: source=MARKET, indicator_code=SOX (15_load_realtime_indices.py 적재)
 *      - DRAM_DDR4: source=MARKET (앵커 보간)
 *      - NAND_TLC: source=MARKET (앵커 보간)
 *   2순위: Yahoo Finance 비공식 API (SOX만 실데이터 가능)
 *      - DRAM/NAND: 무료 공개 API 없음 → 0 반환 (프론트에서 MOCK 처리)
 *
 * 응답: externalData.ts fetchSemiData() 반환 형식과 동일
 *   [{ d: 'N월', sox, dram, nand }]
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

/** Yahoo Finance 비공식 API — 월간 차트 데이터 */
async function fetchYahooMonthly(
  ticker: string,
  months: number
): Promise<{ ym: string; value: number }[]> {
  const encodedTicker = encodeURIComponent(ticker)
  const range = months <= 6 ? '1y' : months <= 24 ? '2y' : '5y'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedTicker}?interval=1mo&range=${range}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) return []

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? []
    const closes: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? []

    if (!timestamps.length || !closes.length) return []

    const start = startDate(months)
    const output: { ym: string; value: number }[] = []

    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i]
      const val = closes[i]
      if (!ts || !val || isNaN(val)) continue

      const d = new Date(ts * 1000)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (ym < start.slice(0, 7)) continue

      output.push({ ym, value: Math.round(val * 100) / 100 })
    }
    return output
  } catch {
    return []
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
      .in('indicator_code', ['SOX', 'DRAM_DDR4', 'NAND_TLC'])
      .gte('date', start)
      .order('date', { ascending: true })

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
          sox: vals['SOX'] ?? 0,
          dram: vals['DRAM_DDR4'] ?? 0,
          nand: vals['NAND_TLC'] ?? 0,
        }))
      if (items.filter(r => r.sox || r.dram || r.nand).length >= 2) {
        return NextResponse.json({ items, source: 'supabase' })
      }
    }
  } catch {
    // DB 실패 시 다음 단계로
  }

  // ── 2순위: Yahoo Finance (SOX만 실데이터, 월별 fallback) ────────────
  const soxRows = await fetchYahooMonthly('^SOX', months)

  if (soxRows.length >= 2) {
    const items = soxRows.map(({ ym, value }) => ({
      d: toMonthLabel(ym + '-01'),
      sox: value,
      dram: 0,  // TrendForce 유료 → DB에서 앵커 보간 데이터 활용
      nand: 0,
    }))
    return NextResponse.json({
      items,
      source: 'yahoo_finance',
      dramMock: true,
      nandMock: true,
    })
  }

  // ── 3순위: 데이터 없음 ────────────────────────────────
  return NextResponse.json({ items: [], source: 'no_data' })
}
