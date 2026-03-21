'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { T, card, sectionTitle, MONTHLY_FORECAST_DATA, SIM_SKUS, exportToCsv } from '@/lib/data'
import { PageHeader, Btn, FilterBar, Select, Table } from '@/components/ui'
import { fetchFXData, fetchSemiData } from '@/lib/externalData'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type MonthRow = {
  m: string
  ym?: string
  p10?: number
  p50?: number
  p90?: number
  actual?: number
  fx?: number
  sox?: number
  dram?: number
  isForecast?: boolean
}

type CustomerItem = { year_month: string; order_qty: number; revenue_qty: number }
type CustomerOption = { id: string; name: string }

type ApiResp = {
  items: MonthRow[]
  historyItems: MonthRow[]
  forecastDate?: string
  model?: string
  source: string
  customerItems?: CustomerItem[]
  evaluation?: { r2: number; mae: number } | null
}

type RiskData = {
  grade: string
  gradeLabel: string
  gradeColor: { color: string; bg: string; border: string }
  totalRisk: number
  stockoutRisk: number
  excessRisk: number
  deliveryRisk: number
  marginRisk: number
  evalDate: string
}

type ActionItem = {
  id: number
  evalDate: string
  riskType: string
  riskTypeLabel: string
  severity: string
  severityLabel: string
  actionType: string
  description: string
  suggestedQty: number | null
  status: string
  createdAt: string
}

type FXRow = Record<string, string | number>
type SemiRow = Record<string, string | number>

// ─── DB SKU 목록 훅 ────────────────────────────────────────────────────────────

type DbSkuItem = { id: string; name: string; spec: string }

