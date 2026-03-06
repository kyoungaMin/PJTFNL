'use client'
import React, { useState, useEffect } from 'react'
import { T, NAV_STRUCTURE, ALL_MEMBERS, ROLE_LABEL, SEARCH_INDEX, TK, type Member, type RoleType } from '@/lib/data'
import { Badge, Btn } from '@/components/ui'

export function Sidebar({ page, setPage, collapsed, onToggle, currentUser }: { page:string, setPage:(p:string)=>void, collapsed:boolean, onToggle:()=>void, currentUser?: import('@/lib/data').Member|null }) {
  const [openGroups, setOpenGroups] = useState({"재고 관리":true,"수요예측":true,"최적화":true,"외부 지표":true});
  const groups = [...new Set(NAV_STRUCTURE.filter(n=>n.parent).map(n=>n.parent))];
  const grouped = {
    top:    NAV_STRUCTURE.filter(n=>!n.parent && n.id!=="admin"),
    groups: groups.map(g=>({ name:g, items:NAV_STRUCTURE.filter(n=>n.parent===g) })),
    bottom: NAV_STRUCTURE.filter(n=>n.id==="admin"),
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
    <div style={{ width:collapsed?54:220, background:T.sidebarBg, borderRight:`1px solid ${T.sidebarBd}`, display:"flex", flexDirection:"column", transition:"width 0.22s ease", flexShrink:0, overflow:"hidden", position:"relative" }}>
      {/* Logo */}
      <div style={{ padding:collapsed?"18px 0":"18px 18px", borderBottom:`1px solid ${T.sidebarBd}`, display:"flex", alignItems:"center", gap:10, justifyContent:collapsed?"center":"flex-start" }}>
        <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, background:"linear-gradient(135deg,#3B82F6,#1D4ED8)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff" }}>F</div>
        {!collapsed && <div>
          <div style={{ fontSize:13, fontWeight:800, color:"#FFFFFF", lineHeight:1 }}>ForecastAI</div>
          <div style={{ fontSize:9, color:T.sidebarSub, letterSpacing:"0.07em", marginTop:3, textTransform:"uppercase" }}>Demand Platform</div>
        </div>}
      </div>

      <nav style={{ flex:1, padding:"10px 0", overflowY:"auto" }}>
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
        <div style={{ height:1, background:T.sidebarBd, margin:"8px 16px" }}/>
        {grouped.bottom.map(item=><NavItem key={item.id} item={item}/>)}
      </nav>

      {!collapsed && (
        <div style={{ padding:"14px 18px", borderTop:`1px solid ${T.sidebarBd}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#3B82F6,#7C3AED)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>나</div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"#E2E8F0" }}>{currentUser?.name} {ROLE_LABEL[currentUser?.role as keyof typeof ROLE_LABEL]}</div>
              <div style={{ fontSize:10, color:T.sidebarSub }}>Manager · 수원 1공장</div>
            </div>
          </div>
        </div>
      )}

      <button onClick={onToggle} style={{ position:"absolute", top:20, right:-11, width:22, height:22, borderRadius:"50%", background:"#2D4470", border:`1px solid ${T.sidebarBd}`, color:T.sidebarTxt, fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10 }}>
        {collapsed?"›":"‹"}
      </button>
    </div>
  );
}

export function Header({ currentUser, setCurrentUser, setPage }) {
  const [alertOpen, setAlertOpen] = useState(false);
  const [userOpen,  setUserOpen]  = useState(false);

  const closeAll = () => { setAlertOpen(false); setUserOpen(false); };

  useEffect(() => {
    const h = e => { if (!e.target.closest("[data-dropdown]")) closeAll(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div style={{ height:58, background:"#FFFFFF", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"flex-end", padding:"0 24px", flexShrink:0, position:"relative", zIndex:50 }}>

      <div style={{ display:"flex", alignItems:"center", gap:14 }}>

        {/* Alert bell */}
        <div data-dropdown style={{ position:"relative" }}>
          <button onClick={()=>{ setAlertOpen(p=>!p); setUserOpen(false); }}
            style={{ position:"relative", background:"none", border:"none", cursor:"pointer", padding:4, fontSize:18, display:"flex", outline:"none" }}>
            🔔
            <span style={{ position:"absolute", top:0, right:0, width:14, height:14, background:T.red, borderRadius:"50%", fontSize:8, fontWeight:700, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", border:"2px solid white" }}>3</span>
          </button>
          {alertOpen && (
            <div style={{ position:"absolute", top:44, right:0, width:308, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, boxShadow:"0 8px 32px rgba(15,23,42,0.14)", overflow:"hidden" }}>
              <div style={{ padding:"12px 16px", borderBottom:`1px solid ${T.border}`, fontSize:12, fontWeight:700, color:T.text1, display:"flex", justifyContent:"space-between" }}>
                알림 <span style={{ color:T.red }}>3건</span>
              </div>
              {[{t:"risk",m:"SKU-0421 E등급 전환 — 즉시 조치 필요",time:"09:10"},{t:"warn",m:"SCM 동기화 지연 감지 (07:30)",time:"07:32"},{t:"info",m:"주간 AI 예측 업데이트 완료 (504 SKU)",time:"03:05"}].map((a,i)=>(
                <div key={i} style={{ padding:"11px 16px", borderBottom:i<2?`1px solid ${T.border}`:"none", display:"flex", gap:10, alignItems:"flex-start", cursor:"pointer" }}
                  onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:a.t==="risk"?T.redSoft:a.t==="warn"?T.amberSoft:T.blueSoft, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>
                    {a.t==="risk"?"🔴":a.t==="warn"?"🟡":"🔵"}
                  </div>
                  <div><div style={{ fontSize:12, color:T.text1, lineHeight:1.4 }}>{a.m}</div><div style={{ fontSize:10, color:T.text3, marginTop:3 }}>{a.time}</div></div>
                </div>
              ))}
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
              <div style={{ padding:"7px 14px 3px", fontSize:10, fontWeight:700, color:T.text3, letterSpacing:"0.06em", textTransform:"uppercase" }}>담당자 전환</div>
              {ALL_MEMBERS.filter(m=>m.id!==currentUser.id).map(m=>(
                <div key={m.id} onClick={()=>{ setCurrentUser(m); setUserOpen(false); }}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", transition:"background 0.1s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:m.grad, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>{m.initial}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:T.text1 }}>{m.name} {ROLE_LABEL[m.role]}</div>
                    <div style={{ fontSize:10, color:T.text3 }}>{m.dept} · {m.role}</div>
                  </div>
                  <span style={{ fontSize:10, color:T.blue, fontWeight:600 }}>전환</span>
                </div>
              ))}
              <div style={{ borderTop:`1px solid ${T.border}`, padding:"8px 10px", display:"flex", gap:6 }}>
                <button style={{ flex:1, padding:"7px 0", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, fontSize:11, color:T.text2, cursor:"pointer", fontWeight:600 }}>⚙ 내 설정</button>
                <button style={{ flex:1, padding:"7px 0", background:T.redSoft, border:`1px solid ${T.redMid}`, borderRadius:6, fontSize:11, color:T.red, cursor:"pointer", fontWeight:600 }}>로그아웃</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}