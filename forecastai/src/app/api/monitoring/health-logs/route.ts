import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('system_health_log')
      .select('id, checked_at, service, status, latency_ms, message')
      .order('checked_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return NextResponse.json({ logs: data ?? [] })
  } catch (err: any) {
    console.error('[API] monitoring/health-logs error:', err)
    return NextResponse.json({ logs: [] })
  }
}
