/**
 * 2월 실데이터 기반 생산 권고 데모 시드
 * 기준일: 2026-02-24, 2026-02-25, 2026-02-26
 * daily_production 실데이터(2/23~2/26) 기간과 겹치도록 설정
 *
 * 실행: npx tsx scripts/seed-feb-production-plan.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/* ─── 실제 생산량 Top 10 제품 (2월 daily_production 기반) ─── */
const PRODUCTS = [
  { product_id: '00001-B030080', base_demand: 4740, base_inv: 1396, risk_grade: 'D',  priority: 'critical', plan_type: 'increase', stockout: 85, excess: 5, desc: '결품 위험 — SL-301S 재고 급감, 긴급 증산 필요' },
  { product_id: '00001-B030009', base_demand: 4530, base_inv: -1768, risk_grade: 'D',  priority: 'critical', plan_type: 'increase', stockout: 92, excess: 0, desc: '5080W 재고 마이너스 — 즉시 생산 투입' },
  { product_id: '00001-B030088', base_demand: 4160, base_inv: 1223, risk_grade: 'C',  priority: 'high',     plan_type: 'increase', stockout: 72, excess: 8, desc: 'INS-1271 안전재고 하회 임박' },
  { product_id: '00001-B050013', base_demand: 3570, base_inv: -1422, risk_grade: 'C',  priority: 'high',     plan_type: 'increase', stockout: 78, excess: 0, desc: '노즐 2.3-3.2 백오더 해소 필요' },
  { product_id: '00001-B030051', base_demand: 3450, base_inv: 3439, risk_grade: 'B',  priority: 'high',     plan_type: 'maintain', stockout: 45, excess: 15, desc: 'KI-100 현 수준 유지 — 수요 안정' },
  { product_id: '00001-B050429', base_demand: 2950, base_inv: 4277, risk_grade: 'A',  priority: 'medium',   plan_type: 'decrease', stockout: 10, excess: 55, desc: '절단 [SL-8000] 과잉 재고 — 감산 조정' },
  { product_id: '00001-B050468', base_demand: 2830, base_inv: 8234, risk_grade: 'A',  priority: 'medium',   plan_type: 'decrease', stockout: 5,  excess: 65, desc: '절단 [5080B] 과잉 — 감산 권고' },
  { product_id: '00001-B030017', base_demand: 2640, base_inv: 376,  risk_grade: 'C',  priority: 'medium',   plan_type: 'increase', stockout: 60, excess: 10, desc: 'ASMM-65 안전재고 접근 중' },
  { product_id: '00001-B050092', base_demand: 2600, base_inv: 1224, risk_grade: 'B',  priority: 'low',      plan_type: 'maintain', stockout: 30, excess: 20, desc: '노즐 3.5-4.7 정상 범위' },
  { product_id: '00001-B050227', base_demand: 2280, base_inv: 1735, risk_grade: 'A',  priority: 'low',      plan_type: 'maintain', stockout: 15, excess: 25, desc: '노즐 2.3-3.2 [SL-301S] 안정적 재고' },
]

/* ─── 3개 기준일 시나리오 ─── */
interface DateScenario {
  plan_date: string
  target_start: string
  target_end: string
  invMultiplier: number  // 재고 변동 (과거일수록 재고 많음)
  demandMultiplier: number
  statusPattern: string[]
}

const SCENARIOS: DateScenario[] = [
  {
    plan_date: '2026-02-24',
    target_start: '2026-02-24',
    target_end: '2026-03-02',
    invMultiplier: 1.5,
    demandMultiplier: 0.92,
    statusPattern: ['completed', 'completed', 'approved', 'approved', 'completed', 'approved', 'completed', 'approved', 'completed', 'approved'],
  },
  {
    plan_date: '2026-02-25',
    target_start: '2026-02-25',
    target_end: '2026-03-03',
    invMultiplier: 1.2,
    demandMultiplier: 0.96,
    statusPattern: ['approved', 'approved', 'in_progress', 'approved', 'in_progress', 'draft', 'approved', 'draft', 'approved', 'draft'],
  },
  {
    plan_date: '2026-02-26',
    target_start: '2026-02-26',
    target_end: '2026-03-04',
    invMultiplier: 1.0,
    demandMultiplier: 1.0,
    statusPattern: ['draft', 'draft', 'draft', 'draft', 'approved', 'draft', 'draft', 'draft', 'draft', 'draft'],
  },
]

