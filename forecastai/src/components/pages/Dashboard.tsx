'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { ComposedChart, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, CartesianGrid,
  ReferenceLine, Area, Line } from 'recharts'
import { T, card, sectionTitle, KPI_DATA, ORDER_FORECAST, RISK_DONUT, ACTION_ITEMS_FULL } from '@/lib/data'
import { Badge, RiskTypeBadge, PageHeader, Btn } from '@/components/ui'

// ─── 타입 ──────────────────────────────────────────────────────────────────────
interface OrderActual { ym: string; m: string; actual: number }
interface RiskGrade   { grade: string; count: number }
interface ActionItem  {
  id: number; priority: string; sku: string; name: string;
  action: string; detail: string; impact: string
  deadline: string; riskType: string; status: string
}

interface ChartRow { m: string; actual?: number; p10?: number; p50?: number; p90?: number }

interface DashApiResponse {
  orderActual: OrderActual[]
  orderChartData?: ChartRow[]
  lastActualM?: string
  hasForecastData?: boolean
  riskGrades: RiskGrade[]
  actionItems: ActionItem[]
  urgentCount: number
  inventoryCoverage: {
    totalQty: number
    snapshotDate: string
    coverageDays: number
    status: 'achieved' | 'watch' | 'risk'
  }
  purchaseOrder: {
    pendingCount: number
    status: 'achieved' | 'watch' | 'risk'
  }
  latestDataDate?: string  // 기존 호환성 유지
  // daily_order max(order_date) 기준 주차 메타데이터
  refWeekInfo?: {
    yearWeek:     string   // e.g. '2026-W09'
    weekStart:    string   // e.g. '2026-02-23' (월요일)
    weekEnd:      string   // e.g. '2026-03-01' (일요일)
    yearMonth:    string   // e.g. '2026-02' (재고현황 월 연계용)
    maxOrderDate: string   // e.g. '2026-02-26' (실제 max 수주일)
  }
  source: string
}

