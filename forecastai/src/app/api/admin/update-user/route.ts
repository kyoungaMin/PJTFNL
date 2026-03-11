import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const VALID_ROLES = ['admin', 'manager', 'analyst', 'viewer']

// POST /api/admin/update-user
// Body: { access_token, userId, role?, is_active? }
// admin만 호출 가능. 역할 변경 또는 계정 활성화/비활성화.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { access_token, userId, role, is_active } = body

  if (!access_token) return NextResponse.json({ error: 'token 없음' }, { status: 401 })
  if (!userId)       return NextResponse.json({ error: 'userId 필수' }, { status: 400 })

  // 1. 토큰 검증
  const { data: userData, error: userError } = await supabase.auth.getUser(access_token)
  if (userError || !userData.user) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  // 2. admin 확인
  const { data: myProfile } = await supabase
    .from('user_profile')
    .select('role, company_id')
    .eq('id', userData.user.id)
    .single()

  if (myProfile?.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음 (admin만 수정 가능)' }, { status: 403 })
  }

  // 3. 자기 자신의 역할/상태는 변경 불가 (안전장치)
  if (userId === userData.user.id) {
    return NextResponse.json({ error: '자신의 역할/상태는 변경할 수 없습니다' }, { status: 400 })
  }

  // 4. 업데이트할 필드 구성
  const updates: Record<string, unknown> = {}

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role.toLowerCase())) {
      return NextResponse.json({ error: '유효하지 않은 역할입니다' }, { status: 400 })
    }
    updates.role = role.toLowerCase()
  }

  if (is_active !== undefined) {
    updates.is_active = Boolean(is_active)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다' }, { status: 400 })
  }

  // 5. user_profile 업데이트
  const { error: updateError } = await supabase
    .from('user_profile')
    .update(updates)
    .eq('id', userId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
