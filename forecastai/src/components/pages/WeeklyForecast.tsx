'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { T, card, sectionTitle, WEEKLY_FORECAST_DATA, SIM_SKUS, exportToCsv } from '@/lib/data'
import { Badge, PageHeader, Btn, Table, FilterBar, Select } from '@/components/ui'

// ─── DB SKU 목록 훅 ────────────────────────────────────────────────────────────

type SkuOption = { id: string; name: string; spec: string }

function useDbSkus(model: 'weekly' | 'monthly') {
  const [skus, setSkus] = useState<SkuOption[]>([])
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

  // DB에서 로드 실패하거나 빈 경우 SIM_SKUS 폴백
  const result = skus.length > 0 ? skus : SIM_SKUS.map(s => ({ id: s.id, name: s.name, spec: s.spec }))
  return { skus: result, loaded }
}

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type ForecastRow = { w: string; p10: number | null; p50: number; p90: number | null; actual: number | null }

type EvaluationData = { mape: number; coverageRate: number; mae: number }

type ApiResp = {
  items: ForecastRow[]
  forecastDate?: string
  model?: string
  source: string
  params?: { customerId: string | null; horizons: number[]; historyWeeks: number }
  evaluation?: EvaluationData | null
}

type CustomerOption = { id: string; name: string }
type HorizonKey = '1W' | '2W' | '4W'

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

// ─── 상수 ──────────────────────────────────────────────────────────────────────

// horizon 선택 → API horizons 파라미터 매핑
const HORIZON_PARAMS: Record<HorizonKey, string> = {
  '1W': '7',
  '2W': '7,14',
  '4W': '7,14,28',
}

// severity 스타일
const SEVERITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: T.red, bg: T.redSoft, border: T.redMid },
  high:     { color: T.orange, bg: T.orangeSoft, border: T.orangeMid },
  medium:   { color: T.blue, bg: T.blueSoft, border: T.blueMid },
  low:      { color: T.text3, bg: T.surface2, border: T.border },
}

// risk_type 색상
const RISK_TYPE_COLOR: Record<string, string> = {
  stockout: T.red,
  delivery: T.orange,
  excess:   T.blue,
  margin:   T.purple,
}

// status 한글 레이블
const STATUS_LABEL: Record<string, string> = {
  pending:    '미처리',
  in_progress: '검토중',
  completed:  '처리완료',
  dismissed:  '보류',
}

// 상태별 다음 가능한 액션 버튼 정의
const NEXT_ACTIONS: Record<string, { status: string; label: string; variant: string }[]> = {
  pending: [
    { status: 'in_progress', label: '검토중', variant: 'secondary' },
    { status: 'completed',   label: '처리완료', variant: 'success' },
    { status: 'dismissed',   label: '보류',   variant: 'danger' },
  ],
  in_progress: [
    { status: 'completed', label: '처리완료', variant: 'success' },
    { status: 'dismissed', label: '보류',   variant: 'danger' },
  ],
}

// ─── 예측 날짜 목록 훅 ────────────────────────────────────────────────────────

function useForecastDates(sku: string) {
  const [dates, setDates] = useState<string[]>([])

  useEffect(() => {
    if (!sku) { setDates([]); return }
    fetch(`/api/forecast-weekly/dates?sku=${encodeURIComponent(sku)}`)
      .then(r => r.json())
      .then(resp => setDates(resp.dates ?? []))
      .catch(() => setDates([]))
  }, [sku])

  return dates
}

// ─── 고객사 목록 훅 ────────────────────────────────────────────────────────────

function useCustomers(sku: string) {
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  useEffect(() => {
    if (!sku) { setCustomers([]); return }
    fetch(`/api/forecast-weekly/customers?sku=${encodeURIComponent(sku)}`)
      .then(r => r.json())
      .then(resp => setCustomers(resp.items ?? []))
      .catch(() => setCustomers([]))
  }, [sku])

  return customers
}

// ─── 리스크 등급 훅 ────────────────────────────────────────────────────────────

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

// ─── 조치 큐 훅 ───────────────────────────────────────────────────────────────

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

  // 낙관적 업데이트: 로컬 즉시 변경 후 서버 PATCH, 실패 시 롤백
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
      refresh() // 실패 시 서버 상태로 롤백
    }
  }, [refresh])

  return { actions, actionsLoading, patchStatus }
}

