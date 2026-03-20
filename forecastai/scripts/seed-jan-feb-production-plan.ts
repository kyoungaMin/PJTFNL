/**
 * 2026년 1월~2월 주차별 생산 권고 시드 스크립트
 * 매주 월요일 기준 8주 데이터 생성
 *   1월: W02(01-05), W03(01-12), W04(01-19), W05(01-26)
 *   2월: W06(02-02), W07(02-09), W08(02-16), W09(02-23)
 *
 * 실행: npx tsx scripts/seed-jan-feb-production-plan.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// .env.local 수동 파싱 (dotenv 미설치 대응)
const envPath = resolve(__dirname, '../.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const m = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/* ─── 제품 마스터 (기존 시드 스크립트 제품 통합 20종) ─── */
const PRODUCTS = [
  // A 그룹 (3월 시드 기반)
  { product_id: '00001-A010174', base_demand: 5960, base_inv: 420,   risk_grade: 'F', priority: 'critical', plan_type: 'increase', stockout: 90, excess: 2,  desc: 'AS-370 P90 수요 기반 증산 — 재고 소진 임박' },
  { product_id: '00001-A010029', base_demand: 2720, base_inv: 380,   risk_grade: 'E', priority: 'critical', plan_type: 'increase', stockout: 85, excess: 3,  desc: 'AS-111 긴급수주 반영 필요' },
  { product_id: '00692-D090003', base_demand: 1980, base_inv: 550,   risk_grade: 'E', priority: 'high',     plan_type: 'increase', stockout: 78, excess: 5,  desc: 'SK하이닉스 납기일 D+5 대응 증산' },
  { product_id: '01016-D010447', base_demand: 1510, base_inv: 1800,  risk_grade: 'D', priority: 'high',     plan_type: 'maintain', stockout: 55, excess: 12, desc: 'AS-326 현 생산량 유지 권고' },
  { product_id: '00001-A010003', base_demand: 1280, base_inv: 320,   risk_grade: 'D', priority: 'high',     plan_type: 'increase', stockout: 65, excess: 8,  desc: 'AS-007 안전재고 하회 — 소량 증산' },
  { product_id: '00001-A010245', base_demand: 1220, base_inv: 1500,  risk_grade: 'C', priority: 'medium',   plan_type: 'maintain', stockout: 35, excess: 18, desc: 'AS-204 안정적 재고 수준' },
  { product_id: '00001-A010137', base_demand: 910,  base_inv: 2200,  risk_grade: 'C', priority: 'medium',   plan_type: 'decrease', stockout: 15, excess: 45, desc: 'AS-274 과잉 재고 위험 — 감산 권고' },
  { product_id: '00001-A011924', base_demand: 900,  base_inv: 1100,  risk_grade: 'B', priority: 'medium',   plan_type: 'maintain', stockout: 25, excess: 20, desc: 'AS-902 정상 범위 유지' },
  { product_id: '00001-A010031', base_demand: 880,  base_inv: 800,   risk_grade: 'A', priority: 'low',      plan_type: 'decrease', stockout: 10, excess: 40, desc: 'AS-113 수요 감소 추세 — 감산 조정' },
  { product_id: '00001-A011313', base_demand: 800,  base_inv: 0,     risk_grade: 'A', priority: 'low',      plan_type: 'new',      stockout: 20, excess: 10, desc: '266.29 신규 라인 시험 생산' },
  // B 그룹 (2월 시드 기반)
  { product_id: '00001-B030080', base_demand: 4740, base_inv: 1396,  risk_grade: 'D', priority: 'critical', plan_type: 'increase', stockout: 85, excess: 5,  desc: '결품 위험 — SL-301S 재고 급감, 긴급 증산 필요' },
  { product_id: '00001-B030009', base_demand: 4530, base_inv: -1768, risk_grade: 'D', priority: 'critical', plan_type: 'increase', stockout: 92, excess: 0,  desc: '5080W 재고 마이너스 — 즉시 생산 투입' },
  { product_id: '00001-B030088', base_demand: 4160, base_inv: 1223,  risk_grade: 'C', priority: 'high',     plan_type: 'increase', stockout: 72, excess: 8,  desc: 'INS-1271 안전재고 하회 임박' },
  { product_id: '00001-B050013', base_demand: 3570, base_inv: -1422, risk_grade: 'C', priority: 'high',     plan_type: 'increase', stockout: 78, excess: 0,  desc: '노즐 2.3-3.2 백오더 해소 필요' },
  { product_id: '00001-B030051', base_demand: 3450, base_inv: 3439,  risk_grade: 'B', priority: 'high',     plan_type: 'maintain', stockout: 45, excess: 15, desc: 'KI-100 현 수준 유지 — 수요 안정' },
  { product_id: '00001-B050429', base_demand: 2950, base_inv: 4277,  risk_grade: 'A', priority: 'medium',   plan_type: 'decrease', stockout: 10, excess: 55, desc: '절단 [SL-8000] 과잉 재고 — 감산 조정' },
  { product_id: '00001-B050468', base_demand: 2830, base_inv: 8234,  risk_grade: 'A', priority: 'medium',   plan_type: 'decrease', stockout: 5,  excess: 65, desc: '절단 [5080B] 과잉 — 감산 권고' },
  { product_id: '00001-B030017', base_demand: 2640, base_inv: 376,   risk_grade: 'C', priority: 'medium',   plan_type: 'increase', stockout: 60, excess: 10, desc: 'ASMM-65 안전재고 접근 중' },
  { product_id: '00001-B050092', base_demand: 2600, base_inv: 1224,  risk_grade: 'B', priority: 'low',      plan_type: 'maintain', stockout: 30, excess: 20, desc: '노즐 3.5-4.7 정상 범위' },
  { product_id: '00001-B050227', base_demand: 2280, base_inv: 1735,  risk_grade: 'A', priority: 'low',      plan_type: 'maintain', stockout: 15, excess: 25, desc: '노즐 2.3-3.2 [SL-301S] 안정적 재고' },
]

