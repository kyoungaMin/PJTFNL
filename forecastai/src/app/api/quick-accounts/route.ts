import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/quick-accounts
// 인증 없이 접근 가능 — 로그인 화면 간편 로그인 버튼용
export async function GET() {
  // 1) Supabase Auth 실제 이메일 목록 (항상 최신)
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (!authData?.users?.length) return NextResponse.json([])

  // 2) user_profile에서 이름/역할 가져오기
  const { data: profiles } = await supabase
    .from('user_profile')
    .select('id, email, display_name, role')
    .eq('is_active', true)

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]))

  // 3) Auth 이메일 기준으로 합치기 (user_profile에 있는 활성 계정만)
  const accounts = (authData.users as any[])
    .filter((u: any) => u.email && profileMap.has(u.id))
    .map((u: any) => {
      const p = profileMap.get(u.id)!
      return {
        email: u.email as string,                                 // Auth 실제 이메일
        name:  p.display_name ?? (u.email as string).split('@')[0],
        role:  p.role ?? 'viewer',
      }
    })
    .sort((a, b) => a.email.localeCompare(b.email))
    .slice(0, 10)

  return NextResponse.json(accounts)
}
