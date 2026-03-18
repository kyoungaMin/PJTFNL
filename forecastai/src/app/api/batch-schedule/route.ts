import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET — 전체 스케줄 설정 조회
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('batch_schedule_config')
      .select('*')
      .order('source_id')

    if (error) throw error
    return NextResponse.json({ schedules: data ?? [] })
  } catch {
    return NextResponse.json({ schedules: [] }, { status: 200 })
  }
}

// POST — 단일 스케줄 설정 저장 (upsert)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      source_id, source_name, is_active,
      freq, hour, minute,
      day_of_week, day_of_month, interval_hours,
      updated_by,
    } = body

    if (!source_id) {
      return NextResponse.json({ error: 'source_id 필수' }, { status: 400 })
    }

    const { error } = await supabase
      .from('batch_schedule_config')
      .upsert({
        source_id, source_name, is_active,
        freq, hour, minute,
        day_of_week, day_of_month, interval_hours,
        updated_by: updated_by ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source_id' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '저장 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
