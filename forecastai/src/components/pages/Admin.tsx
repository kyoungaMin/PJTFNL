'use client'
import React, { useState } from 'react'
import { T, card, sectionTitle, USERS, ROLE_LABEL, ROLE_PERMISSIONS, type RoleType } from '@/lib/data'
import { Badge, StatusBadge, PageHeader, Btn, FilterBar, Select, SearchInput, Table } from '@/components/ui'

export default function PageAdmin() {
  const [users, setUsers]   = useState(USERS);
  const [roleF, setRoleF]   = useState("전체");
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState(false);
  const [editRole, setEditRole] = useState({});

  const filtered = users.filter(u=>{
    const mr = roleF==="전체" || u.role===roleF;
    const ms = u.name.includes(search) || u.email.includes(search);
    return mr && ms;
  });
  const roleCounts = ["Admin","Manager","Analyst","Viewer"].reduce((acc,r)=>({...acc,[r]:users.filter(u=>u.role===r).length}),{});
  const roleColors = { Admin:T.purple, Manager:T.blue, Analyst:T.green, Viewer:T.text3 };

  return (
    <div>
      <PageHeader title="사용자 역할 관리" sub="RBAC 기반 접근 권한 관리 (Admin / Manager / Analyst / Viewer)"
        action={<Btn onClick={()=>setInvite(true)}>+ 사용자 초대</Btn>}/>

      {/* Role counts */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        {["Admin","Manager","Analyst","Viewer"].map(r=>(
          <div key={r} onClick={()=>setRoleF(roleF===r?"전체":r)} style={{
            ...card, padding:"16px 18px", cursor:"pointer",
            background:roleF===r?`${roleColors[r]}10`:T.surface,
            border:`1px solid ${roleF===r?roleColors[r]+"40":T.border}`,
            transition:"all 0.15s",
          }}>
            <div style={{ fontSize:24, fontWeight:800, color:roleColors[r], fontFamily:"'IBM Plex Mono',monospace" }}>{roleCounts[r]}</div>
            <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginTop:4 }}>{r}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="이름 / 이메일 검색"/>
        <Select value={roleF} onChange={setRoleF} options={["전체","Admin","Manager","Analyst","Viewer"]}/>
        <span style={{ marginLeft:"auto", fontSize:11, color:T.text3 }}>{filtered.length}명</span>
      </FilterBar>

      <div style={card}>
        <Table
          headers={["이름","이메일","역할","부서","마지막 로그인","상태",""]}
          rows={filtered.map(u=>({ cells:[
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:`linear-gradient(135deg,${roleColors[u.role]},${roleColors[u.role]}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color:"white", flexShrink:0 }}>{u.name[0]}</div>
              <span style={{ fontWeight:600, color:T.text1 }}>{u.name}</span>
            </div>,
            <span style={{ fontSize:12, color:T.text3 }}>{u.email}</span>,
            editRole[u.id] ? (
              <select value={u.role} onChange={e=>{setUsers(p=>p.map(x=>x.id===u.id?{...x,role:e.target.value as RoleType}:x));setEditRole(p=>({...p,[u.id]:false}));}}
                style={{ fontSize:11, padding:"3px 8px", border:`1px solid ${T.border}`, borderRadius:5, outline:"none" }}>
                {["Admin","Manager","Analyst","Viewer"].map(r=><option key={r}>{r}</option>)}
              </select>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <Badge color={roleColors[u.role]} bg={`${roleColors[u.role]}15`} border={`${roleColors[u.role]}30`}>{u.role}</Badge>
                <button onClick={()=>setEditRole(p=>({...p,[u.id]:true}))} style={{ fontSize:10, color:T.blue, background:"none", border:"none", cursor:"pointer" }}>변경</button>
              </div>
            ),
            <span style={{ fontSize:12, color:T.text2 }}>{u.dept}</span>,
            <span style={{ fontSize:12, color:T.text3 }}>{u.lastLogin}</span>,
            <StatusBadge status={u.status}/>,
            <button style={{ fontSize:11, color:T.red, background:"none", border:"none", cursor:"pointer" }}>비활성화</button>,
          ]}))}
        />
      </div>

      {/* Permission matrix */}
      <div style={{ ...card, marginTop:16 }}>
        <div style={sectionTitle}>역할별 권한 요약</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:T.surface2, borderBottom:`2px solid ${T.border}` }}>
              {["기능",..."Admin Manager Analyst Viewer".split(" ")].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:h==="기능"?"left":"center", fontSize:11, fontWeight:700, color:T.text3 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[["대시보드 조회","dashboard"],["예측 조회","forecast"],["액션 승인","action"],["데이터 입력","dataInput"],["사용자 관리","userMgmt"]].map(([lbl,key])=>(
              <tr key={key} style={{ borderBottom:`1px solid ${T.border}` }}>
                <td style={{ padding:"10px 14px", fontWeight:500, color:T.text2 }}>{lbl}</td>
                {["Admin","Manager","Analyst","Viewer"].map(r=>(
                  <td key={r} style={{ padding:"10px 14px", textAlign:"center" }}>
                    {ROLE_PERMISSIONS[r][key]
                      ? <span style={{ color:T.green, fontSize:16 }}>✓</span>
                      : <span style={{ color:T.border, fontSize:14 }}>─</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      {invite && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.45)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setInvite(false)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:28, width:380, boxShadow:"0 20px 48px rgba(15,23,42,0.18)" }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, marginBottom:20 }}>사용자 초대</div>
            {[["이메일","email","user@company.com"],["이름","text","홍길동"],].map(([lbl,type,ph])=>(
              <div key={lbl} style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>{lbl}</div>
                <input type={type} placeholder={ph} style={{ width:"100%", padding:"8px 12px", border:`1px solid ${T.borderMid}`, borderRadius:7, fontSize:12, outline:"none", boxSizing:"border-box" }}/>
              </div>
            ))}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>역할</div>
              <Select value="Analyst" onChange={()=>{}} options={["Admin","Manager","Analyst","Viewer"]}/>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn variant="secondary" onClick={()=>setInvite(false)} style={{ flex:1 }}>취소</Btn>
              <Btn onClick={()=>setInvite(false)} style={{ flex:2 }}>초대 이메일 발송</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}