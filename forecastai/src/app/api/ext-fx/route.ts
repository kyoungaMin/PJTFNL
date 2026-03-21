import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Freq, groupFxRowsByFreq, forwardFillToKeys, labelFor } from '@/lib/freqUtils'

/**
 * /api/ext-fx — 환율/금리 외부 API 프록시
 *
 * 데이터 소스:
 *   - 한국은행 ECOS API: USD/EUR/JPY/CNY 환율, KR_BASE_RATE
 *   - FRED API: US_FED_RATE (FEDFUNDS 시리즈)
 *
 * 환경변수:
 *   - ECOS_API_KEY: 한국은행 ECOS 오픈 API 키 (https://ecos.bok.or.kr)
 *   - FRED_API_KEY: FRED API 키 (https://fred.stlouisfed.org)
 *
 * 응답: externalData.ts fetchFXData() 반환 형식과 동일
 *   [{ d: '1월', usd, eur, jpy, cny, rate, us_rate }]
 */

const ECOS_BASE = 'https://ecos.bok.or.kr/api'
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

/** 'YYYY-MM-DD' → 'N월' */
function toMonthLabel(dateStr: string): string {
  const m = parseInt(dateStr.slice(5, 7), 10)
  return `${m}월`
}

/** 최근 N개월 시작일 YYYYMMDD 반환 (ECOS 형식) */
function ecosStartDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

/** 최근 N개월 시작일 YYYY-MM-DD 반환 (FRED 형식) */
function fredStartDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

/**
 * ECOS API — 주요 시계열 조회
 * stat_code: 036Y001 (기준환율), 722Y001 (기준금리)
 */
async function fetchEcos(apiKey: string, statCode: string, itemCode: string, months: number) {
  const start = ecosStartDate(months)
  const end = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const url = `${ECOS_BASE}/StatisticSearch/${apiKey}/json/kr/1/1000/${statCode}/MM/${start}/${end}/${itemCode}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const json = await res.json()
  return (json?.StatisticSearch?.row ?? []) as { TIME: string; DATA_VALUE: string }[]
}

/** FRED API — 시계열 조회 */
async function fetchFred(apiKey: string, seriesId: string, months: number) {
  const start = fredStartDate(months)
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}&frequency=m&aggregation_method=eop`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return []
  const json = await res.json()
  return (json?.observations ?? []) as { date: string; value: string }[]
}

/** YYYY-MM 시작일 계산 */
function startYM(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 7)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') ?? '12', 10)
  const freq = (searchParams.get('freq') ?? 'month') as Freq
  const startDate = startYM(months) + '-01'

  // ── 1순위: Supabase DB ───────────────────────────────
  try {
    const [{ data: fxRows }, { data: indRows }] = await Promise.all([
      supabase
        .from('exchange_rate')
        .select('base_currency, rate_date, rate')
        .in('base_currency', ['USD', 'EUR', 'JPY', 'CNY'])
        .eq('quote_currency', 'KRW')
        .gte('rate_date', startDate)
        .order('rate_date', { ascending: true })
        .limit(10000),
      supabase
        .from('economic_indicator')
        .select('indicator_code, date, value')
        .in('indicator_code', ['KR_BASE_RATE', 'US_FED_RATE'])
        .gte('date', startDate)
        .order('date', { ascending: true })
        .limit(10000),
    ])

    if (fxRows?.length || indRows?.length) {
      const fxMap = groupFxRowsByFreq(
        (fxRows ?? []) as { rate_date: string; base_currency: string; rate: number }[],
        freq
      )
      const periodKeys = Object.keys(fxMap).sort()
      const rateRows = (indRows ?? []).map(r => ({
        date: r.date as string,
        indicator_code: r.indicator_code as string,
        value: Number(r.value),
      }))
      const rateMap = forwardFillToKeys(periodKeys, rateRows, ['KR_BASE_RATE', 'US_FED_RATE'])
      const items = periodKeys.map(pk => ({
        d: labelFor(pk, freq),
        usd: fxMap[pk]?.['USD'] ?? 0,
        eur: fxMap[pk]?.['EUR'] ?? 0,
        jpy: fxMap[pk]?.['JPY'] ?? 0,
        cny: fxMap[pk]?.['CNY'] ?? 0,
        rate: rateMap[pk]?.['KR_BASE_RATE'] ?? 0,
        us_rate: rateMap[pk]?.['US_FED_RATE'] ?? 0,
      }))
      if (items.filter(r => r.usd || r.rate || r.us_rate).length >= 2) {
        return NextResponse.json({ items, source: 'supabase' })
      }
    }
  } catch {
    // DB 실패 시 다음 단계로
  }

  // ── 2순위: ECOS / FRED API (월별만 지원) ────────────
  const ecosKey = process.env.ECOS_API_KEY
  const fredKey = process.env.FRED_API_KEY

  if (!ecosKey || !fredKey) {
    return NextResponse.json({ items: [], source: 'no_api_key' })
  }

  try {
    // 병렬 요청: ECOS 환율 4종 + ECOS 기준금리 + FRED 기준금리
    const [usdRows, eurRows, jpyRows, cnyRows, krRateRows, usFedRows] = await Promise.all([
      fetchEcos(ecosKey, '036Y001', '0000001', months), // USD
      fetchEcos(ecosKey, '036Y001', '0000002', months), // EUR
      fetchEcos(ecosKey, '036Y001', '0000003', months), // JPY(100엔)
      fetchEcos(ecosKey, '036Y001', '0000004', months), // CNY
      fetchEcos(ecosKey, '722Y001', '0101000', months), // 한국 기준금리
      fetchFred(fredKey, 'FEDFUNDS', months),           // 미국 기준금리
    ])

    // 월별 집계 맵
    const map: Record<string, { usd: number; eur: number; jpy: number; cny: number; rate: number; us_rate: number }> = {}

    const setVal = (rows: { TIME: string; DATA_VALUE: string }[], key: keyof typeof map[string]) => {
      for (const r of rows) {
        const ym = `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}`
        if (!map[ym]) map[ym] = { usd: 0, eur: 0, jpy: 0, cny: 0, rate: 0, us_rate: 0 }
        const v = parseFloat(r.DATA_VALUE)
        if (!isNaN(v)) map[ym][key] = v
      }
    }

    setVal(usdRows, 'usd')
    setVal(eurRows, 'eur')
    setVal(jpyRows, 'jpy')
    setVal(cnyRows, 'cny')
    setVal(krRateRows, 'rate')

    for (const r of usFedRows) {
      const ym = r.date.slice(0, 7)
      if (!map[ym]) map[ym] = { usd: 0, eur: 0, jpy: 0, cny: 0, rate: 0, us_rate: 0 }
      const v = parseFloat(r.value)
      if (!isNaN(v)) map[ym].us_rate = v
    }

    const items = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, vals]) => ({ d: toMonthLabel(ym), ...vals }))

    if (items.length < 2) {
      return NextResponse.json({ items: [], source: 'insufficient_data' })
    }

    return NextResponse.json({ items, source: 'ecos_fred' })
  } catch (err: any) {
    console.error('[API] ext-fx error:', err)
    return NextResponse.json({ items: [], source: 'error', error: err.message }, { status: 500 })
  }
}