// ─── 주간 예측 데이터 훅 ──────────────────────────────────────────────────────

type ForecastMeta = {
  date?: string
  model?: string
  live: boolean
  mape?: number | null
  coverageRate?: number | null
  mae?: number | null
}

function useForecastWeekly(
  sku: string,
  customerId: string,
  horizon: HorizonKey,
  historyWeeks: number,
  forecastDate: string,
) {
  const [data, setData] = useState<ForecastRow[]>(WEEKLY_FORECAST_DATA as ForecastRow[])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<ForecastMeta>({ live: false })

  useEffect(() => {
    if (!sku) return
    setLoading(true)
    const params = new URLSearchParams({
      sku,
      horizons: HORIZON_PARAMS[horizon],
      history_weeks: String(historyWeeks),
    })
    if (customerId) params.set('customer', customerId)
    if (forecastDate) params.set('forecast_date', forecastDate)

    fetch(`/api/forecast-weekly?${params.toString()}`)
      .then(r => r.json())
      .then((resp: ApiResp) => {
        if (resp.source === 'database' && resp.items?.length >= 2) {
          setData(resp.items)
          setMeta({
            date: resp.forecastDate,
            model: resp.model,
            live: true,
            mape: resp.evaluation?.mape ?? null,
            coverageRate: resp.evaluation?.coverageRate ?? null,
            mae: resp.evaluation?.mae ?? null,
          })
        } else {
          setData(WEEKLY_FORECAST_DATA as ForecastRow[])
          setMeta({ live: false })
        }
      })
      .catch(() => {
        setData(WEEKLY_FORECAST_DATA as ForecastRow[])
        setMeta({ live: false })
      })
      .finally(() => setLoading(false))
  }, [sku, customerId, horizon, historyWeeks, forecastDate])

  return { data, loading, meta }
}

// (SKU_OPTIONS는 컴포넌트 내에서 동적으로 생성 — useDbSkus 사용)

// ─── 세그먼트 버튼 그룹 ───────────────────────────────────────────────────────

function SegmentBtn<TV extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: TV; label: string }[]
  value: TV
  onChange: (v: TV) => void
}) {
  return (
    <div style={{
      display: 'flex',
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 7,
      overflow: 'hidden',
    }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 13px',
            background: value === o.value ? T.blue : 'transparent',
            color: value === o.value ? 'white' : T.text2,
            border: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── 예측 신뢰도 배지 ─────────────────────────────────────────────────────────

/** 예측 구간(P10~P90)의 평균 폭 비율로 신뢰도 산출 (future rows 기준) */
function computeConfidence(data: ForecastRow[]): 'low' | 'medium' | 'good' | null {
  const rows = data.filter(
    d => d.actual == null && d.p10 != null && d.p90 != null && d.p50 > 0
  )
  if (rows.length === 0) return null
  const avgBandRatio =
    rows.reduce((sum, d) => sum + (d.p90! - d.p10!) / (d.p50 + 1), 0) / rows.length
  if (avgBandRatio >= 1.5) return 'low'
  if (avgBandRatio >= 0.7) return 'medium'
  return 'good'
}

const CONFIDENCE_STYLE = {
  low:    { label: '예측 신뢰도 낮음', icon: '⚠', color: '#DC2626', bg: '#FEF2F2', border: '#FEE2E2' },
  medium: { label: '예측 신뢰도 보통', icon: '△', color: '#D97706', bg: '#FFFBEB', border: '#FEF3C7' },
  good:   { label: '예측 신뢰도 양호', icon: '✓', color: '#059669', bg: '#ECFDF5', border: '#D1FAE5' },
}

function ForecastConfidenceBadge({ data, live }: { data: ForecastRow[]; live: boolean }) {
  if (!live) return null
  const level = computeConfidence(data)
  if (!level) return null
  const s = CONFIDENCE_STYLE[level]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 7,
      background: s.bg, border: `1px solid ${s.border}`,
    }}>
      <span style={{ fontSize: 13 }}>{s.icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span>
    </div>
  )
}

// ─── 리스크 등급 배지 ──────────────────────────────────────────────────────────

function RiskGradeBadge({ risk }: { risk: RiskData }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      borderRadius: 8,
      background: risk.gradeColor.bg,
      border: `1px solid ${risk.gradeColor.border}`,
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

// ─── MAPE 스탯 바 ─────────────────────────────────────────────────────────────

function MapeStatBar({ meta }: { meta: ForecastMeta }) {
  if (!meta.live || (meta.mape == null && meta.coverageRate == null)) return null
  const mapeColor = meta.mape == null ? T.text3
    : meta.mape < 15 ? T.green
    : meta.mape < 25 ? T.amber
    : T.red

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      marginTop: 10,
      padding: '7px 12px',
      background: T.surface2,
      borderRadius: 7,
      border: `1px solid ${T.border}`,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 11, color: T.text3, fontWeight: 700 }}>예측 정확도</span>
      {meta.mape != null && (
        <span style={{ fontSize: 11, color: T.text2 }}>
          MAPE{' '}
          <span style={{ fontWeight: 700, color: mapeColor }}>{meta.mape.toFixed(1)}%</span>
        </span>
      )}
      {meta.coverageRate != null && (
        <span style={{ fontSize: 11, color: T.text2 }}>
          밴드 커버리지{' '}
          <span style={{ fontWeight: 700, color: T.blue }}>{meta.coverageRate.toFixed(1)}%</span>
        </span>
      )}
      {meta.mae != null && (
        <span style={{ fontSize: 11, color: T.text2 }}>
          MAE{' '}
          <span style={{ fontWeight: 700, color: T.text1 }}>{meta.mae.toLocaleString()} EA</span>
        </span>
      )}
    </div>
  )
}

