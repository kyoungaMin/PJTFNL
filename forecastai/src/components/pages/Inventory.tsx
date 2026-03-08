'use client'
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell } from 'recharts'
import { T, card } from '@/lib/data'
import { PageHeader, SearchInput } from '@/components/ui'

// ── 카테고리 색상 ─────────────────────────────────────────────────────────────
const BASE_CAT_COLORS: Record<string, string> = {
  커넥터: '#2563EB', 소켓: '#7C3AED', 마운트: '#0D9488',
  리드: '#D97706', 핀: '#EA580C', 기타: '#94A3B8',
}
const CAT_PALETTE = ['#2563EB','#7C3AED','#0D9488','#D97706','#EA580C','#059669','#DC2626','#0891B2']
function getCatColor(cat: string, map: Record<string,string>): string {
  if (map[cat]) return map[cat]
  let h = 0; for (let i = 0; i < cat.length; i++) h = cat.charCodeAt(i) + ((h << 5) - h)
  return CAT_PALETTE[Math.abs(h) % CAT_PALETTE.length]
}

// ── 제품 유형 색상 ────────────────────────────────────────────────────────────
const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  완제품: { color: T.blue,   bg: T.blueSoft   },
  반제품: { color: T.purple, bg: T.purpleSoft },
  원자재: { color: T.green,  bg: T.greenSoft  },
  원료:   { color: T.green,  bg: T.greenSoft  },
}
function getTypeStyle(t: string) {
  return TYPE_STYLE[t] ?? { color: T.text3, bg: T.surface2 }
}

// ── 타입 ─────────────────────────────────────────────────────────────────────
type SkuItem = {
  sku: string; name: string; category: string; productType: string
  stock: number; safeStock: number; unitCost: number
  weeklyDemand: number; customer: string; grade: string
}
type TrendItem = { w: string; total: number; safe: number }
type KpiData   = { totalSku: number; avgCoverageDays: number; snapshotDate?: string }

