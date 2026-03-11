import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/* ─── 배치 .in() 헬퍼 ─── */
const IN_BATCH = 400
async function batchIn(table: string, select: string, col: string, ids: string[], extra?: (q: any) => any): Promise<any[]> {
  const all: any[] = []
  for (let i = 0; i < ids.length; i += IN_BATCH) {
    let q = supabase.from(table).select(select).in(col, ids.slice(i, i + IN_BATCH))
    if (extra) q = extra(q)
    const { data, error } = await q
    if (error) throw error
    if (data) all.push(...data)
  }
  return all
}

/* ─── 주요 리스크 유형 결정 ─── */
function dominantType(row: any): string {
  const candidates = [
    { type: '결품', val: Number(row.stockout_risk ?? 0) },
    { type: '과잉', val: Number(row.excess_risk    ?? 0) },
    { type: '납기', val: Number(row.delivery_risk  ?? 0) },
    { type: '마진', val: Number(row.margin_risk    ?? 0) },
  ]
  candidates.sort((a, b) => b.val - a.val)
  return candidates[0].val > 0 ? candidates[0].type : '결품'
}

/* ─── action_type → 한글 권고 액션 ─── */
const ACTION_TYPE_LABEL: Record<string, string> = {
  expedite_po:          '즉시 발주 권고',
  increase_production:  '생산 증량 권고',
  reduce_order:         '생산 감량 권고',
  adjust_price:         '단가 재협의',
}

/* ─── 리스크 유형 + 등급 기반 기본 액션 ─── */
function defaultAction(type: string, grade: string): string {
  if (type === '결품') return ['E', 'F'].includes(grade) ? '즉시 발주 권고' : '안전재고 상향'
  if (type === '과잉') return '생산 감량 권고'
  if (type === '납기') return ['E', 'F'].includes(grade) ? '생산 우선순위 상향' : '납기 재조정'
  if (type === '마진') return '단가 재협의'
  return '검토 필요'
}

/* ─── action_queue.status → 한글 ─── */
const STATUS_LABEL: Record<string, string> = {
  pending:     '미처리',
  in_progress: '검토중',
  completed:   '완료',
  dismissed:   '기각',
}

