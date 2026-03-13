'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { T, card } from '@/lib/data'
import { SearchInput, Select } from '@/components/ui'

const TYPE_COLORS: Record<string, string> = {
  완제품: '#2563EB',
  반제품: '#7C3AED',
  원재료: '#10B981',
  부자재: '#0D9488',
  포장재: '#D97706',
  자산: '#EA580C',
  기타: '#94A3B8',
}

const TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  완제품: { color: T.blue, bg: T.blueSoft },
  반제품: { color: T.purple, bg: T.purpleSoft },
  원재료: { color: T.green, bg: T.greenSoft },
  부자재: { color: '#0D9488', bg: '#F0FDFA' },
  포장재: { color: T.amber, bg: T.amberSoft },
  자산: { color: '#EA580C', bg: '#FFF7ED' },
}

const CAT_PALETTE = ['#2563EB', '#7C3AED', '#0D9488', '#D97706', '#EA580C', '#059669', '#DC2626', '#0891B2']

type StatusCode = 'all' | 'risk' | 'short' | 'normal' | 'excess'
type StatusCounts = Record<StatusCode, number>

type SkuItem = {
  sku: string
  name: string
  category: string
  productType: string
  stock: number
  safeStock: number
  unitCost: number
  weeklyDemand: number
  customer: string
  grade: string
}

type KpiData = {
  totalSku: number
  totalQty: number
  riskCount: number
  shortCount: number
  avgCoverageDays: number
  snapshotDate?: string
}

type TrendPoint = Record<string, any> & { month: string; label: string }

function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#94A3B8'
}

function getTypeStyle(type: string) {
  return TYPE_STYLE[type] ?? { color: T.text3, bg: T.surface2 }
}

function catColor(category: string): string {
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash)
  return CAT_PALETTE[Math.abs(hash) % CAT_PALETTE.length]
}

function stockStatus(stock: number, safeStock: number, grade = '-') {
  if (grade === 'E' || grade === 'F') {
    return { code: 'risk' as StatusCode, label: '위험', color: T.red, bg: T.redSoft, pri: 0 }
  }
  if (grade === 'D') {
    return { code: 'short' as StatusCode, label: '부족', color: T.amber, bg: T.amberSoft, pri: 1 }
  }
  if (safeStock > 0) {
    const ratio = stock / safeStock
    if (ratio < 0.5) return { code: 'risk' as StatusCode, label: '위험', color: T.red, bg: T.redSoft, pri: 0 }
    if (ratio < 1.0) return { code: 'short' as StatusCode, label: '부족', color: T.amber, bg: T.amberSoft, pri: 1 }
    if (ratio > 3.0) return { code: 'excess' as StatusCode, label: '과잉', color: T.purple, bg: T.purpleSoft, pri: 3 }
    return { code: 'normal' as StatusCode, label: '정상', color: T.green, bg: T.greenSoft, pri: 2 }
  }
  if (stock <= 0) return { code: 'risk' as StatusCode, label: '위험', color: T.red, bg: T.redSoft, pri: 0 }
  if (stock <= 3) return { code: 'short' as StatusCode, label: '부족', color: T.amber, bg: T.amberSoft, pri: 1 }
  return { code: 'normal' as StatusCode, label: '정상', color: T.green, bg: T.greenSoft, pri: 2 }
}

function fmtMonth(ym: string): string {
  if (!ym || ym.length < 6) return ym
  return `${ym.slice(0, 4)}년 ${ym.slice(4, 6)}월`
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 9,
        padding: '10px 14px',
        boxShadow: '0 4px 12px rgba(15,23,42,0.1)',
      }}
    >
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontSize: 12, color: p.color, marginBottom: 2 }}>
          {p.dataKey}: {Number(p.value).toLocaleString()} EA
        </div>
      ))}
    </div>
  )
}