/* ─── 8주 시나리오 (1월 W02 ~ 2월 W09) ─── */
interface WeekScenario {
  plan_date: string
  target_start: string
  target_end: string
  plan_horizon: string
  invMultiplier: number
  demandMultiplier: number
  statusDefault: string
}

const WEEKS: WeekScenario[] = [
  // ── 1월 ──
  {
    plan_date: '2026-01-05', target_start: '2026-01-05', target_end: '2026-01-11',
    plan_horizon: '2026-W02',
    invMultiplier: 2.2, demandMultiplier: 0.82,
    statusDefault: 'completed',
  },
  {
    plan_date: '2026-01-12', target_start: '2026-01-12', target_end: '2026-01-18',
    plan_horizon: '2026-W03',
    invMultiplier: 2.0, demandMultiplier: 0.85,
    statusDefault: 'completed',
  },
  {
    plan_date: '2026-01-19', target_start: '2026-01-19', target_end: '2026-01-25',
    plan_horizon: '2026-W04',
    invMultiplier: 1.8, demandMultiplier: 0.88,
    statusDefault: 'completed',
  },
  {
    plan_date: '2026-01-26', target_start: '2026-01-26', target_end: '2026-02-01',
    plan_horizon: '2026-W05',
    invMultiplier: 1.6, demandMultiplier: 0.90,
    statusDefault: 'completed',
  },
  // ── 2월 ──
  {
    plan_date: '2026-02-02', target_start: '2026-02-02', target_end: '2026-02-08',
    plan_horizon: '2026-W06',
    invMultiplier: 1.5, demandMultiplier: 0.92,
    statusDefault: 'completed',
  },
  {
    plan_date: '2026-02-09', target_start: '2026-02-09', target_end: '2026-02-15',
    plan_horizon: '2026-W07',
    invMultiplier: 1.3, demandMultiplier: 0.95,
    statusDefault: 'approved',
  },
  {
    plan_date: '2026-02-16', target_start: '2026-02-16', target_end: '2026-02-22',
    plan_horizon: '2026-W08',
    invMultiplier: 1.1, demandMultiplier: 0.98,
    statusDefault: 'approved',
  },
  {
    plan_date: '2026-02-23', target_start: '2026-02-23', target_end: '2026-03-01',
    plan_horizon: '2026-W09',
    invMultiplier: 1.0, demandMultiplier: 1.0,
    statusDefault: 'approved',
  },
]

/* ─── 주차별 상태 패턴 (과거→최근: completed → approved → draft) ─── */
function getStatus(weekIdx: number, productIdx: number, defaultStatus: string): string {
  // 오래된 주차일수록 completed 비율 높음
  if (weekIdx <= 1) {
    // W02, W03: 대부분 completed
    return productIdx % 5 === 0 ? 'approved' : 'completed'
  }
  if (weekIdx <= 3) {
    // W04, W05: completed/approved 혼합
    const patterns = ['completed', 'approved', 'completed', 'approved', 'completed']
    return patterns[productIdx % patterns.length]
  }
  if (weekIdx <= 5) {
    // W06, W07: approved 위주, 일부 in_progress
    const patterns = ['approved', 'approved', 'in_progress', 'approved', 'approved', 'in_progress']
    return patterns[productIdx % patterns.length]
  }
  // W08, W09: approved/draft 혼합
  const patterns = ['approved', 'draft', 'approved', 'draft', 'approved', 'draft', 'draft']
  return patterns[productIdx % patterns.length]
}