function useDbSkus(model: 'weekly' | 'monthly') {
  const [skus, setSkus] = useState<DbSkuItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/forecast-skus?model=${model}`)
      .then(r => r.json())
      .then(resp => {
        if (resp.skus?.length > 0) setSkus(resp.skus)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [model])

  const result = skus.length > 0 ? skus : SIM_SKUS.map(s => ({ id: s.id, name: s.name, spec: s.spec }))
  return { skus: result, loaded }
}

// ─── 상수 ──────────────────────────────────────────────────────────────────────

// (SKU_OPTIONS는 컴포넌트 내에서 동적으로 생성 — useDbSkus 사용)

const FALLBACK_CORR = { fx: -0.72, sox: 0.68, gdp: 0.44, dram: 0.58 }

const SEVERITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: T.red,    bg: T.redSoft,    border: T.redMid    },
  high:     { color: T.orange, bg: T.orangeSoft, border: T.orangeMid },
  medium:   { color: T.blue,   bg: T.blueSoft,   border: T.blueMid   },
  low:      { color: T.text3,  bg: T.surface2,   border: T.border    },
}

const RISK_TYPE_COLOR: Record<string, string> = {
  stockout: T.red,
  delivery: T.orange,
  excess:   T.blue,
  margin:   T.purple,
}

const STATUS_LABEL: Record<string, string> = {
  pending:     '미처리',
  in_progress: '검토중',
  completed:   '처리완료',
  dismissed:   '보류',
}

const NEXT_ACTIONS: Record<string, { status: string; label: string; variant: string }[]> = {
  pending: [
    { status: 'in_progress', label: '검토중',  variant: 'secondary' },
    { status: 'completed',   label: '처리완료', variant: 'success'   },
    { status: 'dismissed',   label: '보류',    variant: 'danger'    },
  ],
  in_progress: [
    { status: 'completed', label: '처리완료', variant: 'success' },
    { status: 'dismissed', label: '보류',    variant: 'danger'  },
  ],
}

// ─── 유틸 ──────────────────────────────────────────────────────────────────────

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b) / n
  const my = ys.reduce((a, b) => a + b) / n
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)
  const dx = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0))
  const dy = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0))
  if (dx === 0 || dy === 0) return null
  return Math.max(-1, Math.min(1, num / (dx * dy)))
}

/** 밴드폭 % (P90-P10)/P50 */
function bandwidthPct(row: MonthRow): number | null {
  if (row.p10 == null || row.p90 == null || !row.p50) return null
  return Math.round(((row.p90 - row.p10) / row.p50) * 100)
}

/** 불확실성 등급 색상 */
function bwColor(bw: number | null): string {
  if (bw == null) return T.text3
  if (bw > 60) return T.red
  if (bw > 35) return T.amber
  return T.green
}

// ─── 서브 컴포넌트 ─────────────────────────────────────────────────────────────

function SegmentBtn<TV extends string>({
  options, value, onChange,
}: { options: { value: TV; label: string }[]; value: TV; onChange: (v: TV) => void }) {
  return (
    <div style={{ display: 'flex', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, overflow: 'hidden' }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          fontSize: 12, fontWeight: 600, padding: '6px 13px',
          background: value === o.value ? T.blue : 'transparent',
          color: value === o.value ? 'white' : T.text2,
          border: 'none', cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
        }}>{o.label}</button>
      ))}
    </div>
  )
}

function RiskGradeBadge({ risk }: { risk: RiskData }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
      borderRadius: 8, background: risk.gradeColor.bg, border: `1px solid ${risk.gradeColor.border}`,
    }}>
      <span style={{ fontSize: 20, fontWeight: 900, color: risk.gradeColor.color, lineHeight: 1 }}>
        {risk.grade}
      </span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: risk.gradeColor.color }}>{risk.gradeLabel}</div>
        <div style={{ fontSize: 10, color: T.text3 }}>리스크 {Math.round(risk.totalRisk)}점</div>
      </div>
    </div>
  )
}

/** ── KPI 요약 카드 3개 ─────────────────────────────────────────────────────── */
function ForecastKpiBar({ forecast, historyItems }: { forecast: MonthRow[]; historyItems: MonthRow[] }) {
  if (forecast.length === 0) return null

  // 피크 시점 (p50 최대)
  const peakRow = forecast.reduce((a, b) => ((b.p50 ?? 0) > (a.p50 ?? 0) ? b : a), forecast[0])

  // 예측 합계 (p50 기준)
  const totalP50 = forecast.reduce((s, d) => s + (d.p50 ?? 0), 0)

  // 평균 밴드폭 (불확실성)
  const bws = forecast.map(bandwidthPct).filter((v): v is number => v != null)
  const avgBw = bws.length > 0 ? Math.round(bws.reduce((a, b) => a + b) / bws.length) : null

  // 직전 실적 대비 첫 예측 증감
  const lastActual = historyItems[historyItems.length - 1]?.actual
  const firstForecast = forecast[0]?.p50
  const vsActual = lastActual && firstForecast
    ? ((firstForecast - lastActual) / lastActual * 100).toFixed(1)
    : null

  const kpis = [
    {
      label: '예측 피크 시점',
      value: peakRow.m,
      sub: `P50 ${(peakRow.p50 ?? 0).toLocaleString()} EA`,
      color: T.blue,
      bg: T.blueSoft,
      border: T.blueMid,
      icon: '📈',
    },
    {
      label: `${forecast.length}개월 예측 합계`,
      value: `${(totalP50 / 1000).toFixed(1)}k EA`,
      sub: vsActual != null
        ? `직전 실적 대비 ${Number(vsActual) >= 0 ? '+' : ''}${vsActual}%`
        : 'P50 기준 누적 수요',
      color: Number(vsActual) >= 0 ? T.green : T.red,
      bg: Number(vsActual) >= 0 ? T.greenSoft : T.redSoft,
      border: Number(vsActual) >= 0 ? T.greenMid : T.redMid,
      icon: '📦',
    },
    {
      label: '평균 불확실성',
      value: avgBw != null ? `±${avgBw}%` : '─',
      sub: avgBw == null ? '데이터 부족' : avgBw > 60 ? '변동성 높음 — 주의 필요' : avgBw > 35 ? '중간 수준' : '안정적 예측 범위',
      color: bwColor(avgBw),
      bg: avgBw != null && avgBw > 60 ? T.redSoft : avgBw != null && avgBw > 35 ? T.amberSoft : T.greenSoft,
      border: avgBw != null && avgBw > 60 ? T.redMid : avgBw != null && avgBw > 35 ? T.amberMid : T.greenMid,
      icon: '📊',
    },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
      {kpis.map(k => (
        <div key={k.label} style={{
          background: k.bg, border: `1px solid ${k.border}`,
          borderRadius: 10, padding: '14px 18px',
        }}>
          <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>
            {k.icon} {k.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.2 }}>
            {k.value}
          </div>
          <div style={{ fontSize: 11, color: T.text2, marginTop: 5 }}>{k.sub}</div>
        </div>
      ))}
    </div>
  )
}

/** ── 정확도 스탯 바 ─────────────────────────────────────────────────────────── */
function MonthlyAccuracyBar({ evaluation, live }: { evaluation: { r2: number; mae: number } | null; live: boolean }) {
  if (!live || !evaluation) return null
  const r2Color = evaluation.r2 >= 0.7 ? T.green : evaluation.r2 >= 0.5 ? T.amber : T.red
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20, marginTop: 10,
      padding: '7px 12px', background: T.surface2, borderRadius: 7,
      border: `1px solid ${T.border}`, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 11, color: T.text3, fontWeight: 700 }}>예측 정확도</span>
      <span style={{ fontSize: 11, color: T.text2 }}>
        R²{' '}
        <span style={{ fontWeight: 700, color: r2Color }}>{evaluation.r2.toFixed(4)}</span>
      </span>
      <span style={{ fontSize: 11, color: T.text2 }}>
        MAE{' '}
        <span style={{ fontWeight: 700, color: T.text1 }}>{evaluation.mae.toFixed(1)} EA</span>
      </span>
      <span style={{ fontSize: 11, color: T.green, fontWeight: 600 }}>✅ 실무 활용 가능 (Ridge Regression)</span>
    </div>
  )
}

/** ── 외부 지표 영향도 수평 바 차트 ──────────────────────────────────────────── */
function CorrBarChart({ items, isCalced }: {
  items: { label: string; value: number; source?: string }[]
  isCalced: boolean
}) {
  const BAR_MAX_W = 120 // px

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(({ label, value, source }) => {
          const isPos = value >= 0
          const barW  = Math.round(Math.abs(value) * BAR_MAX_W)
          const color = isPos ? T.green : T.red
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.text1 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {source && <span style={{ fontSize: 10, color: T.text3 }}>{source}</span>}
                  <span style={{
                    fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 700, color,
                    minWidth: 44, textAlign: 'right',
                  }}>
                    {isPos ? '+' : ''}{value.toFixed(2)}
                  </span>
                </div>
              </div>
              {/* 중앙 기준선 + 바 */}
              <div style={{ position: 'relative', height: 10, background: T.surface2, borderRadius: 5, overflow: 'hidden' }}>
                {/* 중앙 기준선 */}
                <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: T.border, zIndex: 1 }} />
                {/* 실제 바 */}
                <div style={{
                  position: 'absolute',
                  top: 1, height: 8, borderRadius: 4,
                  background: color,
                  width: barW,
                  ...(isPos
                    ? { left: '50%' }
                    : { right: '50%' }),
                  opacity: 0.75,
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.text3, marginTop: 2 }}>
                <span>역상관 ↓</span>
                <span>0</span>
                <span>정상관 ↑</span>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: T.text3, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
        ⓘ 상관계수: -1~+1. |값|이 클수록 예측 수요와 해당 지표의 연동이 강함.
        {!isCalced && ' 실데이터 연동 시 자동 재계산됩니다.'}
      </div>
    </div>
  )
}

/** ── 시나리오 해석 텍스트 패널 ──────────────────────────────────────────────── */
function ScenarioPanel({ forecast, historyItems, horizon }: {
  forecast: MonthRow[]
  historyItems: MonthRow[]
  horizon: number
}) {
  if (forecast.length === 0) return null

  const first = forecast[0]
  const last  = forecast[forecast.length - 1]
  const lastActual = historyItems[historyItems.length - 1]?.actual

  // 첫 달 예측 범위
  const p10 = first.p10 ?? 0
  const p90 = first.p90 ?? 0
  const p50 = first.p50 ?? 0
  const bw  = bandwidthPct(first)

  // 전체 트렌드 (첫 예측 → 마지막 예측)
  const trendPct = last.p50 && first.p50
    ? ((last.p50 - first.p50) / first.p50 * 100).toFixed(1)
    : null
  const trendDir = trendPct != null && Number(trendPct) >= 0 ? '상승' : '하락'
  const trendColor = trendPct != null && Number(trendPct) >= 0 ? T.green : T.red

  // 직전 실적 대비
  const vsPrev = lastActual && p50
    ? ((p50 - lastActual) / lastActual * 100).toFixed(1)
    : null

  const bullets: { text: string; color: string; icon: string }[] = []

  if (vsPrev != null) {
    bullets.push({
      icon: Number(vsPrev) >= 0 ? '↑' : '↓',
      text: `직전 실적(${(lastActual!).toLocaleString()} EA) 대비 1개월 후 P50 예측은 ${Number(vsPrev) >= 0 ? '+' : ''}${vsPrev}% (${p50.toLocaleString()} EA)`,
      color: Number(vsPrev) >= 0 ? T.green : T.red,
    })
  }

  bullets.push({
    icon: '◎',
    text: `1개월 후 수요 범위: P10 ${p10.toLocaleString()} EA ~ P90 ${p90.toLocaleString()} EA (밴드폭 ${bw != null ? bw + '%' : '─'})`,
    color: bwColor(bw),
  })

  if (trendPct != null && forecast.length > 1) {
    bullets.push({
      icon: trendDir === '상승' ? '📈' : '📉',
      text: `${horizon}개월 후까지 P50 기준 ${trendDir} 추세 (${Number(trendPct) >= 0 ? '+' : ''}${trendPct}%, ${(last.p50 ?? 0).toLocaleString()} EA)`,
      color: trendColor,
    })
  }

  if (bw != null && bw > 60) {
    bullets.push({
      icon: '⚠',
      text: `불확실성 높음 (밴드폭 ${bw}%) — 안전재고 상향 및 단계적 생산계획 검토 권고`,
      color: T.red,
    })
  } else if (bw != null && bw <= 35) {
    bullets.push({
      icon: '✅',
      text: `불확실성 낮음 (밴드폭 ${bw}%) — 안정적 생산계획 수립 가능`,
      color: T.green,
    })
  }

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ ...sectionTitle, marginBottom: 12 }}>시나리오 해석</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bullets.map((b, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '9px 12px', borderRadius: 8,
            background: T.surface2, border: `1px solid ${T.border}`,
          }}>
            <span style={{ fontSize: 14, color: b.color, flexShrink: 0, marginTop: 1 }}>{b.icon}</span>
            <span style={{ fontSize: 12, color: T.text1, lineHeight: 1.6 }}>{b.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** ── AI 조치 권고 패널 ───────────────────────────────────────────────────────── */
function ActionPanel({
  actions, actionsLoading, patchStatus,
}: { actions: ActionItem[]; actionsLoading: boolean; patchStatus: (id: number, status: string) => void }) {
  const activeCount = actions.filter(a => a.status === 'pending' || a.status === 'in_progress').length

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: actions.length > 0 ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...sectionTitle, marginBottom: 0 }}>AI 조치 권고</span>
          {activeCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: T.red,
              background: T.redSoft, border: `1px solid ${T.redMid}`,
              borderRadius: 10, padding: '2px 8px',
            }}>{activeCount}건 처리 필요</span>
          )}
        </div>
        {actionsLoading && <span style={{ fontSize: 11, color: T.text3 }}>로딩 중...</span>}
      </div>

      {!actionsLoading && actions.length === 0 && (
        <div style={{
          padding: '24px 0', textAlign: 'center' as const, color: T.text3, fontSize: 13,
          background: T.surface2, borderRadius: 8, border: `1px dashed ${T.border}`,
        }}>
          미처리 조치 없음 · DB 연결 시 AI 권고가 표시됩니다
        </div>
      )}

      {actions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {actions.map(action => {
            const sevStyle = SEVERITY_STYLE[action.severity] ?? SEVERITY_STYLE.medium
            const rtColor  = RISK_TYPE_COLOR[action.riskType] ?? T.text2
            const nextBtns = NEXT_ACTIONS[action.status] ?? []
            const isDone   = action.status === 'completed' || action.status === 'dismissed'
            return (
              <div key={action.id} style={{
                padding: '12px 16px', borderRadius: 8,
                border: `1px solid ${isDone ? T.border : sevStyle.border}`,
                background: isDone ? T.surface2 : sevStyle.bg,
                opacity: isDone ? 0.6 : 1, transition: 'opacity 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sevStyle.color, background: 'white', border: `1px solid ${sevStyle.border}`, borderRadius: 5, padding: '1px 7px' }}>
                      {action.severityLabel}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: rtColor, background: `${rtColor}18`, borderRadius: 4, padding: '1px 6px' }}>
                      {action.riskTypeLabel}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: isDone ? T.text3 : T.text2, fontWeight: isDone ? 400 : 600 }}>
                    {STATUS_LABEL[action.status] ?? action.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: isDone ? T.text3 : T.text1, fontWeight: 500, lineHeight: 1.5, marginBottom: action.suggestedQty != null ? 5 : 8 }}>
                  {action.description}
                </div>
                {action.suggestedQty != null && (
                  <div style={{ fontSize: 11, color: T.text2, marginBottom: 8 }}>
                    추천 수량 <span style={{ fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono',monospace" }}>{action.suggestedQty.toLocaleString()} EA</span>
                  </div>
                )}
                <div style={{ fontSize: 10, color: T.text3, marginBottom: nextBtns.length > 0 ? 10 : 0 }}>
                  평가일: {action.evalDate}
                </div>
                {nextBtns.length > 0 && (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                    {nextBtns.map(nb => (
                      <Btn key={nb.status} variant={nb.variant as any} onClick={() => patchStatus(action.id, nb.status)} style={{ fontSize: 11, padding: '4px 10px' }}>
                        {nb.label}
                      </Btn>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 훅 ────────────────────────────────────────────────────────────────────────

function useMonthlyCustomers(sku: string) {
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  useEffect(() => {
    if (!sku) { setCustomers([]); return }
    fetch(`/api/forecast-monthly/customers?sku=${encodeURIComponent(sku)}`)
      .then(r => r.json())
      .then(resp => setCustomers(resp.items ?? []))
      .catch(() => setCustomers([]))
  }, [sku])
  return customers
}

function useMonthlyForecastDates(sku: string) {
  const [dates, setDates] = useState<string[]>([])
  useEffect(() => {
    if (!sku) { setDates([]); return }
    fetch(`/api/forecast-monthly/dates?sku=${encodeURIComponent(sku)}`)
      .then(r => r.json())
      .then(resp => setDates(resp.dates ?? []))
      .catch(() => setDates([]))
  }, [sku])
  return dates
}

function useRiskSummary(sku: string) {
  const [risk, setRisk] = useState<RiskData | null>(null)
  useEffect(() => {
    if (!sku) { setRisk(null); return }
    fetch(`/api/forecast-weekly/risk-summary?sku=${encodeURIComponent(sku)}`)
      .then(r => r.json())
      .then(resp => setRisk(resp.data ?? null))
      .catch(() => setRisk(null))
  }, [sku])
  return risk
}

function useActions(sku: string) {
  const [actions, setActions] = useState<ActionItem[]>([])
  const [actionsLoading, setActionsLoading] = useState(false)

  const refresh = useCallback(() => {
    if (!sku) { setActions([]); return }
    setActionsLoading(true)
    fetch(`/api/forecast-weekly/actions?sku=${encodeURIComponent(sku)}`)
      .then(r => r.json())
      .then(resp => setActions(resp.items ?? []))
      .catch(() => setActions([]))
      .finally(() => setActionsLoading(false))
  }, [sku])

  useEffect(() => { refresh() }, [refresh])

  const patchStatus = useCallback(async (id: number, status: string) => {
    setActions(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    try {
      const res = await fetch('/api/forecast-weekly/actions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) throw new Error('patch failed')
    } catch {
      refresh()
    }
  }, [refresh])

  return { actions, actionsLoading, patchStatus }
}

function useMonthlyData(sku: string, customer: string, months: number, forecastDate: string) {
  const [forecast, setForecast] = useState<MonthRow[]>(MONTHLY_FORECAST_DATA as any)
  const [historyItems, setHistoryItems] = useState<MonthRow[]>([])
  const [customerData, setCustomerData] = useState<CustomerItem[]>([])
  const [evaluation, setEvaluation] = useState<{ r2: number; mae: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<{ date?: string; live: boolean }>({ live: false })

  useEffect(() => {
    if (!sku) return
    setLoading(true)

    const customerParam = customer && customer !== '전체 고객사'
      ? `&customer=${encodeURIComponent(customer)}`
      : ''
    const dateParam = forecastDate ? `&forecast_date=${encodeURIComponent(forecastDate)}` : ''

    Promise.all([
      fetch(`/api/forecast-monthly?sku=${encodeURIComponent(sku)}${customerParam}&months=${months}${dateParam}`).then(r => r.json()),
      fetchFXData(),
      fetchSemiData(),
    ])
      .then(([forecastResp, fxData, semiData]: [ApiResp, FXRow[], SemiRow[]]) => {
        const fxByMonth: Record<string, number>   = {}
        const soxByMonth: Record<string, number>  = {}
        const dramByMonth: Record<string, number> = {}
        for (const row of fxData)   { fxByMonth[row.d as string]   = row.usd  as number }
        for (const row of semiData) {
          soxByMonth[row.d as string]  = row.sox  as number
          dramByMonth[row.d as string] = row.dram as number
        }

        if (forecastResp.source === 'database' && forecastResp.items?.length >= 1) {
          const merged = forecastResp.items.map(r => ({
            ...r,
            fx:   fxByMonth[r.ym ?? r.m]   ?? 0,
            sox:  soxByMonth[r.ym ?? r.m]  ?? 0,
            dram: dramByMonth[r.ym ?? r.m] ?? 0,
          }))
          setForecast(merged)
          setHistoryItems(forecastResp.historyItems ?? [])
          setEvaluation(forecastResp.evaluation ?? null)
          setMeta({ date: forecastResp.forecastDate, live: true })
        } else {
          setForecast(MONTHLY_FORECAST_DATA as any)
          setHistoryItems([])
          setEvaluation(null)
          setMeta({ live: false })
        }
        setCustomerData(forecastResp.customerItems ?? [])
      })
      .catch(() => {
        setForecast(MONTHLY_FORECAST_DATA as any)
        setHistoryItems([])
        setCustomerData([])
        setEvaluation(null)
        setMeta({ live: false })
      })
      .finally(() => setLoading(false))
  }, [sku, customer, months, forecastDate])

  return { forecast, historyItems, customerData, evaluation, loading, meta }
}

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function PageMonthlyForecast() {
  const { skus: dbSkus, loaded: skusLoaded } = useDbSkus('monthly')
  const [sku, setSku] = useState(SIM_SKUS[0].id)
  const [customerId, setCustomerId] = useState('')
  const [horizon, setHorizon] = useState<1 | 3 | 6>(6)
  const [showFX, setShowFX] = useState(true)
  const [showSOX, setShowSOX] = useState(true)
  const [showActual, setShowActual] = useState(true)
  const [selectedDate, setSelectedDate] = useState('')
  const [startM, setStartM] = useState('')
  const [endM, setEndM] = useState('')

  // DB SKU 로드 완료 시 첫 번째 SKU로 자동 설정
  useEffect(() => {
    if (skusLoaded && dbSkus.length > 0) {
      setSku(dbSkus[0].id)
    }
  }, [skusLoaded, dbSkus])

  function handleSkuChange(newSku: string) {
    setSku(newSku)
    setCustomerId('')
    setSelectedDate('')
  }

  const SKU_OPTIONS = dbSkus.map(s => ({ value: s.id, label: `${s.id} — ${s.name}` }))

  const customers      = useMonthlyCustomers(sku)
  const forecastDates  = useMonthlyForecastDates(sku)
  const risk           = useRiskSummary(sku)
  const { actions, actionsLoading, patchStatus } = useActions(sku)

  const { forecast, historyItems, customerData, evaluation, loading, meta } =
    useMonthlyData(sku, customerId || '전체 고객사', horizon, selectedDate)

  const skuMeta = dbSkus.find(s => s.id === sku)

  // 차트 데이터: 실적(히스토리) + 예측 연결
  const chartData: MonthRow[] = [
    ...historyItems.map(h => ({ ...h, isForecast: false })),
    ...forecast.map(f => ({ ...f, isForecast: true })),
  ]

  useEffect(() => {
    if (chartData.length > 0) {
      setStartM(chartData[0].m)
      setEndM(chartData[chartData.length - 1].m)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyItems, forecast])

  const filteredHistory = historyItems.filter(d => (!startM || d.m >= startM) && (!endM || d.m <= endM))
  const filteredForecast = forecast.filter(d => (!startM || d.m >= startM) && (!endM || d.m <= endM))

  // 실적-예측 경계 레이블
  const boundaryLabel = historyItems.length > 0 ? historyItems[historyItems.length - 1].m : undefined

  // ── 상관계수 계산 ────────────────────────────────────────────────────────────
  const p50s  = forecast.map(d => d.p50  ?? 0)
  const fxs   = forecast.map(d => d.fx   ?? 0)
  const soxs  = forecast.map(d => d.sox  ?? 0)
  const drams = forecast.map(d => d.dram ?? 0)
  const corrFX   = (fxs.some(v => v > 0)   ? pearson(p50s, fxs)   : null) ?? FALLBACK_CORR.fx
  const corrSOX  = (soxs.some(v => v > 0)  ? pearson(p50s, soxs)  : null) ?? FALLBACK_CORR.sox
  const corrDRAM = (drams.some(v => v > 0) ? pearson(p50s, drams) : null) ?? FALLBACK_CORR.dram
  const isCalced = fxs.some(v => v > 0) || soxs.some(v => v > 0)

  const corrItems = [
    { label: 'KRW/USD 환율',   value: corrFX,            source: 'ECOS/FRED' },
    { label: 'SOX 반도체지수',  value: corrSOX,           source: 'SOX Index' },
    { label: 'DRAM 현물가',    value: corrDRAM,           source: 'DRAMeXchange' },
    { label: '국내 GDP 성장률', value: FALLBACK_CORR.gdp, source: '한국은행' },
  ]

  const customerOptions = [
    { value: '', label: '전체 고객사' },
    ...customers.map(c => ({ value: c.id, label: `${c.name} (${c.id})` })),
  ]

  // ── 커스텀 툴팁 ──────────────────────────────────────────────────────────────
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const p = Object.fromEntries(payload.map((item: any) => [item.dataKey, item.value]))
    return (
      <div style={{ ...card, padding: '10px 14px', boxShadow: '0 4px 14px rgba(15,23,42,0.1)' }}>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, fontWeight: 600 }}>{label}</div>
        {p.actual != null && <div style={{ fontSize: 12, color: T.orange, fontWeight: 600 }}>실적: {Number(p.actual).toLocaleString()} EA</div>}
        {p.p90   != null && <div style={{ fontSize: 12, color: '#93C5FD' }}>P90 (상한): {Number(p.p90).toLocaleString()} EA</div>}
        {p.p50   != null && <div style={{ fontSize: 13, color: T.blue, fontWeight: 700 }}>P50 (중간): {Number(p.p50).toLocaleString()} EA</div>}
        {p.p10   != null && <div style={{ fontSize: 12, color: '#93C5FD' }}>P10 (하한): {Number(p.p10).toLocaleString()} EA</div>}
        {p.p90   != null && p.p10 != null && p.p50 != null && (
          <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>
            밴드폭: {Math.round(((p.p90 - p.p10) / p.p50) * 100)}%
          </div>
        )}
        {p.fx  != null && p.fx  > 0 && <div style={{ fontSize: 11, color: T.amber, marginTop: 3 }}>KRW/USD: {Number(p.fx).toLocaleString()}</div>}
        {p.sox != null && p.sox > 0 && <div style={{ fontSize: 11, color: T.purple }}>SOX: {Number(p.sox).toLocaleString()}</div>}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="월간 수요예측"
        sub={`${horizon}개월 중장기 트렌드 · 외부 지표 영향 분석 · 월간 파이프라인`}
        action={
          <Btn variant="secondary" onClick={() => exportToCsv(
            `monthly_forecast_${sku}.csv`,
            ['월', '구분', 'P10(EA)', 'P50(EA)', 'P90(EA)', '밴드폭(%)', '실적(EA)'],
            [
              ...historyItems.map(d => [d.m, '실적', '', '', '', '', d.actual ?? '']),
              ...forecast.map(d => {
                const bw = bandwidthPct(d)
                return [d.m, '예측', d.p10 ?? '', d.p50 ?? '', d.p90 ?? '', bw ?? '', '']
              }),
            ]
          )}>CSV 내보내기</Btn>
        }
      />

      {/* ─── 필터바 ──────────────────────────────────────────────────────────── */}
      <FilterBar>
        <Select value={sku} onChange={handleSkuChange} options={SKU_OPTIONS} />
        <Select value={customerId} onChange={setCustomerId} options={customerOptions} />
        {forecastDates.length > 0 && (
          <Select
            value={selectedDate}
            onChange={setSelectedDate}
            options={[
              { value: '', label: '최신 예측' },
              ...forecastDates.map(d => ({ value: d, label: d })),
            ]}
          />
        )}
        <div style={{ width: 1, height: 24, background: T.border }} />

        <SegmentBtn<'1' | '3' | '6'>
          options={[{ value: '1', label: '1개월' }, { value: '3', label: '3개월' }, { value: '6', label: '6개월' }]}
          value={String(horizon) as '1' | '3' | '6'}
          onChange={v => setHorizon(Number(v) as 1 | 3 | 6)}
        />

        <div style={{ width: 1, height: 24, background: T.border }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: T.text2, cursor: 'pointer' }}>
          <div onClick={() => setShowActual(p => !p)} style={{
            width: 36, height: 20, borderRadius: 10,
            background: showActual ? T.blue : T.border,
            position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: showActual ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%', background: 'white',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          실적 비교
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text2 }}>
          <input type="checkbox" checked={showFX} onChange={e => setShowFX(e.target.checked)} style={{ accentColor: T.blue }} /> KRW/USD
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text2 }}>
          <input type="checkbox" checked={showSOX} onChange={e => setShowSOX(e.target.checked)} style={{ accentColor: T.purple }} /> SOX
        </label>

        {chartData.length > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: T.border }} />
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, whiteSpace: 'nowrap' }}>데이터 조회</span>
            <Select
              value={startM}
              onChange={v => { setStartM(v); if (endM && v > endM) setEndM(v) }}
              options={chartData.map(d => ({ value: d.m, label: d.m }))}
            />
            <span style={{ fontSize: 11, color: T.text3 }}>~</span>
            <Select
              value={endM}
              onChange={v => { setEndM(v); if (startM && v < startM) setStartM(v) }}
              options={[...chartData].reverse().map(d => ({ value: d.m, label: d.m }))}
            />
          </>
        )}

        {!loading && (
          meta.live
            ? <span style={{ fontSize: 11, fontWeight: 700, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 6, padding: '3px 8px' }}>● LIVE</span>
            : <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 6, padding: '3px 8px' }}>● MOCK</span>
        )}
      </FilterBar>

      {/* ─── KPI 요약 카드 ───────────────────────────────────────────────────── */}
      {!loading && <ForecastKpiBar forecast={forecast} historyItems={historyItems} />}

      {/* ─── 차트 카드 ───────────────────────────────────────────────────────── */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>
              {skuMeta?.id} — {skuMeta?.name}
              {customerId && (
                <span style={{ marginLeft: 8, fontSize: 12, color: T.blue, fontWeight: 600 }}>
                  · {customers.find(c => c.id === customerId)?.name ?? customerId}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              {skuMeta?.spec} · 단위: EA · 예측 {horizon}개월 · P10/P50/P90 밴드
              {historyItems.length > 0 && ` · 실적 ${historyItems.length}개월`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {risk && !loading && <RiskGradeBadge risk={risk} />}
            {loading && (
              <div style={{ fontSize: 12, color: T.text3, padding: '6px 12px', background: T.surface2, borderRadius: 7, border: `1px solid ${T.border}` }}>
                데이터 로딩 중...
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ height: 260, background: T.surface2, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: T.text3, fontSize: 13 }}>로딩 중...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 50, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="monthBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.blue} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={T.blue} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 11, fill: T.text3 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: T.text3 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: T.text3 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              {boundaryLabel && (
                <ReferenceLine yAxisId="left" x={boundaryLabel} stroke={T.border} strokeDasharray="4 2"
                  label={{ value: '예측 →', position: 'insideTopRight', fontSize: 10, fill: T.text3 }} />
              )}
              <Area yAxisId="left" type="monotone" dataKey="p90" name="P90" stroke="#BFDBFE" strokeWidth={1} fill="url(#monthBand)" dot={false} connectNulls />
              <Area yAxisId="left" type="monotone" dataKey="p10" name="P10" stroke="#BFDBFE" strokeWidth={1} fill="white" dot={false} connectNulls />
              <Line yAxisId="left" type="monotone" dataKey="p50" name="P50 예측" stroke={T.blue} strokeWidth={2.5}
                dot={{ r: 4, fill: T.blue, stroke: 'white', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls />
              {showActual && (
                <Line yAxisId="left" type="monotone" dataKey="actual" name="실적" stroke={T.orange} strokeWidth={2}
                  strokeDasharray="6 3" dot={{ r: 3, fill: T.orange }} connectNulls={false} />
              )}
              {showFX  && <Line yAxisId="right" type="monotone" dataKey="fx"  name="KRW/USD"   stroke={T.amber}  strokeWidth={1.8} strokeDasharray="5 3" dot={false} />}
              {showSOX && <Line yAxisId="right" type="monotone" dataKey="sox" name="SOX Index" stroke={T.purple} strokeWidth={1.8} strokeDasharray="5 3" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        <MonthlyAccuracyBar evaluation={evaluation} live={meta.live} />

        <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
          {([
            ['─',   'P50 예측',    T.blue],
            ['- -', 'P90/P10 밴드', '#93C5FD'],
            ...(showActual ? [['- -', '실적', T.orange]] : []),
            ...(showFX  ? [['- -', 'KRW/USD', T.amber]]  : []),
            ...(showSOX ? [['- -', 'SOX Index', T.purple]] : []),
          ] as [string, string, string][]).map(([dash, lbl, col]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.text2 }}>
              <div style={{ width: 18, borderTop: `2px ${dash === '─' ? 'solid' : 'dashed'} ${col}` }} />{lbl}
            </div>
          ))}
        </div>
      </div>

      {/* ─── 예측 요약 테이블 + 외부 지표 바 차트 ────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>

        {/* 월별 예측 요약 — P10·P50·P90·밴드폭 통합 */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle}>
              월별 예측 요약
              {customerId && (
                <span style={{ fontSize: 11, color: T.blue, fontWeight: 400, marginLeft: 8 }}>— {customers.find(c => c.id === customerId)?.name}</span>
              )}
            </div>
            {!customerId && chartData.length > 0 && (
              <span style={{ fontSize: 11, color: T.text3 }}>{filteredHistory.length + filteredForecast.length}건 / 전체 {chartData.length}건</span>
            )}
          </div>

          {customerId && customerData.length > 0 ? (
            <Table
              headers={['연월', '수주 (EA)', '매출 (EA)']}
              rows={customerData.map(d => ({
                cells: [
                  <span style={{ fontWeight: 600, color: T.text1 }}>{d.year_month}</span>,
                  <span style={{ fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: T.blue }}>{Math.round(d.order_qty).toLocaleString()}</span>,
                  <span style={{ fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", color: T.green }}>{Math.round(d.revenue_qty).toLocaleString()}</span>,
                ]
              }))}
            />
          ) : customerId && customerData.length === 0 && !loading ? (
            <div style={{ fontSize: 12, color: T.text3, padding: '16px 0' }}>해당 고객사의 실적 데이터가 없습니다.</div>
          ) : (
            <Table
              headers={['월', '구분', 'P50 (EA)', '밴드폭', '전월 대비']}
              rows={[
                // 실적 행
                ...filteredHistory.map(d => ({
                  cells: [
                    <span style={{ fontWeight: 600, color: T.text2 }}>{d.m}</span>,
                    <span style={{ fontSize: 11, color: T.orange, fontWeight: 600, background: T.orangeSoft, border: `1px solid ${T.orangeMid}`, borderRadius: 4, padding: '1px 6px' }}>실적</span>,
                    <span style={{ fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: T.orange }}>{(d.actual ?? 0).toLocaleString()}</span>,
                    <span style={{ color: T.text3 }}>─</span>,
                    <span style={{ color: T.text3 }}>─</span>,
                  ]
                })),
                // 예측 행
                ...filteredForecast.map((d, i) => {
                  const bw = bandwidthPct(d)
                  const prevP50 = i === 0
                    ? filteredHistory[filteredHistory.length - 1]?.actual ?? historyItems[historyItems.length - 1]?.actual
                    : filteredForecast[i - 1]?.p50
                  const diff = prevP50 != null && d.p50 != null ? d.p50 - prevP50 : null
                  const pct  = diff != null && prevP50 ? ((diff / prevP50) * 100).toFixed(1) : null
                  return {
                    cells: [
                      <span style={{ fontWeight: 600, color: T.text1 }}>{d.m}</span>,
                      <span style={{ fontSize: 11, color: T.blue, fontWeight: 600, background: T.blueSoft, border: `1px solid ${T.blueMid}`, borderRadius: 4, padding: '1px 6px' }}>예측</span>,
                      <span style={{ fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: T.blue }}>{(d.p50 ?? 0).toLocaleString()}</span>,
                      bw != null
                        ? <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, fontSize: 11, color: bwColor(bw) }}>±{bw}%</span>
                        : <span style={{ color: T.text3 }}>─</span>,
                      pct != null
                        ? <span style={{ color: diff! > 0 ? T.green : T.red, fontWeight: 600 }}>{diff! > 0 ? '↑' : '↓'}{Math.abs(Number(pct))}%</span>
                        : <span style={{ color: T.text3 }}>─</span>,
                    ]
                  }
                }),
              ]}
            />
          )}
        </div>

        {/* 외부 지표 영향도 — 수평 바 차트 */}
        <div style={card}>
          <div style={sectionTitle}>
            외부 지표 영향도 분석
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 400, marginLeft: 6 }}>
              {isCalced ? '(예측 데이터 기반 산출)' : '(AI 분석 · 기본값)'}
            </span>
          </div>
          <CorrBarChart items={corrItems} isCalced={isCalced} />
        </div>
      </div>

      {/* ─── 시나리오 해석 ────────────────────────────────────────────────────── */}
      {!loading && (
        <ScenarioPanel forecast={forecast} historyItems={historyItems} horizon={horizon} />
      )}

      {/* ─── AI 조치 권고 패널 ───────────────────────────────────────────────── */}
      <ActionPanel actions={actions} actionsLoading={actionsLoading} patchStatus={patchStatus} />

      {/* ─── 하단 메타 ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 12, fontSize: 11, color: T.text3 }}>
        ⓘ 모델: LightGBM Quantile (lgbm_q_v3) | horizon: 28/56/91일 (4W/8W/13W)
        {customerId ? ` · 고객사: ${customers.find(c => c.id === customerId)?.name ?? customerId}` : ' · 전체 고객사'}
        {meta.live && meta.date ? ` · 예측 기준일: ${meta.date}` : ''}
        {selectedDate ? ' · 과거 월 조회' : ''}
        {risk ? ` · 리스크: ${risk.grade}등급 (${risk.gradeLabel})` : ''}
      </div>
    </div>
  )
}
