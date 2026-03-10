import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// POST /api/me
// 브라우저에서 access_token을 보내면, 서버에서 user_profile을 조회해서 반환
export async function POST(req: NextRequest) {
  const { access_token } = await req.json()

  if (!access_token) {
    return NextResponse.json({ error: 'token 없음' }, { status: 401 })
  }

  // 1) access_token으로 사용자 정보 확인
  const { data: userData, error: userError } = await supabase.auth.getUser(access_token)

  if (userError || !userData.user) {
    return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 })
  }

  // 2) user_profile 조회 (RLS 우회: service role key 또는 anon key)
  const { data: profile } = await supabase
    .from('user_profile')
    .select('display_name, role, department, email, org_id')
    .eq('id', userData.user.id)
    .single()

  // 3) user_profile 없으면 auth 사용자 정보로 기본 프로필 반환 (404 대신 200)
  if (!profile) {
    const email = userData.user.email ?? ''
    return NextResponse.json({
      display_name: email.split('@')[0],
      role: 'viewer',
      department: '',
      email,
      org_id: 'default',
    })
  }

  return NextResponse.json(profile)
}
