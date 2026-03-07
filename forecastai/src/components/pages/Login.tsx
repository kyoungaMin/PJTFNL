'use client'
import React, { useState } from 'react'
import { LOGIN_ACCOUNTS, type Member, type RoleType } from '@/lib/data'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

// ─── role 첫 글자 대문자 변환 (DB: 'admin' → Member: 'Admin') ───────────────
function toRoleType(role: string): RoleType {
  const map: Record<string, RoleType> = {
    admin: 'Admin', manager: 'Manager', analyst: 'Analyst', viewer: 'Viewer',
  }
  return map[role.toLowerCase()] ?? 'Viewer'
}

// ─── role별 아바타 그라데이션 색상 ─────────────────────────────────────────────
const ROLE_GRAD: Record<RoleType, string> = {
  Admin:   'linear-gradient(135deg,#7C3AED,#EC4899)',
  Manager: 'linear-gradient(135deg,#3B82F6,#7C3AED)',
  Analyst: 'linear-gradient(135deg,#10B981,#059669)',
  Viewer:  'linear-gradient(135deg,#64748B,#94A3B8)',
}

export default function LoginPage({ onLogin }: { onLogin: (member: Member) => void }) {
  const [email,    setEmail]    = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)
  const [showPw,   setShowPw]   = useState(false)

  const handleLogin = async () => {
    if (!email || !password) { setError("이메일과 비밀번호를 입력해 주세요."); return }
    setLoading(true)
    setError("")

    // 1) Supabase Auth 로그인
    const { data: authData, error: authError } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.")
      setLoading(false)
      return
    }

    // 2) /api/me 서버 API로 프로필 조회 (service role key가 RLS 우회)
    const res = await fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: authData.session?.access_token }),
    })

    if (!res.ok) {
      setError("사용자 프로필을 찾을 수 없습니다. 관리자에게 문의해주세요.")
      setLoading(false)
      return
    }

    const profile = await res.json()

    // 3) DB 값 → Member 타입 변환
    const role = toRoleType(profile.role ?? 'viewer')
    const name = profile.display_name ?? email.split('@')[0]

    const member: Member = {
      id:      authData.user?.id ?? '',
      name,
      role,
      dept:    profile.department ?? '',
      email:   profile.email ?? email,
      grad:    ROLE_GRAD[role],
      initial: name.charAt(0) || '?',
      orgId:   profile.org_id ?? 'default',
    }

    onLogin(member)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleLogin() }

  // 빠른 로그인: 폼에 이메일/비밀번호를 자동으로 채워줌 (Supabase 계정이 있어야 실제 로그인 가능)
  const quickLogin = (acc: { email: string; password: string }) => {
    setEmail(acc.email)
    setPassword(acc.password)
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0F172A 0%,#1B2B4B 50%,#0F172A 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Pretendard','Noto Sans KR','Apple SD Gothic Neo',sans-serif", position:"relative", overflow:"hidden" }}>
      {/* Background decoration */}
      <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none" }}>
        <div style={{ position:"absolute", top:"-15%", right:"-5%", width:480, height:480, borderRadius:"50%", background:"radial-gradient(circle,rgba(37,99,235,0.10) 0%,transparent 65%)" }}/>
        <div style={{ position:"absolute", bottom:"-15%", left:"-5%", width:520, height:520, borderRadius:"50%", background:"radial-gradient(circle,rgba(124,58,237,0.08) 0%,transparent 65%)" }}/>
      </div>

      <div style={{ width:"100%", maxWidth:420, padding:"0 24px", position:"relative", zIndex:1 }}>
        {/* Logo area */}
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:56, height:56, borderRadius:16, background:"linear-gradient(135deg,#2563EB,#7C3AED)", boxShadow:"0 8px 32px rgba(37,99,235,0.4)", marginBottom:16 }}>
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none">
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize:24, fontWeight:800, color:"#FFFFFF", letterSpacing:"-0.02em" }}>ForecastAI</div>
          <div style={{ fontSize:12, color:"#64748B", marginTop:4, letterSpacing:"0.08em", textTransform:"uppercase" }}>Demand Planning Platform</div>
        </div>

        {/* Card */}
        <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:20, padding:"36px 32px", backdropFilter:"blur(12px)" }}>
          <div style={{ fontSize:18, fontWeight:700, color:"#F1F5F9", marginBottom:6 }}>로그인</div>
          <div style={{ fontSize:12, color:"#64748B", marginBottom:28 }}>계획·구매·관리 통합 플랫폼에 오신 것을 환영합니다</div>

          {/* Email */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#94A3B8", marginBottom:7, letterSpacing:"0.04em" }}>이메일</div>
            <input
              type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="name@company.com"
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:10, padding:"12px 14px", fontSize:13, color:"#F1F5F9", outline:"none", boxSizing:"border-box", transition:"border 0.15s" }}
              onFocus={e=>(e.target.style.border="1px solid #3B82F6")}
              onBlur={e=>(e.target.style.border="1px solid rgba(255,255,255,0.10)")}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#94A3B8", marginBottom:7, letterSpacing:"0.04em" }}>비밀번호</div>
            <div style={{ position:"relative" }}>
              <input
                type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="비밀번호를 입력하세요"
                style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.10)", borderRadius:10, padding:"12px 40px 12px 14px", fontSize:13, color:"#F1F5F9", outline:"none", boxSizing:"border-box", transition:"border 0.15s" }}
                onFocus={e=>(e.target.style.border="1px solid #3B82F6")}
                onBlur={e=>(e.target.style.border="1px solid rgba(255,255,255,0.10)")}
              />
              <button onClick={()=>setShowPw(p=>!p)}
                style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:15, color:"#64748B", padding:0, lineHeight:1 }}>
                {showPw?"🙈":"👁"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginBottom:16, padding:"9px 13px", background:"rgba(220,38,38,0.12)", border:"1px solid rgba(220,38,38,0.25)", borderRadius:8, fontSize:12, color:"#FCA5A5" }}>
              ⚠ {error}
            </div>
          )}

          {/* Login button */}
          <button onClick={handleLogin} disabled={loading}
            style={{ width:"100%", padding:"13px 0", background:loading?"rgba(37,99,235,0.5)":"linear-gradient(135deg,#2563EB,#3B82F6)", border:"none", borderRadius:10, fontSize:14, fontWeight:700, color:"#FFFFFF", cursor:loading?"not-allowed":"pointer", boxShadow:loading?"none":"0 4px 16px rgba(37,99,235,0.35)", transition:"all 0.2s", letterSpacing:"0.01em" }}>
            {loading ? (
              <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <span style={{ display:"inline-block", width:14, height:14, border:"2px solid rgba(255,255,255,0.4)", borderTopColor:"white", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
                로그인 중...
              </span>
            ) : "로그인"}
          </button>

          <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>
        </div>

        {/* 빠른 로그인 — 폼 자동완성용 (Supabase에 동일 이메일 계정 필요) */}
        <div style={{ marginTop:20, padding:"16px 20px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12 }}>
          <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:10, letterSpacing:"0.04em" }}>테스트 계정 (비밀번호: 1234)</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {LOGIN_ACCOUNTS.map((acc, i) => (
              <button key={i} onClick={() => quickLogin(acc)}
                style={{ fontSize:11, color:"#94A3B8", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"4px 10px", cursor:"pointer", transition:"all 0.15s" }}
                onMouseEnter={e=>{ (e.target as HTMLButtonElement).style.background="rgba(37,99,235,0.15)"; (e.target as HTMLButtonElement).style.color="#93C5FD" }}
                onMouseLeave={e=>{ (e.target as HTMLButtonElement).style.background="rgba(255,255,255,0.05)"; (e.target as HTMLButtonElement).style.color="#94A3B8" }}>
                {acc.member.name} ({acc.member.role})
              </button>
            ))}
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:"#334155" }}>
          © 2025 ForecastAI · Anthropic 기반
        </div>
      </div>
    </div>
  )
}
