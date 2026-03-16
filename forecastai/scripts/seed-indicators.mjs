/**
 * 외부지표 DB 적재 스크립트
 * Gold (GOLD_LBMA), Copper (COPPER_LME), China PMI (CN_PMI_MFG)
 * DRAM/NAND는 기존 예측치 데이터 사용 (이 스크립트에서 제외)
 *
 * 실행: node scripts/seed-indicators.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const FRED_KEY     = process.env.FRED_API_KEY
const MONTHS       = 24

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local 확인)')
  process.exit(1)
}
if (!FRED_KEY) {
  console.error('환경변수 누락: FRED_API_KEY (.env.local 확인)')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function startDate(months) {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// ── Gold: stooq.com XAU/USD 월간 종가 (금 현물가, USD/oz) ─────────────────────
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
    // stooq 날짜는 해당 월 말일 → 1일로 변환
    const ym = date.slice(0, 7)
    if (ym < start.slice(0, 7)) continue
    rows.push({
      date: ym + '-01',
      indicator_code: 'GOLD_LBMA',
      indicator_name: 'Gold Spot Price (XAU/USD)',
      source: 'stooq',
      unit: 'USD/oz',
      value: Math.round(val * 100) / 100,
    })
  }
  return rows
}

// ── Copper: FRED PCOPPUSDM ────────────────────────────────────────────────────
async function fetchCopper() {
  const start = startDate(MONTHS)
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=PCOPPUSDM&api_key=${FRED_KEY}&file_type=json&observation_start=${start}`
  const res = await fetch(url)
  const json = await res.json()
  if (json.error_code) throw new Error(`FRED 오류: ${json.error_message}`)

  return json.observations
    .filter(r => r.value !== '.' && !isNaN(parseFloat(r.value)))
    .map(r => ({
      date: r.date,
      indicator_code: 'COPPER_LME',
      indicator_name: 'Copper Price (LME)',
      source: 'FRED',
      unit: 'USD/mt',
      value: Math.round(parseFloat(r.value) * 100) / 100,
    }))
}

// ── China PMI: NBS 보도자료 스크래핑 ──────────────────────────────────────────
// 목록 페이지에서 "Purchasing Managers' Index" 링크 수집 후
// 각 보도자료에서 "came in at XX.X%" 패턴으로 PMI 수치 파싱
async function fetchChinaPMI() {
  const BASE = 'https://www.stats.gov.cn/english/PressRelease'
  const monthMap = {
    January:'01', February:'02', March:'03', April:'04',
    May:'05', June:'06', July:'07', August:'08',
    September:'09', October:'10', November:'11', December:'12',
  }

  // 목록 1~3페이지에서 PMI 보도자료 링크 수집 (약 24개월치)
  const links = []
  const pages = ['/'].concat(Array.from({ length: 13 }, (_, i) => `/index_${i + 2}.html`))
  for (const page of pages) {
    try {
      const res = await fetch(`${BASE}${page}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const html = await res.text()

      const linkRegex = /title="Purchasing Managers[^"]*Index[^"]*for\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})"[^>]*href="(\.\/[^"]+\.html)"/gi
      let m
      while ((m = linkRegex.exec(html)) !== null) {
        const month = monthMap[m[1]]
        const year  = m[2]
        const path  = m[3].replace('./', '/')
        links.push({ date: `${year}-${month}-01`, url: `${BASE}${path}` })
      }
    } catch { /* 페이지 실패 시 건너뜀 */ }
  }

  console.log(`  링크 ${links.length}개 발견`)
  if (links.length === 0) return []

  // 각 보도자료에서 PMI 수치 파싱
  const rows = []
  for (const { date, url } of links) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const html = await res.text()

      const valMatch = html.match(/manufacturing industry came in at\s+([0-9]{2}\.[0-9])\s*(?:%|percent)/)
      if (!valMatch) continue

      const value = parseFloat(valMatch[1])
      if (!isNaN(value)) {
        rows.push({ date, indicator_code: 'CN_PMI_MFG', indicator_name: 'China NBS Manufacturing PMI', source: 'NBS', unit: 'Index', value })
        console.log(`  ${date}: ${value}`)
      }
    } catch { /* 개별 실패 시 건너뜀 */ }
  }
  return rows
}


// ── Upsert (source+indicator_code+date unique constraint 기반) ────────────────
async function insert(rows, label) {
  if (rows.length === 0) { console.log(`  ${label}: 데이터 없음`); return }

  // 동일 날짜 중복 제거 (마지막 값 우선)
  const deduped = Object.values(
    Object.fromEntries(rows.map(r => [r.date, r]))
  )

  const { error } = await supabase
    .from('economic_indicator')
    .upsert(deduped, { onConflict: 'source,indicator_code,date' })
  if (error) console.error(`  ${label} 적재 오류:`, error.message)
  else console.log(`  ${label}: ${deduped.length}건 적재 완료`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('=== 외부지표 DB 적재 시작 ===\n')

console.log('[1/5] Gold (GOLD_LBMA) — Yahoo Finance GC=F')
try { await insert(await fetchGold(), 'Gold') }
catch (e) { console.error('  Gold 오류:', e.message) }

console.log('[2/5] Copper (COPPER_LME) — FRED PCOPPUSDM')
try { await insert(await fetchCopper(), 'Copper') }
catch (e) { console.error('  Copper 오류:', e.message) }

console.log('[3/5] China PMI (CN_PMI_MFG) — NBS 스크래핑')
try { await insert(await fetchChinaPMI(), 'China PMI') }
catch (e) { console.error('  China PMI 오류:', e.message) }


console.log('\n=== 완료 ===')
