'use client'
import React, { useState, useEffect, useRef } from 'react'
import { T, card, sectionTitle, ROLE_PERMISSIONS, type Member, type RoleType } from '@/lib/data'
import { Badge, StatusBadge, PageHeader, Btn, FilterBar, Select, SearchInput, Table } from '@/components/ui'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

// ─── DB에서 받아오는 사용자 타입 ───────────────────────────────────────────────
type DbUser = {
  id: string
  email: string
  display_name: string | null
  role: string          // lowercase: 'admin' | 'manager' | 'analyst' | 'viewer'
  department: string | null
  is_active: boolean
  last_login_at: string | null
  company_id: string | null
  org_id: string | null
}

// ─── 헬퍼 함수 ────────────────────────────────────────────────────────────────
const toDisplayRole = (r: string): RoleType => {
  const map: Record<string, RoleType> = { admin: 'Admin', manager: 'Manager', analyst: 'Analyst', viewer: 'Viewer' }
  return map[r?.toLowerCase()] ?? 'Viewer'
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return '없음'
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffDays === 0) return '오늘 ' + d.toTimeString().slice(0, 5)
  if (diffDays === 1) return '어제'
  if (diffDays < 7)  return `${diffDays}일 전`
  return d.toLocaleDateString('ko-KR', { month:'short', day:'numeric' })
}

// ─── CSV 파싱 (이메일,이름,역할,부서) ─────────────────────────────────────────
type CsvRow = { email: string; display_name: string; role: string; department: string }

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n').filter(Boolean)
  const rows: CsvRow[] = []
  // 첫 줄이 헤더인지 판단 (이메일 형식 아니면 헤더로 간주)
  const startIdx = lines[0]?.includes('@') ? 0 : 1
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    if (!cols[0]?.includes('@')) continue
    rows.push({
      email:        cols[0] ?? '',
      display_name: cols[1] ?? '',
      role:         cols[2] ?? 'viewer',
      department:   cols[3] ?? '',
    })
  }
  return rows
}

