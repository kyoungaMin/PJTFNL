'use client'
import React, { useState, useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

// 비밀번호 재설정 페이지
// — 이메일의 "비밀번호 변경" 링크 클릭 시 이 페이지로 리다이렉트됨
// — Supabase가 URL 해시(#access_token=...)로 세션을 자동 복원함
export default function ResetPasswordPage() {
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [msg,       setMsg]       = useState('')
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)
  const [ready,     setReady]     = useState(false)

  // Supabase가 URL 해시에서 세션 복원하는 것을 기다림
  useEffect(() => {
    // 이미 세션이 있는 경우 (페이지 로드 시 해시가 먼저 처리된 경우)
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })

    // 또는 PASSWORD_RECOVERY 이벤트를 기다림
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async () => {
    if (!password)              { setMsg('새 비밀번호를 입력해 주세요.'); return }
    if (password.length < 4)    { setMsg('비밀번호는 최소 4자 이상이어야 합니다.'); return }
    if (password !== password2) { setMsg('비밀번호가 일치하지 않습니다.'); return }

    setLoading(true)
    setMsg('')

    const { error } = await supabaseBrowser.auth.updateUser({ password })

    if (error) {
      setMsg(`오류: ${error.message}`)
    } else {
      setDone(true)
      setMsg('비밀번호가 변경되었습니다! 3초 후 로그인 화면으로 이동합니다.')
      setTimeout(() => { window.location.href = '/' }, 3000)
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0F172A 0%,#1B2B4B 50%,#0F172A 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Pretendard','Noto Sans KR',sans-serif" }}>
      <div style={{ width:'100%', maxWidth:400, padding:'0 24px' }}>
        {/* 로고 */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:48, height:48, borderRadius:14, background:'linear-gradient(135deg,#2563EB,#7C3AED)', marginBottom:12 }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:'#FFFFFF' }}>ForecastAI</div>
        </div>

        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:18, padding:'32px 28px', backdropFilter:'blur(12px)' }}>
          <div style={{ fontSize:17, fontWeight:700, color:'#F1F5F9', marginBottom:6 }}>새 비밀번호 설정</div>
          <div style={{ fontSize:12, color:'#64748B', marginBottom:24 }}>
            {ready ? '새로 사용할 비밀번호를 입력해 주세요.' : '링크를 확인 중입니다…'}
          </div>

          {!ready && (
            <div style={{ textAlign:'center', padding:'20px 0', color:'#64748B', fontSize:13 }}>
              잠시만 기다려 주세요…
            </div>
          )}

          {ready && !done && (
            <>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#94A3B8', marginBottom:7 }}>새 비밀번호</div>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="새 비밀번호 (4자 이상)"
                  style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:10, padding:'12px 14px', fontSize:13, color:'#F1F5F9', outline:'none', boxSizing:'border-box' }}
                />
              </div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#94A3B8', marginBottom:7 }}>비밀번호 확인</div>
                <input
                  type="password" value={password2} onChange={e => setPassword2(e.target.value)}
                  placeholder="비밀번호 다시 입력"
                  onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
                  style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:10, padding:'12px 14px', fontSize:13, color:'#F1F5F9', outline:'none', boxSizing:'border-box' }}
                />
              </div>

              {msg && (
                <div style={{ marginBottom:16, padding:'9px 13px', background:'rgba(220,38,38,0.12)', border:'1px solid rgba(220,38,38,0.25)', borderRadius:8, fontSize:12, color:'#FCA5A5' }}>
                  {msg}
                </div>
              )}

              <button onClick={handleSubmit} disabled={loading}
                style={{ width:'100%', padding:'13px 0', background:loading?'rgba(37,99,235,0.5)':'linear-gradient(135deg,#2563EB,#3B82F6)', border:'none', borderRadius:10, fontSize:14, fontWeight:700, color:'#FFFFFF', cursor:loading?'not-allowed':'pointer', boxShadow:'0 4px 16px rgba(37,99,235,0.35)' }}>
                {loading ? '변경 중…' : '비밀번호 변경'}
              </button>
            </>
          )}

          {done && (
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:13, color:'#6EE7B7' }}>{msg}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
