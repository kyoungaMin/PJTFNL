/**
 * 2026년 1~2월 주차별 구매 권고 시드 스크립트
 * 생산계획(seed-jan-feb-production-plan.ts)과 동일 8주 기준
 *   1월: W02(01-05), W03(01-12), W04(01-19), W05(01-26)
 *   2월: W06(02-02), W07(02-09), W08(02-16), W09(02-23)
 *
 * DB의 BOM, 재고, 구매발주, 거래처 실데이터 기반으로 구매권고 생성
 *
 * 실행: npx tsx scripts/seed-jan-feb-purchase-recommendation.ts
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

/* ─── 구매 권고 대상 부품 12종 (실데이터 기반) ─── */
const COMPONENTS = [
  {
    component_product_id: '00001-B010001',
    parent_product_ids: 'SL-301S, 5080W',
    base_gross: 8500, base_inv: 1200, base_pending: 500,
    safety_stock: 2000, reorder_point: 3500,
    order_method: 'eoq' as const,
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 14, unit_price: 27836,
    alt_supplier: '02355', alt_supplier_name: '(주)대한화성',
    urgency: 'critical' as const,
    description: 'BOM 소요량 대비 재고 부족 — 즉시 발주 필요',
  },
  {
    component_product_id: '00001-B010005',
    parent_product_ids: 'INS-1271, KI-100',
    base_gross: 5200, base_inv: -300, base_pending: 0,
    safety_stock: 1500, reorder_point: 2800,
    order_method: 'lot_for_lot' as const,
    supplier: '02355', supplier_name: '(주)대한화성', lead_days: 18, unit_price: 15400,
    alt_supplier: '01016', alt_supplier_name: '(주)그로피아',
    urgency: 'critical' as const,
    description: '재고 마이너스 — 긴급 발주 필수',
  },
  {
    component_product_id: '00001-B020003',
    parent_product_ids: '5080W, ASMM-65',
    base_gross: 4100, base_inv: 1800, base_pending: 200,
    safety_stock: 1000, reorder_point: 1800,
    order_method: 'eoq' as const,
    supplier: '01789', supplier_name: '삼화화학(주)', lead_days: 12, unit_price: 8500,
    alt_supplier: '02066', alt_supplier_name: '(주)한국화학',
    urgency: 'high' as const,
    description: '안전재고 접근 중 — 리드타임 고려 선제 발주',
  },
  {
    component_product_id: '00001-B020010',
    parent_product_ids: 'SL-301S, INS-1271',
    base_gross: 3600, base_inv: 900, base_pending: 400,
    safety_stock: 800, reorder_point: 1500,
    order_method: 'eoq' as const,
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 10, unit_price: 12400,
    alt_supplier: '03308', alt_supplier_name: '(주)케미솔',
    urgency: 'high' as const,
    description: '순소요 발생 — EOQ 기준 발주',
  },
  {
    component_product_id: '01016-D010128',
    parent_product_ids: '노즐 2.3-3.2',
    base_gross: 3000, base_inv: 10, base_pending: 0,
    safety_stock: 800, reorder_point: 1500,
    order_method: 'eoq' as const,
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 15, unit_price: 3200,
    alt_supplier: '02066', alt_supplier_name: '(주)한국화학',
    urgency: 'high' as const,
    description: '재고 거의 소진 — 긴급 보충 필요',
  },
  {
    component_product_id: '00001-B030015',
    parent_product_ids: 'KI-100, 5080W, SL-301S',
    base_gross: 6200, base_inv: 3500, base_pending: 1000,
    safety_stock: 1200, reorder_point: 2400,
    order_method: 'eoq' as const,
    supplier: '02066', supplier_name: '(주)한국화학', lead_days: 8, unit_price: 4200,
    alt_supplier: '01789', alt_supplier_name: '삼화화학(주)',
    urgency: 'medium' as const,
    description: '재고 충분하나 ROP 접근 — 선제 보충',
  },
  {
    component_product_id: '00001-B030022',
    parent_product_ids: 'ASMM-65, INS-1271',
    base_gross: 2800, base_inv: 2100, base_pending: 300,
    safety_stock: 600, reorder_point: 1100,
    order_method: 'lot_for_lot' as const,
    supplier: '03308', supplier_name: '(주)케미솔', lead_days: 7, unit_price: 6800,
    alt_supplier: '02355', alt_supplier_name: '(주)대한화성',
    urgency: 'medium' as const,
    description: '소량 순소요 — Lot-for-Lot 발주',
  },
  {
    component_product_id: '00001-B020018',
    parent_product_ids: '노즐 3.5-4.7',
    base_gross: 1800, base_inv: 600, base_pending: 800,
    safety_stock: 350, reorder_point: 700,
    order_method: 'lot_for_lot' as const,
    supplier: '02066', supplier_name: '(주)한국화학', lead_days: 9, unit_price: 11200,
    alt_supplier: '01789', alt_supplier_name: '삼화화학(주)',
    urgency: 'medium' as const,
    description: '미입고 PO 감안 시 소량 추가 발주',
  },
  {
    component_product_id: '00001-B040001',
    parent_product_ids: 'SL-301S, 5080W, KI-100',
    base_gross: 1500, base_inv: 2800, base_pending: 0,
    safety_stock: 400, reorder_point: 700,
    order_method: 'fixed_period' as const,
    supplier: '02355', supplier_name: '(주)대한화성', lead_days: 5, unit_price: 9500,
    alt_supplier: '03308', alt_supplier_name: '(주)케미솔',
    urgency: 'low' as const,
    description: '순소요 없으나 정기 보충 시기 도래',
  },
  {
    component_product_id: '00001-B040008',
    parent_product_ids: '전 제품',
    base_gross: 800, base_inv: 5200, base_pending: 200,
    safety_stock: 300, reorder_point: 500,
    order_method: 'eoq' as const,
    supplier: '01789', supplier_name: '삼화화학(주)', lead_days: 3, unit_price: 2100,
    alt_supplier: '02066', alt_supplier_name: '(주)한국화학',
    urgency: 'low' as const,
    description: '재고 충분 — 발주 불필요',
  },
  {
    component_product_id: '00001-B050010',
    parent_product_ids: '5080W, SL-301S',
    base_gross: 4500, base_inv: 800, base_pending: 300,
    safety_stock: 1100, reorder_point: 2200,
    order_method: 'eoq' as const,
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 16, unit_price: 5600,
    alt_supplier: '02355', alt_supplier_name: '(주)대한화성',
    urgency: 'critical' as const,
    description: '생산계획 대비 재고 부족 — 대량 발주 필요',
  },
  {
    component_product_id: '00001-B030040',
    parent_product_ids: 'KI-100',
    base_gross: 2200, base_inv: 1500, base_pending: 100,
    safety_stock: 500, reorder_point: 1000,
    order_method: 'eoq' as const,
    supplier: '02066', supplier_name: '(주)한국화학', lead_days: 6, unit_price: 3800,
    alt_supplier: '03308', alt_supplier_name: '(주)케미솔',
    urgency: 'medium' as const,
    description: '안전재고 근접 — 보충 권고',
  },
]