/* ─── 주차 진행에 따른 risk_grade 변화 (과거→현재: 점진적 악화) ─── */
function adjustRiskGrade(baseGrade: string, weekIdx: number): string {
  const grades = ['A', 'B', 'C', 'D', 'E', 'F']
  const baseIdx = grades.indexOf(baseGrade)
  if (baseIdx < 0) return baseGrade
  // 과거(weekIdx=0)에서는 1~2단계 나은 등급, 현재에 가까울수록 원래 등급
  const improvement = Math.max(0, Math.round((7 - weekIdx) * 0.3))
  const newIdx = Math.max(0, baseIdx - improvement)
  return grades[newIdx]
}

/* ─── 레코드 생성 ─── */
function buildRecords() {
  const records: any[] = []

  for (let wIdx = 0; wIdx < WEEKS.length; wIdx++) {
    const w = WEEKS[wIdx]

    for (let pIdx = 0; pIdx < PRODUCTS.length; pIdx++) {
      const p = PRODUCTS[pIdx]

      // 주차별 약간의 랜덤 변동 (시드 기반 결정적)
      const jitter = 1 + ((pIdx * 7 + wIdx * 13) % 11 - 5) / 100  // ±5%

      const inv = Math.round(p.base_inv * w.invMultiplier * jitter)
      const demandP50 = Math.round(p.base_demand * w.demandMultiplier * jitter)
      const demandP90 = Math.round(demandP50 * 1.35)
      const safetyStock = Math.round(demandP50 * 0.4)
      const dailyCap = Math.round(p.base_demand / 7)
      const maxCap = Math.round(dailyCap * 1.4 * 7)

      // 계획수량
      const gap = demandP90 - inv + safetyStock
      const plannedQty = Math.max(Math.round(gap * 0.85), Math.round(dailyCap * 3))
      const minQty = Math.round(plannedQty * 0.8)
      const maxQty = Math.round(plannedQty * 1.2)

      // 과거 재고 풍부 시 우선순위 완화
      let priority = p.priority
      if (w.invMultiplier >= 2.0 && priority === 'critical') priority = 'high'
      if (w.invMultiplier >= 1.8 && priority === 'critical') priority = 'high'

      const riskGrade = adjustRiskGrade(p.risk_grade, wIdx)

      records.push({
        product_id: p.product_id,
        plan_date: w.plan_date,
        plan_horizon: w.plan_horizon,
        target_start: w.target_start,
        target_end: w.target_end,
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
        risk_grade: riskGrade,
        description: p.desc,
        status: getStatus(wIdx, pIdx, w.statusDefault),
      })
    }
  }

  return records
}

/* ─── 메인 시드 실행 ─── */
async function seed() {
  console.log('=== 2026년 1~2월 주차별 생산 권고 시드 시작 ===\n')

  const records = buildRecords()
  const dates = WEEKS.map(w => w.plan_date)

  console.log(`대상 주차: ${dates.join(', ')}`)
  console.log(`총 ${records.length}건 (${PRODUCTS.length} 제품 × ${WEEKS.length} 주)\n`)

  // 기존 해당 날짜 데이터 삭제 (충돌 방지)
  console.log('기존 데이터 삭제 중...')
  for (const date of dates) {
    const { error: delErr } = await supabase
      .from('production_plan')
      .delete()
      .eq('plan_date', date)
    if (delErr) console.warn(`  ${date} 삭제 경고:`, delErr.message)
  }

  // 배치 삽입 (주차별로 나눠 삽입)
  let totalInserted = 0
  for (const date of dates) {
    const batch = records.filter(r => r.plan_date === date)
    const { data, error } = await supabase
      .from('production_plan')
      .insert(batch)
      .select('id, product_id, plan_date, priority, status, planned_qty')

    if (error) {
      console.error(`${date} 삽입 실패:`, error.message)
      continue
    }

    const statusCounts: Record<string, number> = {}
    const prioCounts: Record<string, number> = {}
    for (const item of (data ?? [])) {
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1
      prioCounts[item.priority] = (prioCounts[item.priority] ?? 0) + 1
    }

    console.log(`  ${date}: ${data?.length ?? 0}건`)
    console.log(`    상태: ${Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
    console.log(`    우선순위: ${Object.entries(prioCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
    totalInserted += data?.length ?? 0
  }

  console.log(`\n✓ 총 ${totalInserted}건 삽입 완료!`)

  // 전체 production_plan 날짜 현황 확인
  console.log('\n--- 전체 production_plan 날짜 현황 ---')
  const { data: allDates } = await supabase
    .from('production_plan')
    .select('plan_date')
    .order('plan_date', { ascending: true })

  const dateCounts: Record<string, number> = {}
  for (const r of (allDates ?? [])) {
    dateCounts[r.plan_date] = (dateCounts[r.plan_date] ?? 0) + 1
  }
  for (const [d, c] of Object.entries(dateCounts).sort()) {
    console.log(`  ${d}: ${c}건`)
  }

  console.log('\n=== 시드 완료 ===')
}

seed().catch(console.error)
