/**
 * 생산 권고 데모 데이터 시드 스크립트
 * 과거 3일(03/04, 03/05, 03/06) + 오늘(03/07) 데이터를 생성
 *
 * 실행: npx tsx scripts/seed-production-plan.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/* ─── 기본 SKU 데이터 (10개) — 실제 product_master 코드 사용 ─── */
const BASE_SKUS = [
  {
    product_id: '00001-A010174', priority: 'critical', plan_type: 'increase', risk_grade: 'F',
    demand_p50: 5960, demand_p90: 7800, safety_stock: 2800, daily_capacity: 900, max_capacity: 5400,
    description: 'AS-370 P90 수요 기반 증산 — 재고 소진 임박',
  },
  {
    product_id: '00001-A010029', priority: 'critical', plan_type: 'increase', risk_grade: 'E',
    demand_p50: 2720, demand_p90: 3800, safety_stock: 1500, daily_capacity: 450, max_capacity: 3150,
    description: 'AS-111 긴급수주 반영 필요',
  },
  {
    product_id: '00692-D090003', priority: 'high', plan_type: 'increase', risk_grade: 'E',
    demand_p50: 1980, demand_p90: 2700, safety_stock: 1000, daily_capacity: 350, max_capacity: 2450,
    description: 'SK하이닉스 납기일 D+5 대응 증산',
  },
  {
    product_id: '01016-D010447', priority: 'high', plan_type: 'maintain', risk_grade: 'D',
    demand_p50: 1510, demand_p90: 2100, safety_stock: 750, daily_capacity: 280, max_capacity: 1960,
    description: 'AS-326 현 생산량 유지 권고',
  },
  {
    product_id: '00001-A010003', priority: 'high', plan_type: 'increase', risk_grade: 'D',
    demand_p50: 1280, demand_p90: 1800, safety_stock: 600, daily_capacity: 230, max_capacity: 1610,
    description: 'AS-007 안전재고 하회 — 소량 증산',
  },
  {
    product_id: '00001-A010245', priority: 'medium', plan_type: 'maintain', risk_grade: 'C',
    demand_p50: 1220, demand_p90: 1650, safety_stock: 580, daily_capacity: 210, max_capacity: 1470,
    description: 'AS-204 안정적 재고 수준',
  },
  {
    product_id: '00001-A010137', priority: 'medium', plan_type: 'decrease', risk_grade: 'C',
    demand_p50: 910, demand_p90: 1250, safety_stock: 450, daily_capacity: 180, max_capacity: 1260,
    description: 'AS-274 과잉 재고 위험 — 감산 권고',
  },
  {
    product_id: '00001-A011924', priority: 'medium', plan_type: 'maintain', risk_grade: 'B',
    demand_p50: 900, demand_p90: 1200, safety_stock: 420, daily_capacity: 170, max_capacity: 1190,
    description: 'AS-902 정상 범위 유지',
  },
  {
    product_id: '00001-A010031', priority: 'low', plan_type: 'decrease', risk_grade: 'A',
    demand_p50: 880, demand_p90: 1200, safety_stock: 400, daily_capacity: 160, max_capacity: 1120,
    description: 'AS-113 수요 감소 추세 — 감산 조정',
  },
  {
    product_id: '00001-A011313', priority: 'low', plan_type: 'new', risk_grade: 'A',
    demand_p50: 800, demand_p90: 1100, safety_stock: 380, daily_capacity: 150, max_capacity: 1050,
    description: '266.29 신규 라인 시험 생산',
  },
]

/* ─── 날짜별 변동 시나리오 ─── */
interface DateScenario {
  plan_date: string
  target_start: string
  target_end: string
  // 재고 변동 배수 (과거일수록 재고가 많았음)
  inventoryMultiplier: number
  // 수요 변동 배수
  demandMultiplier: number
  // 상태 패턴: 오래된 날짜일수록 승인/완료 비율 높음
  statusPattern: ('approved' | 'completed' | 'draft' | 'in_progress')[]
}

const DATE_SCENARIOS: DateScenario[] = [
  {
    plan_date: '2026-03-04',
    target_start: '2026-03-04',
    target_end: '2026-03-10',
    inventoryMultiplier: 1.8,
    demandMultiplier: 0.9,
    statusPattern: ['completed', 'completed', 'completed', 'approved', 'approved', 'approved', 'completed', 'approved', 'completed', 'approved'],
  },
  {
    plan_date: '2026-03-05',
    target_start: '2026-03-05',
    target_end: '2026-03-11',
    inventoryMultiplier: 1.4,
    demandMultiplier: 0.95,
    statusPattern: ['approved', 'approved', 'in_progress', 'approved', 'approved', 'in_progress', 'approved', 'draft', 'approved', 'draft'],
  },
  {
    plan_date: '2026-03-06',
    target_start: '2026-03-06',
    target_end: '2026-03-12',
    inventoryMultiplier: 1.1,
    demandMultiplier: 1.0,
    statusPattern: ['approved', 'draft', 'draft', 'approved', 'draft', 'draft', 'approved', 'draft', 'draft', 'draft'],
  },
  {
    plan_date: '2026-03-07',
    target_start: '2026-03-07',
    target_end: '2026-03-13',
    inventoryMultiplier: 1.0,
    demandMultiplier: 1.0,
    statusPattern: ['draft', 'draft', 'draft', 'draft', 'draft', 'draft', 'draft', 'draft', 'draft', 'draft'],
  },
]