function buildRecords() {
  const records: any[] = []

  for (const sc of SCENARIOS) {
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i]
      const inv = Math.round(p.base_inv * sc.invMultiplier)
      const demandP50 = Math.round(p.base_demand * sc.demandMultiplier)
      const demandP90 = Math.round(demandP50 * 1.35)
      const safetyStock = Math.round(demandP50 * 0.4)
      const dailyCap = Math.round(p.base_demand / 7)
      const maxCap = Math.round(dailyCap * 1.4 * 7)

      // 계획수량: 수요 - 재고 + 안전재고
      const gap = demandP90 - inv + safetyStock
      const plannedQty = Math.max(Math.round(gap * 0.85), Math.round(dailyCap * 3))
      const minQty = Math.round(plannedQty * 0.8)
      const maxQty = Math.round(plannedQty * 1.2)

      // 과거 날짜에 따라 우선순위 완화
      let priority = p.priority
      if (sc.invMultiplier >= 1.5 && priority === 'critical') priority = 'high'

      records.push({
        product_id: p.product_id,
        plan_date: sc.plan_date,
        plan_horizon: 'weekly',
        target_start: sc.target_start,
        target_end: sc.target_end,
        demand_p50: demandP50,
        demand_p90: demandP90,
        current_inventory: inv,
        safety_stock: safetyStock,
        daily_capacity: dailyCap,
        max_capacity: maxCap,
        planned_qty: plannedQty,
        min_qty: minQty,
        max_qty: maxQty,
        priority,
        plan_type: p.plan_type,
        risk_grade: p.risk_grade,
        description: p.desc,
        status: sc.statusPattern[i],
      })
    }
  }

  return records
}

async function seed() {
  console.log('=== 2월 실데이터 기반 생산 권고 시드 시작 ===\n')

  const records = buildRecords()
  const dates = SCENARIOS.map(s => s.plan_date)
  console.log(`기준일: ${dates.join(', ')}`)
  console.log(`총 ${records.length}건 (${PRODUCTS.length} 제품 × ${SCENARIOS.length} 날짜)\n`)

  // 기존 해당 날짜 데이터 삭제
  const { error: delErr } = await supabase
    .from('production_plan')
    .delete()
    .in('plan_date', dates)

  if (delErr) console.warn('삭제 경고:', delErr.message)

  // 삽입
  const { data, error } = await supabase
    .from('production_plan')
    .insert(records)
    .select('id, product_id, plan_date, priority, status, planned_qty')

  if (error) {
    console.error('삽입 실패:', error.message)
    console.error('상세:', error)
    return
  }

  console.log(`✓ ${data.length}건 삽입 완료!\n`)

  // 날짜별 요약
  for (const date of dates) {
    const items = data.filter(d => d.plan_date === date)
    const statusCounts: Record<string, number> = {}
    const prioCounts: Record<string, number> = {}
    for (const item of items) {
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1
      prioCounts[item.priority] = (prioCounts[item.priority] ?? 0) + 1
    }
    console.log(`${date}: ${items.length}건`)
    console.log(`  상태: ${Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
    console.log(`  우선순위: ${Object.entries(prioCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
  }

  // 제품명 확인
  const prodIds = PRODUCTS.map(p => p.product_id)
  const { data: masters } = await supabase
    .from('product_master')
    .select('product_code, product_name, product_category')
    .in('product_code', prodIds)

  console.log('\n--- 대상 제품 ---')
  for (const m of (masters ?? [])) {
    const p = PRODUCTS.find(pp => pp.product_id === m.product_code)
    console.log(`  ${m.product_code} | ${m.product_name} | ${m.product_category} | ${p?.priority} | ${p?.risk_grade}`)
  }

  console.log('\n=== 시드 완료 ===')
}

seed().catch(console.error)
