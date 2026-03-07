/**
 * 2월 실데이터 기반 구매 권고 데모 시드
 * 기준일: 2026-02-24, 2026-02-25, 2026-02-26
 * purchase_recommendation 테이블에 삽입
 *
 * 실행: npx tsx scripts/seed-purchase-recommendation.ts
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/* ─── 구매 권고 대상 부품 (실데이터 기반) ─── */
const COMPONENTS = [
  {
    component_product_id: '00001-B010001',
    parent_product_ids: 'SL-301S, 5080W',
    base_gross: 8500, base_inv: 1200, base_pending: 500,
    safety_stock: 2000, reorder_point: 3500,
    order_method: 'eoq',
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 14, unit_price: 27836,
    alt_supplier: '02355', alt_supplier_name: '(주)대한화성',
    urgency: 'critical',
    description: 'BOM 소요량 대비 재고 부족 — 즉시 발주 필요',
  },
  {
    component_product_id: '00001-B010005',
    parent_product_ids: 'INS-1271, KI-100',
    base_gross: 5200, base_inv: -300, base_pending: 0,
    safety_stock: 1500, reorder_point: 2800,
    order_method: 'lot_for_lot',
    supplier: '02355', supplier_name: '(주)대한화성', lead_days: 18, unit_price: 15400,
    alt_supplier: '01016', alt_supplier_name: '(주)그로피아',
    urgency: 'critical',
    description: '재고 마이너스 — 긴급 발주 필수',
  },
  {
    component_product_id: '00001-B020003',
    parent_product_ids: '5080W, ASMM-65',
    base_gross: 4100, base_inv: 1800, base_pending: 200,
    safety_stock: 1000, reorder_point: 1800,
    order_method: 'eoq',
    supplier: '01789', supplier_name: '삼화화학(주)', lead_days: 12, unit_price: 8500,
    alt_supplier: '02066', alt_supplier_name: '(주)한국화학',
    urgency: 'high',
    description: '안전재고 접근 중 — 리드타임 고려 선제 발주',
  },
  {
    component_product_id: '00001-B020010',
    parent_product_ids: 'SL-301S, INS-1271',
    base_gross: 3600, base_inv: 900, base_pending: 400,
    safety_stock: 800, reorder_point: 1500,
    order_method: 'eoq',
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 10, unit_price: 12400,
    alt_supplier: '03308', alt_supplier_name: '(주)케미솔',
    urgency: 'high',
    description: '순소요 발생 — EOQ 기준 발주',
  },
  {
    component_product_id: '01016-D010128',
    parent_product_ids: '노즐 2.3-3.2',
    base_gross: 3000, base_inv: 10, base_pending: 0,
    safety_stock: 800, reorder_point: 1500,
    order_method: 'eoq',
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 15, unit_price: 3200,
    alt_supplier: '02066', alt_supplier_name: '(주)한국화학',
    urgency: 'high',
    description: '재고 거의 소진 — 긴급 보충 필요',
  },
  {
    component_product_id: '00001-B030015',
    parent_product_ids: 'KI-100, 5080W, SL-301S',
    base_gross: 6200, base_inv: 3500, base_pending: 1000,
    safety_stock: 1200, reorder_point: 2400,
    order_method: 'eoq',
    supplier: '02066', supplier_name: '(주)한국화학', lead_days: 8, unit_price: 4200,
    alt_supplier: '01789', alt_supplier_name: '삼화화학(주)',
    urgency: 'medium',
    description: '재고 충분하나 ROP 접근 — 선제 보충',
  },
  {
    component_product_id: '00001-B030022',
    parent_product_ids: 'ASMM-65, INS-1271',
    base_gross: 2800, base_inv: 2100, base_pending: 300,
    safety_stock: 600, reorder_point: 1100,
    order_method: 'lot_for_lot',
    supplier: '03308', supplier_name: '(주)케미솔', lead_days: 7, unit_price: 6800,
    alt_supplier: '02355', alt_supplier_name: '(주)대한화성',
    urgency: 'medium',
    description: '소량 순소요 — Lot-for-Lot 발주',
  },
  {
    component_product_id: '00001-B020018',
    parent_product_ids: '노즐 3.5-4.7',
    base_gross: 1800, base_inv: 600, base_pending: 800,
    safety_stock: 350, reorder_point: 700,
    order_method: 'lot_for_lot',
    supplier: '02066', supplier_name: '(주)한국화학', lead_days: 9, unit_price: 11200,
    alt_supplier: '01789', alt_supplier_name: '삼화화학(주)',
    urgency: 'medium',
    description: '미입고 PO 감안 시 소량 추가 발주',
  },
  {
    component_product_id: '00001-B040001',
    parent_product_ids: 'SL-301S, 5080W, KI-100',
    base_gross: 1500, base_inv: 2800, base_pending: 0,
    safety_stock: 400, reorder_point: 700,
    order_method: 'fixed_period',
    supplier: '02355', supplier_name: '(주)대한화성', lead_days: 5, unit_price: 9500,
    alt_supplier: '03308', alt_supplier_name: '(주)케미솔',
    urgency: 'low',
    description: '순소요 없으나 정기 보충 시기 도래',
  },
  {
    component_product_id: '00001-B040008',
    parent_product_ids: '전 제품',
    base_gross: 800, base_inv: 5200, base_pending: 200,
    safety_stock: 300, reorder_point: 500,
    order_method: 'eoq',
    supplier: '01789', supplier_name: '삼화화학(주)', lead_days: 3, unit_price: 2100,
    alt_supplier: '02066', alt_supplier_name: '(주)한국화학',
    urgency: 'low',
    description: '재고 충분 — 발주 불필요',
  },
  {
    component_product_id: '00001-B050010',
    parent_product_ids: '5080W, SL-301S',
    base_gross: 4500, base_inv: 800, base_pending: 300,
    safety_stock: 1100, reorder_point: 2200,
    order_method: 'eoq',
    supplier: '01016', supplier_name: '(주)그로피아', lead_days: 16, unit_price: 5600,
    alt_supplier: '02355', alt_supplier_name: '(주)대한화성',
    urgency: 'critical',
    description: '생산계획 대비 재고 부족 — 대량 발주 필요',
  },
  {
    component_product_id: '00001-B030040',
    parent_product_ids: 'KI-100',
    base_gross: 2200, base_inv: 1500, base_pending: 100,
    safety_stock: 500, reorder_point: 1000,
    order_method: 'eoq',
    supplier: '02066', supplier_name: '(주)한국화학', lead_days: 6, unit_price: 3800,
    alt_supplier: '03308', alt_supplier_name: '(주)케미솔',
    urgency: 'medium',
    description: '안전재고 근접 — 보충 권고',
  },
]