/* ─── 기본 재고량 (제품별) ─── */
const BASE_INVENTORY: Record<string, number> = {
  '00001-A010174': 420,
  '00001-A010029': 380,
  '00692-D090003': 550,
  '01016-D010447': 1800,
  '00001-A010003': 320,
  '00001-A010245': 1500,
  '00001-A010137': 2200,
  '00001-A011924': 1100,
  '00001-A010031': 800,
  '00001-A011313': 0,
}

function buildRecords() {
  const records: any[] = []

  for (const scenario of DATE_SCENARIOS) {
    for (let i = 0; i < BASE_SKUS.length; i++) {
      const sku = BASE_SKUS[i]
      const baseInv = BASE_INVENTORY[sku.product_id] ?? 500

      const currentInventory = Math.round(baseInv * scenario.inventoryMultiplier)
      const demandP50 = Math.round(sku.demand_p50 * scenario.demandMultiplier)
      const demandP90 = Math.round(sku.demand_p90 * scenario.demandMultiplier)

      // 계획수량: 수요 - 재고 + 안전재고, 최소 일일능력 * 7
      const gap = demandP90 - currentInventory + sku.safety_stock
      const minWeekly = sku.daily_capacity * 7
      const plannedQty = Math.max(Math.round(gap * 0.85), Math.round(minWeekly * 0.5))
      const minQty = Math.round(plannedQty * 0.85)
      const maxQty = Math.round(plannedQty * 1.15)

      // 과거 날짜에 따라 우선순위 약간 변동 (재고 많았으므로)
      let priority = sku.priority
      if (scenario.inventoryMultiplier > 1.5 && priority === 'critical') {
        priority = 'high'
      }

      records.push({
        product_id: sku.product_id,
        plan_date: scenario.plan_date,
        plan_horizon: 'weekly',
        target_start: scenario.target_start,
        target_end: scenario.target_end,
        demand_p50: demandP50,
        demand_p90: demandP90,
        current_inventory: currentInventory,
        safety_stock: sku.safety_stock,
        daily_capacity: sku.daily_capacity,
        max_capacity: sku.max_capacity,
        planned_qty: plannedQty,
        min_qty: minQty,
        max_qty: maxQty,
        priority,
        plan_type: sku.plan_type,
        risk_grade: sku.risk_grade,
        description: sku.description,
        status: scenario.statusPattern[i],
      })
    }
  }

  return records
}

async function seed() {
  console.log('=== 생산 권고 데모 데이터 시드 시작 ===\n')

  const records = buildRecords()
  console.log(`총 ${records.length}건 생성 예정 (${BASE_SKUS.length} SKU × ${DATE_SCENARIOS.length} 날짜)\n`)

  // 기존 데모 날짜 데이터 삭제 (충돌 방지)
  const dates = DATE_SCENARIOS.map(s => s.plan_date)
  console.log(`기존 데이터 삭제: ${dates.join(', ')}`)

  const { error: delErr } = await supabase
    .from('production_plan')
    .delete()
    .in('plan_date', dates)

  if (delErr) {
    console.error('삭제 실패:', delErr.message)
    return
  }

  // 배치 삽입
  const { data, error } = await supabase
    .from('production_plan')
    .insert(records)
    .select('id, product_id, plan_date, status')

  if (error) {
    console.error('삽입 실패:', error.message)
    console.error('상세:', error)
    return
  }

  console.log(`\n✓ ${data.length}건 삽입 완료!\n`)

  // 날짜별 요약
  for (const date of dates) {
    const dateItems = data.filter(d => d.plan_date === date)
    const statusCounts: Record<string, number> = {}
    for (const item of dateItems) {
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1
    }
    console.log(`  ${date}: ${dateItems.length}건 — ${Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
  }

  // 확인 쿼리
  console.log('\n--- 날짜별 데이터 확인 ---')
  const { data: check } = await supabase
    .from('production_plan')
    .select('plan_date')
    .order('plan_date', { ascending: false })

  const dateCounts: Record<string, number> = {}
  for (const r of (check ?? [])) {
    dateCounts[r.plan_date] = (dateCounts[r.plan_date] ?? 0) + 1
  }
  for (const [d, c] of Object.entries(dateCounts).sort()) {
    console.log(`  ${d}: ${c}건`)
  }

  console.log('\n=== 시드 완료 ===')
}

seed().catch(console.error)
