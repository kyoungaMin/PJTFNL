import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/cron/monthly
 * Vercel Cron: 매월 2일 실행 (전월 데이터 확정 후)
 * 담당:
 *   - GOLD_LBMA    : stooq XAU/USD 현물가
 *   - COPPER_LME   : FRED PCOPPUSDM
 *   - SOX          : Yahoo Finance ^SOX
 *   - KR_BASE_RATE : ECOS API
 *   - US_FED_RATE  : FRED FEDFUNDS
 *   - CN_PMI_MFG   : NBS 스크래핑
 *   - 환율 4종     : ECOS API → exchange_rate 테이블
 */

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const MONTHS = 24

function startDate(months: number) {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// ── stooq XAU/USD 월간 종가 (금 현물가) ────────────────────────────────────────
async function fetchGold() {
  const url = 'https://stooq.com/q/d/l/?s=xauusd&i=m'
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`stooq 오류: ${res.status}`)
  const text = await res.text()
  const start = startDate(MONTHS)
  const rows = []
  for (const line of text.trim().split('\n').slice(1)) {
    const [date, , , , close] = line.split(',')
    if (!date || !close) continue
    const val = parseFloat(close)
    if (isNaN(val)) continue
    const ym = date.slice(0, 7)
    if (ym < start.slice(0, 7)) continue
    rows.push({ date: ym + '-01', indicator_code: 'GOLD_LBMA', indicator_name: 'Gold Spot Price (XAU/USD)', source: 'stooq', unit: 'USD/oz', value: Math.round(val * 100) / 100 })
  }
  return rows
}

// ── FRED 월간 시계열 ────────────────────────────────────────────────────────────
async function fetchFred(seriesId: string, code: string, name: string, unit: string, apiKey: string) {
  const start = startDate(MONTHS)
  const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start}&frequency=m&aggregation_method=eop`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED 오류 (${seriesId}): ${res.status}`)
  const json = await res.json()
  if (json.error_code) throw new Error(`FRED 오류: ${json.error_message}`)
  return (json.observations as { date: string; value: string }[])
    .filter(r => r.value !== '.' && !isNaN(parseFloat(r.value)))
    .map(r => ({ date: r.date, indicator_code: code, indicator_name: name, source: 'FRED', unit, value: Math.round(parseFloat(r.value) * 100) / 100 }))
}

// ── Yahoo Finance 월간 종가 ─────────────────────────────────────────────────────
async function fetchYahoo(ticker: string, code: string, name: string, unit: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=5y`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } })
  if (!res.ok) throw new Error(`Yahoo Finance 오류 (${ticker}): ${res.status}`)
  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error(`Yahoo Finance 파싱 실패 (${ticker})`)
  const timestamps: number[] = result.timestamp ?? []
  const closes: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? []
  const start = startDate(MONTHS)
  const rows = []
  for (let i = 0; i < timestamps.length; i++) {
    const val = closes[i]
    if (!val || isNaN(val)) continue
    const d = new Date(timestamps[i] * 1000)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (ym < start.slice(0, 7)) continue
    rows.push({ date: ym + '-01', indicator_code: code, indicator_name: name, source: 'Yahoo Finance', unit, value: Math.round(val * 100) / 100 })
  }
  return rows
}

// ── ECOS API ────────────────────────────────────────────────────────────────────
async function fetchEcos(statCode: string, itemCode: string, apiKey: string) {
  const d = new Date()
  const end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  const s = new Date(); s.setMonth(s.getMonth() - (MONTHS - 1))
  const start = `${s.getFullYear()}${String(s.getMonth() + 1).padStart(2, '0')}`
  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${apiKey}/json/kr/1/1000/${statCode}/MM/${start}/${end}/${itemCode}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ECOS 오류: ${res.status}`)
  const json = await res.json()
  return (json?.StatisticSearch?.row ?? []) as { TIME: string; DATA_VALUE: string }[]
}

