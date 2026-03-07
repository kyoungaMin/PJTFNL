'use client'
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { T, card, sectionTitle, PRODUCTION_PLAN_DATA, PRODUCTION_LINE_CHART,
  PROD_PRIORITY_DIST, PLAN_TYPE_LABELS, PRIORITY_STYLE } from '@/lib/data'
import { Badge, GradeBadge, RiskTypeBadge, PageHeader, Btn, FilterBar, Select, SearchInput } from '@/components/ui'

/* ────── types ────── */
type PlanItem = {
  id: number; sku: string; name: string; line: string;
  demandP50: number; demandP90: number; currentStock: number; safetyStock: number;
  dailyCapacity: number; maxCapacity: number; plannedQty: number; minQty: number; maxQty: number;
  priority: string; planType: string; riskGrade: string;
  stockoutRisk: number; excessRisk: number;
  targetStart: string; targetEnd: string; description: string;
  status: string; riskType: string; customer: string;
  aiReason: { avgConsume: number; openOrder: number; depletionDay: number; leadTime: number; p90Demand: number };
}
type PrioDist = { name: string; value: number; color: string }
type LineChart = Record<string, any>[]

/* ────── helpers ────── */
const fmt = (n: number) => n.toLocaleString()
const statusMap: Record<string,string> = { draft:'미승인', approved:'승인', executed:'실행', in_progress:'진행중', completed:'완료', cancelled:'취소' }
const statusColors: Record<string,{color:string,bg:string,border:string}> = {
  draft:       { color:T.red,   bg:T.redSoft,    border:T.redMid   },
  approved:    { color:T.amber, bg:T.amberSoft,  border:T.amberMid },
  executed:    { color:T.green, bg:T.greenSoft,  border:T.greenMid },
  in_progress: { color:T.amber, bg:T.amberSoft,  border:T.amberMid },
  completed:   { color:T.green, bg:T.greenSoft,  border:T.greenMid },
  cancelled:   { color:T.text3, bg:T.surface2,   border:T.border   },
}
const LINE_COLORS = [T.blue, T.green, T.amber, T.purple, T.orange, T.red]

/* ────── KPI Card ────── */
function KpiCard({ label, value, sub, color, icon }: { label:string, value:string, sub:string, color:string, icon:string }) {
  return (
    <div style={{ ...card, padding:'16px 20px', borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:11, color:T.text3, marginBottom:6 }}>{icon} {label}</div>
      <div style={{ fontSize:24, fontWeight:800, color, fontFamily:"'IBM Plex Mono',monospace", lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:T.text2, marginTop:6 }}>{sub}</div>
    </div>
  )
}

/* ────── Range bar ────── */
function RangeBar({ value, min, max, color }: { value:number, min:number, max:number, color:string }) {
  const range = max - min
  const pct = range > 0 ? Math.min(100, Math.max(0, ((value - min) / range) * 100)) : 50
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:10, color:T.text3, minWidth:30, textAlign:'right' }}>{fmt(min)}</span>
      <div style={{ flex:1, height:6, background:T.surface2, borderRadius:3, position:'relative', minWidth:60 }}>
        <div style={{ position:'absolute', left:0, width:`${pct}%`, height:'100%', background:color, borderRadius:3 }}/>
        <div style={{ position:'absolute', left:`${pct}%`, top:'50%', transform:'translate(-50%,-50%)', width:10, height:10, borderRadius:'50%', background:color, border:'2px solid white', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
      </div>
      <span style={{ fontSize:10, color:T.text3, minWidth:30 }}>{fmt(max)}</span>
    </div>
  )
}

/* ────── Pie label ────── */
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{value}</text>
}

/* ────── Data source badge ────── */
function SourceBadge({ source }: { source: string }) {
  if (source === 'database') return <Badge color={T.green} bg={T.greenSoft} border={T.greenMid} size={10}>DB 실데이터</Badge>
  if (source === 'error') return <Badge color={T.red} bg={T.redSoft} border={T.redMid} size={10}>API 오류 (Mock)</Badge>
  return <Badge color={T.amber} bg={T.amberSoft} border={T.amberMid} size={10}>Mock 데이터</Badge>
}

