import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const TEMP_PASSWORD = '1234'

// POST /api/admin/reset-password
// Body: { access_token, userId }
// admin만 호출 가능. 비밀번호를 임시 비밀번호(1234)로 초기화.
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
    return NextResponse.json({ error: '권한 없음 (admin만 초기화 가능)' }, { status: 403 })
  }

  // 3. 비밀번호를 임시값(1234)으로 초기화
  const { error: resetError } = await supabase.auth.admin.updateUserById(userId, {
    password: TEMP_PASSWORD,
  })

  if (resetError) {
    return NextResponse.json({ error: resetError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tempPassword: TEMP_PASSWORD })
}
