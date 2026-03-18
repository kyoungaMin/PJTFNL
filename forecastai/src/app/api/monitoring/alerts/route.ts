import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/* ──────────────────────────────────────────────
   GET  — 알림 목록 조회 (필터/페이징)
   query: severity, is_read, is_dismissed, limit, offset
   ────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const url = req.nextUrl
    const severity    = url.searchParams.get('severity')
    const isRead      = url.searchParams.get('is_read')
    const isDismissed = url.searchParams.get('is_dismissed') ?? 'false'
    const limit       = Math.min(Number(url.searchParams.get('limit') ?? 50), 100)
    const offset      = Number(url.searchParams.get('offset') ?? 0)

    let query = supabase
      .from('system_alert')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (severity)    query = query.eq('severity', severity)
    if (isRead)      query = query.eq('is_read', isRead === 'true')
    if (isDismissed) query = query.eq('is_dismissed', isDismissed === 'true')

    const { data, count, error } = await query
    if (error) throw error

    return NextResponse.json({ alerts: data ?? [], total: count ?? 0 })
  } catch (err: any) {
    console.error('[API] monitoring/alerts GET error:', err)
    return NextResponse.json({ alerts: [], total: 0 })
  }
}

/* ──────────────────────────────────────────────
   POST — 알림 생성 (수동 or 시스템 자동)
   body: { alert_type, severity, title, message, source, target_page, metadata }
   ────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { alert_type, severity, title, message, source, target_page, metadata } = body

    if (!title) {
      return NextResponse.json({ error: 'title 필수' }, { status: 400 })
    }

    // 동일 제목 중복 방지 (6시간 내)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('system_alert')
      .select('id')
      .eq('title', title)
      .eq('is_dismissed', false)
      .gte('created_at', sixHoursAgo)
      .limit(1)

    if (existing?.length) {
      return NextResponse.json({ skipped: true, message: '동일 알림이 6시간 내 존재' })
    }

    const { data, error } = await supabase
      .from('system_alert')
      .insert({
        alert_type: alert_type ?? 'system',
        severity: severity ?? 'medium',
        title,
        message: message ?? null,
        source: source ?? null,
        target_page: target_page ?? null,
        metadata: metadata ?? {},
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ alert: data })
  } catch (err: any) {
    console.error('[API] monitoring/alerts POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/* ──────────────────────────────────────────────
   PATCH — 알림 상태 변경 (읽음/해제)
   body: { ids: string[], action: 'read' | 'dismiss' | 'resolve' }
   ────────────────────────────────────────────── */
export async function PATCH(req: NextRequest) {
  try {
    const { ids, action } = await req.json()

    if (!ids?.length || !action) {
      return NextResponse.json({ error: 'ids, action 필수' }, { status: 400 })
    }

    const updateData: Record<string, any> = {}
    if (action === 'read')    updateData.is_read = true
    if (action === 'dismiss') updateData.is_dismissed = true
    if (action === 'resolve') { updateData.is_dismissed = true; updateData.resolved_at = new Date().toISOString() }

    const { error } = await supabase
      .from('system_alert')
      .update(updateData)
      .in('id', ids)

    if (error) throw error
    return NextResponse.json({ updated: ids.length })
  } catch (err: any) {
    console.error('[API] monitoring/alerts PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