/* ══════════ Main Component ══════════ */
export default function PageActionQueue() {
  const [items, setItems]           = useState<PlanItem[]>([])
  const [lineChartData, setLineChartData] = useState<LineChart>(PRODUCTION_LINE_CHART)
  const [priorityDist, setPriorityDist]   = useState<PrioDist[]>(PROD_PRIORITY_DIST)
  const [lineList, setLineList]     = useState<string[]>(['L-1','L-2','L-3','L-4'])
  const [dataSource, setDataSource] = useState<string>('loading')
  const [planDate, setPlanDate]     = useState<string>('')
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)

  const [statusF, setStatusF] = useState('전체')
  const [priorF, setPriorF]   = useState('전체')
  const [lineF, setLineF]     = useState('전체')
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [drawerItem, setDrawerItem] = useState<PlanItem | null>(null)
  const [modId, setModId]     = useState<number | null>(null)
  const [note, setNote]       = useState('')
  const [adjQty, setAdjQty]   = useState<number | null>(null)

  /* ── fetch data ── */
  const loadData = useCallback(async (date?: string) => {
    setLoading(true)
    try {
      const qs = date ? `?date=${date}` : ''
      const res = await fetch(`/api/production-plan${qs}`)
      const json = await res.json()

      if (json.availableDates?.length > 0) {
        setAvailableDates(json.availableDates)
      }

      if (json.source === 'database' && json.items?.length > 0) {
        setItems(json.items)
        setLineChartData(json.lineChart ?? PRODUCTION_LINE_CHART)
        setPriorityDist(json.priorityDist ?? PROD_PRIORITY_DIST)
        setLineList(json.lines ?? ['L-1','L-2','L-3','L-4'])
        setPlanDate(json.planDate ?? '')
        setDataSource('database')
      } else {
        // fallback to mock
        setItems(PRODUCTION_PLAN_DATA.map(i => ({ ...i })))
        setLineChartData(PRODUCTION_LINE_CHART)
        setPriorityDist(PROD_PRIORITY_DIST)
        setLineList(['L-1','L-2','L-3','L-4'])
        setDataSource(json.source === 'error' ? 'error' : 'mock')
      }
    } catch {
      // API unreachable → mock fallback
      setItems(PRODUCTION_PLAN_DATA.map(i => ({ ...i })))
      setLineChartData(PRODUCTION_LINE_CHART)
      setPriorityDist(PROD_PRIORITY_DIST)
      setLineList(['L-1','L-2','L-3','L-4'])
      setDataSource('mock')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleDateChange = (date: string) => {
    setPlanDate(date)
    loadData(date)
  }

  /* ── computed ── */
  const totalPlan = items.reduce((s, i) => s + i.plannedQty, 0)
  const draftCount = items.filter(i => i.status === 'draft').length
  const urgentCount = items.filter(i => i.priority === 'critical' || i.priority === 'high').length
  const avgUtil = items.length > 0
    ? Math.round(items.reduce((s, i) => s + (i.maxCapacity > 0 ? (i.plannedQty / 7) / i.maxCapacity * 100 : 0), 0) / items.length)
    : 0
  const approvedRate = items.length > 0
    ? Math.round(items.filter(i => i.status !== 'draft').length / items.length * 100)
    : 0

  const filtered = useMemo(() => items.filter(i => {
    const ms = statusF === '전체' || (statusMap[i.status] ?? i.status) === statusF
    const mp = priorF === '전체' || i.priority === priorF.toLowerCase()
    const ml = lineF === '전체' || i.line === lineF
    const mq = !search || i.sku.toLowerCase().includes(search.toLowerCase()) || i.name.includes(search)
    return ms && mp && ml && mq
  }), [items, statusF, priorF, lineF, search])

  /* ── actions ── */
  const doApprove = async (id: number) => {
    // optimistic update
    setItems(p => p.map(i => i.id === id ? { ...i, status: 'approved' } : i))
    if (dataSource === 'database') {
      try {
        await fetch('/api/production-plan', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'approved' }),
        })
      } catch { /* optimistic UI remains */ }
    }
  }
  const doBulk = () => { selected.forEach(id => doApprove(id)); setSelected([]) }

  /* ── drawer chart ── */
  const drawerChartData = drawerItem ? [
    { name: '수요(P50)', value: drawerItem.demandP50 },
    { name: '수요(P90)', value: drawerItem.demandP90 },
    { name: '현재고', value: drawerItem.currentStock },
    { name: '안전재고', value: drawerItem.safetyStock },
    { name: '계획수량', value: drawerItem.plannedQty },
    { name: '주간능력', value: drawerItem.dailyCapacity * 7 },
  ] : []

  /* ── status filter options (dynamic) ── */
  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(items.map(i => statusMap[i.status] ?? i.status)))
    return ['전체', ...statuses]
  }, [items])

  /* ── line filter options (dynamic) ── */
  const lineOptions = useMemo(() => ['전체', ...lineList], [lineList])

  /* ── loading state ── */
  if (loading) {
    return (
      <div>
        <PageHeader title="생산 권고" sub="AI 기반 주간 생산계획 권고 · S7 파이프라인" action={undefined}/>
        <div style={{ ...card, padding:'60px 0', textAlign:'center' }}>
          <div style={{ fontSize:14, color:T.text3 }}>데이터를 불러오는 중...</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="생산 권고" sub={
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>AI 기반 주간 생산계획 권고 · S7 파이프라인</span>
          <SourceBadge source={dataSource}/>
        </div>
      } action={
        availableDates.length > 1 ? (
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={() => {
              const idx = availableDates.indexOf(planDate)
              if (idx < availableDates.length - 1) handleDateChange(availableDates[idx + 1])
            }} disabled={availableDates.indexOf(planDate) >= availableDates.length - 1}
              style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:14, color:T.text2, opacity: availableDates.indexOf(planDate) >= availableDates.length - 1 ? 0.3 : 1 }}>◀</button>
            <select value={planDate} onChange={e => handleDateChange(e.target.value)}
              style={{ fontSize:12, fontWeight:700, color:T.text1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, padding:'6px 28px 6px 10px', cursor:'pointer', outline:'none',
                appearance:'none' as const, backgroundImage:`url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394A3B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center', fontFamily:"'IBM Plex Mono',monospace" }}>
              {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={() => {
              const idx = availableDates.indexOf(planDate)
              if (idx > 0) handleDateChange(availableDates[idx - 1])
            }} disabled={availableDates.indexOf(planDate) <= 0}
              style={{ background:'none', border:`1px solid ${T.border}`, borderRadius:6, padding:'4px 8px', cursor:'pointer', fontSize:14, color:T.text2, opacity: availableDates.indexOf(planDate) <= 0 ? 0.3 : 1 }}>▶</button>
          </div>
        ) : planDate ? (
          <span style={{ fontSize:12, fontWeight:600, color:T.text2, fontFamily:"'IBM Plex Mono',monospace" }}>{planDate}</span>
        ) : undefined
      }/>

      {/* ── KPI Cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard icon="📋" label="총 권고 건수" value={`${items.length}건`} sub={`미승인 ${draftCount}건`} color={T.blue}/>
        <KpiCard icon="🔥" label="긴급 권고" value={`${urgentCount}건`} sub="Critical + High" color={T.red}/>
        <KpiCard icon="🏭" label="이번 주 계획 생산량" value={`${fmt(totalPlan)} EA`} sub={`${items.length}개 SKU 합계`} color={T.green}/>
        <KpiCard icon="⚡" label="평균 설비 가동률" value={`${avgUtil}%`} sub={avgUtil >= 80 ? '주의: 고부하' : '정상 범위'} color={avgUtil >= 80 ? T.amber : T.green}/>
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16, marginBottom:20 }}>
        {/* 주간 라인별 생산계획 */}
        <div style={{ ...card }}>
          <div style={sectionTitle}>주간 라인별 생산실적 (EA)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lineChartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
              <XAxis dataKey="day" tick={{ fontSize:11, fill:T.text3 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:10, fill:T.text3 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${T.border}` }}/>
              <Legend wrapperStyle={{ fontSize:11 }}/>
              {lineList.map((line, i) => (
                <Bar key={line} dataKey={line} stackId="a" fill={LINE_COLORS[i % LINE_COLORS.length]}
                  radius={i === lineList.length - 1 ? [2,2,0,0] : [0,0,0,0]} name={line}/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 우선순위 분포 + 계획유형 */}
        <div style={{ ...card, display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={sectionTitle}>우선순위 분포</div>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={priorityDist} cx="50%" cy="50%" innerRadius={30} outerRadius={60}
                  dataKey="value" labelLine={false} label={PieLabel}>
                  {priorityDist.map((e, i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip contentStyle={{ fontSize:12, borderRadius:8 }}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', justifyContent:'center', gap:12, marginTop:4 }}>
              {priorityDist.map(d => (
                <div key={d.name} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:8, height:8, borderRadius:2, background:d.color }}/>
                  <span style={{ fontSize:10, color:T.text3 }}>{d.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:8 }}>계획 유형</div>
            {(['increase','decrease','maintain','new'] as const).map(type => {
              const count = items.filter(i => i.planType === type).length
              if (count === 0) return null
              const pct = Math.round(count / items.length * 100)
              const s = PLAN_TYPE_LABELS[type]
              return (
                <div key={type} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, fontWeight:600, color:s.color, minWidth:28 }}>{s.label}</span>
                  <div style={{ flex:1, height:6, background:T.surface2, borderRadius:3 }}>
                    <div style={{ width:`${pct}%`, height:'100%', background:s.color, borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:s.color, fontFamily:"'IBM Plex Mono',monospace", minWidth:32, textAlign:'right' }}>{count}건</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <FilterBar>
        <Select value={statusF} onChange={setStatusF} options={statusOptions}/>
        <Select value={priorF}  onChange={setPriorF}  options={['전체','Critical','High','Medium','Low']}/>
        <Select value={lineF}   onChange={setLineF}   options={lineOptions}/>
        <SearchInput value={search} onChange={setSearch} placeholder="SKU / 제품명 검색"/>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {dataSource === 'database' && (
            <button onClick={() => loadData(planDate || undefined)} style={{ fontSize:11, color:T.blue, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>↻ 새로고침</button>
          )}
          {selected.length > 0 && <Btn variant="success" onClick={doBulk}>✓ 일괄 승인 ({selected.length}건)</Btn>}
        </div>
      </FilterBar>

      {/* ── empty state ── */}
      {filtered.length === 0 && (
        <div style={{ ...card, padding:'40px 0', textAlign:'center' }}>
          <div style={{ fontSize:13, color:T.text3 }}>조건에 맞는 생산 권고가 없습니다.</div>
        </div>
      )}

      {/* ── Production Plan Table ── */}
      {filtered.length > 0 && (
        <div style={{ ...card, padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:T.surface2, borderBottom:`2px solid ${T.border}` }}>
                  <th style={th}></th>
                  <th style={th}>우선순위</th>
                  <th style={th}>SKU</th>
                  <th style={th}>제품명</th>
                  <th style={th}>라인</th>
                  <th style={{ ...th, textAlign:'right' }}>수요(P50)</th>
                  <th style={{ ...th, textAlign:'right' }}>수요(P90)</th>
                  <th style={{ ...th, textAlign:'right' }}>현재고</th>
                  <th style={{ ...th, textAlign:'right' }}>안전재고</th>
                  <th style={{ ...th, minWidth:130 }}>계획수량</th>
                  <th style={th}>유형</th>
                  <th style={th}>등급</th>
                  <th style={th}>기간</th>
                  <th style={th}>상태</th>
                  <th style={th}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const ps = PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.low
                  const pt = PLAN_TYPE_LABELS[item.planType] ?? PLAN_TYPE_LABELS.maintain
                  const sc = statusColors[item.status] ?? statusColors.draft
                  const isSel = selected.includes(item.id)
                  const isActive = drawerItem?.id === item.id
                  return (
                    <tr key={item.id}
                      onClick={() => { setDrawerItem(item); setAdjQty(item.plannedQty) }}
                      style={{
                        borderBottom:`1px solid ${T.border}`,
                        borderLeft:`3px solid ${ps.bar}`,
                        cursor:'pointer',
                        background: isActive ? T.blueSoft : isSel ? `${T.blue}08` : 'transparent',
                        transition:'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.surface2 }}
                      onMouseLeave={e => { if (!isActive && !isSel) e.currentTarget.style.background = 'transparent' }}>
                      <td style={td}>
                        {item.status === 'draft' && (
                          <input type="checkbox" checked={isSel}
                            onChange={e => { e.stopPropagation(); setSelected(p => e.target.checked ? [...p, item.id] : p.filter(x => x !== item.id)) }}
                            onClick={e => e.stopPropagation()}
                            style={{ accentColor:T.blue, width:14, height:14 }}/>
                        )}
                      </td>
                      <td style={td}><Badge color={ps.color} bg={ps.bg} border={ps.border} size={10}>{ps.label}</Badge></td>
                      <td style={{ ...td, fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:T.text3 }}>{item.sku}</td>
                      <td style={{ ...td, fontWeight:600, color:T.text1, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</td>
                      <td style={{ ...td, fontSize:11 }}>{item.line}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace" }}>{fmt(item.demandP50)}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace", color:T.red }}>{fmt(item.demandP90)}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace",
                        color: item.currentStock < item.safetyStock ? T.red : T.text2 }}>{fmt(item.currentStock)}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace" }}>{fmt(item.safetyStock)}</td>
                      <td style={td}>
                        <div style={{ fontWeight:700, fontSize:12, color:ps.color, fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>{fmt(item.plannedQty)} EA</div>
                        {item.minQty > 0 && item.maxQty > 0 && <RangeBar value={item.plannedQty} min={item.minQty} max={item.maxQty} color={ps.bar}/>}
                      </td>
                      <td style={td}><Badge color={pt.color} bg={pt.bg} border={pt.border} size={10}>{pt.label}</Badge></td>
                      <td style={td}><GradeBadge grade={item.riskGrade}/></td>
                      <td style={{ ...td, fontSize:10, whiteSpace:'nowrap' }}>{item.targetStart}<br/>~ {item.targetEnd}</td>
                      <td style={td}>
                        <span style={{ fontSize:10, fontWeight:600, color:sc.color, background:sc.bg, border:`1px solid ${sc.border}`, borderRadius:5, padding:'2px 8px' }}>
                          {statusMap[item.status] ?? item.status}
                        </span>
                      </td>
                      <td style={td}>
                        {item.status === 'draft' ? (
                          <div style={{ display:'flex', gap:4 }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => doApprove(item.id)} style={actionBtn(T.green, T.greenSoft, T.greenMid)}>✓</button>
                            <button onClick={() => { setModId(item.id); setNote('') }} style={actionBtn(T.amber, T.amberSoft, T.amberMid)}>✏</button>
                          </div>
                        ) : (
                          <span style={{ fontSize:10, color:T.text3 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AI 채택률 ── */}
      <div style={{ ...card, marginTop:20, padding:'14px 18px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <span style={{ fontSize:12, fontWeight:600, color:T.text2 }}>AI 추천 채택률</span>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <span style={{ fontSize:16, fontWeight:800, color: approvedRate >= 80 ? T.green : T.amber, fontFamily:"'IBM Plex Mono',monospace" }}>{approvedRate}%</span>
            {approvedRate >= 80
              ? <Badge color={T.green} bg={T.greenSoft} border={T.greenMid}>정상</Badge>
              : <Badge color={T.amber} bg={T.amberSoft} border={T.amberMid}>관찰</Badge>}
            <span style={{ fontSize:11, color:T.text3 }}>목표 80%</span>
          </div>
        </div>
        <div style={{ height:8, background:T.surface2, borderRadius:4, border:`1px solid ${T.border}` }}>
          <div style={{ width:`${approvedRate}%`, height:'100%', background:`linear-gradient(90deg,${T.blue},#60A5FA)`, borderRadius:4, transition:'width 0.5s' }}/>
        </div>
      </div>

      {/* ── Detail Drawer ── */}
      {drawerItem && (
        <div style={{
          position:'fixed', top:0, right:0, bottom:0, width:420,
          background:T.surface, borderLeft:`1px solid ${T.border}`,
          boxShadow:'-8px 0 32px rgba(15,23,42,0.10)', zIndex:100,
          display:'flex', flexDirection:'column', overflow:'hidden',
        }}>
          {/* header */}
          <div style={{ padding:'20px 24px 16px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <Badge color={(PRIORITY_STYLE[drawerItem.priority] ?? PRIORITY_STYLE.low).color}
                    bg={(PRIORITY_STYLE[drawerItem.priority] ?? PRIORITY_STYLE.low).bg}
                    border={(PRIORITY_STYLE[drawerItem.priority] ?? PRIORITY_STYLE.low).border}>
                    {(PRIORITY_STYLE[drawerItem.priority] ?? PRIORITY_STYLE.low).label}
                  </Badge>
                  <RiskTypeBadge type={drawerItem.riskType}/>
                  <GradeBadge grade={drawerItem.riskGrade}/>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:T.text1 }}>{drawerItem.name}</div>
                <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>{drawerItem.sku} · {drawerItem.line} · {drawerItem.customer}</div>
              </div>
              <button onClick={() => setDrawerItem(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:T.text3, padding:4 }}>✕</button>
            </div>
          </div>

          {/* scrollable content */}
          <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>
            {/* description */}
            {drawerItem.description && (
              <div style={{ padding:'12px 14px', background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:8, fontSize:12, color:T.blue, fontWeight:600, marginBottom:20 }}>
                🤖 {drawerItem.description}
              </div>
            )}

            {/* key metrics grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {[
                ['수요 P50', `${fmt(drawerItem.demandP50)} EA`, T.text1],
                ['수요 P90', `${fmt(drawerItem.demandP90)} EA`, T.red],
                ['현재고', `${fmt(drawerItem.currentStock)} EA`, drawerItem.currentStock < drawerItem.safetyStock ? T.red : T.green],
                ['안전재고', `${fmt(drawerItem.safetyStock)} EA`, T.text2],
                ['일 생산능력', `${fmt(drawerItem.dailyCapacity)} EA`, T.text1],
                ['최대능력', `${fmt(drawerItem.maxCapacity)} EA`, T.text2],
              ].map(([lbl, val, c]) => (
                <div key={lbl as string} style={{ padding:'10px 12px', background:T.surface2, borderRadius:8 }}>
                  <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>{lbl}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:c as string, fontFamily:"'IBM Plex Mono',monospace" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* planned qty with range */}
            <div style={{ ...card, padding:'14px 16px', marginBottom:20, borderTop:`3px solid ${(PRIORITY_STYLE[drawerItem.priority] ?? PRIORITY_STYLE.low).bar}` }}>
              <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>계획 수량</div>
              <div style={{ fontSize:22, fontWeight:800, color:(PRIORITY_STYLE[drawerItem.priority] ?? PRIORITY_STYLE.low).color, fontFamily:"'IBM Plex Mono',monospace", marginBottom:8 }}>
                {fmt(drawerItem.plannedQty)} EA
              </div>
              {drawerItem.minQty > 0 && drawerItem.maxQty > 0 && (
                <>
                  <RangeBar value={drawerItem.plannedQty} min={drawerItem.minQty} max={drawerItem.maxQty} color={(PRIORITY_STYLE[drawerItem.priority] ?? PRIORITY_STYLE.low).bar}/>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                    <span style={{ fontSize:10, color:T.text3 }}>최소 {fmt(drawerItem.minQty)}</span>
                    <span style={{ fontSize:10, color:T.text3 }}>최대 {fmt(drawerItem.maxQty)}</span>
                  </div>
                </>
              )}
            </div>

            {/* comparison chart */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:10 }}>재고 · 수요 · 생산 비교</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={drawerChartData} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize:10, fill:T.text3 }} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:T.text2 }} axisLine={false} tickLine={false} width={65}/>
                  <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${T.border}` }}
                    formatter={(v: number) => [fmt(v) + ' EA', '']}/>
                  <Bar dataKey="value" radius={[0,4,4,0]}>
                    {drawerChartData.map((_, i) => {
                      const colors = [T.blue, T.red, T.green, T.amber, T.purple, T.orange]
                      return <Cell key={i} fill={colors[i % colors.length]}/>
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* AI reasoning */}
            <div style={{ padding:'14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
              <div style={{ fontWeight:700, color:T.text1, marginBottom:8 }}>📊 AI 판단 근거</div>
              <div>• 일평균 소모: <b>{fmt(drawerItem.aiReason.avgConsume)} EA</b></div>
              <div>• 미처리 수주: <b>{fmt(drawerItem.aiReason.openOrder)} EA</b></div>
              <div>• 재고 소진 예상: <b>{drawerItem.aiReason.depletionDay > 0 ? `D+${drawerItem.aiReason.depletionDay}일` : '-'}</b></div>
              <div>• 리드타임: <b>{drawerItem.aiReason.leadTime > 0 ? `${drawerItem.aiReason.leadTime}일` : '-'}</b></div>
              <div>• P90 수요 예측: <b>{fmt(drawerItem.aiReason.p90Demand)} EA</b></div>
              <div>• 결품위험: <b style={{ color: drawerItem.stockoutRisk >= 60 ? T.red : T.text1 }}>{drawerItem.stockoutRisk}</b> / 과잉위험: <b style={{ color: drawerItem.excessRisk >= 60 ? T.blue : T.text1 }}>{drawerItem.excessRisk}</b></div>
              <div style={{ marginTop:10, padding:'8px 10px', background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:6, color:T.blue }}>
                ⓘ {dataSource === 'database'
                  ? '이 분석은 S5 리스크 스코어 + S7 생산계획 파이프라인 실데이터 기반입니다.'
                  : '이 분석은 최근 8주 실적 + P50/P90 예측 기반으로 생성되었습니다.'}
              </div>
            </div>

            {/* adjustment */}
            {drawerItem.status === 'draft' && (
              <div style={{ ...card, padding:'14px 16px', marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:10 }}>수량 조정</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="number" value={adjQty ?? drawerItem.plannedQty}
                    onChange={e => setAdjQty(Number(e.target.value))}
                    style={{ flex:1, padding:'8px 12px', borderRadius:7, border:`1px solid ${T.borderMid}`, fontSize:13, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace", color:T.text1, outline:'none', background:T.surface2 }}/>
                  <span style={{ fontSize:12, color:T.text3 }}>EA</span>
                </div>
                {adjQty !== null && adjQty !== drawerItem.plannedQty && (
                  <div style={{ fontSize:11, color:T.amber, marginTop:6 }}>
                    원래 권고: {fmt(drawerItem.plannedQty)} → 수정: {fmt(adjQty)} ({adjQty > drawerItem.plannedQty ? '+' : ''}{fmt(adjQty - drawerItem.plannedQty)})
                  </div>
                )}
              </div>
            )}
          </div>

          {/* footer actions */}
          {drawerItem.status === 'draft' && (
            <div style={{ padding:'16px 24px', borderTop:`1px solid ${T.border}`, display:'flex', gap:8, flexShrink:0 }}>
              <Btn variant="secondary" onClick={() => { setModId(drawerItem.id); setNote('') }} style={{ flex:1 }}>✏ 수정 요청</Btn>
              <Btn variant="success" onClick={() => { doApprove(drawerItem.id); setDrawerItem({ ...drawerItem, status:'approved' }) }} style={{ flex:2 }}>✓ 승인</Btn>
            </div>
          )}
          {drawerItem.status !== 'draft' && (
            <div style={{ padding:'16px 24px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <span style={{ fontSize:12, color:(statusColors[drawerItem.status] ?? statusColors.draft).color, fontWeight:600 }}>
                  ✓ {statusMap[drawerItem.status] ?? drawerItem.status} 완료
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modify Modal ── */}
      {modId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.45)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setModId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:28, width:400, boxShadow:'0 20px 48px rgba(15,23,42,0.18)' }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.text1, marginBottom:3 }}>수정 요청</div>
            <div style={{ fontSize:12, color:T.text3, marginBottom:20 }}>
              {items.find(i => i.id === modId)?.sku} — {items.find(i => i.id === modId)?.name}
            </div>
            <div style={{ fontSize:12, color:T.text2, fontWeight:600, marginBottom:6 }}>수정 사유 (필수)</div>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="예: 원자재 수급 문제, 설비 점검 일정, 고객 납기 변경 등 수정 사유를 입력해 주세요."
              style={{ width:'100%', height:90, background:T.surface2, border:`1px solid ${T.borderMid}`, borderRadius:7, color:T.text1, fontSize:12, padding:'10px 12px', resize:'none', boxSizing:'border-box', outline:'none', lineHeight:1.6 }}/>
            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              <Btn variant="secondary" onClick={() => setModId(null)} style={{ flex:1 }}>취소</Btn>
              <Btn onClick={() => { setModId(null); setNote('') }} style={{ flex:2 }}>수정 요청 전송</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ────── Table styles ────── */
const th: React.CSSProperties = {
  padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700,
  color:T.text3, letterSpacing:'0.04em', whiteSpace:'nowrap',
}
const td: React.CSSProperties = {
  padding:'10px 12px', verticalAlign:'middle',
}
const actionBtn = (color: string, bg: string, border: string): React.CSSProperties => ({
  width:28, height:28, borderRadius:6, border:`1px solid ${border}`,
  background:bg, color, cursor:'pointer', fontWeight:700, fontSize:12,
  display:'flex', alignItems:'center', justifyContent:'center',
})
