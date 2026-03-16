/**
 * 일간 배치: BDI (Baltic Dry Index) 적재
 * 실행: node scripts/batch-daily.mjs
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const MONTHS = 3 // 최근 3개월치 갱신

function formatStooq(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function fetchBdi() {
  const start = new Date()
  start.setMonth(start.getMonth() - (MONTHS - 1))
  start.setDate(1)
  const end = new Date()

  const url = `https://stooq.com/q/d/l/?s=bdi.co&d1=${formatStooq(start)}&d2=${formatStooq(end)}&i=d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Stooq 응답 오류: ${res.status}`)

  const text = await res.text()
  if (!text || text.includes('No data') || text.length < 30) throw new Error('BDI 데이터 없음')

  const lines = text.trim().split('\n')
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 5) continue
    const date = cols[0].trim()
    const value = parseFloat(cols[4].trim())
    if (!date || isNaN(value) || value <= 0) continue
    rows.push({
      date,
      indicator_code: 'BALTIC_DRY',
      indicator_name: 'Baltic Dry Index',
      source: 'Stooq',
      unit: 'Index',
      value: Math.round(value),
    })
  }
  return rows
}

async function insertRows(rows, label) {
  if (!rows.length) { console.log(`  ${label}: 데이터 없음`); return }

  const dates = rows.map(r => r.date)
  const minDate = dates.reduce((a, b) => a < b ? a : b)
  const maxDate = dates.reduce((a, b) => a > b ? a : b)

  const { error: delErr } = await supabase
    .from('economic_indicator')
    .delete()
    .eq('indicator_code', 'BALTIC_DRY')
    .gte('date', minDate)
    .lte('date', maxDate)
  if (delErr) { console.error(`  ${label} 삭제 오류:`, delErr.message); return }

  const { error: insErr } = await supabase.from('economic_indicator').insert(rows)
  if (insErr) console.error(`  ${label} 삽입 오류:`, insErr.message)
  else console.log(`  ${label}: ${rows.length}건 적재 완료`)
}

console.log('=== 일간 배치: BDI ===\n')
try { await insertRows(await fetchBdi(), 'BDI (Baltic Dry Index)') }
catch (e) { console.error('  BDI 오류:', e.message); process.exit(1) }
console.log('\n=== 완료 ===')