export default function PageInventory() {
  // ── 대시보드 상태 (빠른 초기 로드) ──────────────────────────────────────
  const [trendData,    setTrendData]    = useState<TrendItem[]>([])
  const [kpi,          setKpi]          = useState<KpiData>({ totalSku: 0, avgCoverageDays: 0 })
  const [productTypes, setProductTypes] = useState<string[]>(['전체'])
  const [dashLoading,  setDashLoading]  = useState(true)

  // ── SKU 목록 상태 (조회 시에만 로드) ────────────────────────────────────
  const [skuList,     setSkuList]     = useState<SkuItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listLoaded,  setListLoaded]  = useState(false)

  // ── 검색/필터 상태 ────────────────────────────────────────────────────────
  const [search,    setSearch]    = useState('')
  const [typeFilter,setTypeFilter]= useState('전체')
  const [catFilter, setCatFilter] = useState('전체')
  const [sortKey,   setSortKey]   = useState('stock')
  const [sortDesc,  setSortDesc]  = useState(true)
  const [hoverSku,  setHoverSku]  = useState<string | null>(null)

  // ── 초기 대시보드 로드 ───────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => {
        if (data.source !== 'error') {
          setTrendData(data.trend        ?? [])
          setKpi(data.kpi               ?? { totalSku: 0, avgCoverageDays: 0 })
          setProductTypes(data.productTypes ?? ['전체'])
        }
      })
      .catch(console.error)
      .finally(() => setDashLoading(false))
  }, [])

  // ── SKU 목록 조회 ─────────────────────────────────────────────────────────
  const fetchSkuList = useCallback((overrideType?: string) => {
    const t = overrideType ?? typeFilter
    setListLoading(true)
    const params = new URLSearchParams({ mode: 'list' })
    if (search)         params.set('search', search)
    if (t !== '전체')   params.set('type', t)

    fetch(`/api/inventory?${params}`)
      .then(r => r.json())
      .then(data => {
        if (data.source !== 'error') {
          setSkuList(data.skuList ?? [])
          setListLoaded(true)
          setCatFilter('전체')
        }
      })
      .catch(console.error)
      .finally(() => setListLoading(false))
  }, [search, typeFilter])

  // ── 제품 유형 탭 클릭 (이미 조회된 상태면 자동 재조회) ──────────────────
  const handleTypeChange = (t: string) => {
    setTypeFilter(t)
    if (listLoaded) fetchSkuList(t)
  }

  // ── 카테고리 색상 맵 ─────────────────────────────────────────────────────
  const catColors = useMemo(() => {
    const map: Record<string, string> = { ...BASE_CAT_COLORS }
    for (const item of skuList) {
      if (!map[item.category]) map[item.category] = getCatColor(item.category, map)
    }
    return map
  }, [skuList])

  // ── KPI 계산 ─────────────────────────────────────────────────────────────
  const totalSku    = kpi.totalSku || skuList.length
  const totalValue  = skuList.reduce((s, i) => s + i.stock * i.unitCost, 0)
  const avgCoverage = kpi.avgCoverageDays
  const turnover    = avgCoverage > 0 ? (365 / avgCoverage).toFixed(1) : '—'

  // ── 도넛 데이터 ──────────────────────────────────────────────────────────
  const donutData = useMemo(() =>
    Object.entries(
      skuList.reduce((acc, i) => {
        acc[i.category] = (acc[i.category] ?? 0) + i.stock * i.unitCost
        return acc
      }, {} as Record<string, number>)
    ).map(([name, value]) => ({ name, value, color: catColors[name] ?? '#94A3B8' })),
  [skuList, catColors])

  // ── 클라이언트 필터 + 정렬 ───────────────────────────────────────────────
  const cats = ['전체', ...new Set(skuList.map(i => i.category))]
  const maxStock = useMemo(() => Math.max(...skuList.map(x => x.stock), 1), [skuList])
  const filtered = skuList
    .filter(i => (catFilter === '전체' || i.category === catFilter))
    .sort((a, b) => sortDesc
      ? ((b as any)[sortKey] ?? 0) - ((a as any)[sortKey] ?? 0)
      : ((a as any)[sortKey] ?? 0) - ((b as any)[sortKey] ?? 0))

  const handleSort = (k: string) => {
    if (sortKey === k) setSortDesc(d => !d)
    else { setSortKey(k); setSortDesc(true) }
  }
  const SortIcon = ({ k }: { k: string }) =>
    sortKey === k
      ? (sortDesc ? '↓' : '↑')
      : <span style={{ color: T.text3, fontSize: 9 }}>↕</span>

  // ── 재고 상태 판정 ────────────────────────────────────────────────────────
  const stockStatus = (item: SkuItem) => {
    const ratio = item.safeStock > 0 ? item.stock / item.safeStock : 2
    if (ratio < 0.5) return { label: '위험', color: T.red,    bg: T.redSoft    }
    if (ratio < 1.0) return { label: '부족', color: T.amber,  bg: T.amberSoft  }
    if (ratio > 3.0) return { label: '과잉', color: T.purple, bg: T.purpleSoft }
    return              { label: '정상', color: T.green,  bg: T.greenSoft  }
  }
  const coverage = (item: SkuItem) =>
    item.weeklyDemand > 0 ? Math.round(item.stock / item.weeklyDemand * 7) : 0

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const TrendTT = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: '10px 14px', boxShadow: '0 4px 12px rgba(15,23,42,0.1)' }}>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.blue }}>총 재고 {payload[0]?.value?.toLocaleString()} EA</div>
        <div style={{ fontSize: 11, color: T.amber, marginTop: 2 }}>안전재고선 {payload[1]?.value?.toLocaleString()} EA</div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div>
      <PageHeader title="재고 현황" sub="전체 SKU 재고 수준 · 커버리지 · 회전율 실시간 모니터링"/>

      {/* ── KPI 4개 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '총 SKU 수',        value: dashLoading ? '—' : `${totalSku}종`,                               sub: '관리 품목 전체',        color: T.blue,   icon: '📦' },
          { label: '총 재고 금액',      value: !listLoaded ? '조회 후 표시' : `₩${(totalValue/1_000_000).toFixed(1)}M`, sub: '현재 재고 × 단가 기준', color: T.green,  icon: '💰' },
          { label: '평균 재고 커버리지', value: dashLoading ? '—' : `${avgCoverage}일`,                          sub: '목표 21일',             color: avgCoverage >= 21 ? T.green : T.amber, icon: '📅' },
          { label: '재고 회전율',       value: dashLoading ? '—' : `${turnover}회/년`,                           sub: '연간 기준 추정',         color: T.purple, icon: '🔄' },
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

      {/* ── 재고 추이 + 도넛 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: listLoaded ? '3fr 2fr' : '1fr', gap: 16, marginBottom: 16 }}>

        {/* 재고 추이 라인 */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>재고 추이</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>최근 12주 총 재고 수량 (EA)</div>
            </div>
            {dashLoading
              ? <span style={{ fontSize: 11, color: T.text3 }}>불러오는 중…</span>
              : (
                <div style={{ display: 'flex', gap: 14, fontSize: 11, color: T.text2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 12, height: 2, background: T.blue, borderRadius: 1 }}/>총 재고</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 12, borderTop: `2px dashed ${T.amber}` }}/>안전재고선</div>
                </div>
              )
            }
          </div>
          {dashLoading
            ? <div style={{ height: 175, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 12 }}>데이터 불러오는 중…</div>
            : (
              <ResponsiveContainer width="100%" height={175}>
                <ComposedChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="invGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={T.blue} stopOpacity={0.12}/>
                      <stop offset="100%" stopColor={T.blue} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                  <XAxis dataKey="w" tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false} width={36}
                    tickFormatter={v => `${(v/1000).toFixed(0)}k`}/>
                  <Tooltip content={<TrendTT/>}/>
                  <Area  type="monotone" dataKey="total" stroke={T.blue}  strokeWidth={2.5} fill="url(#invGrad)"
                    dot={false} activeDot={{ r: 5, fill: T.blue, stroke: 'white', strokeWidth: 2 }}/>
                  <Line  type="monotone" dataKey="safe"  stroke={T.amber} strokeWidth={1.5} strokeDasharray="5 3" dot={false}/>
                </ComposedChart>
              </ResponsiveContainer>
            )
          }
        </div>

        {/* 재고 구성 도넛 — 조회 후에만 표시 */}
        {listLoaded && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>재고 구성</div>
              <span style={{ fontSize: 11, color: T.text3 }}>카테고리별 금액</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
                <PieChart width={130} height={130}>
                  <Pie data={donutData} dataKey="value" cx={60} cy={60}
                    innerRadius={36} outerRadius={58} paddingAngle={2}
                    startAngle={90} endAngle={-270}>
                    {donutData.map((e, i) => <Cell key={i} fill={e.color} stroke="white" strokeWidth={2}/>)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `₩${(v/1_000_000).toFixed(1)}M`}
                    contentStyle={{ fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 8 }}/>
                </PieChart>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text1, lineHeight: 1 }}>{donutData.length}</div>
                  <div style={{ fontSize: 8, color: T.text3, marginTop: 2 }}>카테고리</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {donutData.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }}/>
                      <span style={{ fontSize: 11, color: T.text2, fontWeight: 500 }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono',monospace" }}>
                      ₩{(d.value/1_000_000).toFixed(1)}M
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── SKU 재고 리스트 ── */}
      <div style={card}>

        {/* ─ 제품 유형 탭 ─ */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {productTypes.map(t => {
            const ts = getTypeStyle(t)
            const active = typeFilter === t
            return (
              <button key={t} onClick={() => handleTypeChange(t)}
                style={{ fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 20,
                  border: `1.5px solid ${active ? ts.color : T.border}`,
                  background: active ? ts.bg : 'transparent',
                  color: active ? ts.color : T.text2,
                  cursor: 'pointer', transition: 'all 0.15s' }}>
                {t}
              </button>
            )
          })}
        </div>

        {/* ─ 검색 + 조회 버튼 ─ */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="SKU 코드 또는 품목명 검색…"
              // @ts-ignore
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && fetchSkuList()}
            />
          </div>
          <button
            onClick={() => fetchSkuList()}
            disabled={listLoading}
            style={{ padding: '7px 20px', borderRadius: 7, border: 'none',
              background: listLoading ? T.border : T.blue,
              color: 'white', fontWeight: 700, fontSize: 13,
              cursor: listLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
            {listLoading ? '조회 중…' : '조회'}
          </button>

          {/* 카테고리 필터 — 조회 후 노출 */}
          {listLoaded && cats.length > 1 && cats.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${catFilter === c ? T.blue : T.border}`,
                background: catFilter === c ? T.blueSoft : 'transparent',
                color: catFilter === c ? T.blue : T.text2, cursor: 'pointer' }}>
              {c}
            </button>
          ))}
        </div>

        {/* ─ 테이블 또는 플레이스홀더 ─ */}
        {!listLoaded ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: T.text3 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text2, marginBottom: 6 }}>제품 유형을 선택하거나 검색 후 조회하세요</div>
            <div style={{ fontSize: 11 }}>조회 버튼을 누르면 SKU 재고 목록이 표시됩니다</div>
          </div>
        ) : listLoading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: T.text3, fontSize: 13 }}>
            데이터 불러오는 중…
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.surface2, borderBottom: `2px solid ${T.border}` }}>
                    {([ ['SKU 코드', null], ['품목명', null], ['유형', null], ['카테고리', null],
                        ['재고 (EA)', 'stock'], ['안전재고', 'safeStock'],
                        ['커버리지', 'coverage'], ['재고 금액', null],
                        ['고객사', null], ['상태', null],
                    ] as [string, string | null][]).map(([h, k]) => (
                      <th key={h} onClick={k ? () => handleSort(k) : undefined}
                        style={{ padding: '10px 14px', textAlign: h === '품목명' ? 'left' : 'center',
                          fontSize: 11, fontWeight: 700, color: T.text3,
                          cursor: k ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
                        {h} {k && <SortIcon k={k}/>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const st  = stockStatus(item)
                    const cov = coverage(item)
                    const val = item.stock * item.unitCost
                    const ts  = getTypeStyle(item.productType)
                    return (
                      <tr key={item.sku}
                        onMouseEnter={() => setHoverSku(item.sku)}
                        onMouseLeave={() => setHoverSku(null)}
                        style={{ borderBottom: `1px solid ${T.border}`,
                          background: hoverSku === item.sku ? T.surface2 : 'transparent',
                          transition: 'background 0.1s' }}>
                        <td style={{ padding: '11px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: T.text3 }}>{item.sku}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 600, color: T.text1 }}>{item.name}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: ts.color, background: ts.bg, borderRadius: 4, padding: '2px 7px' }}>{item.productType}</span>
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 600,
                            color: catColors[item.category] ?? '#94A3B8',
                            background: `${catColors[item.category] ?? '#94A3B8'}15`,
                            borderRadius: 4, padding: '2px 7px' }}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: T.text1 }}>{item.stock.toLocaleString()}</div>
                          <div style={{ marginTop: 4, height: 3, background: T.surface2, borderRadius: 2, width: 60, margin: '4px auto 0' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (item.stock/maxStock)*100)}%`, background: st.color, borderRadius: 2 }}/>
                          </div>
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", color: T.text2 }}>{item.safeStock.toLocaleString()}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700,
                            color: cov < 14 ? T.red : cov < 21 ? T.amber : T.green }}>
                            {cov > 0 ? `${cov}일` : '—'}
                          </span>
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.text2 }}>
                          {item.unitCost > 0 ? `₩${(val/1000).toFixed(0)}K` : '—'}
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'center', fontSize: 11, color: T.text3 }}>{item.customer}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 5, padding: '3px 8px' }}>{st.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: T.text3, fontSize: 12 }}>
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: T.text3, textAlign: 'right' }}>
              {filtered.length}개 SKU 표시 중
              {kpi.snapshotDate && <span style={{ marginLeft: 12 }}>기준: {kpi.snapshotDate}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