// ── NBS 중국 PMI ────────────────────────────────────────────────────────────────
async function fetchChinaPMI() {
  const BASE = 'https://www.stats.gov.cn/english/PressRelease'
  const monthMap: Record<string, string> = {
    January:'01', February:'02', March:'03', April:'04',
    May:'05', June:'06', July:'07', August:'08',
    September:'09', October:'10', November:'11', December:'12',
  }
  const links: { date: string; url: string }[] = []
  const pages = ['/'].concat(Array.from({ length: 13 }, (_, i) => `/index_${i + 2}.html`))
  for (const page of pages) {
    try {
      const res = await fetch(`${BASE}${page}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const html = await res.text()
      const re = /title="Purchasing Managers[^"]*Index[^"]*for\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})"[^>]*href="(\.\/[^"]+\.html)"/gi
      let m
      while ((m = re.exec(html)) !== null) {
        links.push({ date: `${m[2]}-${monthMap[m[1]]}-01`, url: `${BASE}${m[3].replace('./', '/')}` })
      }
    } catch { /* ignore */ }
  }
  const rows = []
  for (const { date, url } of links) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const html = await res.text()
      const valMatch = html.match(/manufacturing industry came in at\s+([0-9]{2}\.[0-9])\s*(?:%|percent)/)
      if (!valMatch) continue
      const value = parseFloat(valMatch[1])
      if (!isNaN(value)) rows.push({ date, indicator_code: 'CN_PMI_MFG', indicator_name: 'China NBS Manufacturing PMI', source: 'NBS', unit: 'Index', value })
    } catch { /* ignore */ }
  }
  return rows
}

// ── Upsert ─────────────────────────────────────────────────────────────────────
async function upsert(rows: Record<string, unknown>[], label: string) {
  if (!rows.length) return { label, count: 0, skipped: true }
  // date 기준 dedup
  const deduped = Object.values(Object.fromEntries(rows.map(r => [(r.date as string), r])))
  const { error } = await supabase.from('economic_indicator').upsert(deduped, { onConflict: 'source,indicator_code,date' })
  if (error) throw new Error(`${label} upsert 실패: ${error.message}`)
  return { label, count: deduped.length }
}

// ── 핸들러 ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fredKey = process.env.FRED_API_KEY
  const ecosKey = process.env.ECOS_API_KEY

  const results: Record<string, unknown> = {}

  // Gold (stooq XAU/USD)
  try { results.gold = await upsert(await fetchGold(), 'Gold') }
  catch (e: any) { results.gold = { error: e.message } }

  // Copper (FRED)
  if (fredKey) {
    try { results.copper = await upsert(await fetchFred('PCOPPUSDM', 'COPPER_LME', 'Copper Price (LME)', 'USD/mt', fredKey), 'Copper') }
    catch (e: any) { results.copper = { error: e.message } }
  }

  // SOX (Yahoo Finance)
  try { results.sox = await upsert(await fetchYahoo('^SOX', 'SOX', 'Philadelphia Semiconductor Index', 'Index'), 'SOX') }
  catch (e: any) { results.sox = { error: e.message } }

  // US Fed Rate (FRED)
  if (fredKey) {
    try { results.usFedRate = await upsert(await fetchFred('FEDFUNDS', 'US_FED_RATE', 'US Federal Funds Rate', '%', fredKey), 'US Fed Rate') }
    catch (e: any) { results.usFedRate = { error: e.message } }
  }

  // KR Base Rate + 환율 (ECOS)
  if (ecosKey) {
    try {
      const rows = await fetchEcos('722Y001', '0101000', ecosKey)
      const mapped = rows.filter(r => !isNaN(parseFloat(r.DATA_VALUE))).map(r => ({
        date: `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}-01`,
        indicator_code: 'KR_BASE_RATE', indicator_name: '한국은행 기준금리', source: 'ECOS', unit: '%',
        value: Math.round(parseFloat(r.DATA_VALUE) * 100) / 100,
      }))
      results.krBaseRate = await upsert(mapped, 'KR Base Rate')
    } catch (e: any) { results.krBaseRate = { error: e.message } }

    try {
      const currencyMap: Record<string, string> = { '0000001': 'USD', '0000002': 'EUR', '0000003': 'JPY', '0000004': 'CNY' }
      const [usd, eur, jpy, cny] = await Promise.all([
        fetchEcos('036Y001', '0000001', ecosKey),
        fetchEcos('036Y001', '0000002', ecosKey),
        fetchEcos('036Y001', '0000003', ecosKey),
        fetchEcos('036Y001', '0000004', ecosKey),
      ])
      const fxRows = []
      for (const [rowSet, code] of [[usd, 'USD'], [eur, 'EUR'], [jpy, 'JPY'], [cny, 'CNY']] as [{ TIME: string; DATA_VALUE: string }[], string][]) {
        for (const r of rowSet) {
          const val = parseFloat(r.DATA_VALUE)
          if (!isNaN(val)) fxRows.push({ base_currency: code, quote_currency: 'KRW', rate_date: `${r.TIME.slice(0,4)}-${r.TIME.slice(4,6)}-01`, rate: Math.round(val * 100) / 100 })
        }
      }
      if (fxRows.length) {
        const { error } = await supabase.from('exchange_rate').upsert(fxRows, { onConflict: 'base_currency,quote_currency,rate_date' })
        results.exchangeRate = error ? { error: error.message } : { count: fxRows.length }
      }
    } catch (e: any) { results.exchangeRate = { error: e.message } }
  }

  // China PMI (NBS 스크래핑)
  try { results.cnPmi = await upsert(await fetchChinaPMI(), 'China PMI') }
  catch (e: any) { results.cnPmi = { error: e.message } }

  return NextResponse.json({ ok: true, results, at: new Date().toISOString() })
}