function MonthPicker({
  value,
  available,
  onChange,
}: {
  value: string
  available: string[]
  onChange: (month: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => (value ? Number(value.slice(0, 4)) : new Date().getFullYear()))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const availableSet = new Set(available)
  const minYear = available.length > 0 ? Number(available[available.length - 1].slice(0, 4)) : viewYear
  const maxYear = available.length > 0 ? Number(available[0].slice(0, 4)) : viewYear
  const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          border: `1.5px solid ${T.border}`,
          borderRadius: 8,
          background: T.surface,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: T.text1,
        }}
      >
        {value ? fmtMonth(value) : '선택'}
        <span style={{ fontSize: 9, color: T.text3 }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 200,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(15,23,42,0.12)',
            padding: '14px 16px',
            minWidth: 220,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              onClick={() => setViewYear(y => Math.max(minYear, y - 1))}
              disabled={viewYear <= minYear}
              style={{
                background: 'none',
                border: 'none',
                cursor: viewYear <= minYear ? 'not-allowed' : 'pointer',
                fontSize: 14,
                color: viewYear <= minYear ? T.text3 : T.text1,
                padding: '2px 6px',
              }}
            >
              ◀
            </button>
            <span style={{ fontWeight: 700, fontSize: 14, color: T.text1 }}>{viewYear}년</span>
            <button
              onClick={() => setViewYear(y => Math.min(maxYear, y + 1))}
              disabled={viewYear >= maxYear}
              style={{
                background: 'none',
                border: 'none',
                cursor: viewYear >= maxYear ? 'not-allowed' : 'pointer',
                fontSize: 14,
                color: viewYear >= maxYear ? T.text3 : T.text1,
                padding: '2px 6px',
              }}
            >
              ▶
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {months.map((month, index) => {
              const ym = `${viewYear}${String(index + 1).padStart(2, '0')}`
              const isAvailable = availableSet.has(ym)
              const isSelected = ym === value
              return (
                <button
                  key={month}
                  onClick={() => {
                    if (!isAvailable) return
                    onChange(ym)
                    setOpen(false)
                  }}
                  disabled={!isAvailable}
                  style={{
                    padding: '6px 4px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 400,
                    border: isSelected ? `2px solid ${T.blue}` : `1px solid ${T.border}`,
                    background: isSelected ? T.blueSoft : isAvailable ? T.surface : T.surface2,
                    color: isSelected ? T.blue : isAvailable ? T.text1 : T.text3,
                    cursor: isAvailable ? 'pointer' : 'not-allowed',
                  }}
                >
                  {month}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PageInventory() {
  const [availableMonths, setAvailableMonths] = useState<string[]>([])
  const [selectedMonth, setSelectedMonth] = useState('')
  const [productTypes, setProductTypes] = useState<string[]>(['전체'])
  const [kpi, setKpi] = useState<KpiData>({ totalSku: 0, totalQty: 0, riskCount: 0, shortCount: 0, avgCoverageDays: 0 })
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [typeStats, setTypeStats] = useState<Record<string, { qty: number; skuCount: number }>>({})
  const [categoryStats, setCategoryStats] = useState<Record<string, number>>({})
  const [dashLoading, setDashLoading] = useState(true)

  const [typeFilter, setTypeFilter] = useState('전체')
  const [skuList, setSkuList] = useState<SkuItem[]>([])
  const [apiPage, setApiPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [baseTotalCount, setBaseTotalCount] = useState(0)
  const [categoryOptions, setCategoryOptions] = useState<string[]>(['전체'])
  const [listLoading, setListLoading] = useState(false)
  const [moreLoading, setMoreLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState<StatusCode>('all')
  const [catFilter, setCatFilter] = useState('전체')
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ all: 0, risk: 0, short: 0, normal: 0, excess: 0 })
  const [hoverSku, setHoverSku] = useState<string | null>(null)
  const dashboardRequestRef = useRef(0)
  const listRequestRef = useRef(0)

  const loadDashboard = useCallback((month?: string, type?: string) => {
    const requestId = ++dashboardRequestRef.current
    setDashLoading(true)

    const params = new URLSearchParams()
    if (month) params.set('month', month)
    if (type && type !== '전체') params.set('type', type)

    fetch(`/api/inventory?${params}`)
      .then(r => r.json())
      .then(data => {
        if (requestId !== dashboardRequestRef.current) return
        if (data.source === 'error') return

        setAvailableMonths(data.availableMonths ?? [])
        if (data.selectedMonth) setSelectedMonth(data.selectedMonth)
        setProductTypes(data.productTypes ?? ['전체'])
        if (data.kpi) setKpi(data.kpi)
        setTrend(data.trend ?? [])
        setTypeStats(data.typeStats ?? {})
        setCategoryStats(data.categoryStats ?? {})
      })
      .catch(console.error)
      .finally(() => {
        if (requestId === dashboardRequestRef.current) setDashLoading(false)
      })
  }, [])

  const loadSkuList = useCallback((
    month: string,
    type: string,
    query: string,
    page = 1,
    status: StatusCode = 'all',
    category = '전체',
  ) => {
    const requestId = ++listRequestRef.current
    if (page === 1) setListLoading(true)
    else setMoreLoading(true)

    const params = new URLSearchParams({ mode: 'list', page: String(page) })
    if (month) params.set('month', month)
    if (type !== '전체') params.set('type', type)
    if (query) params.set('search', query)
    if (status !== 'all') params.set('status', status)
    if (category !== '전체') params.set('category', category)

    fetch(`/api/inventory?${params}`)
      .then(r => r.json())
      .then(data => {
        if (requestId !== listRequestRef.current) return
        if (!data.skuList) return

        if (page === 1) setSkuList(data.skuList)
        else setSkuList(prev => [...prev, ...data.skuList])

        setTotalCount(data.totalCount ?? 0)
        setBaseTotalCount(data.baseTotalCount ?? 0)
        setCategoryOptions(data.categoryOptions ?? ['전체'])
        setStatusCounts(data.statusCounts ?? { all: 0, risk: 0, short: 0, normal: 0, excess: 0 })
        setApiPage(page)
      })
      .catch(console.error)
      .finally(() => {
        if (requestId === listRequestRef.current) {
          setListLoading(false)
          setMoreLoading(false)
        }
      })
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    if (selectedMonth) {
      loadSkuList(selectedMonth, typeFilter, search, 1, statusF, catFilter)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth])

  const handleMonthChange = (month: string) => {
    setCatFilter('전체')
    setStatusF('all')
    setSelectedMonth(month)
    loadDashboard(month, typeFilter)
  }

  const handleTypeChange = (type: string) => {
    setTypeFilter(type)
    setCatFilter('전체')
    setStatusF('all')
    loadDashboard(selectedMonth, type)
    loadSkuList(selectedMonth, type, search, 1, 'all', '전체')
  }

  const handleStatusChange = (status: string) => {
    const next = status as StatusCode
    setStatusF(next)
    loadSkuList(selectedMonth, typeFilter, search, 1, next, catFilter)
  }

  const handleCategoryChange = (category: string) => {
    setCatFilter(category)
    loadSkuList(selectedMonth, typeFilter, search, 1, statusF, category)
  }

  const handleSearchSubmit = () => {
    loadSkuList(selectedMonth, typeFilter, search, 1, statusF, catFilter)
  }

  const trendLines = useMemo(() => {
    if (typeFilter !== '전체') return [typeFilter]
    const types = new Set<string>()
    for (const point of trend) {
      Object.keys(point)
        .filter(key => key !== 'month' && key !== 'label')
        .forEach(key => types.add(key))
    }
    return Array.from(types).sort()
  }, [trend, typeFilter])

  const donutData = useMemo(() => {
    if (typeFilter === '전체') {
      return Object.entries(typeStats)
        .filter(([name]) => name !== '전체')
        .map(([name, stat]) => ({ name, value: Math.round(stat.qty), color: typeColor(name) }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)
    }

    return Object.entries(categoryStats)
      .map(([name, value]) => ({ name, value, color: catColor(name) }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [categoryStats, typeFilter, typeStats])

  const maxStock = useMemo(() => Math.max(...skuList.map(item => item.stock), 1), [skuList])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text1 }}>재고 현황</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>선택 월 기준 재고 현황, 추이, 커버리지, 위험 상태를 확인합니다.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {availableMonths.length > 0 ? (
            <MonthPicker value={selectedMonth} available={availableMonths} onChange={handleMonthChange}/>
          ) : (
            <div style={{ padding: '7px 14px', border: `1.5px solid ${T.border}`, borderRadius: 8, fontSize: 13, color: T.text3 }}>
              {dashLoading ? '조회 중…' : '데이터 없음'}
            </div>
          )}
          <Select value={typeFilter} onChange={handleTypeChange} options={productTypes}/>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: '총 SKU 수', value: dashLoading ? '...' : `${kpi.totalSku}종`, sub: '선택 월 기준', color: T.blue, icon: 'SKU' },
          { label: '총 재고 수량', value: dashLoading ? '...' : `${kpi.totalQty.toLocaleString()} EA`, sub: '선택 월 기준', color: T.green, icon: 'QTY' },
          { label: '위험/부족 SKU', value: dashLoading ? '...' : `${kpi.riskCount + kpi.shortCount}종`, sub: `위험 ${kpi.riskCount} / 부족 ${kpi.shortCount}`, color: kpi.riskCount > 0 ? T.red : T.amber, icon: 'RISK' },
          { label: '평균 커버리지', value: dashLoading ? '...' : kpi.avgCoverageDays > 0 ? `${kpi.avgCoverageDays}일` : '-', sub: '목표 21일', color: kpi.avgCoverageDays >= 21 ? T.green : T.amber, icon: 'COV' },
        ].map((item, index) => (
          <div key={index} style={{ ...card, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: item.color, borderRadius: '10px 10px 0 0' }}/>
            <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 8, fontFamily: "'IBM Plex Mono',monospace" }}>{item.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: item.color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>월별 재고 추이</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                {selectedMonth ? `${fmtMonth(selectedMonth)}를 기준으로 이전 12개월까지 표시합니다.` : '선택 월 기준 12개월 추이'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {trendLines.map(type => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.text2 }}>
                  <div style={{ width: 12, height: 2.5, background: typeColor(type), borderRadius: 1 }}/>
                  {type}
                </div>
              ))}
            </div>
          </div>
          {dashLoading ? (
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 12 }}>
              불러오는 중…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false}/>
                <YAxis
                  tick={{ fontSize: 9, fill: T.text3 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  tickFormatter={(value: number) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)}
                />
                <Tooltip content={<TrendTooltip/>}/>
                {trendLines.map(type => (
                  <Line
                    key={type}
                    type="monotone"
                    dataKey={type}
                    stroke={typeColor(type)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: typeColor(type), stroke: 'white', strokeWidth: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>재고 구성</div>
            <span style={{ fontSize: 11, color: T.text3 }}>
              {typeFilter === '전체' ? '유형별 구성' : `${typeFilter} 카테고리 구성`}
            </span>
          </div>

          {donutData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 12 }}>
              데이터 없음
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PieChart width={120} height={120} style={{ flexShrink: 0 }}>
                <Pie data={donutData} dataKey="value" cx={56} cy={56} innerRadius={32} outerRadius={52} paddingAngle={2} startAngle={90} endAngle={-270}>
                  {donutData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="white" strokeWidth={2}/>
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `${Number(value).toLocaleString()} EA`} contentStyle={{ fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 8 }}/>
              </PieChart>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {donutData.map(item => {
                  const total = donutData.reduce((sum, current) => sum + current.value, 0)
                  const percent = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0'
                  return (
                    <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 7, height: 7, borderRadius: 2, background: item.color, flexShrink: 0 }}/>
                        <span style={{ fontSize: 10, color: T.text2, fontWeight: 500 }}>{item.name}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono',monospace" }}>
                        {percent}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <Select value={typeFilter} onChange={handleTypeChange} options={productTypes}/>
          <div style={{ flex: 1, minWidth: 180 }}>
            <SearchInput
              value={search}
              onChange={(value: string) => setSearch(value)}
              placeholder="SKU 코드 또는 품목명 검색…"
              // @ts-ignore
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleSearchSubmit()}
            />
          </div>
          <Select value={catFilter} onChange={handleCategoryChange} options={categoryOptions}/>
          <Select
            value={statusF}
            onChange={handleStatusChange}
            options={[
              { value: 'all', label: `전체 (${statusCounts.all})` },
              { value: 'risk', label: `위험 (${statusCounts.risk})` },
              { value: 'short', label: `부족 (${statusCounts.short})` },
              { value: 'normal', label: `정상 (${statusCounts.normal})` },
              { value: 'excess', label: `과잉 (${statusCounts.excess})` },
            ]}
          />
        </div>

        {listLoading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: T.text3, fontSize: 13 }}>불러오는 중…</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.surface2, borderBottom: `2px solid ${T.border}` }}>
                    {['SKU 코드', '품목명', '유형', '카테고리', '재고 (EA)', '안전재고', '커버리지', '재고 금액', '고객', '상태'].map(header => (
                      <th
                        key={header}
                        style={{
                          padding: '10px 14px',
                          textAlign: header === '품목명' ? 'left' : 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: T.text3,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {skuList.map(item => {
                    const status = stockStatus(item.stock, item.safeStock, item.grade)
                    const coverage = item.weeklyDemand > 0 ? Math.round((item.stock / item.weeklyDemand) * 7) : 0
                    const stockValue = item.stock * item.unitCost
                    const typeStyle = getTypeStyle(item.productType)

                    return (
                      <tr
                        key={item.sku}
                        onMouseEnter={() => setHoverSku(item.sku)}
                        onMouseLeave={() => setHoverSku(null)}
                        style={{
                          borderBottom: `1px solid ${T.border}`,
                          background: hoverSku === item.sku ? T.surface2 : 'transparent',
                          transition: 'background 0.1s',
                        }}
                      >
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: T.text3 }}>{item.sku}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: T.text1 }}>{item.name}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: typeStyle.color, background: typeStyle.bg, borderRadius: 4, padding: '2px 7px' }}>{item.productType}</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 600, color: catColor(item.category), background: `${catColor(item.category)}18`, borderRadius: 4, padding: '2px 7px' }}>
                            {item.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: T.text1 }}>{item.stock.toLocaleString()}</div>
                          <div style={{ height: 3, background: T.surface2, borderRadius: 2, width: 60, margin: '4px auto 0' }}>
                            <div style={{ height: '100%', width: `${Math.min(100, (item.stock / maxStock) * 100)}%`, background: status.color, borderRadius: 2 }}/>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", color: T.text2 }}>{item.safeStock.toLocaleString()}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: coverage < 14 ? T.red : coverage < 21 ? T.amber : T.green }}>
                            {coverage > 0 ? `${coverage}일` : '-'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.text2 }}>
                          {item.unitCost > 0 ? `₩${(stockValue / 1000).toFixed(0)}K` : '-'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: 11, color: T.text3 }}>{item.customer}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: status.color, background: status.bg, borderRadius: 5, padding: '3px 8px' }}>{status.label}</span>
                        </td>
                      </tr>
                    )
                  })}

                  {skuList.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: T.text3, fontSize: 12 }}>
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {skuList.length < totalCount && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <button
                  onClick={() => loadSkuList(selectedMonth, typeFilter, search, apiPage + 1, statusF, catFilter)}
                  disabled={moreLoading}
                  style={{
                    padding: '10px 32px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#fff',
                    background: T.blue,
                    border: 'none',
                    borderRadius: 24,
                    cursor: moreLoading ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    opacity: moreLoading ? 0.7 : 1,
                  }}
                >
                  {moreLoading ? '불러오는 중…' : `더 보기 (${skuList.length} / ${totalCount}건)`}
                </button>
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 11, color: T.text3, textAlign: 'right' }}>
              현재 {skuList.length}건 로드 / 필터 결과 {totalCount}건 / 선택 월 기준 조회 대상 {baseTotalCount}건
              {selectedMonth && <span style={{ marginLeft: 12 }}>기준: {fmtMonth(selectedMonth)}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
