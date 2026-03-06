'use client'
import React, { useState } from 'react'
import { T } from '@/lib/data'
import type { Member } from '@/lib/data'
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
import { PageExtSemi, PageExtGlobal, PageExtFX, PageExtSupply, PageExtRaw } from '@/components/pages/ExternalIndicators'
import PageAdmin from '@/components/pages/Admin'

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [collapsed, setCollapsed] = useState(false)
  const [currentUser, setCurrentUser] = useState<Member | null>(null)

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
    dashboard:          <PageDashboard />,
    'weekly-forecast':  <PageWeeklyForecast />,
    'monthly-forecast': <PageMonthlyForecast />,
    inventory:          <PageInventory />,
    risk:               <PageRiskManagement />,
    'action-queue':     <PageActionQueue />,
    purchase:           <PagePurchase />,
    simulation:         <PageSimulation />,
    'ext-semi':         <PageExtSemi />,
    'ext-global':       <PageExtGlobal />,
    'ext-fx':           <PageExtFX />,
    'ext-supply':       <PageExtSupply />,
    'ext-raw':          <PageExtRaw />,
    admin:              <PageAdmin />,
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:T.pageBg,
      fontFamily:"'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif",
      color:T.text1, overflow:'hidden' }}>
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} onToggle={() => setCollapsed(p => !p)} currentUser={currentUser} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <Header currentUser={currentUser} setCurrentUser={setCurrentUser} setPage={setPage} />
        <div style={{ flex:1, overflowY:'auto', padding:'28px 32px' }}>
          {PAGE_MAP[page] ?? <PageDashboard />}
        </div>
      </div>
    </div>
  )
}
