import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const VALID_ROLES    = ['admin', 'manager', 'analyst', 'viewer']
const DEFAULT_PASSWORD = '1234'

// POST /api/admin/invite
// Body: { access_token, email, display_name, role, department }
// 기본 비밀번호 1234로 계정 생성 (이메일 발송 없음). admin만 호출 가능.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { access_token, email, display_name, role, department } = body

  if (!access_token) return NextResponse.json({ error: 'token 없음' }, { status: 401 })
  if (!email)        return NextResponse.json({ error: '이메일 필수' }, { status: 400 })

  // 1. 토큰 검증
  const { data: userData, error: userError } = await supabase.auth.getUser(access_token)
  if (userError || !userData.user) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  // 2. admin + company_id 확인
  const { data: myProfile } = await supabase
    .from('user_profile')
    .select('role, company_id')
    .eq('id', userData.user.id)
    .single()

  if (myProfile?.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음 (admin만 등록 가능)' }, { status: 403 })
  }

  const safeRole    = VALID_ROLES.includes(role?.toLowerCase()) ? role.toLowerCase() : 'viewer'
  const displayName = display_name?.trim() || email.split('@')[0]

  // 3. 기본 비밀번호 1234로 계정 생성 (이메일 발송 없음)
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: email.toLowerCase(),
    password: DEFAULT_PASSWORD,
    email_confirm: true,           // 이메일 인증 건너뜀 (즉시 로그인 가능)
    user_metadata: { display_name: displayName },
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // 4. user_profile upsert
  const { error: upsertError } = await supabase.from('user_profile').upsert({
    id:           createData.user.id,
    email:        email.toLowerCase(),
    display_name: displayName,
    role:         safeRole,
    department:   department?.trim() ?? '',
    company_id:   myProfile?.company_id ?? null,
    invited_by:   userData.user.id,
    is_active:    true,
  })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, userId: createData.user.id, email })
}
