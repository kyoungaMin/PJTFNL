import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/forecast-monthly/customers?sku=...
 * 해당 SKU를 수주한 고객사 목록 반환 (monthly_customer_summary 기반)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('sku') ?? ''

  if (!supabase) {
    return NextResponse.json({ items: [], source: 'no_client' }, { status: 200 })
  }
  if (!productId) {
    return NextResponse.json({ items: [], source: 'no_sku' }, { status: 200 })
  }

  try {
    // Bug3 fix: use customer_name directly from monthly_customer_summary (company_name in customer table is null)
    const { data: summaryRows, error: summaryErr } = await supabase
      .from('monthly_customer_summary')
      .select('customer_id, customer_name')
      .eq('product_id', productId)
      .order('customer_id', { ascending: true })

    if (summaryErr) throw summaryErr
    if (!summaryRows || summaryRows.length === 0) {
      return NextResponse.json({ items: [], source: 'no_customers' }, { status: 200 })
    }

    // distinct by customer_id, use customer_name as display name
    const seen = new Set<string>()
    const items = summaryRows
      .filter(r => {
        if (seen.has(r.customer_id)) return false
        seen.add(r.customer_id)
        return true
      })
      .map(r => ({
        id: r.customer_id,
        name: r.customer_name ?? r.customer_id,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ items, source: 'database' })
  } catch (err: any) {
    console.error('[API] forecast-monthly/customers error:', err)
    return NextResponse.json(
      { items: [], source: 'error', error: err.message },
      { status: 500 }
    )
  }
}
