/**
 * externalData.ts — Supabase 실데이터 조회 유틸
 *
 * DB 지표 코드 매핑:
 *   산업지표  : SOX, DRAM_DDR4, NAND_TLC               (source: MARKET)
 *   글로벌수요: INDPRO, CN_PMI_MFG                     (source: FRED / CHINA)
 *              + trade_statistics (hs_code: 8541/8542)
 *   환율/금리 : exchange_rate 테이블 + KR_BASE_RATE     (source: BOK)
 *   물류      : BALTIC_DRY                             (source: MARKET)
 *   원자재    : COPPER_LME, WTI_MONTHLY                (source: MARKET / EIA)
 *
 * supabase가 null이면(env 미설정) mock 데이터 반환
 */

import { supabaseBrowser as supabase } from './supabaseBrowser'
import {
  EXT_SEMI_DATA, EXT_GLOBAL_DATA, EXT_FX_DATA,
  EXT_SUPPLY_DATA, EXT_RAW_DATA,
} from './data'
import { Freq, labelFor, groupRowsByFreq, groupFxRowsByFreq, forwardFillToKeys } from './freqUtils'
export type { Freq }

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

/** 최근 N개월 시작일 반환 (YYYY-MM-DD), 기본 12개월 */
function startOfMonths(months = 12): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

/** 지표 메타 정보 (소스 · 연동 주기) — README 3.2절 기준 */
export const INDICATOR_META: Record<string, { source: string; freq: string }> = {
  SOX:         { source: 'Yahoo Finance',        freq: '일간' },
  DRAM_DDR4:   { source: 'DRAMeXchange',         freq: '주간' },
  NAND_TLC:    { source: 'TrendForce',            freq: '주간' },
  INDPRO:      { source: 'FRED',                 freq: '월간' },
  CN_PMI_MFG:  { source: 'Caixin / S&P Global',  freq: '월간' },
  BALTIC_DRY:  { source: 'Baltic Exchange',      freq: '일간' },
  COPPER_LME:  { source: 'LME',                  freq: '일간' },
  WTI_MONTHLY: { source: 'EIA / NYMEX',          freq: '일간' },
  KR_BASE_RATE:{ source: '한국은행 (ECOS)',        freq: '비정기' },
  US_FED_RATE: { source: 'FRED',                 freq: '비정기' },
  USD:         { source: '한국은행',               freq: '일간' },
  EUR:         { source: '한국은행',               freq: '일간' },
  JPY:         { source: '한국은행',               freq: '일간' },
  CNY:         { source: '한국은행',               freq: '일간' },
  HS8541:      { source: '관세청 UNIPASS',         freq: '월간' },
}

/** 'YYYY-MM-DD' → '1월', '12월' */
function toMonthLabel(dateStr: string): string {
  const m = parseInt(dateStr.slice(5, 7), 10)
  return `${m}월`
}

/** 'YYYY-MM' → '1월', '12월' */
function ymToLabel(ym: string): string {
  const m = parseInt(ym.slice(5, 7), 10)
  return `${m}월`
}

/**
 * economic_indicator 행 배열을 {월: {indicator_code: 값}} 형태로 변환
 * 같은 월에 여러 행이 있으면 마지막(최신) 값 사용 (ascending 정렬 기준)
 */
function groupByMonth(
  rows: { date: string; indicator_code: string; value: number }[]
): Record<string, Record<string, number>> {
  const map: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const ym = row.date.slice(0, 7) // YYYY-MM
    if (!map[ym]) map[ym] = {}
    map[ym][row.indicator_code] = Number(row.value)
  }
  return map
}

/** 월별 map → [{d:'1월', ...values}] 배열로 변환 */
function mapToSeries(
  map: Record<string, Record<string, number>>,
  keyMap: Record<string, string>  // {chartKey: indicator_code}
): Record<string, string | number>[] {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, vals]) => {
      const row: Record<string, string | number> = { d: ymToLabel(ym) }
      for (const [chartKey, code] of Object.entries(keyMap)) {
        row[chartKey] = vals[code] ?? 0
      }
      return row
    })
}

// ── API 라우트 fallback 헬퍼 ─────────────────────────────────────────────────

/** Next.js API 라우트에서 외부지표 데이터를 가져옴 (브라우저 fetch) */
async function fetchFromApiRoute(path: string, months: number, freq: Freq = 'month'): Promise<Record<string, unknown>[] | null> {
  try {
    const res = await fetch(`${path}?months=${months}&freq=${freq}`)
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.items?.length || json.items.length < 2) return null
    return json.items
  } catch {
    return null
  }
}

