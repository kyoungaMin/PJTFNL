import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Freq, groupRowsByFreq, labelFor } from '@/lib/freqUtils'

/**
 * /api/ext-semi — 반도체 산업지표 API 프록시
 *
 * 데이터 소스:
 *   1순위: Supabase DB (economic_indicator 테이블)
 *      - SOX, DRAM_DDR4, NAND_TLC, SEMI_PPI
 *   2순위: Yahoo Finance + FRED (무료 대리지표)
 *      - SOX: Yahoo Finance (^SOX)
 *      - DRAM 대리: Micron(MU) 주가 — DRAM/NAND 매출 비중 90%+, 메모리 가격과 높은 상관관계
 *      - NAND 대리: Western Digital(WDC) 주가 — NAND 중심 기업
 *      - 반도체 PPI: FRED PCU33443344 — 반도체 생산자물가지수 (월간)
 *
 * 응답 형식:
 *   [{ d: 'N월', sox, dram, nand, silicon_wafer, mu, wdc, semi_ppi }]
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

/**
 * FRED API — 월간 시계열 데이터
 * API Key가 없으면 빈 배열 반환 (필수 아님)
 */
async function fetchFredMonthly(
  seriesId: string,
  months: number
): Promise<{ ym: string; value: number }[]> {
  const apiKey = process.env.FRED_API_KEY
  if (!apiKey) return []

  const start = startDate(months)
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}&frequency=m`

  try {
    const res = await fetch(url, { next: { revalidate: 86400 } }) // 24시간 캐시
    if (!res.ok) return []

    const json = await res.json()
    const observations: { date: string; value: string }[] = json?.observations ?? []

    return observations
      .filter(o => o.value !== '.')
      .map(o => ({
        ym: o.date.slice(0, 7),
        value: Math.round(Number(o.value) * 100) / 100,
      }))
  } catch {
    return []
  }
}

/** 여러 시계열을 ym 기준으로 병합 */
function mergeByYm(
  ...sources: { name: string; rows: { ym: string; value: number }[] }[]
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>()
  for (const { name, rows } of sources) {
    for (const { ym, value } of rows) {
      if (!map.has(ym)) map.set(ym, {})
      map.get(ym)![name] = value
    }
  }
  return map
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
      .in('indicator_code', ['SOX', 'DRAM_DDR4', 'NAND_TLC', 'SILICON_WAFER', 'MU_CLOSE', 'WDC_CLOSE', 'SEMI_PPI'])
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
          sox: vals['SOX'] ?? 0,
          dram: vals['DRAM_DDR4'] ?? 0,
          nand: vals['NAND_TLC'] ?? 0,
          silicon_wafer: vals['SILICON_WAFER'] ?? 0,
          mu: vals['MU_CLOSE'] ?? 0,
          wdc: vals['WDC_CLOSE'] ?? 0,
          semi_ppi: vals['SEMI_PPI'] ?? 0,
        }))
      if (items.filter(r => r.sox || r.dram || r.nand || r.mu).length >= 2) {
        return NextResponse.json({ items, source: 'supabase' })
      }
    }
  } catch {
    // DB 실패 시 다음 단계로
  }

  // ── 2순위: Yahoo Finance + FRED (무료 대리지표) ────────────
  const [soxRows, muRows, wdcRows, ppiRows] = await Promise.all([
    fetchYahooMonthly('^SOX', months),
    fetchYahooMonthly('MU', months),
    fetchYahooMonthly('WDC', months),
    fetchFredMonthly('PCU33443344', months),
  ])

  const merged = mergeByYm(
    { name: 'sox', rows: soxRows },
    { name: 'mu', rows: muRows },
    { name: 'wdc', rows: wdcRows },
    { name: 'semi_ppi', rows: ppiRows },
  )

  if (merged.size >= 2) {
    const items = [...merged.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, vals]) => ({
        d: toMonthLabel(ym + '-01'),
        sox: vals.sox ?? 0,
        dram: 0,           // 유료 소스 — DB 적재 시에만 사용
        nand: 0,           // 유료 소스 — DB 적재 시에만 사용
        silicon_wafer: 0,
        mu: vals.mu ?? 0,          // Micron 주가 (DRAM 대리지표)
        wdc: vals.wdc ?? 0,        // WDC 주가 (NAND 대리지표)
        semi_ppi: vals.semi_ppi ?? 0,  // FRED 반도체 PPI
      }))

    return NextResponse.json({
      items,
      source: 'yahoo_fred',
      proxyNote: 'DRAM→Micron(MU) 주가, NAND→WDC 주가, PPI→FRED PCU33443344',
    })
  }

  // ── 3순위: 데이터 없음 ────────────────────────────────
  return NextResponse.json({ items: [], source: 'no_data' })
}
