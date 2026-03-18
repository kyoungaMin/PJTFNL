'use client'
import React, { useState, useEffect } from 'react'
import { T, NAV_STRUCTURE, ROLE_LABEL, type Member } from '@/lib/data'
import { Badge, Btn } from '@/components/ui'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

export function Sidebar({ page, setPage, collapsed, currentUser }: { page:string, setPage:(p:string)=>void, collapsed:boolean, currentUser?: import('@/lib/data').Member|null }) {
  const [openGroups, setOpenGroups] = useState<Record<string,boolean>>({"재고 관리":true,"수요예측":true,"최적화":true,"외부 지표":true,"보고서":true,"관리자":true});
  const allGroups = Array.from(new Set(NAV_STRUCTURE.filter(n=>n.parent).map(n=>n.parent)));
  const grouped = {
    top:        NAV_STRUCTURE.filter(n=>!n.parent),
    groups:     allGroups.filter(g=>g!=='관리자').map(g=>({ name:g, items:NAV_STRUCTURE.filter(n=>n.parent===g) })),
    adminGroup: currentUser?.role === 'Admin'
      ? { name:'관리자', items: NAV_STRUCTURE.filter(n=>n.parent==='관리자') }
      : null,
  };

  const NavItem = ({ item }) => {
    const isActive = page===item.id;
    return (
      <div onClick={()=>setPage(item.id)} style={{
        display:"flex", alignItems:"center", justifyContent:collapsed?"center":"space-between",
        padding:collapsed?"10px 0":"8px 14px", margin:"1px 8px", borderRadius:7, cursor:"pointer",
        background:isActive?"rgba(255,255,255,0.12)":"transparent",
        borderLeft:isActive?"2px solid #60A5FA":"2px solid transparent",
        transition:"background 0.15s",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:isActive?"#93C5FD":T.sidebarSub, flexShrink:0 }}/>
          {!collapsed && <span style={{ fontSize:13, fontWeight:isActive?600:400, color:isActive?"#FFFFFF":T.sidebarTxt }}>{item.label}</span>}
        </div>
        {!collapsed && item.badge && <span style={{ fontSize:10, fontWeight:700, background:"rgba(239,68,68,0.25)", color:"#FCA5A5", borderRadius:8, padding:"1px 5px" }}>{item.badge}</span>}
      </div>
    );
  };

  return (
    <div style={{ width:collapsed?54:220, background:T.sidebarBg, borderRight:`1px solid ${T.sidebarBd}`, display:"flex", flexDirection:"column", transition:"width 0.22s ease", flexShrink:0, position:"relative", zIndex:20 }}>
      {/* Logo */}
      <div style={{ padding:collapsed?"18px 0":"18px 18px", borderBottom:`1px solid ${T.sidebarBd}`, display:"flex", alignItems:"center", gap:10, justifyContent:collapsed?"center":"flex-start" }}>
        <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, background:"linear-gradient(135deg,#3B82F6,#1D4ED8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff" }}>F</div>
        {!collapsed && <div>
          <div style={{ fontSize:13, fontWeight:800, color:"#FFFFFF", lineHeight:1 }}>ForecastAI</div>
          <div style={{ fontSize:9, color:T.sidebarSub, letterSpacing:"0.07em", marginTop:3, textTransform:"uppercase" }}>Demand Platform</div>
        </div>}
      </div>

      <nav style={{ flex:1, padding:"10px 0", overflowY:"auto", overflowX:"hidden" }}>
        {grouped.top.map(item=><NavItem key={item.id} item={item}/>)}
        {grouped.groups.map(g=>(
          <div key={g.name}>
            {!collapsed && (
              <div onClick={()=>setOpenGroups(p=>({...p,[g.name]:!p[g.name]}))} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 22px 4px", cursor:"pointer" }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.sidebarSub, letterSpacing:"0.07em", textTransform:"uppercase" }}>{g.name}</span>
                <span style={{ fontSize:9, color:T.sidebarSub }}>{openGroups[g.name]?"▲":"▼"}</span>
              </div>
            )}
            {(collapsed || openGroups[g.name]) && g.items.map(item=><NavItem key={item.id} item={item}/>)}
          </div>
        ))}
        {grouped.adminGroup && (
          <div>
            <div style={{ height:1, background:T.sidebarBd, margin:"8px 16px" }}/>
            {!collapsed && (
              <div onClick={()=>setOpenGroups(p=>({...p,'관리자':!p['관리자']}))} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 22px 4px", cursor:"pointer" }}>
                <span style={{ fontSize:10, fontWeight:700, color:T.sidebarSub, letterSpacing:"0.07em", textTransform:"uppercase" }}>관리자</span>
                <span style={{ fontSize:9, color:T.sidebarSub }}>{openGroups['관리자']?"▲":"▼"}</span>
              </div>
            )}
            {(collapsed || openGroups['관리자']) && grouped.adminGroup.items.map(item=><NavItem key={item.id} item={item}/>)}
          </div>
        )}
      </nav>

      {!collapsed && (
        <div style={{ padding:"14px 18px", borderTop:`1px solid ${T.sidebarBd}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:currentUser?.grad ?? "linear-gradient(135deg,#3B82F6,#7C3AED)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>{currentUser?.initial ?? '?'}</div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"#E2E8F0" }}>{currentUser?.name} {ROLE_LABEL[currentUser?.role as keyof typeof ROLE_LABEL]}</div>
              <div style={{ fontSize:10, color:T.sidebarSub }}>{currentUser?.dept}</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export function Header({ currentUser, setCurrentUser, setPage, alertCount = 0 }: {
  currentUser: import('@/lib/data').Member
  setCurrentUser: (m: import('@/lib/data').Member | null) => void
  setPage: (p: string) => void
  alertCount?: number
}) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [userOpen,  setUserOpen]  = useState(false);
  const [alertItems, setAlertItems] = useState<{type:string;message:string;time:string;page?:string}[]>([]);
  const [alertLoaded, setAlertLoaded] = useState(false);

  // 비밀번호 변경 모달
  const [pwOpen,    setPwOpen]    = useState(false);
  const [pw1,       setPw1]       = useState('');
  const [pw2,       setPw2]       = useState('');
  const [pwMsg,     setPwMsg]     = useState('');
  const [pwOk,      setPwOk]      = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const openPwModal = () => {
    setPwOpen(true); setUserOpen(false);
    setPw1(''); setPw2(''); setPwMsg(''); setPwOk(false);
  };

  const handlePwChange = async () => {
    if (!pw1)             { setPwMsg('새 비밀번호를 입력해 주세요.'); return }
    if (pw1.length < 6)   { setPwMsg('비밀번호는 최소 6자 이상이어야 합니다.'); return }
    if (pw1 !== pw2)      { setPwMsg('비밀번호가 일치하지 않습니다.'); return }
    setPwLoading(true); setPwMsg('');
    const { error } = await supabaseBrowser.auth.updateUser({ password: pw1 })
    if (error) {
      const errMap: Record<string, string> = {
        'Password should be at least 6 characters.': '비밀번호는 최소 6자 이상이어야 합니다.',
        'New password should be different from the old password.': '기존 비밀번호와 다른 비밀번호를 입력해 주세요.',
      }
      setPwMsg(errMap[error.message] ?? `오류: ${error.message}`)
    } else {
      setPwOk(true);
      setPwMsg('비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.')
      // 3초 후 로그아웃 → 새 비밀번호로 로그인하도록 유도
      setTimeout(async () => {
        sessionStorage.removeItem('session_active')
        await supabaseBrowser.auth.signOut()
        window.location.href = '/'
      }, 3000)
    }
    setPwLoading(false);
  };

  const handleLogout = async () => {
    sessionStorage.removeItem('session_active')
    await supabaseBrowser.auth.signOut()
    window.location.href = '/'
  };

  const closeAll = () => { setAlertOpen(false); setUserOpen(false); };

  useEffect(() => {
    const h = e => { if (!e.target.closest("[data-dropdown]")) closeAll(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // 벨 클릭 시 최초 1회만 실데이터 로드
  const handleAlertOpen = () => {
    setAlertOpen(p => !p);
    setUserOpen(false);
    if (!alertLoaded) {
      fetch('/api/alerts')
        .then(r => r.json())
        .then(d => { if (d.alerts?.length) setAlertItems(d.alerts) })
        .catch(() => {})
        .finally(() => setAlertLoaded(true))
    }
  };

  return (
    <>
    <div style={{ height:58, background:"#FFFFFF", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"flex-end", padding:"0 24px", flexShrink:0, position:"relative", zIndex:50 }}>

      <div style={{ display:"flex", alignItems:"center", gap:14 }}>

        {/* Alert bell */}
        <div data-dropdown style={{ position:"relative" }}>
          <button onClick={handleAlertOpen}
            style={{ position:"relative", background:"none", border:"none", cursor:"pointer", padding:"6px 8px", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", outline:"none", borderRadius:8, lineHeight:1 }}>
            🔔
            {alertCount > 0 && (
              <span style={{ position:"absolute", top:2, right:2, width:9, height:9, background:"#EF4444", borderRadius:"50%", border:"2.5px solid white", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
            )}
          </button>
          {alertOpen && (
            <div style={{ position:"absolute", top:44, right:0, width:320, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, boxShadow:"0 8px 32px rgba(15,23,42,0.14)", overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:`1px solid ${T.border}`, fontSize:12, fontWeight:700, color:T.text1, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span>알림</span>
                <span style={{ fontSize:10, color:T.green, background:T.greenSoft, border:`1px solid ${T.greenMid}`, borderRadius:4, padding:"1px 6px", fontWeight:600 }}>✓ DB 실데이터</span>
              </div>
              {!alertLoaded ? (
                <div style={{ padding:"20px 16px", textAlign:"center", fontSize:12, color:T.text3 }}>로딩 중...</div>
              ) : alertItems.length === 0 ? (
                <div style={{ padding:"20px 16px", textAlign:"center", fontSize:12, color:T.text3 }}>알림 없음</div>
              ) : (
                alertItems.map((a, i) => (
                  <div key={i} style={{ padding:"11px 16px", borderBottom:i<alertItems.length-1?`1px solid ${T.border}`:"none", display:"flex", gap:10, alignItems:"flex-start", cursor: a.page ? "pointer" : "default" }}
                    onClick={() => { if (a.page) { setPage(a.page); closeAll(); } }}
                    onMouseEnter={e=>{ (e.currentTarget as HTMLDivElement).style.background=T.surface2 }}
                    onMouseLeave={e=>{ (e.currentTarget as HTMLDivElement).style.background="transparent" }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:a.type==="risk"?T.redSoft:a.type==="warn"?T.amberSoft:T.blueSoft, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>
                      {a.type==="risk"?"🔴":a.type==="warn"?"🟡":"🔵"}
                    </div>
                    <div>
                      <div style={{ fontSize:12, color:T.text1, lineHeight:1.4 }}>{a.message}</div>
                      <div style={{ fontSize:10, color:T.text3, marginTop:3 }}>{a.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* User switcher */}
        <div data-dropdown style={{ position:"relative" }}>
          <button onClick={()=>{ setUserOpen(p=>!p); setAlertOpen(false); }}
            style={{ display:"flex", alignItems:"center", gap:8, background:userOpen?T.blueSoft:T.surface2, border:`1px solid ${userOpen?T.blue:T.border}`, borderRadius:20, padding:"5px 11px 5px 5px", cursor:"pointer", transition:"all 0.15s", outline:"none" }}>
            <div style={{ width:28, height:28, borderRadius:"50%", background:currentUser.grad, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff", flexShrink:0 }}>{currentUser.initial}</div>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:12, fontWeight:700, color:userOpen?T.blue:T.text1, lineHeight:1.1 }}>{currentUser.name} {ROLE_LABEL[currentUser.role]}</div>
              <div style={{ fontSize:10, color:T.text3 }}>{currentUser.dept}</div>
            </div>
            <span style={{ fontSize:9, color:T.text3, transform:userOpen?"rotate(180deg)":"rotate(0)", transition:"transform 0.15s", display:"inline-block" }}>▼</span>
          </button>

          {userOpen && (
            <div style={{ position:"absolute", top:52, right:0, width:268, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, boxShadow:"0 8px 28px rgba(15,23,42,0.13)", overflow:"hidden" }}>
              <div style={{ padding:"14px 16px", background:`linear-gradient(135deg,${T.blueSoft},#F5F3FF)`, borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:40, height:40, borderRadius:"50%", background:currentUser.grad, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:"#fff", flexShrink:0 }}>{currentUser.initial}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text1 }}>{currentUser.name} {ROLE_LABEL[currentUser.role]}</div>
                    <div style={{ fontSize:11, color:T.text3 }}>{currentUser.email}</div>
                    <div style={{ marginTop:5 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:T.blue, background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:4, padding:"2px 7px" }}>{currentUser.role}</span>
                      <span style={{ fontSize:10, color:T.text3, marginLeft:6 }}>{currentUser.dept}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ borderTop:`1px solid ${T.border}`, padding:"8px 10px", display:"flex", flexDirection:"column", gap:6 }}>
                {currentUser.role === 'Admin' && (
                  <button onClick={()=>{ setPage('admin'); setUserOpen(false); }} style={{ width:"100%", padding:"7px 0", background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:6, fontSize:11, color:T.blue, cursor:"pointer", fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:5 }}>
                    ⚙️ 관리자 설정
                  </button>
                )}
                <button onClick={openPwModal} style={{ width:"100%", padding:"7px 0", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, fontSize:11, color:T.text2, cursor:"pointer", fontWeight:600 }}>🔑 비밀번호 변경</button>
                <button onClick={handleLogout} style={{ width:"100%", padding:"7px 0", background:T.redSoft, border:`1px solid ${T.redMid}`, borderRadius:6, fontSize:11, color:T.red, cursor:"pointer", fontWeight:600 }}>로그아웃</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* 비밀번호 변경 모달 — fixed이므로 헤더 div 밖에 위치 */}
    {pwOpen && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}
        onClick={() => setPwOpen(false)}>
        <div onClick={e => e.stopPropagation()}
          style={{ background:'#1E293B', border:'1px solid rgba(255,255,255,0.12)', borderRadius:16, padding:'28px 28px', width:360, boxShadow:'0 20px 48px rgba(0,0,0,0.5)', fontFamily:"'Pretendard','Noto Sans KR',sans-serif" }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#F1F5F9', marginBottom:6 }}>비밀번호 변경</div>
          <div style={{ fontSize:12, color:'#64748B', marginBottom:20 }}>새로 사용할 비밀번호를 입력해 주세요.</div>

          {!pwOk && (
            <>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#94A3B8', marginBottom:7 }}>새 비밀번호</div>
                <input type="password" value={pw1} onChange={e => setPw1(e.target.value)}
                  placeholder="새 비밀번호 (6자 이상)"
                  style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:9, padding:'11px 13px', fontSize:13, color:'#F1F5F9', outline:'none', boxSizing:'border-box' }}
                />
              </div>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'#94A3B8', marginBottom:7 }}>비밀번호 확인</div>
                <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                  placeholder="비밀번호 다시 입력"
                  onKeyDown={e => { if (e.key === 'Enter') handlePwChange() }}
                  style={{ width:'100%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:9, padding:'11px 13px', fontSize:13, color:'#F1F5F9', outline:'none', boxSizing:'border-box' }}
                />
              </div>
            </>
          )}

          {pwMsg && (
            <div style={{ marginBottom:16, padding:'9px 12px', borderRadius:7,
              background: pwOk ? 'rgba(5,150,105,0.15)' : 'rgba(220,38,38,0.15)',
              color:      pwOk ? '#6EE7B7' : '#FCA5A5',
              border:     `1px solid ${pwOk ? 'rgba(5,150,105,0.3)' : 'rgba(220,38,38,0.3)'}`,
              fontSize:12 }}>
              {pwMsg}
            </div>
          )}

          {!pwOk && (
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setPwOpen(false)}
                style={{ flex:1, padding:'10px 0', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:9, fontSize:13, color:'#94A3B8', cursor:'pointer' }}>
                취소
              </button>
              <button onClick={handlePwChange} disabled={pwLoading}
                style={{ flex:2, padding:'10px 0', background:'linear-gradient(135deg,#2563EB,#3B82F6)', border:'none', borderRadius:9, fontSize:13, fontWeight:700, color:'white', cursor:pwLoading?'not-allowed':'pointer', opacity:pwLoading?0.6:1 }}>
                {pwLoading ? '변경 중…' : '비밀번호 변경'}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
}