// ─── CSV 템플릿 다운로드 ──────────────────────────────────────────────────────
function downloadTemplate() {
  const content = '이메일,이름,역할,부서\nkim@company.com,김철수,manager,생산계획팀\nlee@company.com,이영희,analyst,구매팀\n'
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = '직원등록_양식.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function PageAdmin({ currentUser }: { currentUser: Member }) {
  const [dbUsers,   setDbUsers]   = useState<DbUser[]>([])
  const [loading,   setLoading]   = useState(true)
  const [token,     setToken]     = useState('')
  const [roleF,     setRoleF]     = useState('전체')
  const [search,    setSearch]    = useState('')

  // 단일 초대 모달
  const [inviteOpen,  setInviteOpen]  = useState(false)
  const [invEmail,    setInvEmail]    = useState('')
  const [invName,     setInvName]     = useState('')
  const [invRole,     setInvRole]     = useState('Analyst')
  const [invDept,     setInvDept]     = useState('')
  const [invLoading,  setInvLoading]  = useState(false)
  const [invMsg,      setInvMsg]      = useState('')

  // 일괄 초대 모달
  const [bulkOpen,    setBulkOpen]    = useState(false)
  const [csvRows,     setCsvRows]     = useState<CsvRow[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMsg,     setBulkMsg]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // 역할 인라인 편집
  const [editRole, setEditRole] = useState<Record<string, boolean>>({})

  const roleColors: Record<string, string> = {
    Admin: T.purple, Manager: T.blue, Analyst: T.green, Viewer: T.text3,
  }

  // ─── 세션 토큰 로드 ────────────────────────────────────────────────────────
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? '')
    })
  }, [])

  // ─── 사용자 목록 조회 ──────────────────────────────────────────────────────
  const fetchUsers = async (t: string) => {
    if (!t) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDbUsers(Array.isArray(data) ? data : [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (token) fetchUsers(token) }, [token])

  // ─── 역할 변경 ─────────────────────────────────────────────────────────────
  const handleRoleChange = async (userId: string, newRole: string) => {
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, userId, role: newRole.toLowerCase() }),
    })
    if (res.ok) {
      setDbUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole.toLowerCase() } : u))
    }
    setEditRole(prev => ({ ...prev, [userId]: false }))
  }

  // ─── 비활성화/활성화 ────────────────────────────────────────────────────────
  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, userId, is_active: !currentActive }),
    })
    if (res.ok) {
      setDbUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentActive } : u))
    }
  }

  // ─── 단일 초대 제출 ────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!invEmail) { setInvMsg('이메일을 입력해 주세요.'); return }
    setInvLoading(true); setInvMsg('')
    const res = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        email: invEmail,
        display_name: invName,
        role: invRole.toLowerCase(),
        department: invDept,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setInvMsg(`✓ ${invEmail} 초대 완료! 이메일을 확인해 주세요.`)
      await fetchUsers(token)
      setInvEmail(''); setInvName(''); setInvDept(''); setInvRole('Analyst')
    } else {
      setInvMsg(`오류: ${data.error ?? '초대 실패'}`)
    }
    setInvLoading(false)
  }

  // ─── CSV 파일 선택 ─────────────────────────────────────────────────────────
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setCsvRows(parseCsv(text))
      setBulkMsg('')
    }
    reader.readAsText(file, 'utf-8')
  }

  // ─── 일괄 초대 제출 ────────────────────────────────────────────────────────
  const handleBulkInvite = async () => {
    if (csvRows.length === 0) { setBulkMsg('CSV 파일을 먼저 업로드해 주세요.'); return }
    setBulkLoading(true); setBulkMsg('')
    const res = await fetch('/api/admin/invite-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token, users: csvRows }),
    })
    const data = await res.json()
    if (res.ok) {
      setBulkMsg(`✓ 성공 ${data.successCount}명 / 실패 ${data.failCount}명`)
      await fetchUsers(token)
      setCsvRows([])
      if (fileRef.current) fileRef.current.value = ''
    } else {
      setBulkMsg(`오류: ${data.error ?? '일괄 초대 실패'}`)
    }
    setBulkLoading(false)
  }

  // ─── 필터링 ────────────────────────────────────────────────────────────────
  const filtered = dbUsers.filter(u => {
    const displayRole = toDisplayRole(u.role)
    const mr = roleF === '전체' || displayRole === roleF
    const name = u.display_name ?? ''
    const ms = name.includes(search) || u.email.includes(search)
    return mr && ms
  })

  const roleCounts = (['Admin', 'Manager', 'Analyst', 'Viewer'] as RoleType[]).reduce(
    (acc, r) => ({ ...acc, [r]: dbUsers.filter(u => toDisplayRole(u.role) === r).length }),
    {} as Record<string, number>
  )

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="사용자 역할 관리"
        sub="회사 단위 RBAC — Admin / Manager / Analyst / Viewer"
        action={
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="secondary" onClick={() => setBulkOpen(true)}>엑셀 일괄 등록</Btn>
            <Btn onClick={() => { setInviteOpen(true); setInvMsg('') }}>+ 직원 추가</Btn>
          </div>
        }
      />

      {/* 역할별 카운트 카드 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {(['Admin','Manager','Analyst','Viewer'] as RoleType[]).map(r => (
          <div key={r} onClick={() => setRoleF(roleF === r ? '전체' : r)} style={{
            ...card, padding:'16px 18px', cursor:'pointer',
            background: roleF === r ? `${roleColors[r]}10` : T.surface,
            border: `1px solid ${roleF === r ? roleColors[r] + '40' : T.border}`,
            transition:'all 0.15s',
          }}>
            <div style={{ fontSize:24, fontWeight:800, color:roleColors[r], fontFamily:"'IBM Plex Mono',monospace" }}>
              {loading ? '…' : roleCounts[r] ?? 0}
            </div>
            <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginTop:4 }}>{r}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="이름 / 이메일 검색"/>
        <Select value={roleF} onChange={setRoleF} options={['전체','Admin','Manager','Analyst','Viewer']}/>
        <span style={{ marginLeft:'auto', fontSize:11, color:T.text3 }}>{filtered.length}명</span>
      </FilterBar>

      {/* 사용자 테이블 */}
      <div style={card}>
        {loading ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:T.text3, fontSize:13 }}>불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:T.text3, fontSize:13 }}>
            {dbUsers.length === 0 ? '등록된 사용자가 없습니다. 직원을 초대해 주세요.' : '검색 결과가 없습니다.'}
          </div>
        ) : (
          <Table
            headers={['이름','이메일','역할','부서','조직(org)','마지막 로그인','상태','']}
            aligns={['left','left','center','center','center','center','center','center']}
            rows={filtered.map(u => {
              const displayRole = toDisplayRole(u.role)
              const name = u.display_name ?? u.email.split('@')[0]
              return { cells: [
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${roleColors[displayRole]},${roleColors[displayRole]}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'white', flexShrink:0 }}>
                    {name.charAt(0)}
                  </div>
                  <span style={{ fontWeight:600, color: u.is_active ? T.text1 : T.text3 }}>{name}</span>
                </div>,
                <span style={{ fontSize:12, color:T.text3 }}>{u.email}</span>,
                editRole[u.id] ? (
                  <select
                    defaultValue={displayRole}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    style={{ fontSize:11, padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:5, outline:'none' }}
                  >
                    {(['Admin','Manager','Analyst','Viewer'] as RoleType[]).map(r =>
                      <option key={r} value={r}>{r}</option>
                    )}
                  </select>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Badge color={roleColors[displayRole]} bg={`${roleColors[displayRole]}15`} border={`${roleColors[displayRole]}30`}>
                      {displayRole}
                    </Badge>
                    {u.id !== currentUser.id && (
                      <button onClick={() => setEditRole(p => ({ ...p, [u.id]: true }))}
                        style={{ fontSize:10, color:T.blue, background:'none', border:'none', cursor:'pointer' }}>변경</button>
                    )}
                  </div>
                ),
                <span style={{ fontSize:12, color:T.text2 }}>{u.department ?? '—'}</span>,
                <span style={{ fontSize:12, color:T.text3 }}>{(!u.org_id || u.org_id === 'default') ? '—' : u.org_id}</span>,
                <span style={{ fontSize:12, color:T.text3 }}>{formatLastLogin(u.last_login_at)}</span>,
                <StatusBadge status={u.is_active ? '활성' : '비활성'}/>,
                u.id !== currentUser.id ? (
                  <button
                    onClick={() => handleToggleActive(u.id, u.is_active)}
                    style={{ fontSize:11, color: u.is_active ? T.red : T.green, background:'none', border:'none', cursor:'pointer' }}
                  >
                    {u.is_active ? '비활성화' : '활성화'}
                  </button>
                ) : <span style={{ fontSize:11, color:T.text3 }}>—</span>,
              ]}
            })}
          />
        )}
      </div>

      {/* 권한 요약 매트릭스 */}
      <div style={{ ...card, marginTop:16 }}>
        <div style={sectionTitle}>역할별 권한 요약</div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:T.surface2, borderBottom:`2px solid ${T.border}` }}>
              {['기능',...'Admin Manager Analyst Viewer'.split(' ')].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:h==='기능'?'left':'center', fontSize:11, fontWeight:700, color:T.text3 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[['대시보드 조회','dashboard'],['예측 조회','forecast'],['액션 승인','action'],['데이터 입력','dataInput'],['사용자 관리','userMgmt']].map(([lbl,key]) => (
              <tr key={key} style={{ borderBottom:`1px solid ${T.border}` }}>
                <td style={{ padding:'10px 14px', fontWeight:500, color:T.text2 }}>{lbl}</td>
                {(['Admin','Manager','Analyst','Viewer'] as RoleType[]).map(r => (
                  <td key={r} style={{ padding:'10px 14px', textAlign:'center' }}>
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

      {/* ── 단일 초대 모달 ── */}
      {inviteOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setInviteOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:28, width:400, boxShadow:'0 20px 48px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, marginBottom:4 }}>직원 추가</div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:20 }}>계정이 즉시 생성됩니다. 기본 비밀번호는 <b>1234</b>이며, 직원이 로그인 후 변경할 수 있습니다.</div>

            {[
              { label:'이메일 *', value:invEmail, onChange:setInvEmail, type:'email', placeholder:'kim@company.com' },
              { label:'이름',    value:invName,  onChange:setInvName,  type:'text',  placeholder:'홍길동' },
              { label:'부서',    value:invDept,  onChange:setInvDept,  type:'text',  placeholder:'생산계획팀' },
            ].map(({ label, value, onChange, type, placeholder }) => (
              <div key={label} style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>{label}</div>
                <input type={type} value={value} onChange={e => onChange(e.target.value)}
                  placeholder={placeholder}
                  style={{ width:'100%', padding:'8px 12px', border:`1px solid ${T.borderMid}`, borderRadius:7, fontSize:12, outline:'none', boxSizing:'border-box' }}/>
              </div>
            ))}

            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.text2, marginBottom:6 }}>역할</div>
              <Select value={invRole} onChange={setInvRole} options={['Admin','Manager','Analyst','Viewer']}/>
            </div>

            {invMsg && (
              <div style={{ fontSize:12, color: invMsg.startsWith('✓') ? T.green : T.red, marginBottom:12, padding:'8px 12px', background: invMsg.startsWith('✓') ? T.greenSoft : T.redSoft, borderRadius:6 }}>
                {invMsg}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <Btn variant="secondary" onClick={() => setInviteOpen(false)} style={{ flex:1 }}>취소</Btn>
              <Btn onClick={handleInvite} style={{ flex:2 }} disabled={invLoading}>
                {invLoading ? '생성 중…' : '계정 생성 (기본 비밀번호 1234)'}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── 엑셀 일괄 초대 모달 ── */}
      {bulkOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setBulkOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:28, width:480, boxShadow:'0 20px 48px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, marginBottom:4 }}>엑셀 일괄 등록</div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:16 }}>CSV 파일로 최대 100명까지 한 번에 초대할 수 있습니다.</div>

            {/* CSV 형식 안내 */}
            <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:11, color:T.text2 }}>
              <div style={{ fontWeight:700, marginBottom:4 }}>CSV 컬럼 순서 (엑셀에서 CSV로 저장)</div>
              <div style={{ fontFamily:"monospace", color:T.text3 }}>이메일, 이름, 역할, 부서</div>
              <div style={{ color:T.text3, marginTop:4 }}>역할: admin / manager / analyst / viewer</div>
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <label style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 0', border:`1px dashed ${T.borderMid}`, borderRadius:7, cursor:'pointer', fontSize:12, color:T.blue }}>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleCsvFile} style={{ display:'none' }}/>
                {csvRows.length > 0 ? `${csvRows.length}명 로드됨` : 'CSV 파일 선택'}
              </label>
              <button onClick={downloadTemplate} style={{ padding:'8px 14px', border:`1px solid ${T.border}`, borderRadius:7, fontSize:11, color:T.text2, background:T.surface2, cursor:'pointer' }}>
                양식 다운로드
              </button>
            </div>

            {/* 미리보기 */}
            {csvRows.length > 0 && (
              <div style={{ maxHeight:160, overflowY:'auto', border:`1px solid ${T.border}`, borderRadius:7, marginBottom:16 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:T.surface2 }}>
                      {['이메일','이름','역할','부서'].map(h => (
                        <th key={h} style={{ padding:'6px 10px', textAlign:'left', color:T.text3, fontWeight:600, borderBottom:`1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 10).map((r, i) => (
                      <tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}>
                        <td style={{ padding:'5px 10px', color:T.text2 }}>{r.email}</td>
                        <td style={{ padding:'5px 10px', color:T.text2 }}>{r.display_name}</td>
                        <td style={{ padding:'5px 10px', color:T.text2 }}>{r.role}</td>
                        <td style={{ padding:'5px 10px', color:T.text2 }}>{r.department}</td>
                      </tr>
                    ))}
                    {csvRows.length > 10 && (
                      <tr><td colSpan={4} style={{ padding:'5px 10px', color:T.text3, textAlign:'center' }}>…외 {csvRows.length - 10}명</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {bulkMsg && (
              <div style={{ fontSize:12, color: bulkMsg.startsWith('✓') ? T.green : T.red, marginBottom:12, padding:'8px 12px', background: bulkMsg.startsWith('✓') ? T.greenSoft : T.redSoft, borderRadius:6 }}>
                {bulkMsg}
              </div>
            )}

            <div style={{ display:'flex', gap:8 }}>
              <Btn variant="secondary" onClick={() => { setBulkOpen(false); setCsvRows([]); setBulkMsg('') }} style={{ flex:1 }}>취소</Btn>
              <Btn onClick={handleBulkInvite} style={{ flex:2 }} disabled={bulkLoading || csvRows.length === 0}>
                {bulkLoading ? '처리 중…' : `${csvRows.length}명 일괄 초대`}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
