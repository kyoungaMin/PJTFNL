/**
 * 주간 라인별 생산실적 데모 데이터 시드
 * 최근 7일(03/01 ~ 03/07) daily_production 데이터 생성
 *
 * 실행: npx tsx scripts/seed-daily-production.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/* ─── 제품 ↔ 라인 매핑 (production_plan 데모 데이터와 일치, 실제 product_code 사용) ─── */
const SKU_LINE: { product_id: string; line_id: string; base_qty: number }[] = [
  { product_id: '00001-A010174', line_id: 'L-3', base_qty: 480 },
  { product_id: '00001-A010029', line_id: 'L-2', base_qty: 380 },
  { product_id: '00692-D090003', line_id: 'L-1', base_qty: 340 },
  { product_id: '01016-D010447', line_id: 'L-4', base_qty: 270 },
  { product_id: '00001-A010003', line_id: 'L-2', base_qty: 210 },
  { product_id: '00001-A010245', line_id: 'L-1', base_qty: 190 },
  { product_id: '00001-A010137', line_id: 'L-3', base_qty: 170 },
  { product_id: '00001-A011924', line_id: 'L-2', base_qty: 140 },
  { product_id: '00001-A010031', line_id: 'L-4', base_qty: 95 },
  { product_id: '00001-A011313', line_id: 'L-4', base_qty: 75 },
]

/* ─── 날짜 생성: 최근 7일 ─── */
function getRecentDates(days: number): string[] {
  const dates: string[] = []
  for (let i = days; i >= 1; i--) {
    const d = new Date('2026-03-07')
    d.setDate(d.getDate() - i + 1)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

/* ─── 요일별 가동률 패턴 (토·일 감소) ─── */
function dayFactor(dateStr: string): number {
  const dow = new Date(dateStr).getDay()
  if (dow === 0) return 0.3  // 일요일
  if (dow === 6) return 0.5  // 토요일
  return 0.85 + Math.random() * 0.3 // 평일 85~115%
}

/* ─── 랜덤 변동 ─── */
function vary(base: number, pct: number): number {
  const factor = 1 + (Math.random() * 2 - 1) * pct
  return Math.max(0, Math.round(base * factor))
}

async function seed() {
  console.log('=== 주간 생산실적 데모 데이터 시드 시작 ===\n')

  const dates = getRecentDates(7)
  console.log('대상 날짜:', dates.join(', '))

  const records: any[] = []

  for (const date of dates) {
    const factor = dayFactor(date)
    const dow = new Date(date).getDay()
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][dow]

    for (const sku of SKU_LINE) {
      const qty = vary(Math.round(sku.base_qty * factor), 0.15)
      if (qty <= 0) continue

      records.push({
        production_date: date,
        work_start_date: date,
        work_end_date: date,
        product_id: sku.product_id,
        produced_qty: qty,
        line_id: sku.line_id,
        mfg_order_serial: `MO-${date.replace(/-/g, '')}-${sku.product_id}`,
      })
    }

    console.log(`  ${date} (${dayName}): ${records.filter(r => r.production_date === date).length}건, 가동률 ${Math.round(factor * 100)}%`)
  }

  console.log(`\n총 ${records.length}건 생성 예정`)

  // 기존 데모 데이터 삭제 (대상 제품)
  const productIds = SKU_LINE.map(s => s.product_id)
  const { error: delErr } = await supabase
    .from('daily_production')
    .delete()
    .in('production_date', dates)
    .in('product_id', productIds)

  if (delErr) {
    console.error('삭제 실패:', delErr.message)
    // 삭제 실패해도 삽입 시도 (기존 데이터 없을 수 있음)
  }

  // 삽입
  const { data, error } = await supabase
    .from('daily_production')
    .insert(records)
    .select('id, production_date, line_id, produced_qty')

  if (error) {
    console.error('삽입 실패:', error.message)
    console.error('상세:', error)
    return
  }

  console.log(`\n✓ ${data.length}건 삽입 완료!\n`)

  // 라인별 합계 요약
  const lineTotals: Record<string, number> = {}
  for (const r of data) {
    lineTotals[r.line_id] = (lineTotals[r.line_id] ?? 0) + Number(r.produced_qty)
  }
  console.log('--- 라인별 주간 합계 ---')
  for (const [line, total] of Object.entries(lineTotals).sort()) {
    console.log(`  ${line}: ${total.toLocaleString()} EA`)
  }

  // 요일별 합계
  const dayTotals: Record<string, number> = {}
  for (const r of data) {
    const dow = new Date(r.production_date).getDay()
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][dow]
    dayTotals[dayName] = (dayTotals[dayName] ?? 0) + Number(r.produced_qty)
  }
  console.log('\n--- 요일별 합계 ---')
  for (const day of ['월', '화', '수', '목', '금', '토', '일']) {
    if (dayTotals[day]) console.log(`  ${day}: ${dayTotals[day].toLocaleString()} EA`)
  }

  console.log('\n=== 시드 완료 ===')
}

seed().catch(console.error)