/* ─── 8주 시나리오 (생산계획과 동일 plan_date) ─── */
interface WeekScenario {
  plan_date: string
  invMultiplier: number      // 과거일수록 재고 여유 ↑
  demandMultiplier: number   // 과거일수록 수요 낮음
  pendingMultiplier: number  // 과거일수록 미입고 PO 많음
  statusPattern: string[]    // 12개 부품별 상태
  dateOffsetLatestOrder: number
}

const SCENARIOS: WeekScenario[] = [
  // ── 1월 (과거 → 대부분 처리 완료) ──
  {
    plan_date: '2026-01-05',
    invMultiplier: 2.2, demandMultiplier: 0.80, pendingMultiplier: 1.8,
    statusPattern: ['received','received','received','received','ordered','received','received','ordered','received','received','received','received'],
    dateOffsetLatestOrder: 0,
  },
  {
    plan_date: '2026-01-12',
    invMultiplier: 2.0, demandMultiplier: 0.83, pendingMultiplier: 1.6,
    statusPattern: ['received','received','ordered','received','received','ordered','received','received','received','received','ordered','received'],
    dateOffsetLatestOrder: 0,
  },
  {
    plan_date: '2026-01-19',
    invMultiplier: 1.8, demandMultiplier: 0.87, pendingMultiplier: 1.4,
    statusPattern: ['ordered','received','ordered','ordered','received','received','ordered','received','received','received','ordered','received'],
    dateOffsetLatestOrder: 1,
  },
  {
    plan_date: '2026-01-26',
    invMultiplier: 1.6, demandMultiplier: 0.90, pendingMultiplier: 1.2,
    statusPattern: ['ordered','ordered','received','ordered','ordered','received','ordered','received','received','received','ordered','ordered'],
    dateOffsetLatestOrder: 1,
  },
  // ── 2월 (최근 → 아직 진행 중) ──
  {
    plan_date: '2026-02-02',
    invMultiplier: 1.4, demandMultiplier: 0.92, pendingMultiplier: 1.1,
    statusPattern: ['ordered','approved','ordered','approved','ordered','ordered','approved','ordered','approved','received','ordered','approved'],
    dateOffsetLatestOrder: 1,
  },
  {
    plan_date: '2026-02-09',
    invMultiplier: 1.3, demandMultiplier: 0.95, pendingMultiplier: 1.0,
    statusPattern: ['approved','approved','pending','approved','pending','ordered','approved','pending','approved','received','approved','pending'],
    dateOffsetLatestOrder: 2,
  },
  {
    plan_date: '2026-02-16',
    invMultiplier: 1.1, demandMultiplier: 0.98, pendingMultiplier: 0.9,
    statusPattern: ['approved','pending','pending','approved','pending','approved','pending','pending','approved','approved','pending','pending'],
    dateOffsetLatestOrder: 2,
  },
  {
    plan_date: '2026-02-23',
    invMultiplier: 1.0, demandMultiplier: 1.0, pendingMultiplier: 0.8,
    statusPattern: ['pending','pending','pending','pending','pending','pending','pending','pending','approved','pending','pending','pending'],
    dateOffsetLatestOrder: 3,
  },
]

