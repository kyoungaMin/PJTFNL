import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const VALID_ROLES = ['admin', 'manager', 'analyst', 'viewer']
const DEFAULT_PASSWORD = '1234'

type InviteRow = {
  email: string
  display_name: string
  role: string
  department: string
}

// POST /api/admin/invite-bulk
// Body: { access_token, users: InviteRow[] }
// 기본 비밀번호 1234로 계정 생성 (이메일 발송 없음). 최대 100명.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { access_token, users } = body as { access_token: string; users: InviteRow[] }

  if (!access_token) return NextResponse.json({ error: 'token 없음' }, { status: 401 })
  if (!Array.isArray(users) || users.length === 0) {
    return NextResponse.json({ error: '등록할 사용자 목록이 없습니다' }, { status: 400 })
  }
  if (users.length > 100) {
    return NextResponse.json({ error: '1회 최대 100명까지 등록 가능합니다' }, { status: 400 })
  }

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

  // 3. 각 사용자 계정 생성 (순차 처리)
  const results: { email: string; success: boolean; error?: string }[] = []

  for (const user of users) {
    const email = user.email?.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      results.push({ email: email ?? '(빈값)', success: false, error: '이메일 형식 오류' })
      continue
    }

    const safeRole    = VALID_ROLES.includes(user.role?.toLowerCase()) ? user.role.toLowerCase() : 'viewer'
    const displayName = user.display_name?.trim() || email.split('@')[0]

    // 기본 비밀번호 1234로 계정 생성 (이메일 발송 없음)
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,          // 이메일 인증 건너뜀 (즉시 로그인 가능)
      user_metadata: { display_name: displayName },
    })

    if (createError) {
      results.push({ email, success: false, error: createError.message })
      continue
    }

    // user_profile upsert (role, dept, company_id 설정)
    const { error: upsertError } = await supabase.from('user_profile').upsert({
      id:           createData.user.id,
      email,
      display_name: displayName,
      role:         safeRole,
      department:   user.department?.trim() ?? '',
      company_id:   myProfile?.company_id ?? null,
      invited_by:   userData.user.id,
      is_active:    true,
    })

    if (upsertError) {
      results.push({ email, success: false, error: upsertError.message })
    } else {
      results.push({ email, success: true })
    }
  }

  const successCount = results.filter(r => r.success).length
  const failCount    = results.filter(r => !r.success).length

  return NextResponse.json({ successCount, failCount, results })
}