// ── 산업지표: SOX / DRAM / NAND ───────────────────────────────────────────────

export async function fetchSemiData(months = 12, freq: Freq = 'month') {
  // 1순위: Supabase
  if (supabase) {
    const { data, error } = await supabase
      .from('economic_indicator')
      .select('date, indicator_code, value')
      .in('indicator_code', ['SOX', 'DRAM_DDR4', 'NAND_TLC'])
      .gte('date', startOfMonths(months))
      .order('date', { ascending: true })

    if (!error && data?.length) {
      const rows = data.map(r => ({
        date: r.date as string,
        indicator_code: r.indicator_code as string,
        value: Number(r.value),
      }))
      const map = groupRowsByFreq(rows, freq)
      const series = Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, vals]) => ({
          d: labelFor(key, freq),
          _key: key,
          sox: vals['SOX'] ?? 0,
          dram: vals['DRAM_DDR4'] ?? 0,
          nand: vals['NAND_TLC'] ?? 0,
        }))
      if (series.filter(r => r.sox || r.dram || r.nand).length >= 2) return series
    }
  }

  // 2순위: /api/ext-semi (Yahoo Finance SOX)
  const apiData = await fetchFromApiRoute('/api/ext-semi', months, freq)
  if (apiData) return apiData

  // 3순위: MOCK
  return EXT_SEMI_DATA
}

// ── 글로벌 수요: IPI / PMI / HS8541 ──────────────────────────────────────────

export async function fetchGlobalData(months = 12) {
  // 1순위: Supabase
  if (supabase) {
    const [ecoRes, tradeRes] = await Promise.all([
      supabase
        .from('economic_indicator')
        .select('date, indicator_code, value')
        .in('indicator_code', ['INDPRO', 'CN_PMI_MFG'])
        .gte('date', startOfMonths(months))
        .order('date', { ascending: true }),
      supabase
        .from('trade_statistics')
        .select('year_month, export_amount')
        .like('hs_code', '8541%')
        .gte('year_month', startOfMonths(months).slice(0, 7))
        .order('year_month', { ascending: true }),
    ])

    if ((!ecoRes.error && ecoRes.data?.length) || (!tradeRes.error && tradeRes.data?.length)) {
      const ecoMap = groupByMonth(ecoRes.data ?? [])
      const tradeMap: Record<string, number> = {}
      for (const row of tradeRes.data ?? []) {
        const ym = row.year_month
        tradeMap[ym] = (tradeMap[ym] ?? 0) + Number(row.export_amount)
      }
      const allYms = Array.from(new Set([...Object.keys(ecoMap), ...Object.keys(tradeMap)])).sort()
      const series = allYms.map(ym => ({
        d: ymToLabel(ym),
        _key: ym,
        ipi: ecoMap[ym]?.['INDPRO'] ?? 0,
        pmi: ecoMap[ym]?.['CN_PMI_MFG'] ?? 0,
        hs8541: tradeMap[ym] ? Math.round(tradeMap[ym] / 1_000_000) : 0,
      }))
      if (series.filter(r => r.ipi || r.pmi || r.hs8541).length >= 2) return series
    }
  }

  // 2순위: /api/ext-global (FRED + UNIPASS)
  const apiData = await fetchFromApiRoute('/api/ext-global', months)
  if (apiData) return apiData

  // 3순위: MOCK
  return EXT_GLOBAL_DATA
}

// ── 환율 / 금리: USD / EUR / JPY / CNY / KR_BASE_RATE / US_FED_RATE ─────────

