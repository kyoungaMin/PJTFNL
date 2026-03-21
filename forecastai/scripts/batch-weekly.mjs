/**
 * 주간 배치: WTI 유가 (EIA API) 적재
 * 실행: node scripts/batch-weekly.mjs
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY, EIA_API_KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const EIA_KEY = process.env.EIA_API_KEY
const MONTHS = 3 // 최근 3개월치 갱신

function startDate(months) {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

async function fetchWti() {
  if (!EIA_KEY) throw new Error('EIA_API_KEY 환경변수 없음')

  const start = startDate(MONTHS)
  const url = `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${EIA_KEY}&frequency=weekly&data[0]=value&facets[series][]=RWTC&start=${start}&sort[0][column]=period&sort[0][direction]=asc&length=500`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`EIA API 오류: ${res.status}`)

  const json = await res.json()
  const rawRows = json?.response?.data ?? []

  // 주간 데이터 → 월간 평균으로 집계
  const monthMap = {}
  for (const r of rawRows) {
    const val = parseFloat(r.value)
    if (isNaN(val)) continue
    const ym = r.period.slice(0, 7)
    if (!monthMap[ym]) monthMap[ym] = { sum: 0, count: 0 }
    monthMap[ym].sum += val
    monthMap[ym].count++
  }

  return Object.entries(monthMap).map(([ym, { sum, count }]) => ({
    date: ym + '-01',
    indicator_code: 'WTI_MONTHLY',
    indicator_name: 'WTI Crude Oil Price',
    source: 'EIA',
    unit: 'USD/bbl',
    value: Math.round((sum / count) * 100) / 100,
  }))
}

async function insertRows(rows, label) {
  if (!rows.length) { console.log(`  ${label}: 데이터 없음`); return }

  const dates = rows.map(r => r.date)
  const minDate = dates.reduce((a, b) => a < b ? a : b)
  const maxDate = dates.reduce((a, b) => a > b ? a : b)

  const { error: delErr } = await supabase
    .from('economic_indicator')
    .delete()
    .eq('indicator_code', 'WTI_MONTHLY')
    .gte('date', minDate)
    .lte('date', maxDate)
  if (delErr) { console.error(`  ${label} 삭제 오류:`, delErr.message); return }

  const { error: insErr } = await supabase.from('economic_indicator').insert(rows)
  if (insErr) console.error(`  ${label} 삽입 오류:`, insErr.message)
  else console.log(`  ${label}: ${rows.length}건 적재 완료`)
}

console.log('=== 주간 배치: WTI 유가 ===\n')
try { await insertRows(await fetchWti(), 'WTI (WTI Crude Oil)') }
catch (e) { console.error('  WTI 오류:', e.message); process.exit(1) }
console.log('\n=== 완료 ===')