/* ─── 날짜별 시나리오 ─── */
interface DateScenario {
  plan_date: string
  invMultiplier: number
  demandMultiplier: number
  statusPattern: string[]
  dateOffsetLatestOrder: number  // plan_date 기준 발주마감 오프셋
}

const SCENARIOS: DateScenario[] = [
  {
    plan_date: '2026-02-24',
    invMultiplier: 1.3,
    demandMultiplier: 0.9,
    statusPattern: ['ordered','received','ordered','approved','ordered','received','ordered','approved','received','received','ordered','approved'],
    dateOffsetLatestOrder: 0,
  },
  {
    plan_date: '2026-02-25',
    invMultiplier: 1.1,
    demandMultiplier: 0.95,
    statusPattern: ['approved','approved','pending','approved','pending','ordered','approved','pending','approved','received','approved','pending'],
    dateOffsetLatestOrder: 1,
  },
  {
    plan_date: '2026-02-26',
    invMultiplier: 1.0,
    demandMultiplier: 1.0,
    statusPattern: ['pending','pending','pending','pending','pending','pending','pending','pending','approved','pending','pending','pending'],
    dateOffsetLatestOrder: 2,
  },
]

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function buildRecords() {
  const records: any[] = []

  for (const sc of SCENARIOS) {
    for (let i = 0; i < COMPONENTS.length; i++) {
      const c = COMPONENTS[i]
      const inv = Math.round(c.base_inv * sc.invMultiplier)
      const gross = Math.round(c.base_gross * sc.demandMultiplier)
      const pending = c.base_pending
      const net = Math.max(0, gross - inv - pending)
      const recQty = net > 0 ? Math.max(Math.round(net * 1.1), Math.round(c.safety_stock * 0.5))
        : (inv + pending < c.reorder_point ? Math.round(c.safety_stock * 0.8) : 0)

      const latestOrderDate = addDays(sc.plan_date, sc.dateOffsetLatestOrder + (c.urgency === 'critical' ? 0 : c.urgency === 'high' ? 2 : 5))
      const expectedReceiptDate = addDays(latestOrderDate, c.lead_days)
      const needDate = addDays(sc.plan_date, 7 + Math.round(c.lead_days * 0.3))

      // 과거일수록 urgency 완화
      let urgency = c.urgency
      if (sc.invMultiplier >= 1.3 && urgency === 'critical') urgency = 'high'

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

async function seed() {
  console.log('=== 구매 권고 데모 데이터 시드 시작 ===\n')

  const records = buildRecords()
  const dates = SCENARIOS.map(s => s.plan_date)
  console.log(`기준일: ${dates.join(', ')}`)
  console.log(`총 ${records.length}건 (${COMPONENTS.length} 부품 × ${SCENARIOS.length} 날짜)\n`)

  // 기존 데이터 삭제
  const { error: delErr } = await supabase
    .from('purchase_recommendation')
    .delete()
    .in('plan_date', dates)

  if (delErr) console.warn('삭제 경고:', delErr.message)

  // 삽입
  const { data, error } = await supabase
    .from('purchase_recommendation')
    .insert(records)
    .select('id, component_product_id, plan_date, urgency, status, recommended_qty')

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
    const urgCounts: Record<string, number> = {}
    for (const item of items) {
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1
      urgCounts[item.urgency] = (urgCounts[item.urgency] ?? 0) + 1
    }
    console.log(`${date}: ${items.length}건`)
    console.log(`  상태: ${Object.entries(statusCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
    console.log(`  긴급도: ${Object.entries(urgCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`)
  }

  console.log('\n=== 시드 완료 ===')
}

seed().catch(console.error)
