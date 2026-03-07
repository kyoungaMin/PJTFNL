'use client'
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid } from 'recharts'
import { T, card, sectionTitle, PURCHASE_PLAN_DATA, PURCHASE_SUPPLIER_CHART,
  PURCHASE_URGENCY_DIST, ORDER_METHOD_LABELS, URGENCY_STYLE } from '@/lib/data'
import { Badge, PageHeader, Btn, FilterBar, Select, SearchInput } from '@/components/ui'

/* ────── types ────── */
type PurchaseItem = {
  id: number; componentId: string; componentName: string; category: string;
  parentProducts: string; grossRequirement: number; currentInventory: number;
  pendingPo: number; netRequirement: number; safetyStock: number; reorderPoint: number;
  recommendedQty: number; orderMethod: string;
  supplier: string; supplierName: string; leadDays: number; unitPrice: number; orderAmount: number;
  altSupplier: string; altSupplierName: string;
  latestOrderDate: string; expectedReceiptDate: string; needDate: string;
  urgency: string; description: string; status: string;
}
type UrgDist = { name: string; value: number; color: string }
type SupChart = { supplier: string; amount: number }

/* ────── helpers ────── */
const fmt = (n: number) => n.toLocaleString()
const fmtWon = (n: number) => n >= 100000000 ? `₩${(n/100000000).toFixed(1)}억` : n >= 1000000 ? `₩${(n/1000000).toFixed(1)}M` : `₩${fmt(n)}`
const statusMap: Record<string,string> = { pending:'미처리', approved:'승인', ordered:'발주완료', received:'입고', cancelled:'취소' }
const statusColors: Record<string,{color:string,bg:string,border:string}> = {
  pending:   { color:T.red,   bg:T.redSoft,    border:T.redMid },
  approved:  { color:T.amber, bg:T.amberSoft,  border:T.amberMid },
  ordered:   { color:T.blue,  bg:T.blueSoft,   border:T.blueMid },
  received:  { color:T.green, bg:T.greenSoft,  border:T.greenMid },
  cancelled: { color:T.text3, bg:T.surface2,   border:T.border },
}

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

/* ────── Data source badge ────── */
function SourceBadge({ source }: { source: string }) {
  if (source === 'database') return <Badge color={T.green} bg={T.greenSoft} border={T.greenMid} size={10}>DB 실데이터</Badge>
  if (source === 'error') return <Badge color={T.red} bg={T.redSoft} border={T.redMid} size={10}>API 오류 (Mock)</Badge>
  return <Badge color={T.amber} bg={T.amberSoft} border={T.amberMid} size={10}>Mock 데이터</Badge>
}