/* ─── helpers ─── */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 결정적 jitter (±5%): 주차×부품 조합마다 고유 변동 */
function jitter(weekIdx: number, compIdx: number): number {
  return 1 + ((compIdx * 7 + weekIdx * 13) % 11 - 5) / 100
}

/* ─── 레코드 생성 ─── */
function buildRecords() {
  const records: any[] = []

  for (let wIdx = 0; wIdx < SCENARIOS.length; wIdx++) {
    const sc = SCENARIOS[wIdx]
    const j = (ci: number) => jitter(wIdx, ci)

    for (let i = 0; i < COMPONENTS.length; i++) {
      const c = COMPONENTS[i]
      const inv = Math.round(c.base_inv * sc.invMultiplier * j(i))
      const gross = Math.round(c.base_gross * sc.demandMultiplier * j(i))
      const pending = Math.round(c.base_pending * sc.pendingMultiplier * j(i))
      const net = Math.max(0, gross - inv - pending)
      const recQty = net > 0
        ? Math.max(Math.round(net * 1.1), Math.round(c.safety_stock * 0.5))
        : (inv + pending < c.reorder_point ? Math.round(c.safety_stock * 0.8) : 0)

      // 발주량 0이면 skip (발주 불필요)
      if (recQty <= 0) continue

      const latestOrderDate = addDays(
        sc.plan_date,
        sc.dateOffsetLatestOrder + (c.urgency === 'critical' ? 0 : c.urgency === 'high' ? 2 : 5)
      )
      const expectedReceiptDate = addDays(latestOrderDate, c.lead_days)
      const needDate = addDays(sc.plan_date, 7 + Math.round(c.lead_days * 0.3))

      // 과거 재고 풍부 시 긴급도 완화
      let urgency: string = c.urgency
      if (sc.invMultiplier >= 2.0 && urgency === 'critical') urgency = 'high'
      if (sc.invMultiplier >= 1.8 && urgency === 'high' && net <= 0) urgency = 'medium'
      if (sc.invMultiplier >= 1.5 && urgency === 'medium' && net <= 0) urgency = 'low'

      records.push({
        component_product_id: c.component_product_id,
        plan_date: sc.plan_date,
        parent_product_ids: c.parent_product_ids,
        gross_requirement: gross,
        current_inventory: inv,
        pending_po_qty: pending,
        net_requirement: net,
        safety_stock: c.safety_stock,
        reorder_point: c.reorder_point,
        recommended_qty: recQty,
        order_method: c.order_method,
        recommended_supplier: c.supplier,
        supplier_name: c.supplier_name,
        supplier_lead_days: c.lead_days,
        supplier_unit_price: c.unit_price,
        alt_supplier: c.alt_supplier,
        alt_supplier_name: c.alt_supplier_name,
        latest_order_date: latestOrderDate,
        expected_receipt_date: expectedReceiptDate,
        need_date: needDate,
        urgency,
        description: c.description,
        status: sc.statusPattern[i] ?? 'pending',
      })
    }
  }

  return records
}

