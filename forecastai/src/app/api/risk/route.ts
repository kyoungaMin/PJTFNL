import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FETCH_PAGE = 1000
const PAGE_SIZE = 200

async function fetchAll(
  table: string,
  select: string,
  filter?: (q: any) => any,
): Promise<any[]> {
  const all: any[] = []
  for (let offset = 0; ; offset += FETCH_PAGE) {
    let q = supabase.from(table).select(select).range(offset, offset + FETCH_PAGE - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < FETCH_PAGE) break
  }
  return all
}

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
   쿼리 파라미터:
     date      - 기준일 (없으면 최신 eval_date 자동 탐색)
     type      - 제품 유형 필터 (제품, 반제품, 부재료 등)
     page      - 페이지 번호 (기본 1, PAGE_SIZE=200)
═══════════════════════════════════════════════════════════════════ */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const typeParam = searchParams.get('type')
    const gradeParam = searchParams.get('grade')
    const evalType  = searchParams.get('eval_type') || 'monthly' // 주간/월간 구분
    const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const offset    = (page - 1) * PAGE_SIZE

    // ── 1. eval_date 결정 ──────────────────────────────────────────────────
    let evalDate: string | undefined = dateParam ?? undefined

    if (!evalDate) {
      const { data: snapRows, error: snapErr } = await supabase
        .from('risk_score')
        .select('eval_date')
        .eq('eval_type', evalType)
        .order('eval_date', { ascending: false })
        .limit(1)
      if (snapErr) throw snapErr
      evalDate = snapRows?.[0]?.eval_date as string | undefined
    }

    if (!evalDate) {
      return NextResponse.json({ items: [], evalDate: null, gradeSummary: {}, totalCount: 0, hasMore: false, source: 'empty' })
    }

    // ── 2. 제품유형 필터: product_master에서 대상 product_code 목록 선추출 ─
    let validProductIds: string[] | null = null
    if (typeParam && typeParam !== '전체') {
      const typeRows = await fetchAll(
        'product_master',
        'product_code',
        (q) => q.eq('product_type', typeParam),
      )
      validProductIds = typeRows.map((r: any) => r.product_code)
      if (validProductIds.length === 0) {
        return NextResponse.json({ items: [], evalDate, gradeSummary: {}, totalCount: 0, hasMore: false, source: 'empty' })
      }
    }

    // ── 3. 등급별 건수 집계 (전체 데이터 기준) ────────────────────────────
    const GRADES = ['A', 'B', 'C', 'D', 'E', 'F']
    let gradeSummary: Record<string, number> = {}
    let totalCount = 0

    if (validProductIds) {
      const gradeRows = await batchIn(
        'risk_score', 'risk_grade', 'product_id', validProductIds,
        (q) => q.eq('eval_date', evalDate).eq('eval_type', evalType)
      )
      for (const r of gradeRows) {
        const g = String(r.risk_grade ?? '')
        if (g) gradeSummary[g] = (gradeSummary[g] ?? 0) + 1
      }
      totalCount = gradeParam ? (gradeSummary[gradeParam] ?? 0) : gradeRows.length
    } else {
      const countResults = await Promise.all(
        GRADES.map(g =>
          supabase
            .from('risk_score')
            .select('*', { count: 'exact', head: true })
            .eq('eval_date', evalDate!)
            .eq('eval_type', evalType)
            .eq('risk_grade', g)
        )
      )
      for (let i = 0; i < GRADES.length; i++) {
        const cnt = countResults[i].count ?? 0
        gradeSummary[GRADES[i]] = cnt
        totalCount += cnt
      }
      if (gradeParam) totalCount = gradeSummary[gradeParam] ?? 0
    }

    // ── 4. risk_score 목록 조회 (페이지네이션) ──────────────────────────────
    const RISK_SELECT = 'product_id,eval_date,total_risk,risk_grade,stockout_risk,excess_risk,delivery_risk,margin_risk,safety_stock,inventory_days'

    let risks: any[] = []

    if (validProductIds) {
      const allRisks = await batchIn(
        'risk_score', RISK_SELECT, 'product_id', validProductIds,
        (q) => {
          let qq = q.eq('eval_date', evalDate).eq('eval_type', evalType)
          if (gradeParam) qq = qq.eq('risk_grade', gradeParam)
          return qq.order('total_risk', { ascending: false })
        }
      )
      allRisks.sort((a, b) => b.total_risk - a.total_risk)
      risks = allRisks.slice(offset, offset + PAGE_SIZE)
    } else {
      let riskQuery = supabase
        .from('risk_score')
        .select(RISK_SELECT)
        .eq('eval_date', evalDate)
        .eq('eval_type', evalType)
        .order('total_risk', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
      if (gradeParam) riskQuery = riskQuery.eq('risk_grade', gradeParam)

      const { data, error: rErr } = await riskQuery
      if (rErr) throw rErr
      if (data) risks = data
    }

    const hasMore = offset + risks.length < totalCount

    if (risks.length === 0) {
      return NextResponse.json({ items: [], evalDate, gradeSummary, totalCount, hasMore: false, source: page === 1 ? 'empty' : 'database' })
    }

    const productIds = risks.map(r => r.product_id)
    const now = new Date()
    const fourWeeksAgo = new Date(now)
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

    // ── 5. 병렬 보조 데이터 조회 ──────────────────────────────────────────
    const [products, latestInvSnap, leadTimes, actionRows, custRows] = await Promise.all([
      batchIn('product_master', 'product_code,product_name,product_category', 'product_code', productIds),
      supabase.from('inventory').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1),
      batchIn('product_lead_time', 'product_id,avg_lead_days,calc_date', 'product_id', productIds),
      batchIn('action_queue', 'product_id,action_type,description,status,created_at', 'product_id', productIds,
        q => q.order('created_at', { ascending: false })),
      batchIn('weekly_customer_summary', 'product_id,customer_id,order_qty', 'product_id', productIds,
        q => q.gte('week_start', fourWeeksAgo.toISOString().slice(0, 10))),
    ])

    // ── 6. 최신 재고 스냅샷 조회 ──────────────────────────────────────────
    const latestSnap = latestInvSnap.data?.[0]?.snapshot_date as string | undefined
    let invMap: Record<string, number> = {}
    if (latestSnap) {
      const invRows = await batchIn('inventory', 'product_id,inventory_qty', 'product_id', productIds,
        q => q.eq('snapshot_date', latestSnap))
      for (const r of invRows) {
        invMap[r.product_id] = (invMap[r.product_id] ?? 0) + Number(r.inventory_qty ?? 0)
      }
    }

    // ── 7. 맵 구축 ────────────────────────────────────────────────────────
    const productMap: Record<string, any> = {}
    for (const p of (products ?? [])) productMap[p.product_code] = p

    const ltMap: Record<string, any> = {}
    for (const lt of (leadTimes ?? [])) {
      if (!ltMap[lt.product_id] || (lt.calc_date ?? '') > (ltMap[lt.product_id].calc_date ?? '')) {
        ltMap[lt.product_id] = lt
      }
    }

    const actionMap: Record<string, any> = {}
    for (const a of (actionRows ?? [])) {
      if (!actionMap[a.product_id]) actionMap[a.product_id] = a
    }

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

    // ── 8. 아이템 조합 ────────────────────────────────────────────────────
    const items = risks.map((r, idx) => {
      const prod  = productMap[r.product_id] ?? {}
      const lt    = ltMap[r.product_id] ?? {}
      const aq    = actionMap[r.product_id]
      const rType = dominantType(r)
      const grade = r.risk_grade ?? '-'

      return {
        id:        offset + idx + 1,
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

    return NextResponse.json({ items, evalDate, gradeSummary, totalCount, hasMore, source: 'database' })
  } catch (err: any) {
    console.error('[API] risk error:', err)
    return NextResponse.json({ items: [], gradeSummary: {}, totalCount: 0, hasMore: false, source: 'error', error: err.message }, { status: 500 })
  }
}
