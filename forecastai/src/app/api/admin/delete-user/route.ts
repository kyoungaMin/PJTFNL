import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// POST /api/admin/delete-user
// Body: { access_token, userId }
// admin만 호출 가능. Auth + user_profile 모두 영구 삭제.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { access_token, userId } = body

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
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (myProfile?.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음 (admin만 삭제 가능)' }, { status: 403 })
  }

  // 3. 자기 자신 삭제 방지
  if (userId === userData.user.id) {
    return NextResponse.json({ error: '자신의 계정은 삭제할 수 없습니다' }, { status: 400 })
  }

  // 4. user_profile 먼저 삭제 (FK 제약 방지)
  await supabase.from('user_profile').delete().eq('id', userId)

  // 5. Auth 계정 삭제
  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
