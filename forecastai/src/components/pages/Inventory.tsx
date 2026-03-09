'use client'
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from 'recharts'
import { T, card } from '@/lib/data'
import { SearchInput } from '@/components/ui'

// ── 유형 색상 (실제 DB 유형: 제품, 반제품, 부재료, 소모품, 원재료, 자산) ─────
const TYPE_COLORS: Record<string, string> = {
  제품:   '#2563EB', 완제품: '#2563EB',
  반제품: '#7C3AED',
  원재료: '#10B981', 원자재: '#10B981', 원료: '#10B981',
  부재료: '#0D9488',
  소모품: '#D97706',
  자산:   '#EA580C',
  기타:   '#94A3B8',
}
function typeColor(t: string): string {
  return TYPE_COLORS[t] ?? '#94A3B8'
}

const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  제품:   { color: T.blue,   bg: T.blueSoft   },
  완제품: { color: T.blue,   bg: T.blueSoft   },
  반제품: { color: T.purple, bg: T.purpleSoft },
  원재료: { color: T.green,  bg: T.greenSoft  },
  원자재: { color: T.green,  bg: T.greenSoft  },
  원료:   { color: T.green,  bg: T.greenSoft  },
  부재료: { color: '#0D9488', bg: '#F0FDFA'   },
  소모품: { color: T.amber,  bg: T.amberSoft  },
  자산:   { color: '#EA580C', bg: '#FFF7ED'   },
}
function getTypeStyle(t: string) { return TYPE_STYLE[t] ?? { color: T.text3, bg: T.surface2 } }

// ── 카테고리 색상 ───────────────────────────────────────────────────────────
const CAT_PALETTE = ['#2563EB','#7C3AED','#0D9488','#D97706','#EA580C','#059669','#DC2626','#0891B2']
function catColor(cat: string): string {
  let h = 0; for (let i = 0; i < cat.length; i++) h = cat.charCodeAt(i) + ((h << 5) - h)
  return CAT_PALETTE[Math.abs(h) % CAT_PALETTE.length]
}

// ── 재고 상태 판정 (sort key 포함) ─────────────────────────────────────────
function stockStatus(stock: number, safeStock: number) {
  const ratio = safeStock > 0 ? stock / safeStock : 2
  if (ratio < 0.5) return { label: '위험', color: T.red,    bg: T.redSoft,    pri: 0 }
  if (ratio < 1.0) return { label: '부족', color: T.amber,  bg: T.amberSoft,  pri: 1 }
  if (ratio > 3.0) return { label: '과잉', color: T.purple, bg: T.purpleSoft, pri: 3 }
  return              { label: '정상', color: T.green,  bg: T.greenSoft,  pri: 2 }
}

// ── 월 라벨 YYYYMM → 'YYYY년 MM월' ────────────────────────────────────────
function fmtMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym
  return `${ym.slice(0, 4)}년 ${ym.slice(4, 6)}월`
}

// ── 타입 ───────────────────────────────────────────────────────────────────
type SkuItem = {
  sku: string; name: string; category: string; productType: string
  stock: number; safeStock: number; unitCost: number; weeklyDemand: number
  customer: string; grade: string
}
type KpiData = {
  totalSku: number; totalQty: number; riskCount: number; shortCount: number
  avgCoverageDays: number; snapshotDate?: string
}
type TrendPoint = Record<string, any> & { month: string; label: string }