/* ─── 메인 실행 ─── */
async function seed() {
  console.log('=== 2026년 1~2월 구매 권고 시드 시작 ===\n')

  const records = buildRecords()
  const dates = SCENARIOS.map(s => s.plan_date)

  console.log(`대상 주차: ${dates.join(', ')}`)
  console.log(`총 ${records.length}건 생성\n`)

  // 기존 해당 날짜 데이터 삭제
  console.log('기존 데이터 삭제 중...')
  for (const date of dates) {
    const { error: delErr } = await supabase
      .from('purchase_recommendation')
      .delete()
      .eq('plan_date', date)
    if (delErr) console.warn(`  ${date} 삭제 경고:`, delErr.message)
  }

  // 주차별 배치 삽입
  let totalInserted = 0
  for (const date of dates) {
    const batch = records.filter(r => r.plan_date === date)
    if (batch.length === 0) {
      console.log(`  ${date}: 0건 (발주 불필요)`)
      continue
    }

    const { data, error } = await supabase
      .from('purchase_recommendation')
      .insert(batch)
      .select('id, component_product_id, plan_date, urgency, status, recommended_qty')

    if (error) {
      console.error(`  ${date} 삽입 실패:`, error.message)
      console.error('  상세:', error)
      continue
    }

    const statusCounts: Record<string, number> = {}
    const urgCounts: Record<string, number> = {}
    let totalQty = 0
    for (const item of (data ?? [])) {
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1
      urgCounts[item.urgency] = (urgCounts[item.urgency] ?? 0) + 1
      totalQty += item.recommended_qty
    }

    console.log(`  ${date}: ${data?.length ?? 0}건`)
    console.log(`    상태: ${Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
    console.log(`    긴급도: ${Object.entries(urgCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
    console.log(`    총 권고수량: ${totalQty.toLocaleString()}`)
    totalInserted += data?.length ?? 0
  }

  console.log(`\n✓ 총 ${totalInserted}건 삽입 완료!`)

  // 전체 purchase_recommendation 날짜 현황
  console.log('\n--- 전체 purchase_recommendation 날짜 현황 ---')
  const { data: allDates } = await supabase
    .from('purchase_recommendation')
    .select('plan_date')
    .order('plan_date', { ascending: true })
    .limit(1000)

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
