/**
 * 월간 배치: 외부지표 일괄 적재
 *   - Gold (GOLD_LBMA)       ← Yahoo Finance GC=F
 *   - Copper (COPPER_LME)    ← FRED PCOPPUSDM
 *   - SOX (SOX)              ← Yahoo Finance ^SOX
 *   - 환율 4종               ← ECOS API → exchange_rate 테이블
 *   - 한국 기준금리           ← ECOS API → economic_indicator
 *   - 미국 기준금리           ← FRED FEDFUNDS → economic_indicator
 *   - China PMI (CN_PMI_MFG) ← NBS 스크래핑
 *
 * 실행: node scripts/batch-monthly.mjs
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY, FRED_API_KEY, ECOS_API_KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const FRED_KEY  = process.env.FRED_API_KEY
const ECOS_KEY  = process.env.ECOS_API_KEY
const MONTHS    = 24

function startDate(months) {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// ── Yahoo Finance 월간 종가 ────────────────────────────────────────────────────
async function fetchYahoo(ticker, indicatorCode, indicatorName, unit) {
  const encoded = encodeURIComponent(ticker)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1mo&range=5y`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  })
  if (!res.ok) throw new Error(`Yahoo Finance 오류 (${ticker}): ${res.status}`)
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`Yahoo Finance 파싱 실패 (${ticker})`)

  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.adjclose?.[0]?.adjclose ?? []
  const start = startDate(MONTHS)
  const rows = []

  for (let i = 0; i < timestamps.length; i++) {
    const val = closes[i]
    if (!val || isNaN(val)) continue
    const d = new Date(timestamps[i] * 1000)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (ym < start.slice(0, 7)) continue
    rows.push({
      date: ym + '-01',
      indicator_code: indicatorCode,
      indicator_name: indicatorName,
      source: 'Yahoo Finance',
      unit,
      value: Math.round(val * 100) / 100,
    })
  }
  return rows
}

// ── FRED API 월간 시계열 ───────────────────────────────────────────────────────
async function fetchFred(seriesId, indicatorCode, indicatorName, unit) {
  if (!FRED_KEY) throw new Error('FRED_API_KEY 환경변수 없음')
  const start = startDate(MONTHS)
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&observation_start=${start}&frequency=m&aggregation_method=eop`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED API 오류 (${seriesId}): ${res.status}`)
  const json = await res.json()
  if (json.error_code) throw new Error(`FRED 오류: ${json.error_message}`)

  return json.observations
    .filter(r => r.value !== '.' && !isNaN(parseFloat(r.value)))
    .map(r => ({
      date: r.date,
      indicator_code: indicatorCode,
      indicator_name: indicatorName,
      source: 'FRED',
      unit,
      value: Math.round(parseFloat(r.value) * 100) / 100,
    }))
}

// ── ECOS API — 환율 + 기준금리 ────────────────────────────────────────────────
async function fetchEcos(statCode, itemCode) {
  if (!ECOS_KEY) throw new Error('ECOS_API_KEY 환경변수 없음')
  const d = new Date()
  const end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  const startD = new Date()
  startD.setMonth(startD.getMonth() - (MONTHS - 1))
  const start = `${startD.getFullYear()}${String(startD.getMonth() + 1).padStart(2, '0')}`

  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${ECOS_KEY}/json/kr/1/1000/${statCode}/MM/${start}/${end}/${itemCode}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ECOS API 오류: ${res.status}`)
  const json = await res.json()
  return json?.StatisticSearch?.row ?? []
}

// ── NBS 중국 PMI 스크래핑 ─────────────────────────────────────────────────────
async function fetchChinaPMI() {
  const res = await fetch('https://www.stats.gov.cn/english/PressRelease/', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []

  const html = await res.text()
  const monthMap = {
    January:'01', February:'02', March:'03', April:'04',
    May:'05', June:'06', July:'07', August:'08',
    September:'09', October:'10', November:'11', December:'12',
  }
  const regex = /Manufacturing PMI[^0-9]*([4-6][0-9]\.[0-9])[^0-9]*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi
  const rows = []
  let match
  while ((match = regex.exec(html)) !== null) {
    const value = parseFloat(match[1])
    const month = monthMap[match[2]]
    const year  = match[3]
    if (value && month && year) {
      rows.push({
        date: `${year}-${month}-01`,
        indicator_code: 'CN_PMI_MFG',
        indicator_name: 'China NBS Manufacturing PMI',
        source: 'NBS',
        unit: 'Index',
        value,
      })
    }
  }
  return rows
}

// ── economic_indicator 테이블 적재 ────────────────────────────────────────────
async function insertIndicator(rows, label) {
  if (!rows.length) { console.log(`  ${label}: 데이터 없음`); return }

  const code = rows[0].indicator_code
  const dates = rows.map(r => r.date)
  const minDate = dates.reduce((a, b) => a < b ? a : b)
  const maxDate = dates.reduce((a, b) => a > b ? a : b)

  const { error: delErr } = await supabase
    .from('economic_indicator')
    .delete()
    .eq('indicator_code', code)
    .gte('date', minDate)
    .lte('date', maxDate)
  if (delErr) { console.error(`  ${label} 삭제 오류:`, delErr.message); return }

  const { error: insErr } = await supabase.from('economic_indicator').insert(rows)
  if (insErr) console.error(`  ${label} 삽입 오류:`, insErr.message)
  else console.log(`  ${label}: ${rows.length}건 적재 완료`)
}

// ── exchange_rate 테이블 적재 ─────────────────────────────────────────────────
async function insertExchangeRates(rows, label) {
  if (!rows.length) { console.log(`  ${label}: 데이터 없음`); return }

  // 통화별로 분리해서 처리
  const currencies = [...new Set(rows.map(r => r.base_currency))]
  for (const currency of currencies) {
    const currencyRows = rows.filter(r => r.base_currency === currency)
    const dates = currencyRows.map(r => r.rate_date)
    const minDate = dates.reduce((a, b) => a < b ? a : b)
    const maxDate = dates.reduce((a, b) => a > b ? a : b)

    const { error: delErr } = await supabase
      .from('exchange_rate')
      .delete()
      .eq('base_currency', currency)
      .eq('quote_currency', 'KRW')
      .gte('rate_date', minDate)
      .lte('rate_date', maxDate)
    if (delErr) { console.error(`  ${label} (${currency}) 삭제 오류:`, delErr.message); continue }

    const { error: insErr } = await supabase.from('exchange_rate').insert(currencyRows)
    if (insErr) console.error(`  ${label} (${currency}) 삽입 오류:`, insErr.message)
    else console.log(`  ${label} (${currency}): ${currencyRows.length}건 적재 완료`)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== 월간 배치: 외부지표 일괄 적재 ===\n')

console.log('[1/7] Gold (GOLD_LBMA) — Yahoo Finance GC=F')
try { await insertIndicator(await fetchYahoo('GC=F', 'GOLD_LBMA', 'Gold Price (London Bullion)', 'USD/oz'), 'Gold') }
catch (e) { console.error('  Gold 오류:', e.message) }

console.log('[2/7] Copper (COPPER_LME) — FRED PCOPPUSDM')
try { await insertIndicator(await fetchFred('PCOPPUSDM', 'COPPER_LME', 'Copper Price (LME)', 'USD/mt'), 'Copper') }
catch (e) { console.error('  Copper 오류:', e.message) }

console.log('[3/7] SOX — Yahoo Finance ^SOX')
try { await insertIndicator(await fetchYahoo('^SOX', 'SOX', 'Philadelphia Semiconductor Index', 'Index'), 'SOX') }
catch (e) { console.error('  SOX 오류:', e.message) }

console.log('[4/7] 환율 (USD/EUR/JPY/CNY) — ECOS API')
try {
  const [usdRows, eurRows, jpyRows, cnyRows] = await Promise.all([
    fetchEcos('036Y001', '0000001'), // USD
    fetchEcos('036Y001', '0000002'), // EUR
    fetchEcos('036Y001', '0000003'), // JPY(100엔)
    fetchEcos('036Y001', '0000004'), // CNY
  ])
  const currencyMap = { '0000001': 'USD', '0000002': 'EUR', '0000003': 'JPY', '0000004': 'CNY' }
  const allFxRows = []
  for (const [rows, code] of [[usdRows, 'USD'], [eurRows, 'EUR'], [jpyRows, 'JPY'], [cnyRows, 'CNY']]) {
    for (const r of rows) {
      const val = parseFloat(r.DATA_VALUE)
      if (isNaN(val)) continue
      const ym = r.TIME
      allFxRows.push({
        base_currency: code,
        quote_currency: 'KRW',
        rate_date: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`,
        rate: Math.round(val * 100) / 100,
      })
    }
  }
  await insertExchangeRates(allFxRows, '환율')
} catch (e) { console.error('  환율 오류:', e.message) }

console.log('[5/7] 한국 기준금리 (KR_BASE_RATE) — ECOS API')
try {
  const rows = await fetchEcos('722Y001', '0101000')
  const mapped = rows
    .filter(r => !isNaN(parseFloat(r.DATA_VALUE)))
    .map(r => ({
      date: `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}-01`,
      indicator_code: 'KR_BASE_RATE',
      indicator_name: '한국은행 기준금리',
      source: 'ECOS',
      unit: '%',
      value: Math.round(parseFloat(r.DATA_VALUE) * 100) / 100,
    }))
  await insertIndicator(mapped, 'KR 기준금리')
} catch (e) { console.error('  KR 기준금리 오류:', e.message) }

console.log('[6/7] 미국 기준금리 (US_FED_RATE) — FRED FEDFUNDS')
try { await insertIndicator(await fetchFred('FEDFUNDS', 'US_FED_RATE', 'US Federal Funds Rate', '%'), 'US Fed Rate') }
catch (e) { console.error('  US Fed Rate 오류:', e.message) }

console.log('[7/7] China PMI (CN_PMI_MFG) — NBS 스크래핑')
try { await insertIndicator(await fetchChinaPMI(), 'China PMI') }
catch (e) { console.error('  China PMI 오류:', e.message) }

console.log('\n=== 완료 ===')
