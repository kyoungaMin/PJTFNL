import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/** 유효한 action 상태값 */
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'dismissed'] as const
type ActionStatus = typeof VALID_STATUSES[number]

type ActionRow = {
  id: number
  eval_date: string
  risk_type: string
  severity: string
  action_type: string
  description: string
  suggested_qty: number | null
  status: string
  created_at: string
}

/** severity → 한글 */
const SEVERITY_LABEL: Record<string, string> = {
  critical: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
}

/** risk_type → 한글 */
const RISK_TYPE_LABEL: Record<string, string> = {
  stockout: '결품',
  excess: '과잉',
  delivery: '납기',
  margin: '마진',
}

// ─── GET: SKU별 조치 큐 조회 ───────────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('sku') ?? ''
  // 기본값: 미처리(pending) + 처리중(in_progress)
  const statusParam = searchParams.get('status') ?? 'pending,in_progress'

  if (!supabase) {
    return NextResponse.json({ items: [], source: 'no_client' }, { status: 200 })
  }
  if (!productId) {
    return NextResponse.json({ items: [], source: 'no_sku' }, { status: 200 })
  }

  const statuses = statusParam
    .split(',')
    .map(s => s.trim())
    .filter((s): s is ActionStatus => (VALID_STATUSES as readonly string[]).includes(s))
  const validStatuses = statuses.length > 0 ? statuses : ['pending', 'in_progress']

  try {
    const { data, error } = await supabase
      .from('action_queue')
      .select(
        'id, eval_date, risk_type, severity, action_type, description, ' +
        'suggested_qty, status, created_at'
      )
      .eq('product_id', productId)
      .in('status', validStatuses)
      .order('eval_date', { ascending: false })
      .limit(10)

    if (error) throw error

    const rows = (data ?? []) as unknown as ActionRow[]

    return NextResponse.json({
      items: rows.map(a => ({
        id: a.id,
        evalDate: a.eval_date,
        riskType: a.risk_type,
        riskTypeLabel: RISK_TYPE_LABEL[a.risk_type] ?? a.risk_type,
        severity: a.severity,
        severityLabel: SEVERITY_LABEL[a.severity] ?? a.severity,
        actionType: a.action_type,
        description: a.description,
        suggestedQty: a.suggested_qty != null ? Number(a.suggested_qty) : null,
        status: a.status,
        createdAt: a.created_at,
      })),
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] actions GET error:', err)
    return NextResponse.json(
      { items: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}

// ─── PATCH: 조치 상태 업데이트 ────────────────────────────────────────────────
export async function PATCH(request: Request) {
  if (!supabase) {
    return NextResponse.json({ ok: false, error: 'no_client' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { id, status } = body as { id: number; status: string }

    if (!id || !status) {
      return NextResponse.json(
        { ok: false, error: 'id와 status는 필수입니다.' },
        { status: 400 }
      )
    }

    if (!(VALID_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { ok: false, error: `유효하지 않은 status: ${status}` },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    // 완료 처리 시 resolved_at 기록
    if (status === 'completed') {
      updateData.resolved_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('action_queue')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true, id, status })
  } catch (err: any) {
    console.error('[API] actions PATCH error:', err)
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    )
  }
}
