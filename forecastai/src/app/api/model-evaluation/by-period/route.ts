import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/model-evaluation/by-period?type=weekly&period=2025-W37
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'weekly'
  const period = req.nextUrl.searchParams.get('period') ?? ''
  const modelId = type === 'monthly' ? 'lgbm_q_monthly_v1' : 'lgbm_q_v2'

  if (!period) {
    return NextResponse.json({ error: 'period parameter required' }, { status: 400 })
  }

  try {
    // Parse period to date range
    let startDate: string, endDate: string

    if (type === 'monthly') {
      // period = "2026-01"
      const [y, m] = period.split('-').map(Number)
      startDate = `${y}-${String(m).padStart(2, '0')}-01`
      const nextMonth = m === 12 ? new Date(y + 1, 0, 1) : new Date(y, m, 1)
      endDate = nextMonth.toISOString().slice(0, 10)
    } else {
      // period = "2025-W37" → compute Monday of that ISO week
      const match = period.match(/^(\d{4})-W(\d{2})$/)
      if (!match) {
        return NextResponse.json({ error: 'Invalid period format' }, { status: 400 })
      }
      const [, yearStr, weekStr] = match
      const year = parseInt(yearStr), week = parseInt(weekStr)

      // ISO week date to Monday
      const jan4 = new Date(year, 0, 4)
      const dayOfWeek = jan4.getDay() || 7
      const mondayOfWeek1 = new Date(jan4)
      mondayOfWeek1.setDate(jan4.getDate() - dayOfWeek + 1)
      const targetMonday = new Date(mondayOfWeek1)
      targetMonday.setDate(mondayOfWeek1.getDate() + (week - 1) * 7)
      const targetSunday = new Date(targetMonday)
      targetSunday.setDate(targetMonday.getDate() + 7)

      startDate = targetMonday.toISOString().slice(0, 10)
      endDate = targetSunday.toISOString().slice(0, 10)
    }

    // Query forecast_result for the date range
    const { data, error } = await supabase
      .from('forecast_result')
      .select('product_id, p10, p50, p90, actual_qty')
      .eq('model_id', modelId)
      .gte('target_date', startDate)
      .lt('target_date', endDate)
      .not('actual_qty', 'is', null)

    if (error) throw error

    const rows = data ?? []
    if (rows.length === 0) {
      return NextResponse.json({
        period, type, n_products: 0,
        metrics: { mae: 0, rmse: 0, r2: 0, mape: 0, tolerance_5_rate: 0 },
        top_error_products: [],
        top_accurate_products: [],
      })
    }

    // Compute metrics
    const errors = rows.map(r => ({
      pid: r.product_id,
      pred: r.p50,
      actual: r.actual_qty,
      error: Math.abs(r.p50 - r.actual_qty),
      sqError: (r.p50 - r.actual_qty) ** 2,
    }))

    const n = errors.length
    const mae = errors.reduce((s, e) => s + e.error, 0) / n
    const mse = errors.reduce((s, e) => s + e.sqError, 0) / n
    const rmse = Math.sqrt(mse)

    // R²
    const meanActual = errors.reduce((s, e) => s + e.actual, 0) / n
    const ssTot = errors.reduce((s, e) => s + (e.actual - meanActual) ** 2, 0)
    const ssRes = errors.reduce((s, e) => s + e.sqError, 0)
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

    // MAPE (exclude actual=0)
    const nonZero = errors.filter(e => e.actual !== 0)
    const mape = nonZero.length > 0
      ? nonZero.reduce((s, e) => s + e.error / Math.abs(e.actual), 0) / nonZero.length * 100
      : 0

    // ±5 tolerance
    const within5 = errors.filter(e => e.error <= 5).length
    const tolerance_5_rate = (within5 / n) * 100

    // Unique products
    const uniqueProducts = new Set(errors.map(e => e.pid))

    // Top error / accurate products
    const sorted = [...errors].sort((a, b) => b.error - a.error)
    const topError = sorted.slice(0, 10).map(e => ({
      product_id: e.pid, predicted: Math.round(e.pred * 10) / 10,
      actual: Math.round(e.actual * 10) / 10, error: Math.round(e.error * 10) / 10,
    }))
    const topAccurate = sorted.slice(-10).reverse().map(e => ({
      product_id: e.pid, predicted: Math.round(e.pred * 10) / 10,
      actual: Math.round(e.actual * 10) / 10, error: Math.round(e.error * 10) / 10,
    }))

    return NextResponse.json({
      period, type,
      n_products: uniqueProducts.size,
      n_records: n,
      date_range: { start: startDate, end: endDate },
      metrics: {
        mae: Math.round(mae * 100) / 100,
        rmse: Math.round(rmse * 100) / 100,
        r2: Math.round(r2 * 10000) / 10000,
        mape: Math.round(mape * 100) / 100,
        tolerance_5_rate: Math.round(tolerance_5_rate * 100) / 100,
      },
      top_error_products: topError,
      top_accurate_products: topAccurate,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? String(err) },
      { status: 500 }
    )
  }
}