/* ══════════ Main Component ══════════ */
export default function PagePurchase() {
  const [items, setItems]           = useState<PurchaseItem[]>([])
  const [supplierChart, setSupplierChart] = useState<SupChart[]>(PURCHASE_SUPPLIER_CHART)
  const [urgencyDist, setUrgencyDist]     = useState<UrgDist[]>(PURCHASE_URGENCY_DIST)
  const [supplierList, setSupplierList]   = useState<string[]>([])
  const [dataSource, setDataSource] = useState<string>('loading')
  const [planDate, setPlanDate]     = useState<string>('')
  const [planWeekLabel, setPlanWeekLabel] = useState<string>('')
  const [availableWeeks, setAvailableWeeks] = useState<Array<{date:string; label:string}>>([])
  const [loading, setLoading]       = useState(true)

  const [statusF, setStatusF]   = useState('전체')
  const [urgencyF, setUrgencyF] = useState('전체')
  const [supplierF, setSupplierF] = useState('전체')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [drawerItem, setDrawerItem] = useState<PurchaseItem | null>(null)
  const [modId, setModId]       = useState<number | null>(null)
  const [note, setNote]         = useState('')
  const [adjQty, setAdjQty]     = useState<number | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  /* ── fetch data ── */
  const loadData = useCallback(async (week?: string) => {
    setLoading(true)
    try {
      const qs = week ? `?week=${week}` : ''
      const res = await fetch(`/api/purchase-recommendation${qs}`)
      const json = await res.json()

      if (json.availableWeeks?.length > 0) setAvailableWeeks(json.availableWeeks)

      if (json.source === 'database' && json.items?.length > 0) {
        setItems(json.items)
        setSupplierChart(json.supplierChart ?? PURCHASE_SUPPLIER_CHART)
        setUrgencyDist(json.urgencyDist ?? PURCHASE_URGENCY_DIST)
        setSupplierList(json.suppliers ?? [])
        setPlanDate(json.planDate ?? '')
        setPlanWeekLabel(json.planWeekLabel ?? '')
        setDataSource('database')
      } else {
        setItems(PURCHASE_PLAN_DATA.map(i => ({ ...i })))
        setSupplierChart(PURCHASE_SUPPLIER_CHART)
        setUrgencyDist(PURCHASE_URGENCY_DIST)
        setSupplierList(Array.from(new Set(PURCHASE_PLAN_DATA.map(i => i.supplierName))))
        setDataSource(json.source === 'error' ? 'error' : 'mock')
      }
    } catch {
      setItems(PURCHASE_PLAN_DATA.map(i => ({ ...i })))
      setSupplierChart(PURCHASE_SUPPLIER_CHART)
      setUrgencyDist(PURCHASE_URGENCY_DIST)
      setSupplierList(Array.from(new Set(PURCHASE_PLAN_DATA.map(i => i.supplierName))))
      setDataSource('mock')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleWeekChange = (week: string) => { setPlanDate(week); loadData(week) }

  /* ── computed ── */
  const totalAmount = items.reduce((s, i) => s + i.orderAmount, 0)
  const pendingCount = items.filter(i => i.status === 'pending').length
  const urgentCount = items.filter(i => i.urgency === 'critical' || i.urgency === 'high').length
  const avgLead = items.length > 0
    ? Math.round(items.reduce((s, i) => s + i.leadDays, 0) / items.length * 10) / 10
    : 0
  const approvedRate = items.length > 0
    ? Math.round(items.filter(i => i.status !== 'pending').length / items.length * 100)
    : 0

  const filtered = useMemo(() => items.filter(i => {
    const ms = statusF === '전체' || (statusMap[i.status] ?? i.status) === statusF
    const mu = urgencyF === '전체' || i.urgency === urgencyF.toLowerCase()
    const msu = supplierF === '전체' || i.supplierName === supplierF
    const mq = !search || i.componentId.toLowerCase().includes(search.toLowerCase()) || i.componentName.includes(search)
    return ms && mu && msu && mq
  }), [items, statusF, urgencyF, supplierF, search])

  /* ── actions ── */
  const doApprove = async (id: number) => {
    setItems(p => p.map(i => i.id === id ? { ...i, status: 'approved' } : i))
    if (dataSource === 'database') {
      try {
        await fetch('/api/purchase-recommendation', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'approved' }),
        })
      } catch { /* optimistic */ }
    }
  }
  const doBulk = () => { selected.forEach(id => doApprove(id)); setSelected([]) }

  /* ── drawer chart ── */
  const drawerChartData = drawerItem ? [
    { name: '총소요', value: drawerItem.grossRequirement },
    { name: '현재고', value: Math.max(0, drawerItem.currentInventory) },
    { name: '미입고PO', value: drawerItem.pendingPo },
    { name: '순소요', value: drawerItem.netRequirement },
    { name: '안전재고', value: drawerItem.safetyStock },
    { name: '권고수량', value: drawerItem.recommendedQty },
  ] : []

  /* ── filter options (dynamic) ── */
  const statusOptions = useMemo(() => {
    const sts = Array.from(new Set(items.map(i => statusMap[i.status] ?? i.status)))
    return ['전체', ...sts]
  }, [items])
  const supplierOptions = useMemo(() => ['전체', ...supplierList], [supplierList])

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
        <PageHeader title="구매 권고" sub="AI 기반 원자재·부품 구매 권고 · S8 파이프라인" action={undefined}/>

        {/* 로딩 안내 배너 */}
        <div style={{ ...card, padding:'20px 24px', marginBottom:20, display:'flex', alignItems:'center', gap:16,
          background:`linear-gradient(135deg, ${T.blueSoft}, ${T.surface})`, border:`1px solid ${T.blueMid}`,
          animation:'fadeInUp 0.3s ease-out' }}>
          <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0,
            border:`3px solid ${T.blueMid}`, borderTopColor:T.blue,
            animation:'spin 0.8s linear infinite' }}/>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:T.text1, marginBottom:2 }}>
              구매 권고 데이터를 불러오고 있습니다
            </div>
            <div style={{ fontSize:12, color:T.text3 }}>
              BOM 전개 · 재고 현황 · 리드타임 분석을 종합하여 최적 발주계획을 생성 중입니다...
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
        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:16, marginBottom:20 }}>
          <div style={{ ...card, padding:20 }}><div style={{ ...pulse, width:'100%', height:200 }}/></div>
          <div style={{ ...card, padding:20 }}><div style={{ ...pulse, width:'100%', height:200 }}/></div>
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

            <h2 style={{ fontSize:18, fontWeight:800, color:T.text1, marginBottom:4 }}>구매 권고 사용자 가이드</h2>
            <p style={{ fontSize:12, color:T.text3, marginBottom:20, lineHeight:1.6 }}>
              이 페이지는 BOM 전개 · 재고 · 리드타임 데이터를 종합 분석하여<br/>
              &quot;어떤 부품을 얼마나, 언제 발주해야 하는가&quot;를 권고하는 화면입니다.
            </p>

            {/* 발주 최적화 알고리즘 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>AI 발주 최적화 알고리즘</h3>
              <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, background:T.surface2, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
                <b>① 총소요량 산출 (BOM 전개)</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  생산계획 수량 × BOM 소요계수 = <b style={{ color:T.text1 }}>총소요량(Gross Requirement)</b>
                </span><br/>
                <b>② 주차별 재고 보정</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  보정재고 = 현재재고 × (1 + 주차차이 × 0.15)<br/>
                  <span style={{ paddingLeft:16 }}>보정미입고PO = 미입고PO × (1 + 주차차이 × 0.10)</span><br/>
                  <span style={{ paddingLeft:16, fontSize:11, color:T.text3 }}>※ 과거 주차는 소진 전이므로 재고가 더 많고, 미입고 PO도 입고 전 상태를 반영</span>
                </span><br/>
                <b>③ 순소요량 계산</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  총소요량 − 보정재고 − 보정미입고PO + 안전재고 = <b style={{ color:T.text1 }}>순소요량(Net Requirement)</b>
                </span><br/>
                <b>④ 발주수량 결정 (발주방식별)</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  · EOQ: {'√'}(2 × 연간수요 × 발주비용 / 보관비용) 경제적 주문량<br/>
                  <span style={{ paddingLeft:16 }}>· L4L(Lot-for-Lot): 순소요량 = 발주수량 (정확 매칭)</span><br/>
                  <span style={{ paddingLeft:16 }}>· 정기발주: 고정주기 묶음 발주 (리드타임 + 버퍼 기간분)</span>
                </span><br/>
                <b>⑤ 긴급도 판정</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  · Critical: 보정재고 {'<'} 안전재고 &amp; 리드타임 내 소진 예상<br/>
                  <span style={{ paddingLeft:16 }}>· High: 재주문점(ROP) 도달 — 즉시 발주 필요</span><br/>
                  <span style={{ paddingLeft:16 }}>· Medium: 2주 이내 ROP 도달 예상</span><br/>
                  <span style={{ paddingLeft:16 }}>· Low: 충분한 재고 보유, 정기 보충</span>
                </span><br/>
                <b>⑥ 발주일정 산출</b><br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  필요일(Need Date) − 공급사 리드타임 = <b style={{ color:T.text1 }}>발주마감일(Latest Order Date)</b>
                </span>
              </div>
            </div>

            {/* KPI 카드 설명 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>KPI 카드 (상단 4개)</h3>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <tbody>
                  {([
                    ['총 구매 권고', 'AI가 분석한 전체 부품 발주 권고 건수입니다. 미처리 건수가 많으면 조기 검토가 필요합니다.'],
                    ['긴급 발주', 'Critical + High 등급 부품 수입니다. 재고 소진 임박 또는 ROP 도달 부품으로 우선 발주가 필요합니다.'],
                    ['예상 발주액', '권고 수량 × 단가의 합계입니다. 예산 대비 발주 규모를 파악할 수 있습니다.'],
                    ['평균 리드타임', '전체 권고 부품의 평균 공급 소요일입니다. 14일 이상이면 장기 리드타임 주의가 필요합니다.'],
                  ] as const).map(([label, desc]) => (
                    <tr key={label} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:T.text1, whiteSpace:'nowrap', verticalAlign:'top' }}>{label}</td>
                      <td style={{ padding:'8px 10px', color:T.text2, lineHeight:1.6 }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 차트 설명 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>차트 영역</h3>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <tbody>
                  {([
                    ['공급사별 발주금액', '공급사별 예상 발주금액 합계입니다. 특정 공급사 편중을 확인하고 리스크를 분산할 수 있습니다.'],
                    ['긴급도 분포', 'Critical/High/Medium/Low 등급별 부품 수를 파이 차트로 보여줍니다.'],
                    ['발주 방식', 'EOQ(경제적 주문량), L4L(정확 매칭), 정기발주 방식별 비율을 나타냅니다.'],
                  ] as const).map(([label, desc]) => (
                    <tr key={label} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:T.text1, whiteSpace:'nowrap', verticalAlign:'top' }}>{label}</td>
                      <td style={{ padding:'8px 10px', color:T.text2, lineHeight:1.6 }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 긴급도 등급 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>긴급도 등급 (Critical ~ Low)</h3>
              <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, background:T.surface2, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
                <span style={{ color:T.red, fontWeight:700 }}>Critical</span> — 현재고가 안전재고 미만이고 리드타임 내 소진 예상. 즉시 발주 필수.<br/>
                <span style={{ color:'#EA580C', fontWeight:700 }}>High</span> — 재주문점(ROP) 도달. 금주 내 발주 권고.<br/>
                <span style={{ color:T.amber, fontWeight:700 }}>Medium</span> — 2주 이내 ROP 도달 예상. 계획 발주 권고.<br/>
                <span style={{ color:T.green, fontWeight:700 }}>Low</span> — 재고 충분. 정기 보충 일정에 따라 발주.
              </div>
            </div>

            {/* 발주 방식 설명 */}
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>발주 방식 (Order Method)</h3>
              <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, background:T.surface2, borderRadius:10, padding:'14px 16px', border:`1px solid ${T.border}` }}>
                <span style={{ color:T.blue, fontWeight:700 }}>EOQ (Economic Order Quantity)</span> — 경제적 주문량<br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  발주비용과 보관비용의 합이 최소가 되는 최적 수량. {'√'}(2 × 연간수요 × 1회 발주비용 / 보관비율)로 산출.<br/>
                  <span style={{ paddingLeft:16 }}>수요가 안정적이고 단가가 높은 부품에 적합합니다.</span>
                </span><br/>
                <span style={{ color:'#7C3AED', fontWeight:700 }}>L4L (Lot-for-Lot)</span> — 정확 매칭 발주<br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  순소요량과 동일한 수량을 발주. 재고 보관비용을 최소화하지만 발주 빈도가 높아짐.<br/>
                  <span style={{ paddingLeft:16 }}>수요 변동이 크거나 고가 부품, 유통기한이 있는 자재에 적합합니다.</span>
                </span><br/>
                <span style={{ color:T.green, fontWeight:700 }}>정기발주 (Fixed Period)</span> — 고정주기 묶음 발주<br/>
                <span style={{ color:T.text3, paddingLeft:16, display:'inline-block' }}>
                  리드타임 + 버퍼 기간의 수요를 묶어 한 번에 발주. 발주 횟수를 줄여 행정비용 절감.<br/>
                  <span style={{ paddingLeft:16 }}>저가 부품, 소모품 등 발주 빈도를 줄이고 싶은 자재에 적합합니다.</span>
                </span>
              </div>
            </div>

            {/* 테이블 컬럼 설명 */}
            <div>
              <h3 style={{ fontSize:14, fontWeight:700, color:T.blue, marginBottom:8 }}>테이블 주요 컬럼</h3>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <tbody>
                  {([
                    ['총소요', 'BOM 전개로 산출된 원자재·부품의 총 필요 수량'],
                    ['현재고', '현재 보유 재고. 빨간색은 재고 0, 주황색은 안전재고 미만'],
                    ['순소요', '총소요 − 현재고 − 미입고PO + 안전재고. 양수이면 발주 필요'],
                    ['권고수량', 'AI가 발주방식(EOQ/L4L/정기)에 따라 산출한 최적 발주 수량'],
                    ['발주마감', '이 날까지 발주해야 필요일에 입고 가능 (Need Date − 리드타임)'],
                  ] as const).map(([label, desc]) => (
                    <tr key={label} style={{ borderBottom:`1px solid ${T.border}` }}>
                      <td style={{ padding:'8px 10px', fontWeight:700, color:T.text1, whiteSpace:'nowrap', verticalAlign:'top' }}>{label}</td>
                      <td style={{ padding:'8px 10px', color:T.text2, lineHeight:1.6 }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <PageHeader title="구매 권고" sub={
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>AI 기반 원자재·부품 구매 권고 · S8 파이프라인</span>
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
        <KpiCard icon="📋" label="총 구매 권고" value={`${items.length}건`} sub={`미처리 ${pendingCount}건`} color={T.blue}/>
        <KpiCard icon="🔥" label="긴급 발주" value={`${urgentCount}건`} sub="Critical + High" color={T.red}/>
        <KpiCard icon="💰" label="예상 발주액" value={fmtWon(totalAmount)} sub={`${items.filter(i => i.orderAmount > 0).length}건 합계`} color={T.green}/>
        <KpiCard icon="🚚" label="평균 리드타임" value={`${avgLead}일`} sub={avgLead >= 14 ? '주의: 장기 리드타임' : '정상 범위'} color={avgLead >= 14 ? T.amber : T.green}/>
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16, marginBottom:20 }}>
        {/* 공급사별 발주금액 */}
        <div style={{ ...card }}>
          <div style={sectionTitle}>공급사별 발주금액</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={supplierChart} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
              <XAxis type="number" tick={{ fontSize:10, fill:T.text3 }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 100000000 ? `${(v/100000000).toFixed(0)}억` : `${(v/1000000).toFixed(0)}M`}/>
              <YAxis type="category" dataKey="supplier" tick={{ fontSize:11, fill:T.text2 }} axisLine={false} tickLine={false} width={110}/>
              <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${T.border}` }}
                formatter={(v: number) => [fmtWon(v), '발주금액']}/>
              <Bar dataKey="amount" radius={[0,4,4,0]} fill={T.blue}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 긴급도 분포 + 발주방식 */}
        <div style={{ ...card, display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={sectionTitle}>긴급도 분포</div>
            {(() => {
              const total = urgencyDist.reduce((s, d) => s + d.value, 0) || 1
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:8 }}>
                  {urgencyDist.map(d => {
                    const pct = Math.round(d.value / total * 100)
                    return (
                      <div key={d.name} style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:d.color, minWidth:52 }}>{d.name}</span>
                        <div style={{ flex:1, height:8, background:T.surface2, borderRadius:4, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:d.color, borderRadius:4, transition:'width .4s ease' }}/>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:T.text1, minWidth:56, textAlign:'right' }}>{d.value.toLocaleString()}건</span>
                        <span style={{ fontSize:10, color:T.text3, minWidth:32, textAlign:'right' }}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:8 }}>발주 방식</div>
            {(['eoq','lot_for_lot','fixed_period'] as const).map(method => {
              const count = items.filter(i => i.orderMethod === method).length
              if (count === 0) return null
              const pct = Math.round(count / items.length * 100)
              const s = ORDER_METHOD_LABELS[method]
              return (
                <div key={method} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
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
        <Select value={statusF}   onChange={setStatusF}   options={statusOptions}/>
        <Select value={urgencyF}  onChange={setUrgencyF}  options={['전체','Critical','High','Medium','Low']}/>
        <Select value={supplierF} onChange={setSupplierF} options={supplierOptions}/>
        <SearchInput value={search} onChange={setSearch} placeholder="부품코드 / 부품명 검색"/>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {dataSource === 'database' && (
            <span style={{ display:'flex', alignItems:'center', gap:6 }}>
              <button onClick={() => loadData(planDate || undefined)} style={{ fontSize:11, color:T.blue, background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>↻ 새로고침</button>
              {planWeekLabel && <span style={{ fontSize:10, color:T.text3 }}>{planWeekLabel}</span>}
            </span>
          )}
          {selected.length > 0 && <Btn variant="success" onClick={doBulk}>✓ 일괄 승인 ({selected.length}건)</Btn>}
        </div>
      </FilterBar>

      {/* ── empty state ── */}
      {filtered.length === 0 && (
        <div style={{ ...card, padding:'40px 0', textAlign:'center' }}>
          <div style={{ fontSize:13, color:T.text3 }}>조건에 맞는 구매 권고가 없습니다.</div>
        </div>
      )}

      {/* ── Purchase Table ── */}
      {filtered.length > 0 && (
        <div style={{ ...card, padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:T.surface2, borderBottom:`2px solid ${T.border}` }}>
                  <th style={th}></th>
                  <th style={th}>긴급도</th>
                  <th style={th}>부품코드</th>
                  <th style={th}>부품명</th>
                  <th style={th}>공급사</th>
                  <th style={{ ...th, textAlign:'right' }}>총소요</th>
                  <th style={{ ...th, textAlign:'right' }}>현재고</th>
                  <th style={{ ...th, textAlign:'right' }}>순소요</th>
                  <th style={{ ...th, textAlign:'right' }}>권고수량</th>
                  <th style={{ ...th, textAlign:'right' }}>단가</th>
                  <th style={{ ...th, textAlign:'right' }}>발주금액</th>
                  <th style={th}>방식</th>
                  <th style={th}>발주마감</th>
                  <th style={th}>상태</th>
                  <th style={th}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const us = URGENCY_STYLE[item.urgency] ?? URGENCY_STYLE.medium
                  const om = ORDER_METHOD_LABELS[item.orderMethod] ?? ORDER_METHOD_LABELS.eoq
                  const sc = statusColors[item.status] ?? statusColors.pending
                  const isSel = selected.includes(item.id)
                  const isActive = drawerItem?.id === item.id
                  return (
                    <tr key={item.id}
                      onClick={() => { setDrawerItem(item); setAdjQty(item.recommendedQty) }}
                      style={{
                        borderBottom:`1px solid ${T.border}`,
                        borderLeft:`3px solid ${us.bar}`,
                        cursor:'pointer',
                        background: isActive ? T.blueSoft : isSel ? `${T.blue}08` : 'transparent',
                        transition:'background 0.15s',
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.surface2 }}
                      onMouseLeave={e => { if (!isActive && !isSel) e.currentTarget.style.background = 'transparent' }}>
                      <td style={td}>
                        {item.status === 'pending' && (
                          <input type="checkbox" checked={isSel}
                            onChange={e => { e.stopPropagation(); setSelected(p => e.target.checked ? [...p, item.id] : p.filter(x => x !== item.id)) }}
                            onClick={e => e.stopPropagation()}
                            style={{ accentColor:T.blue, width:14, height:14 }}/>
                        )}
                      </td>
                      <td style={td}><Badge color={us.color} bg={us.bg} border={us.border} size={10}>{us.label}</Badge></td>
                      <td style={{ ...td, fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:T.text3 }}>{item.componentId}</td>
                      <td style={{ ...td, fontWeight:600, color:T.text1, maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.componentName}</td>
                      <td style={{ ...td, fontSize:11, color:T.text2 }}>{item.supplierName}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace" }}>{fmt(item.grossRequirement)}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace",
                        color: item.currentInventory <= 0 ? T.red : item.currentInventory < item.safetyStock ? T.amber : T.text2 }}>{fmt(item.currentInventory)}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace", color: item.netRequirement > 0 ? T.red : T.text2 }}>
                        {item.netRequirement > 0 ? fmt(item.netRequirement) : '-'}</td>
                      <td style={{ ...td, textAlign:'right' }}>
                        <span style={{ fontWeight:700, fontSize:12, color:us.color, fontFamily:"'IBM Plex Mono',monospace" }}>
                          {item.recommendedQty > 0 ? fmt(item.recommendedQty) : '-'}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace", color:T.text2 }}>
                        {item.unitPrice > 0 ? `₩${fmt(item.unitPrice)}` : '-'}</td>
                      <td style={{ ...td, textAlign:'right', fontFamily:"'IBM Plex Mono',monospace", fontWeight:700, color:T.blue }}>
                        {item.orderAmount > 0 ? fmtWon(item.orderAmount) : '-'}</td>
                      <td style={td}><Badge color={om.color} bg={om.bg} border={om.border} size={10}>{om.label}</Badge></td>
                      <td style={{ ...td, fontSize:10, whiteSpace:'nowrap' }}>{item.latestOrderDate}</td>
                      <td style={td}>
                        <span style={{ fontSize:10, fontWeight:600, color:sc.color, background:sc.bg, border:`1px solid ${sc.border}`, borderRadius:5, padding:'2px 8px' }}>
                          {statusMap[item.status] ?? item.status}
                        </span>
                      </td>
                      <td style={td}>
                        {item.status === 'pending' ? (
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
          {/* 합계 */}
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'14px 14px 0', borderTop:`1px solid ${T.border}`, marginTop:8 }}>
            <span style={{ fontSize:13, fontWeight:700, color:T.text1 }}>합계: <span style={{ color:T.blue, fontFamily:"'IBM Plex Mono',monospace" }}>{fmtWon(filtered.reduce((s, i) => s + i.orderAmount, 0))}</span></span>
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
                  <Badge color={(URGENCY_STYLE[drawerItem.urgency] ?? URGENCY_STYLE.medium).color}
                    bg={(URGENCY_STYLE[drawerItem.urgency] ?? URGENCY_STYLE.medium).bg}
                    border={(URGENCY_STYLE[drawerItem.urgency] ?? URGENCY_STYLE.medium).border}>
                    {(URGENCY_STYLE[drawerItem.urgency] ?? URGENCY_STYLE.medium).label}
                  </Badge>
                  <Badge color={(ORDER_METHOD_LABELS[drawerItem.orderMethod] ?? ORDER_METHOD_LABELS.eoq).color}
                    bg={(ORDER_METHOD_LABELS[drawerItem.orderMethod] ?? ORDER_METHOD_LABELS.eoq).bg}
                    border={(ORDER_METHOD_LABELS[drawerItem.orderMethod] ?? ORDER_METHOD_LABELS.eoq).border}>
                    {(ORDER_METHOD_LABELS[drawerItem.orderMethod] ?? ORDER_METHOD_LABELS.eoq).label}
                  </Badge>
                </div>
                <div style={{ fontSize:15, fontWeight:700, color:T.text1 }}>{drawerItem.componentName}</div>
                <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>{drawerItem.componentId} · {drawerItem.category}</div>
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
                ['총소요량', `${fmt(drawerItem.grossRequirement)}`, T.text1],
                ['현재고', `${fmt(drawerItem.currentInventory)}`, drawerItem.currentInventory <= 0 ? T.red : T.green],
                ['미입고 PO', `${fmt(drawerItem.pendingPo)}`, T.blue],
                ['순소요량', `${fmt(drawerItem.netRequirement)}`, drawerItem.netRequirement > 0 ? T.red : T.green],
                ['안전재고', `${fmt(drawerItem.safetyStock)}`, T.text2],
                ['ROP', `${fmt(drawerItem.reorderPoint)}`, T.text2],
              ].map(([lbl, val, c]) => (
                <div key={lbl as string} style={{ padding:'10px 12px', background:T.surface2, borderRadius:8 }}>
                  <div style={{ fontSize:10, color:T.text3, marginBottom:3 }}>{lbl}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:c as string, fontFamily:"'IBM Plex Mono',monospace" }}>{val}</div>
                </div>
              ))}
            </div>

            {/* recommended qty */}
            <div style={{ ...card, padding:'14px 16px', marginBottom:20, borderTop:`3px solid ${(URGENCY_STYLE[drawerItem.urgency] ?? URGENCY_STYLE.medium).bar}` }}>
              <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>권고 발주 수량</div>
              <div style={{ fontSize:22, fontWeight:800, color:(URGENCY_STYLE[drawerItem.urgency] ?? URGENCY_STYLE.medium).color, fontFamily:"'IBM Plex Mono',monospace", marginBottom:4 }}>
                {drawerItem.recommendedQty > 0 ? `${fmt(drawerItem.recommendedQty)}` : '발주 불필요'}
              </div>
              {drawerItem.orderAmount > 0 && (
                <div style={{ fontSize:12, color:T.blue, fontWeight:600 }}>발주금액: {fmtWon(drawerItem.orderAmount)}</div>
              )}
            </div>

            {/* comparison chart */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:10 }}>소요량 · 재고 · 발주 비교</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={drawerChartData} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false}/>
                  <XAxis type="number" tick={{ fontSize:10, fill:T.text3 }} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:T.text2 }} axisLine={false} tickLine={false} width={65}/>
                  <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:`1px solid ${T.border}` }}
                    formatter={(v: number) => [fmt(v), '']}/>
                  <Bar dataKey="value" radius={[0,4,4,0]}>
                    {drawerChartData.map((_, i) => {
                      const colors = [T.blue, T.green, T.purple, T.red, T.amber, T.orange]
                      return <Cell key={i} fill={colors[i % colors.length]}/>
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* supplier comparison */}
            <div style={{ padding:'14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:20 }}>
              <div style={{ fontWeight:700, color:T.text1, fontSize:12, marginBottom:10 }}>🏢 공급사 비교</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div style={{ padding:'10px 12px', background:T.surface, borderRadius:8, border:`2px solid ${T.blue}` }}>
                  <div style={{ fontSize:10, color:T.blue, fontWeight:600, marginBottom:4 }}>추천 공급사</div>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text1, marginBottom:6 }}>{drawerItem.supplierName}</div>
                  <div style={{ fontSize:11, color:T.text2 }}>리드타임: <b>{drawerItem.leadDays}일</b></div>
                  <div style={{ fontSize:11, color:T.text2 }}>단가: <b>₩{fmt(drawerItem.unitPrice)}</b></div>
                </div>
                <div style={{ padding:'10px 12px', background:T.surface, borderRadius:8, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:10, color:T.text3, fontWeight:600, marginBottom:4 }}>대안 공급사</div>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text2, marginBottom:6 }}>{drawerItem.altSupplierName}</div>
                  <div style={{ fontSize:11, color:T.text3 }}>코드: {drawerItem.altSupplier}</div>
                </div>
              </div>
            </div>

            {/* schedule timeline */}
            <div style={{ padding:'14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:20 }}>
              <div style={{ fontWeight:700, color:T.text1, fontSize:12, marginBottom:10 }}>📅 발주 일정</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {[
                  { label:'발주마감', date:drawerItem.latestOrderDate, color:T.red },
                  { label:'입고예정', date:drawerItem.expectedReceiptDate, color:T.blue },
                  { label:'필요일', date:drawerItem.needDate, color:T.green },
                ].map((s, i) => (
                  <React.Fragment key={s.label}>
                    {i > 0 && <div style={{ flex:1, height:2, background:T.border, margin:'0 4px' }}/>}
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:9, color:T.text3, marginBottom:3 }}>{s.label}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:s.color, fontFamily:"'IBM Plex Mono',monospace" }}>{s.date}</div>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* BOM parent products */}
            {drawerItem.parentProducts && drawerItem.parentProducts !== '-' && (
              <div style={{ padding:'14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:20 }}>
                <div style={{ fontWeight:700, color:T.text1, fontSize:12, marginBottom:8 }}>🔗 BOM 연관 제품</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {drawerItem.parentProducts.split(',').map(p => (
                    <span key={p.trim()} style={{ padding:'3px 10px', background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:5, fontSize:11, fontWeight:600, color:T.blue }}>
                      {p.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI note */}
            <div style={{ padding:'14px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
              <div style={{ fontWeight:700, color:T.text1, marginBottom:6 }}>📊 AI 판단 근거</div>
              <div>• 총소요량: <b>{fmt(drawerItem.grossRequirement)}</b> (BOM 전개 기준)</div>
              <div>• 현재고: <b style={{ color: drawerItem.currentInventory <= 0 ? T.red : T.text1 }}>{fmt(drawerItem.currentInventory)}</b></div>
              <div>• 미입고 PO: <b>{fmt(drawerItem.pendingPo)}</b></div>
              <div>• 순소요: <b style={{ color: drawerItem.netRequirement > 0 ? T.red : T.green }}>{fmt(drawerItem.netRequirement)}</b></div>
              <div>• 리드타임: <b>{drawerItem.leadDays}일</b></div>
              <div style={{ marginTop:10, padding:'8px 10px', background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:6, color:T.blue }}>
                ⓘ {dataSource === 'database'
                  ? '이 분석은 S8 구매최적화 파이프라인 + BOM 전개 + EOQ 계산 실데이터 기반입니다.'
                  : '이 분석은 BOM 전개 + 재고 현황 + 리드타임 기반으로 생성되었습니다.'}
              </div>
            </div>

            {/* adjustment */}
            {drawerItem.status === 'pending' && drawerItem.recommendedQty > 0 && (
              <div style={{ ...card, padding:'14px 16px', marginBottom:20 }}>
                <div style={{ fontSize:12, fontWeight:700, color:T.text1, marginBottom:10 }}>수량 조정</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input type="number" value={adjQty ?? drawerItem.recommendedQty}
                    onChange={e => setAdjQty(Number(e.target.value))}
                    style={{ flex:1, padding:'8px 12px', borderRadius:7, border:`1px solid ${T.borderMid}`, fontSize:13, fontWeight:700, fontFamily:"'IBM Plex Mono',monospace", color:T.text1, outline:'none', background:T.surface2 }}/>
                  <span style={{ fontSize:12, color:T.text3 }}>EA</span>
                </div>
                {adjQty !== null && adjQty !== drawerItem.recommendedQty && (
                  <div style={{ fontSize:11, color:T.amber, marginTop:6 }}>
                    원래 권고: {fmt(drawerItem.recommendedQty)} → 수정: {fmt(adjQty)} ({adjQty > drawerItem.recommendedQty ? '+' : ''}{fmt(adjQty - drawerItem.recommendedQty)})
                  </div>
                )}
              </div>
            )}
          </div>

          {/* footer actions */}
          {drawerItem.status === 'pending' && (
            <div style={{ padding:'16px 24px', borderTop:`1px solid ${T.border}`, display:'flex', gap:8, flexShrink:0 }}>
              <Btn variant="secondary" onClick={() => { setModId(drawerItem.id); setNote('') }} style={{ flex:1 }}>✏ 수정 요청</Btn>
              <Btn variant="success" onClick={() => { doApprove(drawerItem.id); setDrawerItem({ ...drawerItem, status:'approved' }) }} style={{ flex:2 }}>✓ 승인</Btn>
            </div>
          )}
          {drawerItem.status !== 'pending' && (
            <div style={{ padding:'16px 24px', borderTop:`1px solid ${T.border}`, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <span style={{ fontSize:12, color:(statusColors[drawerItem.status] ?? statusColors.pending).color, fontWeight:600 }}>
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
              {items.find(i => i.id === modId)?.componentId} — {items.find(i => i.id === modId)?.componentName}
            </div>
            <div style={{ fontSize:12, color:T.text2, fontWeight:600, marginBottom:6 }}>수정 사유 (필수)</div>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="예: 공급사 변경, 수량 조정, 납기 변경 등 수정 사유를 입력해 주세요."
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
