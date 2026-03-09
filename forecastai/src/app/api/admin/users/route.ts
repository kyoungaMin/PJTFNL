import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/admin/users
// Authorization: Bearer <access_token>
// admin만 호출 가능. 같은 company_id 소속 사용자 전체 반환.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'token 없음' }, { status: 401 })

  // 1. 토큰으로 사용자 확인
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 })
  }

  // 2. admin 여부 + company_id 확인
  const { data: myProfile, error: profileError } = await supabase
    .from('user_profile')
    .select('role, company_id')
    .eq('id', userData.user.id)
    .single()

  if (profileError || !myProfile) {
    return NextResponse.json({ error: '프로필 없음' }, { status: 404 })
  }
  if (myProfile.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음 (admin만 접근 가능)' }, { status: 403 })
  }

  // 3. 같은 회사 사용자 조회 (company_id가 없으면 전체 조회)
  let query = supabase
    .from('user_profile')
    .select('id, email, display_name, role, department, is_active, last_login_at, company_id, invited_by, created_at')
    .order('created_at', { ascending: true })

  if (myProfile.company_id) {
    query = query.eq('company_id', myProfile.company_id)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
