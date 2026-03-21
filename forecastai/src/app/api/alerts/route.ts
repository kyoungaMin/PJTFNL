import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export interface AlertItem {
  type: 'risk' | 'warn' | 'info'
  message: string
  time: string
  page?: string
}

// ─── 시스템 기준날짜 ────────────────────────────────────────────────────────
const SYSTEM_BASE_DATE = '2026-02-28'

export async function GET() {
  try {
    const alerts: AlertItem[] = []

    // ─── 1. action_queue critical 항목 (최대 2건) ───────────────────────────
    const { data: criticalActions } = await supabase
      .from('action_queue')
      .select('product_id, action_type, severity, eval_date')
      .eq('status', 'pending')
      .eq('severity', 'critical')
      .order('eval_date', { ascending: false })
      .limit(2)

    const ACTION_TYPE_KO: Record<string, string> = {
      increase_production: '생산 증량',
      reduce_order:        '발주 감소',
      expedite_po:         '긴급 발주',
      expedite_production: '긴급 생산',
      adjust_price:        '가격 조정',
      increase_po:         '발주 증량',
      reduce_production:   '생산 감량',
    }

    for (const row of (criticalActions ?? [])) {
      alerts.push({
        type: 'risk',
        message: `${String(row.product_id)} — ${ACTION_TYPE_KO[String(row.action_type)] ?? row.action_type} 긴급 조치 필요`,
        time: String(row.eval_date ?? '').slice(5, 10),
        page: 'action-queue',
      })
    }

    // ─── 2. risk_score E·F 등급 건수 (최신 eval_date 기준, 기본: monthly) ───
    const { data: latestEval } = await supabase
      .from('risk_score')
      .select('eval_date')
      .eq('eval_type', 'monthly')
      .order('eval_date', { ascending: false })
      .limit(1)

    if (latestEval?.[0]?.eval_date) {
      const evalDate = String(latestEval[0].eval_date)
      const { count: efCount } = await supabase
        .from('risk_score')
        .select('*', { count: 'exact', head: true })
        .eq('eval_date', evalDate)
        .in('risk_grade', ['E', 'F'])

      if ((efCount ?? 0) > 0) {
        alerts.push({
          type: 'risk',
          message: `위험 등급 E·F SKU ${efCount}건 — 이번 주 내 조치 필요`,
          time: evalDate.slice(5, 10),
          page: 'risk',
        })
      }
    }

    // ─── 3. purchase_order 미처리 건수 (R=미입고, P=처리중) ───────────────
    const { count: pendingPO } = await supabase
      .from('purchase_order')
      .select('*', { count: 'exact', head: true })
      .in('status', ['R', 'P'])

    if ((pendingPO ?? 0) > 0) {
      const today = SYSTEM_BASE_DATE.slice(5, 10)
      alerts.push({
        type: 'warn',
        message: `미처리 구매 발주 ${pendingPO}건 — 입고 확인 필요`,
        time: today,
        page: 'purchase',
      })
    }

    // ─── 4. action_queue high 항목 (3건 미만이면 보충) ─────────────────────
    if (alerts.length < 3) {
      const { data: highActions } = await supabase
        .from('action_queue')
        .select('product_id, action_type, eval_date')
        .eq('status', 'pending')
        .eq('severity', 'high')
        .order('eval_date', { ascending: false })
        .limit(3 - alerts.length)

      for (const row of (highActions ?? [])) {
        alerts.push({
          type: 'warn',
          message: `${String(row.product_id)} — ${ACTION_TYPE_KO[String(row.action_type)] ?? row.action_type} 권고`,
          time: String(row.eval_date ?? '').slice(5, 10),
          page: 'action-queue',
        })
      }
    }

    return NextResponse.json({ alerts: alerts.slice(0, 5), source: 'database' })
  } catch (err: any) {
    console.error('[API] alerts error:', err)
    return NextResponse.json({ source: 'error', error: err.message }, { status: 500 })
  }
}