// ── 월 선택기 컴포넌트 ───────────────────────────────────────────────────────
function MonthPicker({
  value, available, onChange,
}: { value: string; available: string[]; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => value ? Number(value.slice(0, 4)) : new Date().getFullYear())
  const ref = useRef<HTMLDivElement>(null)

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const availSet = new Set(available)
  const minYear = available.length > 0 ? Number(available[available.length - 1].slice(0, 4)) : viewYear
  const maxYear = available.length > 0 ? Number(available[0].slice(0, 4)) : viewYear
  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          border: `1.5px solid ${T.border}`, borderRadius: 8, background: T.surface,
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.text1 }}>
        📅 {value ? fmtMonth(value) : '월 선택'}
        <span style={{ fontSize: 9, color: T.text3 }}>▼</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
          boxShadow: '0 8px 24px rgba(15,23,42,0.12)', padding: '14px 16px', minWidth: 220 }}>

          {/* 연도 네비게이션 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={() => setViewYear(y => Math.max(minYear, y - 1))}
              disabled={viewYear <= minYear}
              style={{ background: 'none', border: 'none', cursor: viewYear <= minYear ? 'not-allowed' : 'pointer',
                fontSize: 14, color: viewYear <= minYear ? T.text3 : T.text1, padding: '2px 6px' }}>◀</button>
            <span style={{ fontWeight: 700, fontSize: 14, color: T.text1 }}>{viewYear}년</span>
            <button onClick={() => setViewYear(y => Math.min(maxYear, y + 1))}
              disabled={viewYear >= maxYear}
              style={{ background: 'none', border: 'none', cursor: viewYear >= maxYear ? 'not-allowed' : 'pointer',
                fontSize: 14, color: viewYear >= maxYear ? T.text3 : T.text1, padding: '2px 6px' }}>▶</button>
          </div>

          {/* 월 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {MONTHS.map((m, idx) => {
              const ym = `${viewYear}${String(idx + 1).padStart(2, '0')}`
              const isAvail = availSet.has(ym)
              const isSelected = ym === value
              return (
                <button key={m} onClick={() => { if (isAvail) { onChange(ym); setOpen(false) } }}
                  disabled={!isAvail}
                  style={{ padding: '6px 4px', borderRadius: 6, fontSize: 12, fontWeight: isSelected ? 700 : 400,
                    border: isSelected ? `2px solid ${T.blue}` : `1px solid ${T.border}`,
                    background: isSelected ? T.blueSoft : isAvail ? T.surface : T.surface2,
                    color: isSelected ? T.blue : isAvail ? T.text1 : T.text3,
                    cursor: isAvail ? 'pointer' : 'not-allowed' }}>
                  {m}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 커스텀 툴팁 ────────────────────────────────────────────────────────────
function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9,
      padding: '10px 14px', boxShadow: '0 4px 12px rgba(15,23,42,0.1)' }}>
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontSize: 12, color: p.color, marginBottom: 2 }}>
          {p.dataKey}: {Number(p.value).toLocaleString()} EA
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
export default function PageInventory() {
  // ── 상태 ────────────────────────────────────────────────────────────────
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth,   setSelectedMonth]   = useState<string>('')
  const [productTypes,    setProductTypes]    = useState<string[]>(['전체'])
  const [kpi,             setKpi]             = useState<KpiData>({ totalSku: 0, totalQty: 0, riskCount: 0, shortCount: 0, avgCoverageDays: 0 })
  const [trend,           setTrend]           = useState<TrendPoint[]>([])
  const [typeStats,       setTypeStats]       = useState<Record<string, { qty: number; skuCount: number }>>({})
  const [dashLoading,     setDashLoading]     = useState(true)

  const [typeFilter,  setTypeFilter]  = useState('전체')
  const [skuList,     setSkuList]     = useState<SkuItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [search,      setSearch]      = useState('')
  const [statusF,     setStatusF]     = useState('전체')  // 상태 필터
  const [catFilter,   setCatFilter]   = useState('전체')  // 카테고리 필터
  const [hoverSku,    setHoverSku]    = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(50)

  // ── 대시보드 로드 ────────────────────────────────────────────────────────
  const loadDashboard = useCallback((month?: string, type?: string) => {
    setDashLoading(true)
    const params = new URLSearchParams()
    if (month) params.set('month', month)
    if (type && type !== '전체') params.set('type', type)

    fetch(`/api/inventory?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.source !== 'error') {
          if (data.availableMonths?.length) setAvailableMonths(data.availableMonths)
          if (data.selectedMonth)           setSelectedMonth(data.selectedMonth)
          if (data.productTypes?.length)    setProductTypes(data.productTypes)
          if (data.kpi)                     setKpi(data.kpi)
          if (data.trend?.length)           setTrend(data.trend)
          if (data.typeStats)               setTypeStats(data.typeStats)
        }
      })
      .catch(console.error)
      .finally(() => setDashLoading(false))
  }, [])

  // ── SKU 목록 로드 ─────────────────────────────────────────────────────────
  const loadSkuList = useCallback((month: string, type: string, q: string) => {
    setListLoading(true)
    const params = new URLSearchParams({ mode: 'list' })
    if (month)          params.set('month', month)
    if (type !== '전체') params.set('type', type)
    if (q)              params.set('search', q)

    fetch(`/api/inventory?${params}`)
      .then(r => r.json())
      .then(data => { if (data.skuList) { setSkuList(data.skuList); setCatFilter('전체') } })
      .catch(console.error)
      .finally(() => setListLoading(false))
  }, [])

  // ── 초기 로드 ────────────────────────────────────────────────────────────
  useEffect(() => { loadDashboard() }, [loadDashboard])

  // ── selectedMonth 확정 후 SKU 자동 로드 ─────────────────────────────────
  useEffect(() => {
    if (selectedMonth) loadSkuList(selectedMonth, typeFilter, search)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth])

  // ── 월 변경 핸들러 ───────────────────────────────────────────────────────
  const handleMonthChange = (m: string) => {
    setSelectedMonth(m)
    loadDashboard(m, typeFilter)
    loadSkuList(m, typeFilter, search)
  }

  // ── 유형 탭 변경 ─────────────────────────────────────────────────────────
  const handleTypeChange = (t: string) => {
    setTypeFilter(t)
    setCatFilter('전체')
    setStatusF('전체')
    loadDashboard(selectedMonth, t)
    loadSkuList(selectedMonth, t, search)
  }

  // ── 트렌드 라인 키 (선택 유형 필터 또는 전체 유형) ──────────────────────
  const trendLines = useMemo(() => {
    if (typeFilter !== '전체') return [typeFilter]
    const types = new Set<string>()
    for (const p of trend) {
      Object.keys(p).filter(k => k !== 'month' && k !== 'label').forEach(k => types.add(k))
    }
    return Array.from(types).sort()
  }, [trend, typeFilter])

  // ── 도넛 데이터
  //   '전체' → typeStats(API) 기준 유형별 수량 (월 선택 즉시 반영)
  //   특정 유형 → skuList 기준 카테고리별 수량
  const donutData = useMemo(() => {
    if (typeFilter === '전체') {
      return Object.entries(typeStats)
        .filter(([name]) => name !== '전체')
        .map(([name, s]) => ({ name, value: Math.round(s.qty), color: typeColor(name) }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value)
    }
    const byCat: Record<string, number> = {}
    for (const item of skuList) {
      if (item.productType !== typeFilter) continue
      byCat[item.category] = (byCat[item.category] ?? 0) + item.stock
    }
    return Object.entries(byCat)
      .map(([name, value]) => ({ name, value, color: catColor(name) }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [skuList, typeFilter, typeStats])

  // ── 카테고리 목록 (현재 유형 기준) ──────────────────────────────────────
  const cats = useMemo(() => {
    const filtered = typeFilter === '전체' ? skuList : skuList.filter(i => i.productType === typeFilter)
    return ['전체', ...new Set(filtered.map(i => i.category))]
  }, [skuList, typeFilter])

  // ── 상태 카운트 ──────────────────────────────────────────────────────────
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { 전체: 0, 위험: 0, 부족: 0, 정상: 0, 과잉: 0 }
    for (const item of skuList) {
      if (typeFilter !== '전체' && item.productType !== typeFilter) continue
      const s = stockStatus(item.stock, item.safeStock).label
      counts[s]++; counts['전체']++
    }
    return counts
  }, [skuList, typeFilter])

  // ── 필터링 + 정렬 (상태 우선순위: 위험→부족→정상→과잉) ─────────────────
  const filtered = useMemo(() => {
    return skuList
      .filter(item => {
        if (typeFilter !== '전체' && item.productType !== typeFilter) return false
        if (catFilter !== '전체' && item.category !== catFilter) return false
        const st = stockStatus(item.stock, item.safeStock)
        if (statusF !== '전체' && st.label !== statusF) return false
        if (search && !item.sku.includes(search) && !item.name.includes(search)) return false
        return true
      })
      .sort((a, b) => {
        const pa = stockStatus(a.stock, a.safeStock).pri
        const pb = stockStatus(b.stock, b.safeStock).pri
        return pa !== pb ? pa - pb : b.stock - a.stock
      })
  }, [skuList, typeFilter, catFilter, statusF, search])

  // 필터나 검색, 월이 변경되면 화면 표시 개수를 초기화
  useEffect(() => {
    setVisibleCount(50)
  }, [typeFilter, catFilter, statusF, search, selectedMonth])

  const maxStock = useMemo(() => Math.max(...filtered.map(x => x.stock), 1), [filtered])
  const displayedItems = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  // ─────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── 헤더 + 월 선택기 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text1 }}>재고 현황</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>전체 SKU 재고 수준 · 커버리지 · 회전율</div>
        </div>
        {!dashLoading && availableMonths.length > 0 && (
          <MonthPicker value={selectedMonth} available={availableMonths} onChange={handleMonthChange}/>
        )}
      </div>

      {/* ── 제품 유형 탭 ── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {productTypes.map(t => {
          const ts = getTypeStyle(t)
          const active = typeFilter === t
          return (
            <button key={t} onClick={() => handleTypeChange(t)}
              style={{ fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 20,
                border: `1.5px solid ${active ? ts.color : T.border}`,
                background: active ? ts.bg : 'transparent',
                color: active ? ts.color : T.text2,
                cursor: 'pointer', transition: 'all 0.15s' }}>
              {t}
            </button>
          )
        })}
      </div>

      {/* ── KPI 4개 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '총 SKU 수',     value: dashLoading ? '—' : `${kpi.totalSku}종`,             sub: '관리 품목', color: T.blue,   icon: '📦' },
          { label: '총 재고 수량',   value: dashLoading ? '—' : `${kpi.totalQty.toLocaleString()} EA`, sub: '해당 월 스냅샷', color: T.green, icon: '🏭' },
          { label: '위험·부족 SKU', value: dashLoading ? '—' : `${kpi.riskCount + kpi.shortCount}종`,  sub: `위험 ${kpi.riskCount} · 부족 ${kpi.shortCount}`, color: kpi.riskCount > 0 ? T.red : T.amber, icon: '⚠️' },
          { label: '평균 커버리지',  value: dashLoading ? '—' : kpi.avgCoverageDays > 0 ? `${kpi.avgCoverageDays}일` : '—', sub: '목표 21일', color: kpi.avgCoverageDays >= 21 ? T.green : T.amber, icon: '📅' },
        ].map((k, i) => (
          <div key={i} style={{ ...card, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: k.color, borderRadius: '10px 10px 0 0' }}/>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 트렌드 차트 + 도넛 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 20 }}>

        {/* 월별 재고 추이 */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>월별 재고 추이</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                {typeFilter === '전체' ? '제품 유형별 월말 재고 수량 (EA)' : `${typeFilter} 월말 재고 수량 (EA)`}
              </div>
            </div>
            {/* 범례 */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {trendLines.map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.text2 }}>
                  <div style={{ width: 12, height: 2.5, background: typeColor(t), borderRadius: 1 }}/>
                  {t}
                </div>
              ))}
            </div>
          </div>
          {dashLoading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 12 }}>
              불러오는 중…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false} width={40}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}/>
                <Tooltip content={<TrendTooltip/>}/>
                {trendLines.map(t => (
                  <Line key={t} type="monotone" dataKey={t}
                    stroke={typeColor(t)} strokeWidth={2} dot={false}
                    activeDot={{ r: 4, fill: typeColor(t), stroke: 'white', strokeWidth: 2 }}/>
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 재고 구성 도넛 */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>재고 구성</div>
            <span style={{ fontSize: 11, color: T.text3 }}>
              {typeFilter === '전체' ? '유형별 수량' : `${typeFilter} 카테고리별`}
            </span>
          </div>
          {donutData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 12 }}>
              데이터 없음
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PieChart width={120} height={120} style={{ flexShrink: 0 }}>
                <Pie data={donutData} dataKey="value" cx={56} cy={56}
                  innerRadius={32} outerRadius={52} paddingAngle={2}
                  startAngle={90} endAngle={-270}>
                  {donutData.map((e, i) => <Cell key={i} fill={e.color} stroke="white" strokeWidth={2}/>)}
                </Pie>
                <Tooltip formatter={(v: any) => `${Number(v).toLocaleString()} EA`}
                  contentStyle={{ fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 8 }}/>
              </PieChart>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {donutData.map(d => {
                  const total = donutData.reduce((s, x) => s + x.value, 0)
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(0) : '0'
                  return (
                    <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }}/>
                        <span style={{ fontSize: 10, color: T.text2, fontWeight: 500 }}>{d.name}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono',monospace" }}>
                        {pct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SKU 목록 ── */}
      <div style={card}>
        {/* ─ 상태 필터 + 검색 ─ */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          {/* 상태 필터 */}
          {[
            { label: '전체',  color: T.text2,   bg: T.surface2,    border: T.border   },
            { label: '위험',  color: T.red,     bg: T.redSoft,     border: T.redMid   },
            { label: '부족',  color: T.amber,   bg: T.amberSoft,   border: T.amberMid },
            { label: '정상',  color: T.green,   bg: T.greenSoft,   border: T.greenMid },
            { label: '과잉',  color: T.purple,  bg: T.purpleSoft,  border: T.purpleMid ?? T.purple + '40' },
          ].map(s => (
            <button key={s.label} onClick={() => setStatusF(s.label)}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 16,
                border: `1.5px solid ${statusF === s.label ? s.border : T.border}`,
                background: statusF === s.label ? s.bg : 'transparent',
                color: statusF === s.label ? s.color : T.text3, cursor: 'pointer' }}>
              {s.label} {statusCounts[s.label] > 0 ? `(${statusCounts[s.label]})` : ''}
            </button>
          ))}

          <div style={{ flex: 1, minWidth: 180 }}>
            <SearchInput value={search} onChange={(v: string) => { setSearch(v) }}
              placeholder="SKU 코드 또는 품목명 검색…"
              // @ts-ignore
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && loadSkuList(selectedMonth, typeFilter, search)}
            />
          </div>

          {/* 카테고리 필터 */}
          {cats.length > 2 && cats.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${catFilter === c ? T.blue : T.border}`,
                background: catFilter === c ? T.blueSoft : 'transparent',
                color: catFilter === c ? T.blue : T.text2, cursor: 'pointer' }}>
              {c}
            </button>
          ))}
        </div>

        {/* ─ 테이블 ─ */}
        {listLoading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: T.text3, fontSize: 13 }}>불러오는 중…</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.surface2, borderBottom: `2px solid ${T.border}` }}>
                    {['SKU 코드','품목명','유형','카테고리','재고 (EA)','안전재고','커버리지','재고 금액','고객사','상태'].map(h => (
                      <th key={h} style={{ padding: '10px 14px',
                        textAlign: h === '품목명' ? 'left' : 'center',
                        fontSize: 11, fontWeight: 700, color: T.text3, whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedItems.map(item => {
                    const st  = stockStatus(item.stock, item.safeStock)
                    const cov = item.weeklyDemand > 0 ? Math.round(item.stock / item.weeklyDemand * 7) : 0
                    const val = item.stock * item.unitCost
                    const ts  = getTypeStyle(item.productType)
                    return (
                      <tr key={item.sku}
                        onMouseEnter={() => setHoverSku(item.sku)}
                        onMouseLeave={() => setHoverSku(null)}
                        style={{ borderBottom: `1px solid ${T.border}`,
                          background: hoverSku === item.sku ? T.surface2 : 'transparent',
                          transition: 'background 0.1s' }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: T.text3 }}>{item.sku}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: T.text1 }}>{item.name}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: ts.color, background: ts.bg, borderRadius: 4, padding: '2px 7px' }}>{item.productType}</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: catColor(item.category), background: `${catColor(item.category)}18`, borderRadius: 4, padding: '2px 7px' }}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: T.text1 }}>{item.stock.toLocaleString()}</div>
                          <div style={{ height: 3, background: T.surface2, borderRadius: 2, width: 60, margin: '4px auto 0' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (item.stock / maxStock) * 100)}%`, background: st.color, borderRadius: 2 }}/>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", color: T.text2 }}>{item.safeStock.toLocaleString()}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
                            color: cov < 14 ? T.red : cov < 21 ? T.amber : T.green }}>
                            {cov > 0 ? `${cov}일` : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.text2 }}>
                          {item.unitCost > 0 ? `₩${(val / 1000).toFixed(0)}K` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: T.text3 }}>{item.customer}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 5, padding: '3px 8px' }}>{st.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: T.text3, fontSize: 12 }}>
                        {skuList.length === 0 ? '데이터를 불러오는 중입니다…' : '검색 결과가 없습니다.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {visibleCount < filtered.length && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                  onClick={() => setVisibleCount(v => v + 50)}
                  style={{
                    padding: '8px 24px', fontSize: 12, fontWeight: 600, color: T.text2,
                    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20,
                    cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)', transition: 'all 0.1s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = T.surface2}
                  onMouseOut={(e) => e.currentTarget.style.background = T.surface}>
                  더보기 ({visibleCount} / {filtered.length})
                </button>
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: 11, color: T.text3, textAlign: 'right' }}>
              {filtered.length}개 SKU 표시 중 (전체 {skuList.filter(i => typeFilter === '전체' || i.productType === typeFilter).length}개)
              {selectedMonth && <span style={{ marginLeft: 12 }}>기준: {fmtMonth(selectedMonth)}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
