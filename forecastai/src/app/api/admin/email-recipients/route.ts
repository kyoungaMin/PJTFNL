import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Admin 권한 확인 헬퍼 (기존 admin/users 패턴과 동일)
async function verifyAdmin(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.replace('Bearer ', '')
  const { data } = await supabase.auth.getUser(token)
  if (!data.user) return false
  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', data.user.id)
    .single()
  return profile?.role === 'admin'
}

// GET /api/admin/email-recipients — 수신자 목록
export async function GET(req: Request) {
  const isAdmin = await verifyAdmin(req.headers.get('authorization'))
  if (!isAdmin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { data, error } = await supabase
    .from('email_report_recipients')
    .select('id, email, name, is_active, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/admin/email-recipients — 수신자 추가
export async function POST(req: Request) {
  const isAdmin = await verifyAdmin(req.headers.get('authorization'))
  if (!isAdmin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json()
  const email = String(body.email ?? '').trim()
  const name  = String(body.name  ?? '').trim()

  if (!email.includes('@')) return NextResponse.json({ error: '올바른 이메일을 입력하세요.' }, { status: 400 })

  const { data, error } = await supabase
    .from('email_report_recipients')
    .insert({ email, name })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '이미 등록된 이메일입니다.' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/admin/email-recipients — 활성/비활성 토글
export async function PATCH(req: Request) {
  const isAdmin = await verifyAdmin(req.headers.get('authorization'))
  if (!isAdmin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const body = await req.json()
  const id        = String(body.id ?? '')
  const is_active = Boolean(body.is_active)

  const { error } = await supabase
    .from('email_report_recipients')
    .update({ is_active })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/email-recipients — 수신자 삭제
export async function DELETE(req: Request) {
  const isAdmin = await verifyAdmin(req.headers.get('authorization'))
  if (!isAdmin) return NextResponse.json({ error: '권한 없음' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('email_report_recipients')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