// ─── 주차 계산 헬퍼 ──────────────────────────────────────────────────────────
// 이번 주 월요일 기준으로 "N월 N주차" + 날짜 범위 반환
function getWeekInfo(date: Date): { year: number; month: number; week: number; start: string; end: string } {
  const d = new Date(date)
  const day = d.getDay() || 7   // 일=7, 월=1
  d.setDate(d.getDate() - day + 1)  // 이번 주 월요일
  const year  = d.getFullYear()
  const month = d.getMonth() + 1
  const week  = Math.ceil(d.getDate() / 7)
  // toISOString()은 UTC 기준이라 한국(UTC+9)에서 하루 밀림 → 로컬 날짜 직접 계산
  const pad = (n: number) => String(n).padStart(2, '0')
  const toLocal = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`
  const start = toLocal(d)
  d.setDate(d.getDate() + 4)        // 이번 주 금요일 (주중 Mon~Fri)
  return { year, month, week, start, end: toLocal(d) }
}

// 도넛 등급별 색상 (A~F)
const GRADE_COLORS: Record<string, string> = {
  A: '#10B981', B: '#84CC16', C: '#F59E0B',
  D: '#F97316', E: '#EF4444', F: '#7C3AED',
}

// KPI ID → 이동할 페이지
const KPI_PAGE_MAP: Record<string, string> = {
  order:    'purchase',
  coverage: 'inventory',
  aiaction: 'action-queue',
  urgent:   'risk',
}

// ─── KPI 스켈레톤 (shimmer) ───────────────────────────────────────────────────
function KpiSkeleton({ delay = 0 }: { delay?: number }) {
  const [vis, setVis] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return (
    <div style={{
      ...card, padding: '20px 22px',
      opacity: vis ? 1 : 0,
      transform: vis ? 'translateY(0)' : 'translateY(10px)',
      transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
      overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div className="shimmer-box" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '10px 10px 0 0' }}/>
      <div className="shimmer-box" style={{ height: 12, width: '55%', marginTop: 2 }}/>
      <div className="shimmer-box" style={{ height: 30, width: '40%' }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="shimmer-box" style={{ height: 11, width: '35%' }}/>
        <div className="shimmer-box" style={{ height: 20, width: '22%', borderRadius: 8 }}/>
      </div>
      <div className="shimmer-box" style={{ height: 11, width: '65%', marginTop: -4 }}/>
    </div>
  )
}

// ─── KPI 카드 ──────────────────────────────────────────────────────────────────
function KpiCard({ kpi, delay = 0, onNavigate }: {
  kpi: typeof KPI_DATA[number]
  delay?: number
  onNavigate?: (page: string) => void
}) {
  const [vis, setVis] = useState(false)
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVis(true), delay)
    return () => clearTimeout(t)
  }, [delay])

  const sm = {
    achieved: { label: '달성', bg: T.greenSoft, color: T.green, bar: T.green },
    watch:    { label: '관찰', bg: T.amberSoft, color: T.amber, bar: T.amber },
    risk:     { label: '위험', bg: T.redSoft,   color: T.red,   bar: T.red   },
  }[kpi.status]

  const targetPage = KPI_PAGE_MAP[kpi.id]

  return (
    <div
      onClick={() => targetPage && onNavigate?.(targetPage)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...card, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12,
        opacity: vis ? 1 : 0,
        transform: vis ? (hovered ? 'translateY(-2px)' : 'translateY(0)') : 'translateY(10px)',
        transition: `opacity 0.35s ease ${delay}ms, transform 0.25s ease, box-shadow 0.2s ease`,
        boxShadow: hovered ? '0 6px 20px rgba(15,23,42,0.12)' : '0 1px 4px rgba(15,23,42,0.07)',
        overflow: 'hidden', position: 'relative',
        cursor: targetPage ? 'pointer' : 'default',
      }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: sm.bar, borderRadius: '10px 10px 0 0' }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.text3, letterSpacing: '0.03em' }}>{kpi.label}</div>
        {targetPage && (
          <span style={{
            fontSize: 10, color: hovered ? T.blue : T.text3,
            transition: 'color 0.15s, transform 0.15s',
            transform: hovered ? 'translateX(2px)' : 'translateX(0)',
            display: 'inline-block',
          }}>상세 →</span>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: T.text1, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{kpi.value}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: T.text3 }}>목표 {kpi.target}</span>
        <Badge color={sm.color} bg={sm.bg} border={sm.bg}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sm.color, display: 'inline-block' }}/>
          {sm.label}
        </Badge>
      </div>
      <div style={{ fontSize: 11, color: T.text2, marginTop: -4 }}>{kpi.detail}</div>
    </div>
  )
}

// ─── 수주량 추이 차트 ─────────────────────────────────────────────────────────
function OrderForecastChart({
  data = ORDER_FORECAST,
  hasDbData = false,
  hasForecastData = false,
  lastActualM = "'24.12",
  loading = false,
  onNavigate,
}: {
  data?: ChartRow[]
  hasDbData?: boolean
  hasForecastData?: boolean
  lastActualM?: string
  loading?: boolean
  onNavigate?: (page: string) => void
}) {
  const OrderTT = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const vals = Object.fromEntries(payload.map((p: { dataKey: string; value: number }) => [p.dataKey, p.value]))
    return (
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 9, padding: '10px 14px', boxShadow: '0 4px 16px rgba(15,23,42,0.12)', minWidth: 160 }}>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, fontWeight: 600 }}>{label}</div>
        {vals.p90 != null && <div style={{ fontSize: 11, color: '#60A5FA', marginBottom: 2 }}>P90 (상한): {vals.p90?.toLocaleString()} EA</div>}
        {vals.p50 != null && <div style={{ fontSize: 13, color: T.blue, fontWeight: 700, marginBottom: 2 }}>P50 (중간): {vals.p50?.toLocaleString()} EA</div>}
        {vals.p10 != null && <div style={{ fontSize: 11, color: '#60A5FA', marginBottom: 2 }}>P10 (하한): {vals.p10?.toLocaleString()} EA</div>}
        {vals.actual != null && <div style={{ fontSize: 12, color: T.orange, fontWeight: 600, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${T.border}` }}>실적: {vals.actual?.toLocaleString()} EA</div>}
      </div>
    )
  }

  const lastActualRow = [...data].filter(d => d.actual).pop()
  const nextFcstRow   = data.find(d => !d.actual && d.p50 != null)
  const mom = nextFcstRow && lastActualRow && lastActualRow.actual
    ? (((nextFcstRow.p50 - lastActualRow.actual) / lastActualRow.actual) * 100).toFixed(1)
    : null
  const isUp = parseFloat(mom ?? '0') >= 0

  const chartData = data.map(row => ({ ...row, actual: row.actual ?? null }))

  // Y축 포맷: 1000 단위로 'k' 표시
  const yFmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)

  // X축 커스텀 tick: 주차(3W2) + 날짜(3/09) 두 줄 표시
  // label 형식: "M/DD" (e.g., "3/09") → 위: "3W2", 아래: "3/09"
  const CustomXTick = ({ x, y, payload }: any) => {
    const label: string = payload?.value ?? ''
    const parts = label.split('/')
    if (parts.length !== 2) return null
    const weekNum = Math.ceil(parseInt(parts[1], 10) / 7)
    const weekLabel = `${parts[0]}W${weekNum}`
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={11} textAnchor="middle" fill={T.text2} fontSize={9} fontWeight={700}>{weekLabel}</text>
        <text x={0} y={0} dy={21} textAnchor="middle" fill={T.text3} fontSize={8}>{label}</text>
      </g>
    )
  }

  if (loading) {
    return (
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="shimmer-box" style={{ height: 13, width: 80 }}/>
          <div className="shimmer-box" style={{ height: 28, width: 82, borderRadius: 6 }}/>
        </div>
        <div className="shimmer-box" style={{ height: 11, width: '60%' }}/>
        <div className="shimmer-box" style={{ height: 190, width: '100%', borderRadius: 8 }}/>
        <div style={{ display: 'flex', gap: 18, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          {[80, 60, 90].map((w, i) => <div key={i} className="shimmer-box" style={{ height: 11, width: w }}/>)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>수주량 추이</div>
          <button
            onClick={() => onNavigate?.('monthly-forecast')}
            style={{ fontSize: 11, color: T.blue, background: T.blueSoft, border: `1px solid ${T.blueMid}`, borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>
            월간 예측 →
          </button>
        </div>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>
          단위: EA &nbsp;·&nbsp; 주간 실적 (DB) &nbsp; 점선=AI 예측 밴드 (P10~P90{hasForecastData ? ', DB 실데이터' : ', ML 연동 예정'})
        </div>
        {nextFcstRow && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>다음주 P50 예측</span>
            <span style={{ fontSize: 17, fontWeight: 800, color: isUp ? T.green : T.red, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>
              {nextFcstRow.p50?.toLocaleString() ?? '-'} EA
            </span>
            {mom != null && (
              <span style={{ fontSize: 12, color: isUp ? T.green : T.red, fontWeight: 700 }}>
                {isUp ? '▲' : '▼'} {Math.abs(parseFloat(mom))}% WoW
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 차트 ── */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="orderBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.blue} stopOpacity={0.09}/>
              <stop offset="100%" stopColor={T.blue} stopOpacity={0.01}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false}/>
          <XAxis dataKey="m" tick={<CustomXTick />} axisLine={false} tickLine={false} interval={2} height={34}/>
          <YAxis tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false} tickFormatter={yFmt} width={32}/>
          <Tooltip content={<OrderTT/>}/>
          <Area type="monotone" dataKey="p90" name="p90" stroke="#93C5FD" strokeWidth={1} strokeDasharray="4 3" fill="url(#orderBand)" dot={false}/>
          <Area type="monotone" dataKey="p10" name="p10" stroke="#93C5FD" strokeWidth={1} strokeDasharray="4 3" fill="white" dot={false}/>
          <Line type="monotone" dataKey="p50" name="p50" stroke={T.blue} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4, fill: T.blue, stroke: 'white', strokeWidth: 2 }}/>
          <Line type="monotone" dataKey="actual" name="actual" stroke={T.orange} strokeWidth={2.5}
            dot={{ r: 3, fill: T.orange, stroke: 'white', strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: T.orange, stroke: 'white', strokeWidth: 2 }} connectNulls={false}/>
          <ReferenceLine x={lastActualM} stroke={T.borderMid} strokeDasharray="3 3"
            label={{ value: '실적↔예측', position: 'insideTopRight', fontSize: 9, fill: T.text3, dy: -2 }}/>
        </ComposedChart>
      </ResponsiveContainer>

      {/* 범례 + 상태 알림 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {([['실적 (DB)', T.orange, 'solid', 2.5], ['P50 예측', T.blue, 'dashed', 2], ['P10~P90 밴드', '#93C5FD', 'dashed', 1]] as [string, string, string, number][]).map(([lbl, col, dash, w]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.text2 }}>
              <svg width={18} height={10}><line x1={0} y1={5} x2={18} y2={5} stroke={String(col)} strokeWidth={Number(w)} strokeDasharray={dash === 'dashed' ? '5 3' : '0'}/></svg>
              {lbl}
            </div>
          ))}
        </div>
        {!loading && !hasDbData && (
          <span style={{ fontSize: 10, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 5, padding: '3px 8px', fontWeight: 600 }}>
            ⚠ DB 실적 없음 · 샘플 데이터
          </span>
        )}
        {!loading && hasDbData && !hasForecastData && (
          <span style={{ fontSize: 10, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 5, padding: '3px 8px', fontWeight: 600 }}>
            ✓ 실적 DB 연동
          </span>
        )}
        {!loading && hasDbData && hasForecastData && (
          <span style={{ fontSize: 10, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 5, padding: '3px 8px', fontWeight: 600 }}>
            ✓ 실적·예측 DB 연동
          </span>
        )}
        {loading && (
          <span style={{ fontSize: 10, color: T.text3, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 8px' }}>
            ⏳ 데이터 로딩 중...
          </span>
        )}
      </div>
    </div>
  )
}

// ─── AI 인사이트 타입 ──────────────────────────────────────────────────────────
interface InsightItem { color: 'blue' | 'red' | 'amber' | 'green' | 'purple'; text: string }
interface InsightApiResponse { insights: InsightItem[]; source: string; generatedAt?: string }

// color → 실제 색상 토큰 매핑
const INSIGHT_COLOR: Record<string, string> = {
  blue: T.blue, red: T.red, amber: T.amber, green: T.green, purple: T.purple,
}

// ─── AI 인사이트 패널 (GPT 실데이터 연동) ───────────────────────────────────
function AIInsightPanel() {
  const [insights, setInsights]     = useState<InsightItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [isGpt, setIsGpt]           = useState(false)

  useEffect(() => {
    fetch('/api/ai-insights')
      .then(r => r.json())
      .then((d: InsightApiResponse) => {
        if (d.insights?.length) {
          setInsights(d.insights)
          setIsGpt(d.source !== 'error')
          setGeneratedAt(d.generatedAt ?? null)
        }
      })
      .catch(() => {/* 에러 시 빈 화면 대신 로딩 상태 유지 */})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)', display: 'flex', flexDirection: 'column' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#3B82F6,#6366F1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text1 }}>AI 인사이트 요약</span>
        </div>
        {/* GPT 실데이터 배지 */}
        {!loading && isGpt && (
          <span style={{ fontSize: 10, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 5, padding: '3px 8px', fontWeight: 600 }}>
            ✦ GPT 실데이터 분석
          </span>
        )}
      </div>

      {/* 본문 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        {loading ? (
          [0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: T.surface2, borderRadius: 9, border: `1px solid ${T.border}` }}>
              <div className="shimmer-box" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 4 }}/>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="shimmer-box" style={{ height: 12, width: '90%' }}/>
                <div className="shimmer-box" style={{ height: 12, width: `${60 + (i % 3) * 12}%` }}/>
              </div>
            </div>
          ))
        ) : insights.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: T.text3, fontSize: 13 }}>
            인사이트를 불러올 수 없습니다
          </div>
        ) : (
          insights.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', background: T.surface2, borderRadius: 9, border: `1px solid ${T.border}` }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: INSIGHT_COLOR[item.color] ?? T.blue, flexShrink: 0, marginTop: 4 }}/>
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6 }}>{item.text}</div>
            </div>
          ))
        )}
      </div>

      {/* 푸터 */}
      <div style={{ marginTop: 12, fontSize: 10, color: T.text3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {isGpt && generatedAt
          ? <span>ⓘ GPT-4o-mini · 실데이터 기반 자동 생성 · 6시간 캐시</span>
          : <span>ⓘ 실데이터 기반 AI 인사이트 (GPT-4o-mini)</span>
        }
        {generatedAt && (
          <span style={{ color: T.text3 }}>
            {new Date(generatedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 생성
          </span>
        )}
      </div>
    </div>
  )
}

// ─── 메인 대시보드 ────────────────────────────────────────────────────────────
export default function PageDashboard({
  setPage,
  onAlertCount,
}: {
  setPage?: (page: string) => void
  onAlertCount?: (count: number) => void
}) {
  const [activeGrade, setActiveGrade]   = useState<string | null>(null)
  const [dashData, setDashData]         = useState<DashApiResponse | null>(null)
  const [loading, setLoading]           = useState(true)
  // ─── 실데이터 API 호출 ────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then((d: DashApiResponse) => {
        if (d.source === 'database') {
          setDashData(d)
          // 기준 주차 정보를 sessionStorage에 저장 → 상세화면에서 연계 사용
          // 구매권고·생산권고·리스크관리: weekStart/weekEnd 필터
          // 재고현황: yearMonth 필터
          if (d.refWeekInfo) {
            sessionStorage.setItem('dashRefWeek', JSON.stringify(d.refWeekInfo))
          }
          onAlertCount?.(d.purchaseOrder.pendingCount)
        } else {
          console.warn('[Dashboard] API source:', d.source, (d as any).error)
        }
      })
      .catch(err => console.error('[Dashboard] API 호출 실패:', err))
      .finally(() => setLoading(false))
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // ─── KPI 실데이터 merge ───────────────────────────────────────────────────
  const kpiData = useMemo(() => {
    if (!dashData) return KPI_DATA
    return KPI_DATA.map(k => {
      if (k.id === 'coverage' && dashData.inventoryCoverage) {
        const { coverageDays, status } = dashData.inventoryCoverage
        const gap = 21 - coverageDays
        return { ...k, value: `${coverageDays}일`, status, detail: gap > 0 ? `목표까지 ${gap}일` : '목표 달성' }
      }
      if (k.id === 'order' && dashData.purchaseOrder) {
        const { pendingCount, status } = dashData.purchaseOrder
        return { ...k, value: `${pendingCount}건`, status, detail: pendingCount > 0 ? '즉시 처리 필요' : '처리 완료' }
      }
      // AI 생산 권고 KPI: DB action_queue 건수 (없으면 Mock 유지)
      if (k.id === 'aiaction' && dashData.actionItems.length > 0) {
        const cnt = dashData.actionItems.length
        const status = cnt >= 3 ? 'risk' : cnt >= 1 ? 'watch' : 'achieved'
        return { ...k, value: `${cnt}건`, status, detail: '승인 대기 중' }
      }
      // 긴급 대응 SKU KPI: DB risk_score E~F 등급 건수 (없으면 Mock 유지)
      if (k.id === 'urgent' && dashData.urgentCount > 0) {
        const cnt = dashData.urgentCount
        const status: 'achieved' | 'watch' | 'risk' = cnt >= 3 ? 'risk' : cnt >= 1 ? 'watch' : 'achieved'
        return { ...k, value: `${cnt}종`, status, detail: '즉시 조치 필요' }
      }
      return k
    })
  }, [dashData])

  // ─── 수주량 차트 실데이터 merge ───────────────────────────────────────────
  // API에서 orderChartData(실적+예측 통합)를 받으면 그대로 사용
  // 없으면 ORDER_FORECAST mock에 orderActual을 덮어씌우는 기존 방식 fallback
  // orderChartData가 있으면 실데이터로 판단 (주간으로 전환 후 orderActual은 빈 배열)
  const hasDbOrderData = (dashData?.orderChartData?.length ?? 0) > 0 || (dashData?.orderActual?.length ?? 0) > 0
  const hasForecastData = dashData?.hasForecastData ?? false
  const lastActualM = dashData?.lastActualM ?? "'24.12"

  const orderChartData = useMemo<ChartRow[]>(() => {
    // 신규: API에서 통합 차트 데이터가 오면 바로 사용
    if (dashData?.orderChartData?.length) return dashData.orderChartData
    // fallback: ORDER_FORECAST mock에 실적 덮어씌우기
    if (!hasDbOrderData) return ORDER_FORECAST
    const actualMap: Record<string, number> = {}
    for (const r of dashData!.orderActual) actualMap[r.m] = r.actual
    return ORDER_FORECAST.map(row => {
      const dbVal = actualMap[row.m]
      if (dbVal !== undefined) return { ...row, actual: dbVal }
      const { actual: _removed, ...rest } = row
      return { ...rest }
    })
  }, [dashData, hasDbOrderData])

  // ─── 위험 도넛 실데이터 merge ─────────────────────────────────────────────
  // ML 미실행(riskGrades 빈 배열)이면 RISK_DONUT Mock 사용
  // 실데이터 있으면 A~F 6개 등급 항상 고정 표시 (DB에 없는 등급은 count=0)
  const donutData = useMemo(() => {
    if (loading) return RISK_DONUT.map(d => ({ ...d, count: 0 }))
    if (!dashData || dashData.riskGrades.length === 0) return RISK_DONUT
    const gradeMap = Object.fromEntries(dashData.riskGrades.map(g => [g.grade, g.count]))
    return ['A', 'B', 'C', 'D', 'E', 'F'].map(grade => ({
      grade,
      count: gradeMap[grade] ?? 0,
      color: GRADE_COLORS[grade],
    }))
  }, [dashData])

  const efCount = donutData.filter(d => ['E', 'F'].includes(d.grade)).reduce((a, b) => a + b.count, 0)
  const total   = donutData.reduce((a, b) => a + b.count, 0)

  // ─── AI 생산 권고카드 실데이터 merge ──────────────────────────────────────
  // ML 미실행(actionItems 빈 배열)이면 ACTION_ITEMS_FULL Mock 상위 3건 사용
  const actionCards = useMemo(() => {
    if (!dashData || dashData.actionItems.length === 0) return ACTION_ITEMS_FULL.slice(0, 3)
    return dashData.actionItems
  }, [dashData])

  const isDbAction = (dashData?.actionItems?.length ?? 0) > 0

  return (
    <div>
      <PageHeader
        title="대시보드"
        sub={(() => {
          // 로딩 중 → 목업 날짜 플리커 방지
          if (loading) return '데이터 로딩 중...'
          const ref = dashData?.refWeekInfo
          const pad = (n: number) => String(n).padStart(2, '0')
          const toL = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
          if (ref?.weekStart) {
            const { year, month, week } = getWeekInfo(new Date(ref.weekStart + 'T00:00:00'))
            // DB의 weekStart ~ weekEnd 그대로 사용 (1주 기준)
            const weekEndStr = ref.weekEnd || ref.weekStart
            return `${year}년 ${month}월 ${week}주차 · ${ref.weekStart} ~ ${weekEndStr} · 생산계획팀 주간 현황`
          }
          const { year, month, week, start, end } = getWeekInfo(new Date())
          return `${year}년 ${month}월 ${week}주차 · ${start} ~ ${end} · 생산계획팀 주간 현황`
        })()}
      />

      {/* ── KPI 4개 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {loading
          ? [0, 1, 2, 3].map(i => <KpiSkeleton key={i} delay={i * 60} />)
          : kpiData.map((k, i) => <KpiCard key={k.id} kpi={k} delay={i * 60} onNavigate={setPage} />)
        }
      </div>

      {/* ── Row 2: 수주량 추이 차트 + 위험 도넛 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
        <OrderForecastChart
          data={orderChartData}
          hasDbData={hasDbOrderData}
          hasForecastData={hasForecastData}
          lastActualM={lastActualM}
          loading={loading}
          onNavigate={setPage}
        />

        {/* 위험 도넛 */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={sectionTitle}>위험 품목 현황</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Badge color={T.text3} bg={T.surface2} border={T.border}>전체 {total}건</Badge>
              {!loading && (dashData?.riskGrades.length ?? 0) === 0 && (
                <span style={{ fontSize: 9, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 4, padding: '2px 5px', fontWeight: 600 }}>샘플</span>
              )}
              {!loading && (dashData?.riskGrades.length ?? 0) > 0 && (
                <span style={{ fontSize: 9, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 4, padding: '2px 5px', fontWeight: 600 }}>✓ DB 실데이터</span>
              )}
            </div>
          </div>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 128, height: 128, borderRadius: '50%', background: T.surface2, flexShrink: 0, animation: 'pulse 1.4s ease-in-out infinite' }}/>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {[80, 60, 70, 40, 30, 30].map((w, i) => (
                  <div key={i} style={{ height: 10, borderRadius: 4, background: T.surface2, width: `${w}%`, animation: 'pulse 1.4s ease-in-out infinite' }}/>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
                <PieChart width={128} height={128}>
                  <Pie data={donutData} dataKey="count" cx={59} cy={59}
                    innerRadius={35} outerRadius={56} paddingAngle={2}
                    startAngle={90} endAngle={-270}
                    onMouseEnter={(_entry: unknown, i: number) => setActiveGrade(donutData[i].grade)}
                    onMouseLeave={() => setActiveGrade(null)}>
                    {donutData.map(e => (
                      <Cell key={e.grade} fill={e.color} opacity={activeGrade && activeGrade !== e.grade ? 0.2 : 1} stroke="white" strokeWidth={2}/>
                    ))}
                  </Pie>
                </PieChart>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: T.red, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{efCount}</div>
                  <div style={{ fontSize: 8, color: T.text3, lineHeight: 1.4, marginTop: 2 }}>E~F<br/>위험</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                {donutData.map(d => (
                  <div key={d.grade} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    opacity: activeGrade && activeGrade !== d.grade ? 0.2 : 1,
                    transition: 'opacity 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 7, height: 7, borderRadius: 2, background: d.color, flexShrink: 0 }}/>
                      <span style={{ fontSize: 11, color: T.text2, fontWeight: 500 }}>Grade {d.grade}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 44, height: 4, background: T.surface2, borderRadius: 2 }}>
                        <div style={{ width: `${total > 0 ? (d.count / total) * 100 : 0}%`, height: '100%', background: d.color, borderRadius: 2 }}/>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono',monospace", minWidth: 22, textAlign: 'right' }}>{d.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!loading && efCount > 0 ? (
            <div
              onClick={() => setPage?.('risk')}
              style={{
                marginTop: 12, padding: '8px 11px',
                background: T.redSoft, border: `1px solid ${T.redMid}`,
                borderRadius: 7, fontSize: 11, color: T.red, fontWeight: 500,
                cursor: setPage ? 'pointer' : 'default',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
              <span>⚠ E~F 등급 {efCount}건 — 이번 주 내 조치 필요</span>
              {setPage && <span style={{ fontSize: 10, fontWeight: 700 }}>리스크 관리 →</span>}
            </div>
          ) : !loading ? (
            <div style={{
              marginTop: 12, padding: '8px 11px',
              background: T.greenSoft, border: `1px solid ${T.greenMid}`,
              borderRadius: 7, fontSize: 11, color: T.green, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>✓ E~F 등급 위험 없음</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Row 3: AI 생산 권고사항 + AI 인사이트 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, paddingBottom: 24 }}>
        {/* AI 생산 권고사항 */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '20px 24px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ ...sectionTitle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              AI 생산 권고사항
              <Badge color={T.red} bg={T.redSoft} border={T.redMid}>{actionCards.length}</Badge>
              {!isDbAction && !loading && (
                <span style={{ fontSize: 9, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 4, padding: '2px 5px', fontWeight: 600 }}>샘플</span>
              )}
              {isDbAction && !loading && (
                <span style={{ fontSize: 9, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 4, padding: '2px 5px', fontWeight: 600 }}>✓ DB 실데이터</span>
              )}
            </div>
            <Btn variant="ghost" onClick={() => setPage?.('action-queue')}>전체 보기 →</Btn>
          </div>
          {loading ? (
            [0, 1, 2].map(i => (
              <div key={i} style={{ padding: '11px 13px', background: T.surface2, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.border}`, borderRadius: 8, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div className="shimmer-box" style={{ height: 18, width: 36, borderRadius: 4 }}/>
                    <div className="shimmer-box" style={{ height: 18, width: 80, borderRadius: 4 }}/>
                    <div className="shimmer-box" style={{ height: 18, width: 52, borderRadius: 4 }}/>
                  </div>
                  <div className="shimmer-box" style={{ height: 18, width: 50, borderRadius: 4 }}/>
                </div>
                <div className="shimmer-box" style={{ height: 14, width: '75%' }}/>
                <div className="shimmer-box" style={{ height: 12, width: '55%' }}/>
              </div>
            ))
          ) : actionCards.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: T.text3, fontSize: 13 }}>
              권고 항목이 없습니다
            </div>
          ) : (
            actionCards.map((item: any) => (
              <div key={item.id} style={{
                padding: '11px 13px', background: T.surface2,
                border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${item.priority === 'HIGH' ? T.red : T.amber}`,
                borderRadius: 8, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Badge
                      color={item.priority === 'HIGH' ? T.red : T.amber}
                      bg={item.priority === 'HIGH' ? T.redSoft : T.amberSoft}
                      border={item.priority === 'HIGH' ? T.redMid : T.amberMid}
                      size={10}>{item.priority}</Badge>
                    <span style={{ fontSize: 11, color: T.text3, fontFamily: "'IBM Plex Mono',monospace" }}>{item.sku}</span>
                    <RiskTypeBadge type={item.riskType}/>
                  </div>
                  <span style={{ fontSize: 10, color: T.red, background: T.redSoft, border: `1px solid ${T.redMid}`, borderRadius: 4, padding: '1px 6px' }}>{item.deadline}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>{item.name} — {item.action}</div>
                <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>📈 {item.impact}</div>
              </div>
            ))
          )}
        </div>
        <AIInsightPanel/>
      </div>

    </div>
  )
}
