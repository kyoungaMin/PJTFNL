'use client'
import React, { useState, useCallback, useEffect } from 'react'
import { T } from '@/lib/data'
import type { Member, RoleType } from '@/lib/data'
import { supabaseBrowser } from '@/lib/supabaseBrowser'
import { Sidebar, Header } from '@/components/layout'
import LoginPage from '@/components/pages/Login'
import PageDashboard from '@/components/pages/Dashboard'
import PageWeeklyForecast from '@/components/pages/WeeklyForecast'
import PageMonthlyForecast from '@/components/pages/MonthlyForecast'
import PageInventory from '@/components/pages/Inventory'
import PageRiskManagement from '@/components/pages/RiskManagement'
import PageActionQueue from '@/components/pages/ActionQueue'
import PagePurchase from '@/components/pages/Purchase'
import PageSimulation from '@/components/pages/Simulation'
import PageModelScenario from '@/components/pages/ModelScenario'
import PageModelEvaluation from '@/components/pages/ModelEvaluation'
import { PageExtSemi, PageExtGlobal, PageExtFX, PageExtSupply, PageExtRaw } from '@/components/pages/ExternalIndicators'
import PageAdmin from '@/components/pages/Admin'

const ROLE_GRAD: Record<RoleType, string> = {
  Admin:   'linear-gradient(135deg,#7C3AED,#EC4899)',
  Manager: 'linear-gradient(135deg,#3B82F6,#7C3AED)',
  Analyst: 'linear-gradient(135deg,#10B981,#059669)',
  Viewer:  'linear-gradient(135deg,#64748B,#94A3B8)',
}
function toRoleType(role: string): RoleType {
  const map: Record<string, RoleType> = { admin:'Admin', manager:'Manager', analyst:'Analyst', viewer:'Viewer' }
  return map[role.toLowerCase()] ?? 'Viewer'
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [collapsed] = useState(false)
  const [currentUser, setCurrentUser] = useState<Member | null>(null)
  const [alertCount, setAlertCount] = useState(0)

  // stable reference — Dashboard → Header 알림 배지 업데이트
  const handleAlertCount = useCallback((count: number) => setAlertCount(count), [])

  // 새로고침 시 Supabase 세션 복원
  // sessionStorage 플래그가 있을 때만 자동 복원 (탭 닫으면 초기화 → 새 탭은 로그인 필요)
  useEffect(() => {
    const sessionActive = typeof window !== 'undefined'
      ? sessionStorage.getItem('session_active')
      : null

    if (!sessionActive) {
      setSessionChecked(true)
      return
    }

    supabaseBrowser.auth.getSession().then(async ({ data }) => {
      const session = data.session
      if (!session) { setSessionChecked(true); return }

      try {
        const res = await fetch('/api/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token }),
        })
        if (res.ok) {
          const profile = await res.json()
          const role = toRoleType(profile.role ?? 'viewer')
          const name = profile.display_name ?? session.user.email?.split('@')[0] ?? '?'
          setCurrentUser({
            id: session.user.id,
            name, role,
            dept:    profile.department ?? '',
            email:   profile.email ?? session.user.email ?? '',
            grad:    ROLE_GRAD[role],
            initial: name.charAt(0) || '?',
            orgId:   profile.org_id ?? 'default',
          })
          setLoggedIn(true)
        }
      } catch { /* 세션 복원 실패 시 로그인 화면으로 */ }
      setSessionChecked(true)
    }).catch(() => {
      // Supabase 연결 실패 시에도 로그인 화면 표시
      setSessionChecked(true)
    })
  }, [])

  if (!sessionChecked) return null  // 세션 확인 전 깜빡임 방지

  if (!loggedIn || !currentUser) {
    return (
      <LoginPage
        onLogin={(member: Member) => {
          setCurrentUser(member)
          setLoggedIn(true)
        }}
      />
    )
  }

  const PAGE_MAP: Record<string, React.ReactNode> = {
    dashboard:          <PageDashboard setPage={setPage} onAlertCount={handleAlertCount} />,
    'weekly-forecast':  <PageWeeklyForecast />,
    'monthly-forecast': <PageMonthlyForecast />,
    inventory:          <PageInventory />,
    risk:               <PageRiskManagement />,
    'action-queue':     <PageActionQueue />,
    purchase:           <PagePurchase />,
    simulation:         <PageSimulation />,
    'model-scenario':   <PageModelScenario />,
    'model-eval':       <PageModelEvaluation />,
    'ext-semi':         <PageExtSemi />,
    'ext-global':       <PageExtGlobal />,
    'ext-fx':           <PageExtFX />,
    'ext-supply':       <PageExtSupply />,
    'ext-raw':          <PageExtRaw />,
    admin: currentUser.role === 'Admin'
      ? <PageAdmin currentUser={currentUser} />
      : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:12 }}>
            <div style={{ fontSize:48, color:T.border }}>🔒</div>
            <div style={{ fontSize:16, fontWeight:700, color:T.text1 }}>접근 권한이 없습니다</div>
            <div style={{ fontSize:13, color:T.text3 }}>관리자 페이지는 Admin 역할만 접근 가능합니다.</div>
          </div>
        ),
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:T.pageBg,
      fontFamily:"'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif",
      color:T.text1, overflow:'hidden' }}>
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} currentUser={currentUser} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Header currentUser={currentUser} setCurrentUser={setCurrentUser} setPage={setPage} alertCount={alertCount} />
        <div style={{ flex:1, overflowY:'auto', padding:'28px 32px' }}>
          {PAGE_MAP[page] ?? <PageDashboard />}
          <div style={{ textAlign:'center', marginTop:16, paddingBottom:8, fontSize:11, color:'#64748B' }}>
            Copyright © 2026 ICA 1 Team. All rights reserved.
          </div>
        </div>
      </div>
    </div>
  )
}
