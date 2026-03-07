'use client'
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { T, card, sectionTitle, PRODUCTION_PLAN_DATA,
  PLAN_TYPE_LABELS, PRIORITY_STYLE } from '@/lib/data'
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
type ChartData = Record<string, any>[]
type WeekOption = { date: string; label: string }

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
const CAT_COLORS = [T.blue, T.green, T.amber, T.purple, T.orange, T.red, '#6366F1', '#EC4899']

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
  const [catChartData, setCatChartData]   = useState<ChartData>([])
  const [catList, setCatList]             = useState<string[]>([])
  const [topProducts, setTopProducts]     = useState<{id:string;name:string;qty:number;category:string}[]>([])
  const [dataSource, setDataSource] = useState<string>('loading')
  const [planDate, setPlanDate]     = useState<string>('')
  const [planWeek, setPlanWeek]     = useState<string>('')
  const [planWeekLabel, setPlanWeekLabel] = useState<string>('')
  const [availableWeeks, setAvailableWeeks] = useState<WeekOption[]>([])
  const [loading, setLoading]       = useState(true)

  const [showGuide, setShowGuide] = useState(false)
  const [statusF, setStatusF] = useState('전체')
  const [priorF, setPriorF]   = useState('전체')
  const [catF, setCatF]       = useState('전체')
  const [search, setSearch]   = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [drawerItem, setDrawerItem] = useState<PlanItem | null>(null)
  const [modId, setModId]     = useState<number | null>(null)
  const [note, setNote]       = useState('')
  const [adjQty, setAdjQty]   = useState<number | null>(null)

  /* ── fetch data ── */
  const loadData = useCallback(async (week?: string) => {
    setLoading(true)
    try {
      const qs = week ? `?week=${week}` : ''
      const res = await fetch(`/api/production-plan${qs}`)
      const json = await res.json()

      if (json.availableWeeks?.length > 0) {
        setAvailableWeeks(json.availableWeeks)
      }

      if (json.source === 'database' && json.items?.length > 0) {
        setItems(json.items)
        setCatChartData(json.categoryChart ?? [])
        setCatList(json.categories ?? [])
        setTopProducts(json.topProducts ?? [])

        setPlanDate(json.planDate ?? '')
        setPlanWeek(json.planWeek ?? '')
        setPlanWeekLabel(json.planWeekLabel ?? '')
        setDataSource('database')
      } else {
        setItems(PRODUCTION_PLAN_DATA.map(i => ({ ...i })))
        setCatChartData([])
        setCatList([])
        setTopProducts([])

        setDataSource(json.source === 'error' ? 'error' : 'mock')
      }
    } catch {
      setItems(PRODUCTION_PLAN_DATA.map(i => ({ ...i })))
      setCatChartData([])
      setCatList([])
      setTopProducts([])
      setPriorityDist(PROD_PRIORITY_DIST)
      setDataSource('mock')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleWeekChange = (week: string) => { setPlanDate(week); loadData(week) }

  /* ── computed ── */
  const totalPlan = items.reduce((s, i) => s + i.plannedQty, 0)
  const stockoutItems = items.filter(i => i.currentStock < i.safetyStock).length
  const zeroStockItems = items.filter(i => i.currentStock <= 0).length
  const draftCount = items.filter(i => i.status === 'draft').length
  const approvedCount = items.filter(i => i.status !== 'draft').length
  const approvedRate = items.length > 0 ? Math.round(approvedCount / items.length * 100) : 0

  const gradeDist = useMemo(() => [
    { name: 'A (안전)', value: items.filter(i => i.riskGrade === 'A').length, color: '#059669' },
    { name: 'B (양호)', value: items.filter(i => i.riskGrade === 'B').length, color: '#2563EB' },
    { name: 'C (주의)', value: items.filter(i => i.riskGrade === 'C').length, color: '#D97706' },
    { name: 'D (위험)', value: items.filter(i => i.riskGrade === 'D').length, color: '#DC2626' },
    { name: 'F (긴급)', value: items.filter(i => i.riskGrade === 'F').length, color: '#7C2D12' },
  ].filter(d => d.value > 0), [items])

  const filtered = useMemo(() => items.filter(i => {
    const ms = statusF === '전체' || (statusMap[i.status] ?? i.status) === statusF
    const mp = priorF === '전체' || i.priority === priorF.toLowerCase()
    const mc = catF === '전체' || i.category === catF
    const mq = !search || i.sku.toLowerCase().includes(search.toLowerCase()) || i.name.includes(search)
    return ms && mp && mc && mq
  }), [items, statusF, priorF, catF, search])

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

  /* ── category filter options (dynamic) ── */
  const catOptions = useMemo(() => {
    const cats = Array.from(new Set(items.map(i => i.category).filter(Boolean)))
    return ['전체', ...cats.sort()]
  }, [items])

  /* ── loading state — 스켈레톤 UI ── */
  if (loading) {
    const pulse: React.CSSProperties = {
      background:`linear-gradient(90deg, ${T.surface} 25%, ${T.border}44 50%, ${T.surface} 75%)`,
      backgroundSize:'200% 100%', animation:'pulse 1.5s infinite', borderRadius:6,
    }
    return (
      <div>
        <style>{`
          @keyframes pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}
          @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
          @keyframes fadeInUp{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
        `}</style>
        <PageHeader title="생산 권고" sub="AI 기반 주간 생산계획 권고 · S7 파이프라인" action={undefined}/>

        {/* 로딩 안내 배너 */}
        <div style={{ ...card, padding:'20px 24px', marginBottom:20, display:'flex', alignItems:'center', gap:16,
          background:`linear-gradient(135deg, ${T.blueSoft}, ${T.surface})`, border:`1px solid ${T.blueMid}`,
          animation:'fadeInUp 0.3s ease-out' }}>
          {/* 스피너 */}
          <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0,
            border:`3px solid ${T.blueMid}`, borderTopColor:T.blue,
            animation:'spin 0.8s linear infinite' }}/>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:T.text1, marginBottom:2 }}>
              생산 권고 데이터를 불러오고 있습니다
            </div>
            <div style={{ fontSize:12, color:T.text3 }}>
              수요예측 · 재고 · 리스크 분석 결과를 종합하여 최적 생산계획을 생성 중입니다...
            </div>
          </div>
        </div>

        {/* KPI 스켈레톤 */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ ...card, padding:20 }}>
              <div style={{ ...pulse, width:80, height:12, marginBottom:10 }}/>
              <div style={{ ...pulse, width:100, height:24, marginBottom:6 }}/>
              <div style={{ ...pulse, width:60, height:10 }}/>
            </div>
          ))}
        </div>
        {/* 차트 스켈레톤 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:20 }}>
          <div style={{ ...card, padding:20 }}><div style={{ ...pulse, width:'100%', height:220 }}/></div>
          <div style={{ ...card, padding:20 }}><div style={{ ...pulse, width:'100%', height:220 }}/></div>
          <div style={{ ...card, padding:20 }}><div style={{ ...pulse, width:'100%', height:220 }}/></div>
        </div>
        {/* 테이블 스켈레톤 */}
        <div style={{ ...card, padding:16 }}>
          <div style={{ ...pulse, width:200, height:14, marginBottom:16 }}/>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ display:'flex', gap:12, marginBottom:10 }}>
              <div style={{ ...pulse, width:60, height:14 }}/>
              <div style={{ ...pulse, width:120, height:14 }}/>
              <div style={{ ...pulse, flex:1, height:14 }}/>
              <div style={{ ...pulse, width:80, height:14 }}/>
              <div style={{ ...pulse, width:60, height:14 }}/>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── 사용자 가이드 모달 ── */}
      {showGuide && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setShowGuide(false)}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.4)' }}/>
          <div onClick={e => e.stopPropagation()}
            style={{ position:'relative', background:T.surface, borderRadius:16, padding:'32px 36px',
              maxWidth:720, width:'90vw', maxHeight:'85vh', overflowY:'auto',
              boxShadow:'0 20px 60px rgba(0,0,0,0.15)', border:`1px solid ${T.border}` }}>
            <button onClick={() => setShowGuide(false)}
              style={{ position:'absolute', top:16, right:16, background:'none', border:'none',
                fontSize:18, cursor:'pointer', color:T.text3, fontWeight:700 }}>X</button>

            <h2 style={{ fontSize:18, fontWeight:800, color:T.text1, marginBottom:4 }}>생산 권고 사용자 가이드</h2>
            <p style={{ fontSize:12, color:T.text3, marginBottom:20, lineHeight:1.6 }}>
              이 페이지는 AI가 수요예측, 재고, 리스크 데이터를 종합 분석하여<br/>
              &quot;이번 주에 어떤 제품을 얼마나 생산해야 하는가&quot;를 권고하는 화면입니다.
            </p>

            {/* 생산 최적화 알고리즘 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>AI 생산 최적화 알고리즘</h3>
              <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, background:T.surface2, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
                <b>① 순소요량 산출</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  수요예측(P50) + 안전재고(리드타임P90 × 일평균수요) − 현재재고 = <b style={{ color:T.text1 }}>순소요량</b>
                </span><br/>
                <b>② 긴급 수주 반영</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  미처리 수주 중 납기 7일 이내 긴급분을 소요량에 추가 반영
                </span><br/>
                <b>③ 캐파 제약 적용</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  최근 90일 일평균생산 × 1.2(버퍼) × 7일 = <b style={{ color:T.text1 }}>주간 최대 캐파</b>
                </span><br/>
                <b>④ 리스크 동적 조정</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  · 결품 위험 (D/F등급 + stockout{'>'} 60%) → P90 기준 상향<br/>
                  <span style={{ paddingLeft:16 }}>· 과잉 위험 (D/F등급 + excess{'>'} 60%) → 10% 감량</span>
                </span>
              </div>
            </div>

            {/* KPI 카드 설명 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>KPI 카드 (상단 4개)</h3>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <tbody>
                  {([
                    ['결품 위험 품목', '현재 재고가 안전재고보다 적은 제품 수. 이 제품들은 수요 발생 시 결품(품절)될 가능성이 높아 우선 생산이 필요합니다.'],
                    ['이번 주 계획 생산량', 'AI가 권고한 이번 주 전체 생산 수량의 합계입니다.'],
                    ['승인 진행률', '전체 권고 중 담당자가 승인한 비율입니다. 100%가 되면 모든 권고가 검토 완료된 것입니다.'],
                    ['재고 소진 품목', '현재 재고가 0인 제품 수. 즉시 생산하지 않으면 납기 지연이 발생합니다.'],
                  ] as const).map(([label, desc]) => (
                    <tr key={label} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:T.text1, whiteSpace:'nowrap', verticalAlign:'top' }}>{label}</td>
                      <td style={{ padding:'8px 10px', color:T.text2, lineHeight:1.6 }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 리스크등급 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>리스크등급 (A ~ D)</h3>
              <p style={{ fontSize:12, color:T.text3, marginBottom:8 }}>
                결품위험, 과잉위험, 납기위험, 마진위험을 종합하여 제품별로 부여하는 위험 등급입니다.
              </p>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <tbody>
                  {([
                    ['A (안전)', '#059669', '재고와 수요 균형이 양호. 정상 생산 유지.'],
                    ['B (양호)', '#2563EB', '약간의 주의가 필요하나 큰 문제 없음.'],
                    ['C (주의)', '#D97706', '결품 또는 과잉 위험이 감지됨. 생산량 조정 검토 필요.'],
                    ['D (위험)', '#DC2626', '결품/과잉 위험이 높음. 즉시 생산계획 조정이 필요.'],
                  ] as const).map(([label, color, desc]) => (
                    <tr key={label} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color, whiteSpace:'nowrap', verticalAlign:'top' }}>{label}</td>
                      <td style={{ padding:'8px 10px', color:T.text2, lineHeight:1.6 }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 계획유형 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>계획유형</h3>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <tbody>
                  {([
                    ['증산', T.red, '최근 평균 대비 15% 이상 생산량 증가 필요. 수요 증가 또는 재고 부족 시 발생.'],
                    ['감산', T.blue, '최근 평균 대비 15% 이상 생산량 감소 권고. 과잉재고 방지를 위해 줄여야 합니다.'],
                    ['유지', T.amber, '현재 생산 수준 유지. 수요와 재고가 안정적입니다.'],
                    ['신규', T.purple, '최근 생산 이력이 없는 제품의 신규 생산 권고.'],
                  ] as const).map(([label, color, desc]) => (
                    <tr key={label} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color, whiteSpace:'nowrap', verticalAlign:'top' }}>{label}</td>
                      <td style={{ padding:'8px 10px', color:T.text2, lineHeight:1.6 }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 제품 상세 용어 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>제품 상세 정보 용어</h3>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <tbody>
                  {([
                    ['P10 (낙관)', '수요가 적을 확률 90%인 하한값. "최소 이 정도는 팔린다"는 의미입니다.'],
                    ['P50 (기준)', '가장 가능성 높은 예측 수요. AI가 권고하는 생산량의 기준이 됩니다.'],
                    ['P90 (보수)', '수요가 이보다 클 확률 10%인 상한값. "최대 이 정도 팔릴 수 있다"는 의미입니다.'],
                    ['안전재고', '수요 변동과 리드타임을 고려하여 결품 방지를 위해 항상 유지해야 하는 최소 재고량입니다.'],
                    ['계획수량', 'AI가 권고하는 이번 주 최적 생산 수량입니다. 수요예측 + 안전재고 - 현재재고를 기반으로 산출됩니다.'],
                    ['현재재고', '현재 창고에 보유 중인 수량입니다.'],
                    ['일 생산능력', '하루에 생산 가능한 평균 수량입니다. 최근 생산 이력 기반으로 산출됩니다.'],
                    ['리드타임', '생산 시작부터 완료까지 걸리는 평균 일수입니다.'],
                  ] as const).map(([label, desc]) => (
                    <tr key={label} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:T.text1, whiteSpace:'nowrap', verticalAlign:'top' }}>{label}</td>
                      <td style={{ padding:'8px 10px', color:T.text2, lineHeight:1.6 }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 워크플로우 */}
            <div style={{ marginBottom:8 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>사용 흐름</h3>
              <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, background:T.surface, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
                <b>Step 1.</b> 조회 주차를 선택하여 해당 주의 생산 권고를 확인합니다.<br/>
                <b>Step 2.</b> 결품위험/재고소진 KPI를 확인하여 긴급 품목을 파악합니다.<br/>
                <b>Step 3.</b> 리스크등급 C·D 제품을 우선 검토합니다.<br/>
                <b>Step 4.</b> 제품 행을 클릭하면 AI 분석 근거(일평균 소비량, 미처리 수주, 재고소진 예상일 등)를 확인할 수 있습니다.<br/>
                <b>Step 5.</b> 검토 후 &quot;승인&quot; 버튼을 눌러 생산계획을 확정합니다.
              </div>
            </div>
          </div>
        </div>
      )}

      <PageHeader title="생산 권고" sub={
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>AI 기반 주간 생산계획 권고 · S7 파이프라인</span>
          <SourceBadge source={dataSource}/>
          <button onClick={() => setShowGuide(true)}
            style={{ fontSize:11, fontWeight:700, color:T.blue, background:T.blueSoft,
              border:`1px solid ${T.blueMid}`, borderRadius:6, padding:'3px 8px', cursor:'pointer' }}>? 가이드</button>
        </div>
      } action={
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, color:T.text3, fontWeight:600 }}>조회 주차</span>
          <select value={planDate}
            onChange={e => handleWeekChange(e.target.value)}
            style={{ fontSize:12, fontWeight:700, color:T.text1, background:T.surface,
              border:`1px solid ${T.border}`, borderRadius:7, padding:'6px 12px',
              cursor:'pointer', outline:'none', fontFamily:"'IBM Plex Mono',monospace" }}>
            {availableWeeks.map(w => (
              <option key={w.date} value={w.date}>{w.label} ({w.date})</option>
            ))}
            {availableWeeks.length === 0 && <option value="">주차 없음</option>}
          </select>
          <button onClick={() => loadData()}
            style={{ fontSize:11, fontWeight:600, color:T.blue, background:T.blueSoft, border:`1px solid ${T.blueMid}`,
              borderRadius:6, padding:'5px 10px', cursor:'pointer' }}>최신</button>
        </div>
      }/>

      {/* ── KPI Cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        <KpiCard icon="🚨" label="결품 위험 품목" value={`${fmt(stockoutItems)}건`} sub={`재고 소진 ${fmt(zeroStockItems)}건 포함`} color={stockoutItems > 0 ? T.red : T.green}/>
        <KpiCard icon="🏭" label="이번 주 계획 생산량" value={`${fmt(totalPlan)} EA`} sub={`${fmt(items.length)}개 SKU 합계`} color={T.blue}/>
        <KpiCard icon="📋" label="승인 진행률" value={`${approvedRate}%`} sub={`승인 ${fmt(approvedCount)} / 미승인 ${fmt(draftCount)}`} color={approvedRate >= 50 ? T.green : T.amber}/>
        <KpiCard icon="📦" label="재고 소진 품목" value={`${fmt(zeroStockItems)}건`} sub={zeroStockItems > 0 ? '즉시 생산 필요' : '안정'} color={zeroStockItems > 0 ? T.red : T.green}/>
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:20 }}>
        {/* 카테고리별 주간 생산실적 */}
        <div style={{ ...card }}>
          <div style={sectionTitle}>카테고리별 주간 생산실적 (EA)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={catChartData} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
              <XAxis dataKey="day" tick={{ fontSize:11, fill:T.text3 }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:10, fill:T.text3 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${T.border}` }}/>
              <Legend wrapperStyle={{ fontSize:11 }}/>
              {catList.map((cat, i) => (
                <Bar key={cat} dataKey={cat} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]}
                  radius={i === catList.length - 1 ? [2,2,0,0] : [0,0,0,0]} name={cat}/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top 5 제품 생산실적 */}
        <div style={{ ...card }}>
          <div style={sectionTitle}>Top 5 제품 생산실적 (EA)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts} layout="vertical" barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
              <XAxis type="number" tick={{ fontSize:10, fill:T.text3 }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize:10, fill:T.text2 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${T.border}` }}
                formatter={(v: number) => [`${v.toLocaleString()} EA`, '생산량']}/>
              <Bar dataKey="qty" fill={T.blue} radius={[0,4,4,0]} name="생산량"/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 리스크등급 분포 + 계획유형 */}
        <div style={{ ...card, display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={sectionTitle}>리스크등급 분포</div>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={gradeDist} cx="50%" cy="50%" innerRadius={30} outerRadius={60}
                  dataKey="value" labelLine={false} label={PieLabel}>
                  {gradeDist.map((e, i) => <Cell key={i} fill={e.color}/>)}
                </Pie>
                <Tooltip contentStyle={{ fontSize:12, borderRadius:8 }}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', justifyContent:'center', gap:12, marginTop:4 }}>
              {gradeDist.map(d => (
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
        <Select value={catF}    onChange={setCatF}     options={catOptions}/>
        <SearchInput value={search} onChange={setSearch} placeholder="SKU / 제품명 검색"/>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {dataSource === 'database' && <>
            <button onClick={() => loadData(planDate || undefined)} style={{ fontSize:11, color:T.blue, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>↻ 새로고침</button>
            {planWeekLabel && <span style={{ fontSize:10, color:T.text3, marginLeft:4 }}>{planWeek} {`(${planWeekLabel})`}</span>}
          </>}
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