// ─── AI 조치 권고 패널 ────────────────────────────────────────────────────────

// ─── AI 수요예측 분석 패널 ────────────────────────────────────────────────────

interface AiAnalysisItem {
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple'
  title: string
  text: string
}

const AI_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  blue:   { text: T.blue,   bg: T.blueSoft,   border: T.blueMid },
  red:    { text: T.red,    bg: T.redSoft,    border: T.redMid },
  amber:  { text: T.amber,  bg: T.amberSoft,  border: T.amberMid },
  green:  { text: T.green,  bg: T.greenSoft,  border: T.greenMid },
  purple: { text: T.purple, bg: '#F5F3FF',    border: '#C4B5FD' },
}

function AiForecastPanel({ sku, model }: { sku: string; model: 'weekly' | 'monthly' }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AiAnalysisItem[]>([])
  const [loading, setLoading] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [source, setSource] = useState<string>('')

  async function fetchAnalysis(refresh = false) {
    setLoading(true)
    try {
      const url = `/api/ai-forecast-analysis?product_id=${sku}&model=${model}${refresh ? '&refresh=1' : ''}`
      const res = await fetch(url)
      const json = await res.json()
      setItems(json.items ?? [])
      setGeneratedAt(json.generatedAt ?? null)
      setSource(json.source ?? '')
    } catch {
      setItems([{ color: 'amber', title: '오류', text: 'AI 분석을 불러오지 못했습니다.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    setOpen(true)
    if (items.length === 0) fetchAnalysis()
  }

  // SKU 변경 시 결과 초기화
  React.useEffect(() => {
    setItems([])
    setGeneratedAt(null)
    setSource('')
    setOpen(false)
  }, [sku])

  return (
    <div style={{ ...card, marginTop: 16, border: `1.5px solid ${T.blueMid}` }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>AI 수요예측 분석</div>
            <div style={{ fontSize: 11, color: T.text3 }}>외부지표(환율·금리) 연계 AI 인사이트 · gpt-4o-mini</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {open && items.length > 0 && (
            <Btn variant="ghost" onClick={() => fetchAnalysis(true)} style={{ fontSize: 11, padding: '4px 10px' }}>
              새로고침
            </Btn>
          )}
          <Btn
            variant={open ? 'secondary' : 'primary'}
            onClick={open ? () => setOpen(false) : handleOpen}
            style={{ fontSize: 12, padding: '6px 14px' }}
          >
            {open ? '닫기' : 'AI 분석 시작'}
          </Btn>
        </div>
      </div>

      {/* 결과 */}
      {open && (
        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: T.text3 }}>
              <div style={{ width: 18, height: 18, border: `2px solid ${T.blueMid}`, borderTopColor: T.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13 }}>GPT가 예측 데이터와 외부지표를 분석하는 중...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {items.map((item, i) => {
                  const style = AI_COLOR[item.color] ?? AI_COLOR.blue
                  return (
                    <div key={i} style={{
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: style.text, marginBottom: 6 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 13, color: T.text1, lineHeight: 1.6 }}>
                        {item.text}
                      </div>
                    </div>
                  )
                })}
              </div>
              {generatedAt && (
                <div style={{ marginTop: 10, fontSize: 10, color: T.text3 }}>
                  생성 시각: {new Date(generatedAt).toLocaleString('ko-KR')}
                  {source === 'cache' && ' · 캐시 (12시간 유효)'}
                  {source === 'gpt' && ' · GPT 생성'}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ActionPanel({
  actions,
  actionsLoading,
  patchStatus,
}: {
  actions: ActionItem[]
  actionsLoading: boolean
  patchStatus: (id: number, status: string) => void
}) {
  const activeCount = actions.filter(a => a.status === 'pending' || a.status === 'in_progress').length

  return (
    <div style={{ ...card, marginTop: 16 }}>
      {/* 패널 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: actions.length > 0 ? 14 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...sectionTitle, marginBottom: 0 }}>AI 조치 권고</span>
          {activeCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: T.red,
              background: T.redSoft, border: `1px solid ${T.redMid}`,
              borderRadius: 10, padding: '2px 8px',
            }}>
              {activeCount}건 처리 필요
            </span>
          )}
        </div>
        {actionsLoading && (
          <span style={{ fontSize: 11, color: T.text3 }}>로딩 중...</span>
        )}
      </div>

      {/* 빈 상태 */}
      {!actionsLoading && actions.length === 0 && (
        <div style={{
          padding: '24px 0',
          textAlign: 'center' as const,
          color: T.text3,
          fontSize: 13,
          background: T.surface2,
          borderRadius: 8,
          border: `1px dashed ${T.border}`,
        }}>
          미처리 조치 없음 · DB 연결 시 AI 권고가 표시됩니다
        </div>
      )}

      {/* 조치 카드 목록 */}
      {actions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {actions.map(action => {
            const sevStyle = SEVERITY_STYLE[action.severity] ?? SEVERITY_STYLE.medium
            const rtColor  = RISK_TYPE_COLOR[action.riskType] ?? T.text2
            const nextBtns = NEXT_ACTIONS[action.status] ?? []
            const isDone   = action.status === 'completed' || action.status === 'dismissed'

            return (
              <div
                key={action.id}
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: `1px solid ${isDone ? T.border : sevStyle.border}`,
                  background: isDone ? T.surface2 : sevStyle.bg,
                  opacity: isDone ? 0.6 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                {/* 카드 헤더 행 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {/* severity 배지 */}
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: sevStyle.color,
                      background: 'white',
                      border: `1px solid ${sevStyle.border}`,
                      borderRadius: 5,
                      padding: '1px 7px',
                    }}>
                      {action.severityLabel}
                    </span>
                    {/* risk_type 배지 */}
                    <span style={{
                      fontSize: 10, fontWeight: 600,
                      color: rtColor,
                      background: `${rtColor}18`,
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}>
                      {action.riskTypeLabel}
                    </span>
                  </div>
                  {/* 현재 상태 */}
                  <span style={{
                    fontSize: 10, color: isDone ? T.text3 : T.text2,
                    fontWeight: isDone ? 400 : 600,
                  }}>
                    {STATUS_LABEL[action.status] ?? action.status}
                  </span>
                </div>

                {/* 조치 설명 */}
                <div style={{
                  fontSize: 13,
                  color: isDone ? T.text3 : T.text1,
                  fontWeight: 500,
                  lineHeight: 1.5,
                  marginBottom: action.suggestedQty != null ? 5 : 8,
                }}>
                  {action.description}
                </div>

                {/* 추천 수량 */}
                {action.suggestedQty != null && (
                  <div style={{ fontSize: 11, color: T.text2, marginBottom: 8 }}>
                    추천 수량{' '}
                    <span style={{
                      fontWeight: 700,
                      color: T.text1,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}>
                      {action.suggestedQty.toLocaleString()} EA
                    </span>
                  </div>
                )}

                {/* 평가일 */}
                <div style={{
                  fontSize: 10,
                  color: T.text3,
                  marginBottom: nextBtns.length > 0 ? 10 : 0,
                }}>
                  평가일: {action.evalDate}
                </div>

                {/* 상태 변경 버튼 */}
                {nextBtns.length > 0 && (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' as const }}>
                    {nextBtns.map(nb => (
                      <Btn
                        key={nb.status}
                        variant={nb.variant as 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'}
                        onClick={() => patchStatus(action.id, nb.status)}
                        style={{ fontSize: 11, padding: '4px 10px' }}
                      >
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

// ─── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function PageWeeklyForecast() {
  const { skus: dbSkus, loaded: skusLoaded } = useDbSkus('weekly')
  const [sku, setSku] = useState(SIM_SKUS[0].id)
  const [customerId, setCustomerId] = useState('')
  const [horizon, setHorizon] = useState<HorizonKey>('4W')
  const [historyWeeks, setHistoryWeeks] = useState<4 | 8>(4)
  const [showActual, setShowActual] = useState(true)
  const [selectedDate, setSelectedDate] = useState('') // '' = 최신
  const [startW, setStartW] = useState('')
  const [endW, setEndW] = useState('')

  // DB SKU 로드 완료 시 첫 번째 SKU로 자동 설정
  useEffect(() => {
    if (skusLoaded && dbSkus.length > 0) {
      setSku(dbSkus[0].id)
    }
  }, [skusLoaded, dbSkus])

  // SKU 변경 시 고객사·날짜 초기화
  function handleSkuChange(newSku: string) {
    setSku(newSku)
    setCustomerId('')
    setSelectedDate('')
  }

  const forecastDates = useForecastDates(sku)
  const customers = useCustomers(sku)
  const risk = useRiskSummary(sku)
  const { data, loading, meta } = useForecastWeekly(sku, customerId, horizon, historyWeeks, selectedDate)

  useEffect(() => {
    if (data.length > 0) {
      setStartW(data[0].w)
      setEndW(data[data.length - 1].w)
    }
  }, [data])

  const filteredData = data.filter(d => (!startW || d.w >= startW) && (!endW || d.w <= endW))
  const { actions, actionsLoading, patchStatus } = useActions(sku)
  const skuMeta = dbSkus.find(s => s.id === sku)

  const SKU_OPTIONS = dbSkus.map(s => ({ value: s.id, label: `${s.id} — ${s.name}` }))

  // 고객사 Select 옵션
  const customerOptions = [
    { value: '', label: '전체 고객사' },
    ...customers.map(c => ({ value: c.id, label: `${c.name} (${c.id})` })),
  ]

  // ─── 커스텀 툴팁 ─────────────────────────────────────────────────────────────

  const BandTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: { dataKey: string; value: number }[]
    label?: string
  }) => {
    if (!active || !payload?.length) return null
    const p = Object.fromEntries(payload.map(item => [item.dataKey, item.value]))
    return (
      <div style={{ ...card, padding: '10px 14px', boxShadow: '0 4px 14px rgba(15,23,42,0.1)' }}>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, fontWeight: 600 }}>{label}</div>
        {p.p90 != null && <div style={{ fontSize: 12, color: '#93C5FD' }}>P90 (상한): {p.p90?.toLocaleString()} EA</div>}
        {p.p50 != null && <div style={{ fontSize: 13, color: T.blue, fontWeight: 700 }}>P50 (중간): {p.p50?.toLocaleString()} EA</div>}
        {p.p10 != null && <div style={{ fontSize: 12, color: '#93C5FD' }}>P10 (하한): {p.p10?.toLocaleString()} EA</div>}
        {p.actual != null && <div style={{ fontSize: 12, color: T.orange, fontWeight: 600 }}>실적: {p.actual?.toLocaleString()} EA</div>}
      </div>
    )
  }

  // ─── 렌더 ─────────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="주간 수요예측"
        sub="SKU별 예측 밴드 (P10 / P50 / P90) · 고객사 필터 · horizon 선택"
        action={
          <Btn
            variant="secondary"
            onClick={() => exportToCsv(
              `weekly_forecast_${sku}.csv`,
              ['주차', 'P10(EA)', 'P50(EA)', 'P90(EA)', '밴드폭(%)', '실적(EA)', '구분'],
              data.map(d => {
                const bw = (d.p10 != null && d.p90 != null && d.p50 > 0)
                  ? Math.round((d.p90 - d.p10) / d.p50 * 100)
                  : ''
                return [d.w, d.p10 ?? '', d.p50, d.p90 ?? '', bw, d.actual ?? '', d.actual != null ? '실적' : '예측']
              }),
            )}
          >
            CSV 내보내기
          </Btn>
        }
      />

      {/* ─── 필터바 ─────────────────────────────────────────────────────────── */}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, whiteSpace: 'nowrap' }}>예측</span>
          <SegmentBtn<HorizonKey>
            options={[
              { value: '1W', label: '1W' },
              { value: '2W', label: '2W' },
              { value: '4W', label: '4W' },
            ]}
            value={horizon}
            onChange={setHorizon}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, whiteSpace: 'nowrap' }}>실적</span>
          <SegmentBtn<'4' | '8'>
            options={[
              { value: '4', label: '4주' },
              { value: '8', label: '8주' },
            ]}
            value={String(historyWeeks) as '4' | '8'}
            onChange={v => setHistoryWeeks(Number(v) as 4 | 8)}
          />
        </div>

        {data.length > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: T.border }} />
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, whiteSpace: 'nowrap' }}>데이터 조회</span>
            <Select
              value={startW}
              onChange={v => { setStartW(v); if (endW && v > endW) setEndW(v) }}
              options={data.map(d => ({ value: d.w, label: d.w }))}
            />
            <span style={{ fontSize: 11, color: T.text3 }}>~</span>
            <Select
              value={endW}
              onChange={v => { setEndW(v); if (startW && v < startW) setStartW(v) }}
              options={[...data].reverse().map(d => ({ value: d.w, label: d.w }))}
            />
          </>
        )}

        <div style={{ width: 1, height: 24, background: T.border }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: T.text2, cursor: 'pointer' }}>
          <div
            onClick={() => setShowActual(prev => !prev)}
            style={{
              width: 36, height: 20, borderRadius: 10,
              background: showActual ? T.blue : T.border,
              position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
            }}
          >
            <div style={{
              position: 'absolute', top: 2, left: showActual ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%', background: 'white',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </div>
          실적 비교
        </label>

        {!loading && (
          meta.live
            ? <span style={{ fontSize: 11, fontWeight: 700, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 6, padding: '3px 8px' }}>● LIVE</span>
            : <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 6, padding: '3px 8px' }}>● MOCK</span>
        )}
      </FilterBar>

      {/* ─── 차트 카드 ───────────────────────────────────────────────────────── */}
      <div style={card}>
        {/* 카드 헤더 */}
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
              {skuMeta?.spec} · 단위: EA · 예측 {horizon} · 실적 {historyWeeks}주 · P10/P50/P90 밴드
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
            {!loading && <ForecastConfidenceBadge data={data} live={meta.live} />}
            {risk && !loading && <RiskGradeBadge risk={risk} />}
            {loading && (
              <div style={{ fontSize: 12, color: T.text3, padding: '6px 12px', background: T.surface2, borderRadius: 7, border: `1px solid ${T.border}` }}>
                데이터 로딩 중...
              </div>
            )}
          </div>
        </div>

        {/* 차트 */}
        {loading ? (
          <div style={{ height: 240, background: T.surface2, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: T.text3, fontSize: 13 }}>로딩 중...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.blue} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={T.blue} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
              <XAxis dataKey="w" tick={{ fontSize: 11, fill: T.text3 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: T.text3 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip content={<BandTooltip />} />
              <Area type="monotone" dataKey="p90" stroke="#93C5FD" strokeWidth={1.2} strokeDasharray="4 3" fill="url(#bandFill)" dot={false} connectNulls />
              <Area type="monotone" dataKey="p10" stroke="#93C5FD" strokeWidth={1.2} strokeDasharray="4 3" fill="white" dot={false} connectNulls />
              <Line
                type="monotone"
                dataKey="p50"
                stroke={T.blue}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: T.blue, stroke: 'white', strokeWidth: 2 }}
                connectNulls
              />
              {showActual && (
                <Line
                  type="monotone"
                  dataKey="actual"
                  stroke={T.orange}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3, fill: T.orange }}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* 예측 정확도 스탯 바 */}
        <MapeStatBar meta={meta} />

        {/* 범례 */}
        <div style={{ display: 'flex', gap: 20, marginTop: 10, padding: '10px 0', borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
          {([
            ['─',   'P50 (중간값)',    T.blue],
            ['- -', 'P90 (상한 90%)', '#93C5FD'],
            ['- -', 'P10 (하한 10%)', '#93C5FD'],
            ...(showActual ? [['- -', '실적 (표시중)', T.orange]] : []),
          ] as [string, string, string][]).map(([dash, lbl, col]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.text2 }}>
              <div style={{ width: 20, borderTop: `2.5px ${dash === '─' ? 'solid' : 'dashed'} ${col}` }} />
              {lbl}
            </div>
          ))}
        </div>
      </div>

      {/* ─── 수치 테이블 ─────────────────────────────────────────────────────── */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={sectionTitle}>주차별 예측 수치</div>
          <span style={{ fontSize: 11, color: T.text3 }}>{filteredData.length}건 / 전체 {data.length}건</span>
        </div>
        <Table
          headers={['주차', 'P10 (EA)', 'P50 (EA)', 'P90 (EA)', '밴드폭', '실적 (EA)', '구분']}
          rows={filteredData.map(d => {
            const bw = (d.p10 != null && d.p90 != null && d.p50 > 0)
              ? Math.round((d.p90 - d.p10) / d.p50 * 100)
              : null
            const bwColor = bw == null ? T.text3
              : bw > 60 ? T.red
              : bw > 30 ? T.amber
              : T.green

            return {
              cells: [
                <span key="w" style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>{d.w}</span>,
                <span key="p10" style={{ color: T.text3 }}>{d.p10 != null ? d.p10.toLocaleString() : '─'}</span>,
                <span key="p50" style={{ fontWeight: 700, color: T.blue }}>{d.p50?.toLocaleString()}</span>,
                <span key="p90" style={{ color: T.text3 }}>{d.p90 != null ? d.p90.toLocaleString() : '─'}</span>,
                bw != null
                  ? <span key="bw" style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: bwColor }}>{bw}%</span>
                  : <span key="bw" style={{ color: T.text3 }}>─</span>,
                <span key="actual" style={{ color: T.orange }}>{d.actual != null ? d.actual.toLocaleString() : '─'}</span>,
                d.actual != null
                  ? <Badge key="badge" color={T.green} bg={T.greenSoft} border={T.greenMid}>실적</Badge>
                  : <Badge key="badge" color={T.blue} bg={T.blueSoft} border={T.blueMid}>예측</Badge>,
              ],
            }
          })}
        />
      </div>

      {/* ─── AI 수요예측 분석 패널 ──────────────────────────────────────────── */}
      <AiForecastPanel sku={sku} model="weekly" />

      {/* ─── AI 조치 권고 패널 ────────────────────────────────────────────────── */}
      <ActionPanel
        actions={actions}
        actionsLoading={actionsLoading}
        patchStatus={patchStatus}
      />

      {/* ─── 하단 메타 ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 12, fontSize: 11, color: T.text3 }}>
        ⓘ 모델: LightGBM Quantile (lgbm_q_v2) · horizon: {HORIZON_PARAMS[horizon]}일
        {customerId ? ` · 고객사: ${customers.find(c => c.id === customerId)?.name ?? customerId}` : ' · 전체 고객사'}
        {meta.live && meta.date ? ` · 예측 기준일: ${meta.date}` : ''}
        {selectedDate ? ' · 과거 주차 조회' : ''}
        {risk ? ` · 리스크: ${risk.grade}등급 (${risk.gradeLabel})` : ''}
      </div>
    </div>
  )
}
