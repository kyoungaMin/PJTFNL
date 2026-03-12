import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/weekly-report?week=2026-W09  (week 파라미터 없으면 DB 최신 주차 자동 사용)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const requestedWeek = searchParams.get('week')  // 없으면 null
    const fromParam     = searchParams.get('from')  // 날짜 범위 시작
    const toParam       = searchParams.get('to')    // 날짜 범위 종료

    // ─── 날짜 범위 모드 (from/to 파라미터) ──────────────────────────────────
    if (fromParam && toParam) {
      // 1. 해당 기간의 weekly_product_summary 조회
      const { data: weeklyRows, error: weeklyErr } = await supabase
        .from('weekly_product_summary')
        .select('product_id, year_week, week_start, week_end, order_qty, order_amount, revenue_qty, revenue_amount, produced_qty')
        .gte('week_start', fromParam)
        .lte('week_start', toParam)
        .order('week_start', { ascending: false })
        .order('order_qty',  { ascending: false })
        .limit(500)

      if (weeklyErr) throw weeklyErr

      // 2. KPI 집계
      const rows           = weeklyRows ?? []
      const totalOrderQty    = rows.reduce((s, r) => s + Number(r.order_qty    ?? 0), 0)
      const totalOrderAmt    = rows.reduce((s, r) => s + Number(r.order_amount  ?? 0), 0)
      const totalRevenueAmt  = rows.reduce((s, r) => s + Number(r.revenue_amount ?? 0), 0)
      const totalProducedQty = rows.reduce((s, r) => s + Number(r.produced_qty  ?? 0), 0)

      // 3. 재고 커버리지 (최신 스냅샷 기준)
      // ⚠️ inventory(617,720행) + daily_order(259,684행) 직접 조회 → limit=1000 잘림 버그
      //    → get_inventory_coverage RPC로 해결 (DB/24_coverage_rpc.sql)
      const { data: covRows2 } = await supabase
        .rpc('get_inventory_coverage', {
          p_from_date: fromParam,
          p_to_date:   toParam,
        })

      const covRow2    = covRows2?.[0]
      const totalInv2  = Number(covRow2?.total_inv_qty   ?? 0)
      const demand2    = Number(covRow2?.total_order_qty ?? 0)
      const periodDays = Math.max(1, Math.round(
        (new Date(toParam).getTime() - new Date(fromParam).getTime()) / (24 * 60 * 60 * 1000)
      ) + 1)
      const dailyAvg2  = demand2 / periodDays
      let coverageDays = dailyAvg2 > 0 ? Math.round(totalInv2 / dailyAvg2) : 0

      // 4. 미처리 구매 발주
      const { data: poRows2, error: poErr2 } = await supabase
        .from('purchase_order')
        .select('id, cd_partner, supplier_name, component_product_id, po_date, receipt_date, po_qty, unit_price, currency, status')
        .in('status', ['R', 'P']).order('receipt_date', { ascending: true }).limit(100)

      if (poErr2) throw poErr2

      return NextResponse.json({
        meta: {
          generatedAt: new Date().toISOString(),
          targetWeek:  `${fromParam} ~ ${toParam}`,
          weekStart:   fromParam,
          weekEnd:     toParam,
          isLatest:    false,
        },
        weekOptions: [],
        kpi: {
          coverageDays,
          coverageStatus: coverageDays >= 21 ? '달성' : coverageDays >= 14 ? '관찰' : '위험',
          pendingPO:       (poRows2 ?? []).length,
          weekOrderQty:    Math.round(totalOrderQty),
          weekOrderAmt:    Math.round(totalOrderAmt),
          weekRevenueAmt:  Math.round(totalRevenueAmt),
          weekProducedQty: Math.round(totalProducedQty),
        },
        weeklyProducts: rows.map(r => ({
          product_id:     r.product_id,
          year_week:      r.year_week,
          week_start:     r.week_start,
          week_end:       r.week_end,
          order_qty:      Math.round(Number(r.order_qty     ?? 0)),
          order_amount:   Math.round(Number(r.order_amount   ?? 0)),
          revenue_qty:    Math.round(Number(r.revenue_qty    ?? 0)),
          revenue_amount: Math.round(Number(r.revenue_amount ?? 0)),
          produced_qty:   Math.round(Number(r.produced_qty   ?? 0)),
        })),
        pendingOrders: (poRows2 ?? []).map(r => ({
          supplier:     r.supplier_name ?? r.cd_partner ?? '',
          product_id:   r.component_product_id ?? '',
          po_date:      r.po_date ?? '',
          receipt_date: r.receipt_date ?? '',
          po_qty:       Math.round(Number(r.po_qty ?? 0)),
          unit_price:   Number(r.unit_price ?? 0),
          currency:     r.currency ?? '',
          status:       r.status === 'R' ? '미입고' : r.status === 'P' ? '처리중' : (r.status ?? ''),
        })),
        source: 'database',
      })
    }

    // ─── 1. 사용할 주차 결정 ────────────────────────────────────────────────
    // weekly_product_summary에서 DB에 실제 있는 최신 주차를 먼저 조회
    // → 현재 달력 주차(W10)가 아직 집계 안 됐을 수 있으므로 DB 기준 사용
    const { data: latestWeekRow } = await supabase
      .from('weekly_product_summary')
      .select('year_week, week_start, week_end')
      .order('week_start', { ascending: false })
      .limit(1)

    const latestWeek = latestWeekRow?.[0]?.year_week as string | undefined

    if (!latestWeek) throw new Error('weekly_product_summary에 데이터가 없습니다.')

    // 요청한 주차가 있으면 그거 사용, 없으면 최신 주차 사용
    const targetWeek = requestedWeek ?? latestWeek

    // ─── 2. 선택 가능한 주차 목록 (최근 12주, 셀렉트박스용) ─────────────────
    const { data: weekListRows } = await supabase
      .from('weekly_product_summary')
      .select('year_week, week_start, week_end')
      .order('week_start', { ascending: false })
      .limit(500)  // 넉넉하게 가져와서 중복 제거

    // 중복 제거 후 최근 12주만 추출
    const seen = new Set<string>()
    const weekOptions: { value: string; label: string }[] = []
    for (const row of (weekListRows ?? [])) {
      if (seen.has(row.year_week)) continue
      seen.add(row.year_week)
      const label = `${row.year_week}  (${row.week_start} ~ ${row.week_end})`
      weekOptions.push({ value: row.year_week, label })
      if (weekOptions.length >= 12) break
    }

    // ─── 3. 선택된 주차 기준 4주 범위 데이터 조회 ───────────────────────────
    // 선택된 주차의 week_start 찾기
    const targetWeekInfo = (weekListRows ?? []).find(r => r.year_week === targetWeek)
    const targetWeekStart = targetWeekInfo?.week_start as string | undefined
    const targetWeekEnd   = targetWeekInfo?.week_end   as string | undefined

    if (!targetWeekStart) throw new Error(`주차 ${targetWeek}의 데이터를 찾을 수 없습니다.`)

    // 선택 주차 기준 4주 전
    const fourWeeksBeforeTarget = new Date(targetWeekStart)
    fourWeeksBeforeTarget.setDate(fourWeeksBeforeTarget.getDate() - 28)
    const fromStr = fourWeeksBeforeTarget.toISOString().slice(0, 10)

    const { data: weeklyRows, error: weeklyErr } = await supabase
      .from('weekly_product_summary')
      .select('product_id, year_week, week_start, week_end, order_qty, order_amount, revenue_qty, revenue_amount, produced_qty')
      .gte('week_start', fromStr)
      .lte('week_start', targetWeekStart)
      .order('week_start', { ascending: false })
      .order('order_qty',  { ascending: false })
      .limit(200)

    if (weeklyErr) throw weeklyErr

    // ─── 4. 재고 커버리지 KPI ─────────────────────────────────────────────
    // ⚠️ inventory(617,720행) + daily_order(259,684행) 직접 조회 → limit=1000 잘림 버그
    //    → get_inventory_coverage RPC로 해결 (DB/24_coverage_rpc.sql)
    const toDateStr     = targetWeekEnd ?? targetWeekStart
    const thirtyAgoStr  = new Date(
      new Date(toDateStr).getTime() - 30 * 24 * 60 * 60 * 1000
    ).toISOString().slice(0, 10)

    const { data: covRows } = await supabase
      .rpc('get_inventory_coverage', {
        p_from_date: thirtyAgoStr,
        p_to_date:   toDateStr,
      })

    const covRow     = covRows?.[0]
    const snapshotDate = String(covRow?.snapshot_date ?? '')
    const totalInv   = Number(covRow?.total_inv_qty   ?? 0)
    const demand30   = Number(covRow?.total_order_qty ?? 0)
    const dailyAvg   = demand30 / 30
    let coverageDays = dailyAvg > 0 ? Math.round(totalInv / dailyAvg) : 0

    // ─── 5. 미처리 구매 발주 목록 ────────────────────────────────────────────
    const { data: poRows, error: poErr } = await supabase
      .from('purchase_order')
      .select('id, cd_partner, supplier_name, component_product_id, po_date, receipt_date, po_qty, unit_price, currency, status')
      .in('status', ['R', 'P'])
      .order('receipt_date', { ascending: true })
      .limit(100)

    if (poErr) throw poErr

    // ─── 6. 선택 주차 수주 합계 (KPI용) ────────────────────────────────────
    const targetRows = (weeklyRows ?? []).filter(r => r.year_week === targetWeek)
    const targetOrderQty    = targetRows.reduce((s, r) => s + Number(r.order_qty ?? 0), 0)
    const targetOrderAmt    = targetRows.reduce((s, r) => s + Number(r.order_amount ?? 0), 0)
    const targetRevenueAmt  = targetRows.reduce((s, r) => s + Number(r.revenue_amount ?? 0), 0)
    const targetProducedQty = targetRows.reduce((s, r) => s + Number(r.produced_qty ?? 0), 0)

    return NextResponse.json({
      meta: {
        generatedAt:   new Date().toISOString(),
        targetWeek,
        weekStart:     targetWeekStart,
        weekEnd:       targetWeekEnd ?? '',
        latestWeek,
        snapshotDate,
        isLatest:      targetWeek === latestWeek,
      },
      weekOptions,   // 셀렉트박스용 주차 목록 (최근 12주)
      kpi: {
        coverageDays,
        coverageStatus: coverageDays >= 21 ? '달성' : coverageDays >= 14 ? '관찰' : '위험',
        pendingPO:      (poRows ?? []).length,
        weekOrderQty:    Math.round(targetOrderQty),
        weekOrderAmt:    Math.round(targetOrderAmt),
        weekRevenueAmt:  Math.round(targetRevenueAmt),
        weekProducedQty: Math.round(targetProducedQty),
      },
      weeklyProducts: (weeklyRows ?? []).map(r => ({
        product_id:     r.product_id,
        year_week:      r.year_week,
        week_start:     r.week_start,
        week_end:       r.week_end,
        order_qty:      Math.round(Number(r.order_qty ?? 0)),
        order_amount:   Math.round(Number(r.order_amount ?? 0)),
        revenue_qty:    Math.round(Number(r.revenue_qty ?? 0)),
        revenue_amount: Math.round(Number(r.revenue_amount ?? 0)),
        produced_qty:   Math.round(Number(r.produced_qty ?? 0)),
      })),
      pendingOrders: (poRows ?? []).map(r => ({
        supplier:     r.supplier_name ?? r.cd_partner ?? '',
        product_id:   r.component_product_id ?? '',
        po_date:      r.po_date ?? '',
        receipt_date: r.receipt_date ?? '',
        po_qty:       Math.round(Number(r.po_qty ?? 0)),
        unit_price:   Number(r.unit_price ?? 0),
        currency:     r.currency ?? '',
        status:       r.status === 'R' ? '미입고' : r.status === 'P' ? '처리중' : (r.status ?? ''),
      })),
      source: 'database',
    })
  } catch (err: any) {
    console.error('[API] weekly-report error:', err)
    return NextResponse.json({ source: 'error', error: err.message }, { status: 500 })
  }
}
