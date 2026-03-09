/**
 * 외부 지표 데이터 fetch 유틸리티
 * - 각 fetch 함수는 DB API를 호출하고, 실패 시 fallback 데이터를 반환
 * - INDICATOR_META: 지표별 출처·갱신주기 메타데이터
 */

import {
  EXT_SEMI_DATA,
  EXT_GLOBAL_DATA,
  EXT_FX_DATA,
  EXT_SUPPLY_DATA,
  EXT_RAW_DATA,
} from './data'

// ── 지표 메타데이터 ──────────────────────────────────────────────────────────

export const INDICATOR_META: Record<string, { source: string; freq: string }> = {
  // 산업 지표
  SOX:         { source: 'NASDAQ',          freq: '일간' },
  DRAM_DDR4:   { source: 'DRAMeXchange',    freq: '주간 (매주 목)' },
  NAND_TLC:    { source: 'DRAMeXchange',    freq: '주간 (매주 목)' },

  // 글로벌 수요
  INDPRO:      { source: 'FRED (미 연준)',   freq: '월간 (익월 중순)' },
  CN_PMI_MFG:  { source: 'NBS (중국 통계국)', freq: '월간 (익월 1영업일)' },
  HS8541:      { source: '관세청',           freq: '월간 (익월 15일)' },

  // 환율·금리
  USD:         { source: '한국은행',          freq: '일간 (영업일)' },
  EUR:         { source: '한국은행',          freq: '일간 (영업일)' },
  JPY:         { source: '한국은행',          freq: '일간 (영업일)' },
  CNY:         { source: '한국은행',          freq: '일간 (영업일)' },
  KR_BASE_RATE:{ source: '한국은행',          freq: '비정기 (연 8회)' },
  US_FED_RATE: { source: 'FRED (미 연준)',   freq: '비정기 (연 8회)' },

  // 물류
  BALTIC_DRY:  { source: 'Baltic Exchange', freq: '일간 (영업일)' },

  // 원자재
  COPPER_LME:  { source: 'LME',            freq: '일간 (거래일)' },
  WTI_MONTHLY: { source: 'EIA',            freq: '일간 (거래일)' },
}

// ── fetch 함수 ───────────────────────────────────────────────────────────────

async function fetchExternal<T>(endpoint: string, months: number, fallback: T): Promise<T> {
  try {
    const res = await fetch(`/api/${endpoint}?months=${months}`)
    if (!res.ok) return fallback
    const json = await res.json()
    return json.items?.length ? json.items : fallback
  } catch {
    return fallback
  }
}

export function fetchSemiData(months = 12) {
  return fetchExternal('external-semi', months, EXT_SEMI_DATA)
}

export function fetchGlobalData(months = 12) {
  return fetchExternal('external-global', months, EXT_GLOBAL_DATA)
}

export function fetchFXData(months = 6) {
  return fetchExternal('external-fx', months, EXT_FX_DATA)
}

export function fetchSupplyData(months = 6) {
  return fetchExternal('external-supply', months, EXT_SUPPLY_DATA)
}

export function fetchRawData(months = 6) {
  return fetchExternal('external-raw', months, EXT_RAW_DATA)
}