export async function fetchFXData(months = 12, freq: Freq = 'month') {
  // 1순위: Supabase
  if (supabase) {
    const [fxRes, rateRes] = await Promise.all([
      supabase
        .from('exchange_rate')
        .select('rate_date, base_currency, rate')
        .in('base_currency', ['USD', 'EUR', 'JPY', 'CNY'])
        .gte('rate_date', startOfMonths(months))
        .order('rate_date', { ascending: true }),
      supabase
        .from('economic_indicator')
        .select('date, indicator_code, value')
        .in('indicator_code', ['KR_BASE_RATE', 'US_FED_RATE'])
        .gte('date', startOfMonths(months))
        .order('date', { ascending: true }),
    ])

    if (!fxRes.error && fxRes.data?.length) {
      const fxMap = groupFxRowsByFreq(fxRes.data as { rate_date: string; base_currency: string; rate: number }[], freq)
      const periodKeys = Object.keys(fxMap).sort()
      const rateRows = (rateRes.data ?? []).map(r => ({
        date: r.date as string,
        indicator_code: r.indicator_code as string,
        value: Number(r.value),
      }))
      const rateMap = forwardFillToKeys(periodKeys, rateRows, ['KR_BASE_RATE', 'US_FED_RATE'])
      const series = periodKeys.map(pk => ({
        d: labelFor(pk, freq),
        _key: pk,
        usd: fxMap[pk]?.['USD'] ?? 0,
        eur: fxMap[pk]?.['EUR'] ?? 0,
        jpy: fxMap[pk]?.['JPY'] ?? 0,
        cny: fxMap[pk]?.['CNY'] ?? 0,
        rate: rateMap[pk]?.['KR_BASE_RATE'] ?? 0,
        us_rate: rateMap[pk]?.['US_FED_RATE'] ?? 0,
      }))
      if (series.filter(r => r.usd || r.eur).length >= 2) return series
    }
  }

  // 2순위: /api/ext-fx (ECOS + FRED)
  const apiData = await fetchFromApiRoute('/api/ext-fx', months, freq)
  if (apiData) return apiData

  // 3순위: MOCK
  return EXT_FX_DATA
}

// ── 물류: BDI / freight ───────────────────────────────────────────────────────

export async function fetchSupplyData(months = 12, freq: Freq = 'month') {
  // 1순위: Supabase
  if (supabase) {
    const { data, error } = await supabase
      .from('economic_indicator')
      .select('date, indicator_code, value')
      .eq('indicator_code', 'BALTIC_DRY')
      .gte('date', startOfMonths(months))
      .order('date', { ascending: true })

    if (!error && data?.length) {
      const rows = data.map(r => ({
        date: r.date as string,
        indicator_code: r.indicator_code as string,
        value: Number(r.value),
      }))
      const map = groupRowsByFreq(rows, freq)
      const series = Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, vals]) => {
          const bdi = vals['BALTIC_DRY'] ?? 0
          return { d: labelFor(key, freq), _key: key, bdi, freight: bdi ? Math.round(bdi * 0.65) : 0 }
        })
      if (series.filter(r => r.bdi).length >= 2) return series
    }
  }

  // 2순위: /api/ext-supply (stooq BDI.CO → Yahoo Finance ^BDI)
  const apiData = await fetchFromApiRoute('/api/ext-supply', months, freq)
  if (apiData) return apiData

  // 3순위: MOCK
  return EXT_SUPPLY_DATA
}

// ── 원자재: 구리 / WTI / 금 ──────────────────────────────────────────────────

/** gold MOCK 병합 헬퍼 */
function mergeGoldMock(series: { d: string; copper: number; wti: number; gold: number }[]) {
  const mockByLabel: Record<string, number> = {}
  for (const row of EXT_RAW_DATA) {
    mockByLabel[row.d as string] = row.gold as number
  }
  return series.map(r => ({ ...r, gold: mockByLabel[r.d] ?? 0 }))
}

export async function fetchRawData(months = 12, freq: Freq = 'month') {
  // 1순위: Supabase
  if (supabase) {
    const { data, error } = await supabase
      .from('economic_indicator')
      .select('date, indicator_code, value')
      .in('indicator_code', ['COPPER_LME', 'WTI_MONTHLY'])
      .gte('date', startOfMonths(months))
      .order('date', { ascending: true })

    if (!error && data?.length) {
      const rows = data.map(r => ({
        date: r.date as string,
        indicator_code: r.indicator_code as string,
        value: Number(r.value),
      }))
      const map = groupRowsByFreq(rows, freq)
      const series = Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, vals]) => ({
          d: labelFor(key, freq),
          _key: key,
          copper: vals['COPPER_LME'] ?? 0,
          wti: vals['WTI_MONTHLY'] ?? 0,
          gold: 0,
        }))
      const merged = mergeGoldMock(series)
      if (merged.filter(r => r.copper || r.wti).length >= 2) return merged
    }
  }

  // 2순위: /api/ext-raw (EIA WTI)
  const apiData = await fetchFromApiRoute('/api/ext-raw', months, freq)
  if (apiData) {
    // API 라우트는 copper=0, gold=0 반환 → gold MOCK 병합
    const series = (apiData as { d: string; copper: number; wti: number; gold: number }[])
    return mergeGoldMock(series)
  }

  // 3순위: MOCK
  return EXT_RAW_DATA
}