/* ═══════════════════════════════════════════════════════════════════
   GET /api/risk
   risk_score 최신 eval_date 기준으로 리스크 현황 목록을 반환합니다.
═══════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const typeParam = searchParams.get('type') // 제품, 반제품, 부재료 등

    let evalDate = dateParam
    
    // 1. eval_date 조회 (dateParam이 없을 때만 최신 조회)
    if (!evalDate) {
      const { data: snapRows, error: snapErr } = await supabase
        .from('risk_score')
        .select('eval_date')
        .order('eval_date', { ascending: false })
        .limit(1)
      if (snapErr) throw snapErr
      evalDate = snapRows?.[0]?.eval_date as string | undefined
    }

    if (!evalDate) {
      return NextResponse.json({ items: [], evalDate: null, source: 'empty' })
    }

    // [NEW] type 필터링이 필요한 경우 product_master와 JOIN이 불가능하므로, 
    // product_master에서 먼저 대상 product_code를 필터링
    let validProductIds: string[] | null = null
    if (typeParam && typeParam !== '전체') {
      const { data: typeRows, error: typeErr } = await supabase
        .from('product_master')
        .select('product_code')
        .eq('product_type', typeParam)
      if (typeErr) throw typeErr
      validProductIds = typeRows.map((r: any) => r.product_code)
      if (validProductIds.length === 0) {
         return NextResponse.json({ items: [], evalDate, source: 'empty' })
      }
    }

    let risks: any[] = []

    if (validProductIds) {
      // product_id 목록이 너무 많으면 URL 길이 제한(fetch error)이 발생하므로 batchIn으로 안전하게 분할 조회합니다.
      risks = await batchIn('risk_score',
        'product_id,total_risk,risk_grade,stockout_risk,excess_risk,delivery_risk,margin_risk,safety_stock,inventory_days',
        'product_id',
        validProductIds,
        (q) => q.eq('eval_date', evalDate).order('total_risk', { ascending: false }).limit(200)
      )
      
      // Batch 단위로 조회된 결과에서 다시 상위 200개를 추려냅니다.
      risks.sort((a, b) => b.total_risk - a.total_risk)
      risks = risks.slice(0, 200)
      
    } else {
      // 카테고리 필터가 없는 경우 단순 조회
      const { data, error: bErr } = await supabase
        .from('risk_score')
        .select('product_id,total_risk,risk_grade,stockout_risk,excess_risk,delivery_risk,margin_risk,safety_stock,inventory_days')
        .eq('eval_date', evalDate)
        .order('total_risk', { ascending: false })
        .limit(200)

      if (bErr) throw bErr
      if (data) risks = data
    }

    if (!risks || risks.length === 0) {
      return NextResponse.json({ items: [], evalDate, source: 'empty' })
    }

    const productIds = risks.map(r => r.product_id)
    const now = new Date()

    // 3. 병렬 조회
    const fourWeeksAgo = new Date(now)
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

    const [products, latestInvSnap, leadTimes, actionRows, custRows] = await Promise.all([
      // product_master: name, category
      batchIn('product_master', 'product_code,product_name,product_category', 'product_code', productIds),

      // inventory: 최신 snapshot_date 1건
      supabase.from('inventory').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1),

      // product_lead_time: 최신 avg_lead_days
      batchIn('product_lead_time', 'product_id,avg_lead_days,calc_date', 'product_id', productIds),

      // action_queue: 최신 액션 (per product)
      batchIn('action_queue', 'product_id,action_type,description,status,created_at', 'product_id', productIds,
        q => q.order('created_at', { ascending: false })),

      // weekly_customer_summary: 최근 4주 주요 고객사
      batchIn('weekly_customer_summary', 'product_id,customer_id,order_qty', 'product_id', productIds,
        q => q.gte('week_start', fourWeeksAgo.toISOString().slice(0, 10))),
    ])

    // 4. 최신 inventory snapshot 기준 재고 조회
    const latestSnap = latestInvSnap.data?.[0]?.snapshot_date as string | undefined
    let invMap: Record<string, number> = {}
    if (latestSnap) {
      const invRows = await batchIn('inventory', 'product_id,inventory_qty', 'product_id', productIds,
        q => q.eq('snapshot_date', latestSnap))
      for (const r of invRows) {
        invMap[r.product_id] = (invMap[r.product_id] ?? 0) + Number(r.inventory_qty ?? 0)
      }
    }

    // 5. 맵 구축
    const productMap: Record<string, any> = {}
    for (const p of (products ?? [])) productMap[p.product_code] = p

    const ltMap: Record<string, any> = {}
    for (const lt of (leadTimes ?? [])) {
      if (!ltMap[lt.product_id] || (lt.calc_date ?? '') > (ltMap[lt.product_id].calc_date ?? '')) {
        ltMap[lt.product_id] = lt
      }
    }

    // action_queue: product_id별 최신 1건
    const actionMap: Record<string, any> = {}
    for (const a of (actionRows ?? [])) {
      if (!actionMap[a.product_id]) actionMap[a.product_id] = a
    }

    // 고객사 집계: product_id → 가장 많이 주문한 customer_id
    const custAccum: Record<string, Record<string, number>> = {}
    for (const r of (custRows ?? [])) {
      if (!custAccum[r.product_id]) custAccum[r.product_id] = {}
      custAccum[r.product_id][r.customer_id] =
        (custAccum[r.product_id][r.customer_id] ?? 0) + Number(r.order_qty ?? 0)
    }
    const custMap: Record<string, string> = {}
    for (const [pid, cmap] of Object.entries(custAccum)) {
      const top = Object.entries(cmap).sort(([, a], [, b]) => b - a)[0]
      if (top) custMap[pid] = top[0]
    }

    // 6. 아이템 조합
    const items = risks.map((r, idx) => {
      const prod = productMap[r.product_id] ?? {}
      const lt   = ltMap[r.product_id] ?? {}
      const aq   = actionMap[r.product_id]
      const rType = dominantType(r)
      const grade = r.risk_grade ?? '-'

      return {
        id:        idx + 1,
        sku:       r.product_id,
        name:      prod.product_name ?? r.product_id,
        score:     Math.round(Number(r.total_risk ?? 0)),
        grade,
        type:      rType,
        action:    aq ? (ACTION_TYPE_LABEL[aq.action_type] ?? aq.description ?? defaultAction(rType, grade)) : defaultAction(rType, grade),
        status:    aq ? (STATUS_LABEL[aq.status] ?? aq.status ?? '미처리') : '미처리',
        stock:     Math.round(invMap[r.product_id] ?? 0),
        safeStock: Math.round(Number(r.safety_stock ?? 0)),
        leadTime:  Math.round(Number(lt.avg_lead_days ?? 0)),
        customer:  custMap[r.product_id] ?? '-',
      }
    })

    return NextResponse.json({ items, evalDate, source: 'database' })
  } catch (err: any) {
    console.error('[API] risk error:', err)
    return NextResponse.json({ items: [], source: 'error', error: err.message }, { status: 500 })
  }
}
