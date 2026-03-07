'use client'
import React, { useState, useMemo, useEffect } from 'react'
import {
  AreaChart, Area, ComposedChart, Bar, BarChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { T, card, INDUSTRY_SCENARIOS, CATEGORY_COLORS, RADAR_AXES } from '@/lib/data'
import { PageHeader, Btn, Select } from '@/components/ui'

/* ─── Inline helpers ─────────────────────────────────────────────────────── */
const mono = "'IBM Plex Mono',monospace"
const fmt = (n: number) => n.toLocaleString()

function SimSlider({ label, value, onChange, min, max, step = 1, unit = '', color = T.blue }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; color?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color, fontFamily: mono }}>{value > 0 && '+'}{value}{unit}</span>
      </div>
      <div style={{ position: 'relative', height: 6, background: T.surface2, borderRadius: 3, cursor: 'pointer' }}>
        <div style={{ position: 'absolute', left: 0, width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0, width: '100%', height: 20, opacity: 0, cursor: 'pointer', margin: 0 }} />
        <div style={{ position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%,-50%)', width: 14, height: 14, borderRadius: '50%', background: color, border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        <span style={{ fontSize: 9, color: T.text3 }}>{min}{unit}</span>
        <span style={{ fontSize: 9, color: T.text3 }}>{max}{unit}</span>
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color = T.blue, icon }: {
  label: string; value: string; sub: string; color?: string; icon: string
}) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 6 }}>{icon} {label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: mono, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.text2, marginTop: 5 }}>{sub}</div>
    </div>
  )
}

/* ─── Tab constants ────────────────────────────────────────────────────── */
const TABS = [
  { id: 'prediction' as const, label: 'AI 예측 시뮬레이션', icon: '🤖' },
  { id: 'comparison' as const, label: '모델 비교', icon: '📊' },
  { id: 'risk' as const, label: '리스크 시나리오', icon: '⚠' },
]
type TabId = typeof TABS[number]['id']

const MODELS = [
  { id: 'lgbm_q_v2', label: '주간 모델 (LightGBM)' },
  { id: 'lgbm_q_monthly_v1', label: '월간 모델 (LightGBM)' },
]

type ProductInfo = { id: string; name: string; spec: string; currentStock: number; safeStock: number; productionCap: number; estimated?: boolean }
type Prediction = { week: string; weekKey: string; targetDate: string; p10: number; p50: number; p90: number; actual: number | null; nDays: number }
type DataMeta = { totalRecords: number; weekCount: number; dateRange: { start: string; end: string } | null; tables: string[]; modelDesc: string; estimated?: boolean }

/* ─── Client-side simulation ─────────────────────────────────────────── */
function runModelScenario(
  predictions: Prediction[],
  currentStock: number,
  safeStock: number,
  prodCap: number,
  adj: { demandFactor: number; supplyFactor: number; safetyFactor: number; orderQty: number; leadTimeDelta: number },
) {
  let stock = currentStock
  const adjustedSafe = Math.round(safeStock * (1 + adj.safetyFactor / 100))
  let shortageWeeks = 0
  let totalStock = 0

  const result = predictions.map((p, i) => {
    const baseDemand = p.p50
    const adjustedDemand = Math.round(baseDemand * (1 + adj.demandFactor / 100))
    const weeklyProd = Math.round(prodCap * 7 * (1 + adj.supplyFactor / 100))
    const orderArrival = (adj.orderQty > 0 && i >= Math.max(1, Math.ceil((adj.leadTimeDelta + 14) / 7)))
      ? Math.round(adj.orderQty / predictions.length)
      : 0

    // AS-IS: no adjustments
    const asisStock = i === 0
      ? currentStock - baseDemand + prodCap * 7
      : 0 // We'll compute iteratively below

    // TO-BE: with adjustments
    stock = stock - adjustedDemand + weeklyProd + orderArrival
    const shortage = stock < 0
    if (shortage) shortageWeeks++
    totalStock += Math.max(0, stock)

    return {
      week: p.week,
      weekKey: p.weekKey,
      p10: p.p10,
      p50: p.p50,
      p90: p.p90,
      actual: p.actual,
      adjustedDemand,
      stock: Math.max(0, stock),
      rawStock: stock,
      safeStock: adjustedSafe,
      shortage,
      weeklyProd,
      orderArrival,
    }
  })

  // Compute AS-IS iteratively (unclamped for chart visibility)
  let asisStock = currentStock
  for (const r of result) {
    asisStock = asisStock - r.p50 + prodCap * 7
    ;(r as any).asisStock = asisStock
  }

  // 실질 재고 (양수 구간만) 평균
  const positiveStocks = result.map(r => Math.max(0, r.rawStock)).filter(v => v > 0)
  const avgStock = positiveStocks.length > 0
    ? Math.round(positiveStocks.reduce((s, v) => s + v, 0) / positiveStocks.length)
    : 0

  const shortageStart = result.findIndex(r => r.shortage)

  // 총 수요 / 총 공급
  const totalDemand = result.reduce((s, r) => s + r.adjustedDemand, 0)
  const totalSupply = result.reduce((s, r) => s + r.weeklyProd + r.orderArrival, 0) + currentStock
  const supplyGap = totalDemand - totalSupply   // 양수면 공급 부족

  // 재고 회전율: 총수요 / max(평균재고, 1)
  const turnover = avgStock > 0
    ? Math.round(totalDemand / avgStock * 100) / 100
    : totalDemand > 0 ? Infinity : 0

  // 주간 평균 수요
  const avgWeeklyDemand = predictions.length > 0
    ? Math.round(totalDemand / predictions.length)
    : 0

  return { data: result, shortageWeeks, avgStock, shortageStart, turnover, totalDemand, totalSupply, supplyGap, avgWeeklyDemand }
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function PageModelScenario() {
  const [activeTab, setActiveTab] = useState<TabId>('prediction')

  /* ── Product list ── */
  const [productList, setProductList] = useState<{ id: string; name: string; spec: string }[]>([])
  const [loading, setLoading] = useState(true)

  /* ── Selection state ── */
  const [modelId, setModelId] = useState('lgbm_q_v2')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [weeks, setWeeks] = useState(8)

  /* ── Prediction data ── */
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [dataSource, setDataSource] = useState<string>('')
  const [dataMeta, setDataMeta] = useState<DataMeta | null>(null)

  /* ── Adjustments ── */
  const [demandFactor, setDemandFactor] = useState(0)
  const [supplyFactor, setSupplyFactor] = useState(0)
  const [safetyFactor, setSafetyFactor] = useState(0)
  const [orderQty, setOrderQty] = useState(0)
  const [leadTimeDelta, setLeadTimeDelta] = useState(0)

  /* ── Model comparison ── */
  const [compProduct, setCompProduct] = useState('')
  const [weeklyPreds, setWeeklyPreds] = useState<Prediction[]>([])
  const [monthlyPreds, setMonthlyPreds] = useState<Prediction[]>([])
  const [compLoading, setCompLoading] = useState(false)

  /* ── Risk scenario ── */
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)

  /* ── Load product list ── */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/model-scenario?model=${modelId}&product=ALL`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.products?.length > 0) {
          setProductList(data.products)
          if (!selectedProduct) setSelectedProduct(data.products[0].id)
        }
        setLoading(false)
      })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [modelId])

  /* ── Fetch prediction data ── */
  function fetchPredictions(mid?: string, pid?: string, w?: number) {
    const m = mid ?? modelId
    const p = pid ?? selectedProduct
    const wk = w ?? weeks
    if (!p) return
    setDataLoading(true)
    fetch(`/api/model-scenario?model=${m}&product=${encodeURIComponent(p)}&weeks=${wk}`)
      .then(r => r.json())
      .then(data => {
        if (data.product) setProduct(data.product)
        setPredictions(data.predictions ?? [])
        setDataSource(data.source ?? '')
        setDataMeta(data.meta ?? null)
        setDataLoading(false)
      })
      .catch(() => { setDataLoading(false) })
  }

  /* ── Simulation result ── */
  const adj = { demandFactor, supplyFactor, safetyFactor, orderQty, leadTimeDelta }
  const simResult = useMemo(() => {
    if (!product || predictions.length === 0) return null
    return runModelScenario(predictions, product.currentStock, product.safeStock, product.productionCap, adj)
  }, [predictions, product, demandFactor, supplyFactor, safetyFactor, orderQty, leadTimeDelta])

  function resetSliders() {
    setDemandFactor(0); setSupplyFactor(0); setSafetyFactor(0); setOrderQty(0); setLeadTimeDelta(0)
  }

  /* ── Model comparison fetch ── */
  function fetchComparison() {
    if (!compProduct) return
    setCompLoading(true)
    Promise.all([
      fetch(`/api/model-scenario?model=lgbm_q_v2&product=${encodeURIComponent(compProduct)}&weeks=8`).then(r => r.json()),
      fetch(`/api/model-scenario?model=lgbm_q_monthly_v1&product=${encodeURIComponent(compProduct)}&weeks=8`).then(r => r.json()),
    ]).then(([weekly, monthly]) => {
      setWeeklyPreds(weekly.predictions ?? [])
      setMonthlyPreds(monthly.predictions ?? [])
      setCompLoading(false)
    }).catch(() => setCompLoading(false))
  }

  /* ── Risk scenario adjustments ── */
  const scenarioAdj = useMemo(() => {
    if (!selectedScenario) return null
    const sc = INDUSTRY_SCENARIOS.find(s => s.id === selectedScenario)
    if (!sc) return null
    return {
      demandFactor: (sc as any).params?.demandDelta ?? 0,
      supplyFactor: (sc as any).params?.productionDelta ?? 0,
      safetyFactor: (sc as any).params?.safetyBuffer ?? 0,
      orderQty: (sc as any).params?.orderQty ?? 0,
      leadTimeDelta: (sc as any).params?.leadTimeDelta ?? 0,
    }
  }, [selectedScenario])

  const riskResult = useMemo(() => {
    if (!product || predictions.length === 0 || !scenarioAdj) return null
    return runModelScenario(predictions, product.currentStock, product.safeStock, product.productionCap, scenarioAdj)
  }, [predictions, product, scenarioAdj])

  const baseResult = useMemo(() => {
    if (!product || predictions.length === 0) return null
    return runModelScenario(predictions, product.currentStock, product.safeStock, product.productionCap,
      { demandFactor: 0, supplyFactor: 0, safetyFactor: 0, orderQty: 0, leadTimeDelta: 0 })
  }, [predictions, product])

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div>
      <PageHeader
        title="AI 시나리오 분석"
        sub="학습된 ML 모델(LightGBM)의 예측값(P10/P50/P90)을 기반으로 What-If 시나리오를 분석합니다"
      />

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: T.surface2, borderRadius: 10, padding: 4, border: `1px solid ${T.border}` }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '10px 0', fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 500, borderRadius: 8,
              border: activeTab === tab.id ? `1px solid ${T.blue}` : '1px solid transparent',
              background: activeTab === tab.id ? T.surface : 'transparent',
              color: activeTab === tab.id ? T.blue : T.text2,
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: activeTab === tab.id ? '0 1px 4px rgba(37,99,235,0.12)' : 'none',
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═════════════════════ Tab 1: AI 예측 시뮬레이션 ═════════════════════ */}
      {activeTab === 'prediction' && (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Left panel — Controls */}
          <div style={{ width: 360, flexShrink: 0 }}>
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 14 }}>모델 · 제품 선택</div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>예측 모델</div>
                <select value={modelId} onChange={e => setModelId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, color: T.text1, cursor: 'pointer', outline: 'none' }}>
                  {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>제품 선택</div>
                {loading ? (
                  <div style={{ fontSize: 12, color: T.text3, padding: 8 }}>로딩 중...</div>
                ) : (
                  <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, color: T.text1, cursor: 'pointer', outline: 'none' }}>
                    {productList.map(p => (
                      <option key={p.id} value={p.id}>{p.id} | {p.name}{p.spec ? ` | ${p.spec}` : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>분석 기간</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[4, 8, 12].map(w => (
                    <button key={w} onClick={() => setWeeks(w)}
                      style={{
                        flex: 1, padding: '6px 0', fontSize: 12, fontWeight: weeks === w ? 700 : 500,
                        borderRadius: 6, cursor: 'pointer',
                        border: weeks === w ? `1px solid ${T.blue}` : `1px solid ${T.border}`,
                        background: weeks === w ? T.blueSoft : T.surface,
                        color: weeks === w ? T.blue : T.text2,
                      }}>
                      {w}주
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => fetchPredictions()}
                style={{ width: '100%', padding: '9px 0', fontSize: 13, fontWeight: 700, color: '#fff', background: T.blue, border: 'none', borderRadius: 7, cursor: 'pointer' }}>
                조회
              </button>
            </div>

            {/* Adjustment sliders */}
            {predictions.length > 0 && (
              <div style={{ ...card }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>시나리오 조정</div>
                  <button onClick={resetSliders}
                    style={{ fontSize: 10, fontWeight: 600, color: T.text3, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                    초기화
                  </button>
                </div>
                <SimSlider label="수요 변동률" value={demandFactor} onChange={setDemandFactor} min={-30} max={30} unit="%" color={T.blue} />
                <SimSlider label="공급(생산) 조정" value={supplyFactor} onChange={setSupplyFactor} min={-30} max={30} unit="%" color={T.green} />
                <SimSlider label="안전재고 버퍼" value={safetyFactor} onChange={setSafetyFactor} min={0} max={50} unit="%" color={T.purple} />
                <SimSlider label="추가 발주량" value={orderQty} onChange={setOrderQty} min={0} max={5000} step={100} unit=" EA" color={T.orange} />
                <SimSlider label="리드타임 조정" value={leadTimeDelta} onChange={setLeadTimeDelta} min={-7} max={7} unit="일" color={T.amber} />
              </div>
            )}
          </div>

          {/* Right panel — Results */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {!predictions.length && !dataLoading && (
              <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12 }}>
                <div style={{ fontSize: 48 }}>🤖</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>AI 예측 데이터를 조회하세요</div>
                <div style={{ fontSize: 13, color: T.text3, textAlign: 'center', lineHeight: 1.6 }}>
                  왼쪽에서 모델과 제품을 선택한 후<br />"조회" 버튼을 클릭하면 학습된 모델의 예측 결과를 확인할 수 있습니다.
                </div>
              </div>
            )}

            {dataLoading && (
              <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
                <div style={{ fontSize: 14, color: T.text3 }}>예측 데이터 로딩 중...</div>
              </div>
            )}

            {predictions.length > 0 && product && simResult && (
              <>
                {/* Product info banner */}
                <div style={{ ...card, marginBottom: 16, background: `linear-gradient(135deg, ${T.blueSoft}, #F5F3FF)`, borderLeft: `3px solid ${T.blue}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: T.text1 }}>{product.name}</span>
                        {product.estimated && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 4, padding: '1px 6px' }}>
                            재고·생산 추정값
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{product.id} · {product.spec}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: T.text3 }}>현재 재고{product.estimated ? ' (추정)' : ''}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: T.text1, fontFamily: mono }}>{fmt(product.currentStock)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: T.text3 }}>안전재고{product.estimated ? ' (추정)' : ''}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: T.amber, fontFamily: mono }}>{fmt(product.safeStock)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: T.text3 }}>일 생산능력{product.estimated ? ' (추정)' : ''}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: T.green, fontFamily: mono }}>{fmt(product.productionCap)}</div>
                      </div>
                    </div>
                  </div>
                  {product.estimated && (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: T.amberSoft, borderRadius: 6, fontSize: 11, color: T.text2 }}>
                      생산계획(production_plan)에 해당 제품 데이터가 없어, AI 예측(P50) 기반으로 재고·생산능력을 추정했습니다.
                    </div>
                  )}
                </div>

                {/* Data source info */}
                {dataMeta && (
                  <div style={{ ...card, marginBottom: 16, padding: '12px 18px', background: T.surface2, borderLeft: `3px solid ${dataMeta.estimated ? T.amber : T.green}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: dataMeta.estimated ? T.amber : T.green, borderRadius: 4, padding: '2px 7px' }}>
                          {dataMeta.estimated ? '예측 기반' : '실데이터'}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text1 }}>{dataMeta.modelDesc}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16 }}>
                        {dataMeta.dateRange && (
                          <span style={{ fontSize: 11, color: T.text3 }}>
                            기간: <b style={{ color: T.text2, fontFamily: mono }}>{dataMeta.dateRange.start} ~ {dataMeta.dateRange.end}</b>
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: T.text3 }}>
                          데이터: <b style={{ color: T.text2, fontFamily: mono }}>{fmt(dataMeta.totalRecords)}건 / {dataMeta.weekCount}주</b>
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>
                      연동 테이블: {dataMeta.tables.map((t, i) => (
                        <span key={t} style={{ fontFamily: mono, fontSize: 10, color: T.blue, background: T.blueSoft, borderRadius: 3, padding: '1px 5px', marginRight: 4 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                  <KpiCard icon="📅" label="예측 결품 주차" color={simResult.shortageWeeks > 0 ? T.red : T.green}
                    value={simResult.shortageWeeks > 0 ? `${simResult.shortageWeeks}주 / ${predictions.length}주` : '없음'}
                    sub={simResult.shortageStart >= 0 ? `W${String(simResult.shortageStart + 1).padStart(2, '0')}부터 발생` : '시뮬레이션 기간 내 안전'} />
                  <KpiCard icon="📊" label="주간 평균 수요 (P50)" color={T.blue}
                    value={fmt(simResult.avgWeeklyDemand)}
                    sub={`총 수요 ${fmt(simResult.totalDemand)} (${predictions.length}주)`} />
                  <KpiCard icon="📦" label="수급 밸런스" color={simResult.supplyGap > 0 ? T.red : T.green}
                    value={simResult.supplyGap > 0 ? `${fmt(simResult.supplyGap)} 부족` : `${fmt(Math.abs(simResult.supplyGap))} 여유`}
                    sub={`공급 ${fmt(simResult.totalSupply)} / 수요 ${fmt(simResult.totalDemand)}`} />
                  <KpiCard icon="🔄" label={simResult.avgStock > 0 ? '재고 회전율' : '평균 재고'}
                    color={T.purple}
                    value={simResult.avgStock > 0
                      ? `${simResult.turnover === Infinity ? '∞' : simResult.turnover}회`
                      : '재고 소진'}
                    sub={simResult.avgStock > 0
                      ? `평균 재고 ${fmt(simResult.avgStock)}`
                      : `W${String((simResult.shortageStart >= 0 ? simResult.shortageStart : 0) + 1).padStart(2, '0')}에 소진 예상`} />
                </div>

                {/* P10/P50/P90 Band chart */}
                <div style={{ ...card, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>AI 수요 예측 밴드 (P10 ~ P90)</div>
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
                    파란 영역이 예측 불확실성 구간입니다. P50이 가장 가능성 높은 수요, 주황 점선은 시나리오 조정 수요입니다.
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={simResult.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                      <XAxis dataKey="week" fontSize={11} tick={{ fill: T.text3 }} />
                      <YAxis fontSize={11} tick={{ fill: T.text3 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }} />
                      <Area type="monotone" dataKey="p90" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.3)" strokeDasharray="3 3" name="P90 (상한)" />
                      <Area type="monotone" dataKey="p10" fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.3)" strokeDasharray="3 3" name="P10 (하한)" />
                      <Line type="monotone" dataKey="p50" stroke={T.blue} strokeWidth={2.5} dot={{ r: 4 }} name="P50 (예측)" />
                      <Line type="monotone" dataKey="adjustedDemand" stroke={T.orange} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: T.orange }} name="조정 수요" />
                      <Line type="monotone" dataKey="actual" stroke={T.red} strokeWidth={0} dot={{ r: 5, fill: T.red, stroke: '#fff', strokeWidth: 2 }} name="실적" connectNulls={false} />
                      <Bar dataKey="weeklyProd" fill="rgba(34,197,94,0.25)" name="주간 생산량" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Inventory projection chart */}
                <div style={{ ...card }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>재고 추이 시뮬레이션</div>
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
                    회색 선은 현행(AS-IS), 파란 선은 조정 적용 후(TO-BE) 재고 추이입니다. 0 아래(빨간 영역)는 결품(부족) 수량입니다.
                  </div>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={simResult.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                      <XAxis dataKey="week" fontSize={11} tick={{ fill: T.text3 }} />
                      <YAxis fontSize={11} tick={{ fill: T.text3 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }}
                        formatter={(val: any, name: string) => [fmt(Math.round(Number(val))), name]} />
                      <ReferenceLine y={0} stroke={T.text3} strokeWidth={1} />
                      <ReferenceLine y={simResult.data[0]?.safeStock ?? 0} stroke={T.red} strokeDasharray="6 3"
                        label={{ value: '안전재고', position: 'right', fontSize: 10, fill: T.red }} />
                      <Area type="monotone" dataKey="rawStock" fill="rgba(239,68,68,0.1)" stroke="transparent" name="" baseValue={0} />
                      <Line type="monotone" dataKey="rawStock" stroke={T.blue} strokeWidth={2.5} dot={{ r: 4 }} name="TO-BE (조정)" />
                      <Line type="monotone" dataKey="asisStock" stroke={T.text3} strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="AS-IS (현행)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════ Tab 2: 모델 비교 ═════════════════════ */}
      {activeTab === 'comparison' && (
        <div>
          {/* Controls */}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 12 }}>모델 비교 — 제품 선택</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>제품</div>
                <select value={compProduct} onChange={e => setCompProduct(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 12, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, color: T.text1, cursor: 'pointer', outline: 'none' }}>
                  <option value="">선택하세요</option>
                  {productList.map(p => (
                    <option key={p.id} value={p.id}>{p.id} | {p.name}{p.spec ? ` | ${p.spec}` : ''}</option>
                  ))}
                </select>
              </div>
              <button onClick={fetchComparison}
                disabled={!compProduct || compLoading}
                style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, color: '#fff', background: compProduct ? T.blue : T.text3, border: 'none', borderRadius: 7, cursor: compProduct ? 'pointer' : 'default' }}>
                {compLoading ? '로딩...' : '비교 조회'}
              </button>
            </div>
          </div>

          {weeklyPreds.length === 0 && monthlyPreds.length === 0 && !compLoading && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 350, gap: 12 }}>
              <div style={{ fontSize: 48 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>모델 비교를 시작하세요</div>
              <div style={{ fontSize: 13, color: T.text3, textAlign: 'center', lineHeight: 1.6 }}>
                제품을 선택하면 주간 모델과 월간 모델의 예측을 비교할 수 있습니다.
              </div>
            </div>
          )}

          {(weeklyPreds.length > 0 || monthlyPreds.length > 0) && (
            <>
              {/* Overlay chart */}
              <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>P50 예측 비교</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
                  동일 제품에 대한 주간/월간 모델의 P50 예측값을 비교합니다. 실적(빨간 점)에 가까운 선이 더 정확한 모델입니다.
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={(() => {
                    const maxLen = Math.max(weeklyPreds.length, monthlyPreds.length)
                    return Array.from({ length: maxLen }, (_, i) => ({
                      week: `W${String(i + 1).padStart(2, '0')}`,
                      weekly_p50: weeklyPreds[i]?.p50 ?? null,
                      monthly_p50: monthlyPreds[i]?.p50 ?? null,
                      actual: weeklyPreds[i]?.actual ?? monthlyPreds[i]?.actual ?? null,
                    }))
                  })()}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                    <XAxis dataKey="week" fontSize={11} tick={{ fill: T.text3 }} />
                    <YAxis fontSize={11} tick={{ fill: T.text3 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="weekly_p50" stroke={T.blue} strokeWidth={2.5} dot={{ r: 3 }} name="주간 모델 P50" connectNulls />
                    <Line type="monotone" dataKey="monthly_p50" stroke={T.purple} strokeWidth={2.5} dot={{ r: 3 }} name="월간 모델 P50" connectNulls />
                    <Line type="monotone" dataKey="actual" stroke={T.red} strokeWidth={0} dot={{ r: 5, fill: T.red, stroke: '#fff', strokeWidth: 2 }} name="실적" connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Metrics comparison table */}
              <div style={{ ...card }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 14 }}>모델별 예측 정확도 비교</div>
                {(() => {
                  function calcMetrics(preds: Prediction[]) {
                    const withActual = preds.filter(p => p.actual != null)
                    if (withActual.length === 0) return { mae: '-', within5: '-', mape: '-', n: 0 }
                    const mae = withActual.reduce((s, p) => s + Math.abs(p.p50 - p.actual!), 0) / withActual.length
                    const within5 = withActual.filter(p => Math.abs(p.p50 - p.actual!) <= 5).length / withActual.length * 100
                    const nonZero = withActual.filter(p => p.actual !== 0)
                    const mape = nonZero.length > 0
                      ? nonZero.reduce((s, p) => s + Math.abs(p.p50 - p.actual!) / Math.abs(p.actual!), 0) / nonZero.length * 100
                      : 0
                    return { mae: mae.toFixed(1), within5: within5.toFixed(1), mape: mape.toFixed(1), n: withActual.length }
                  }
                  const wm = calcMetrics(weeklyPreds)
                  const mm = calcMetrics(monthlyPreds)
                  const rows = [
                    { label: 'MAE (평균 절대 오차)', weekly: wm.mae, monthly: mm.mae, desc: '낮을수록 좋음' },
                    { label: '±5 적중률 (%)', weekly: wm.within5, monthly: mm.within5, desc: '높을수록 좋음' },
                    { label: 'MAPE (%)', weekly: wm.mape, monthly: mm.mape, desc: '낮을수록 좋음' },
                    { label: '비교 데이터 수', weekly: String(wm.n), monthly: String(mm.n), desc: '실적 있는 주차 수' },
                  ]
                  return (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                          <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textAlign: 'left' }}>지표</th>
                          <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: T.blue, textAlign: 'center' }}>주간 모델</th>
                          <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: T.purple, textAlign: 'center' }}>월간 모델</th>
                          <th style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textAlign: 'right' }}>설명</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                            <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: T.text1 }}>{r.label}</td>
                            <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 800, color: T.blue, textAlign: 'center', fontFamily: mono }}>{r.weekly}</td>
                            <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 800, color: T.purple, textAlign: 'center', fontFamily: mono }}>{r.monthly}</td>
                            <td style={{ padding: '10px 12px', fontSize: 11, color: T.text3, textAlign: 'right' }}>{r.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
                <div style={{ marginTop: 14, padding: '10px 14px', background: T.blueSoft, borderRadius: 8, fontSize: 12, color: T.text2, lineHeight: 1.6 }}>
                  💡 <b>해석 가이드:</b> MAE가 낮고 ±5 적중률이 높은 모델이 해당 제품에 더 적합합니다.
                  두 모델 모두 데이터가 없으면 해당 기간에 예측이 수행되지 않은 것입니다.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═════════════════════ Tab 3: 리스크 시나리오 ═════════════════════ */}
      {activeTab === 'risk' && (
        <div>
          {/* Info banner */}
          {!predictions.length && (
            <div style={{ ...card, marginBottom: 16, background: T.amberSoft, borderLeft: `3px solid ${T.amber}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>먼저 예측 데이터를 조회하세요</div>
              <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.5 }}>
                "AI 예측 시뮬레이션" 탭에서 모델·제품을 선택하고 "조회"를 클릭하면, 해당 예측 데이터를 기반으로 업종별 리스크 시나리오를 적용할 수 있습니다.
              </div>
            </div>
          )}

          {predictions.length > 0 && product && (
            <div style={{ display: 'flex', gap: 20 }}>
              {/* Left — scenario cards */}
              <div style={{ width: 340, flexShrink: 0 }}>
                <div style={{ ...card }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 14 }}>업종별 리스크 시나리오</div>
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>시나리오를 선택하면 AI 예측에 해당 조건이 적용됩니다.</div>
                  {INDUSTRY_SCENARIOS.map((sc: any) => {
                    const isActive = selectedScenario === sc.id
                    const catObj = CATEGORY_COLORS?.[sc.category]
                    const catC = catObj?.c ?? T.text3
                    const catBg = catObj?.bg ?? T.surface2
                    return (
                      <div key={sc.id} onClick={() => setSelectedScenario(isActive ? null : sc.id)}
                        style={{
                          padding: '12px 14px', marginBottom: 8, borderRadius: 8, cursor: 'pointer',
                          border: isActive ? `2px solid ${T.blue}` : `1px solid ${T.border}`,
                          background: isActive ? T.blueSoft : T.surface,
                          transition: 'all 0.15s',
                        }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? T.blue : T.text1 }}>{sc.icon} {sc.label}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                            background: catBg, color: catC,
                          }}>{sc.category}</span>
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.4 }}>{sc.desc}</div>
                        {isActive && sc.params && (
                          <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(255,255,255,0.6)', borderRadius: 5, fontSize: 10, color: T.text2 }}>
                            수요 {sc.params.demandDelta > 0 ? '+' : ''}{sc.params.demandDelta}% · 생산 {sc.params.productionDelta > 0 ? '+' : ''}{sc.params.productionDelta}% · 안전재고 +{sc.params.safetyBuffer}%
                            {sc.params.leadTimeDelta ? ` · 리드타임 ${sc.params.leadTimeDelta > 0 ? '+' : ''}${sc.params.leadTimeDelta}일` : ''}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right — results */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {!selectedScenario && (
                  <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12 }}>
                    <div style={{ fontSize: 48 }}>⚠</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>시나리오를 선택하세요</div>
                    <div style={{ fontSize: 13, color: T.text3 }}>왼쪽에서 리스크 시나리오를 선택하면 영향 분석 결과가 표시됩니다.</div>
                  </div>
                )}

                {selectedScenario && riskResult && baseResult && (() => {
                  const sc = INDUSTRY_SCENARIOS.find((s: any) => s.id === selectedScenario) as any
                  if (!sc) return null
                  const catObj = CATEGORY_COLORS?.[sc.category]

                  // 리스크 점수 계산 (5축)
                  const calcScore = (res: typeof riskResult) => {
                    const zeroWeeks = res.data.filter((d: any) => d.rawStock <= 0).length
                    const totalWeeks = res.data.length || 1
                    const lastStock = res.data[res.data.length - 1]?.rawStock ?? 0
                    const avgPositiveStock = res.avgStock
                    const safeStockVal = res.data[0]?.safeStock ?? 1

                    return {
                      inventoryStability: Math.min(100, Math.max(0, Math.round((avgPositiveStock / Math.max(safeStockVal, 1)) * 50))),
                      costEfficiency: Math.min(100, Math.max(0, Math.round(
                        80 - Math.abs(sc.params.productionDelta) * 1.2 - (sc.params.orderQty / 150)
                      ))),
                      deliveryRate: zeroWeeks === 0 ? 95 : Math.max(20, 95 - zeroWeeks * 12),
                      stockoutRisk: Math.min(100, Math.max(0, 100 - zeroWeeks * 18 - (lastStock <= 0 ? 25 : 0))),
                      productionEfficiency: Math.min(100, Math.max(0, Math.round(
                        85 + sc.params.productionDelta * 0.5 - Math.abs(sc.params.demandDelta - sc.params.productionDelta) * 0.8
                      ))),
                    }
                  }
                  const baseScores = calcScore(baseResult)
                  const riskScores = calcScore(riskResult)
                  const radarData = RADAR_AXES.map(ax => ({
                    axis: ax.label,
                    기본: (baseScores as any)[ax.key] ?? 0,
                    시나리오: (riskScores as any)[ax.key] ?? 0,
                    fullMark: ax.fullMark,
                  }))

                  // 종합 리스크 점수 (0~100, 낮을수록 위험)
                  const avgBaseScore = Math.round(Object.values(baseScores).reduce((s, v) => s + v, 0) / 5)
                  const avgRiskScore = Math.round(Object.values(riskScores).reduce((s, v) => s + v, 0) / 5)
                  const scoreDelta = avgRiskScore - avgBaseScore

                  // 시나리오별 구체적 대응 방안
                  const getActions = () => {
                    const actions: string[] = []
                    if (sc.params.demandDelta > 20) actions.push('수요 급증 대비 선행 재고 확보 (현재 재고의 1.5배 목표)')
                    if (sc.params.demandDelta < -10) actions.push('수요 감소 시 발주량 축소 및 재고 회전율 모니터링')
                    if (sc.params.productionDelta < -15) actions.push('외주 생산 또는 대체 라인 가동 검토')
                    if (sc.params.productionDelta < 0) actions.push('설비 가동률 최적화 및 병목 공정 분석')
                    if (sc.params.leadTimeDelta > 3) actions.push('안전재고 상향 및 대체 공급처 확보')
                    if (sc.params.leadTimeDelta > 0) actions.push('리드타임 증가분 반영한 발주 시점 앞당김')
                    if (sc.params.safetyBuffer > 20) actions.push('안전재고 기준 재설정 및 보관 비용 분석')
                    if (sc.params.orderQty > 2000) actions.push('긴급 발주 계약 체결 및 운송 방법 검토 (항공 vs 해상)')
                    if (riskResult.shortageWeeks > 0) actions.push(`결품 예상 ${riskResult.shortageWeeks}주 대비 고객사 납기 조정 협의`)
                    if (actions.length === 0) actions.push('현재 재고 수준으로 충분히 대응 가능합니다.')
                    return actions
                  }

                  return (
                    <>
                      {/* Scenario header */}
                      <div style={{ ...card, marginBottom: 16, background: `linear-gradient(135deg, ${catObj?.bg ?? T.amberSoft}, ${T.surface})`, borderLeft: `3px solid ${catObj?.c ?? T.amber}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: T.text1 }}>{sc.icon} {sc.label}</div>
                            <div style={{ fontSize: 12, color: T.text2, marginTop: 4 }}>{sc.desc}</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 10, background: scoreDelta < -5 ? T.redSoft : scoreDelta > 5 ? T.greenSoft : T.amberSoft }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T.text3 }}>종합 리스크</div>
                            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: mono, color: scoreDelta < -5 ? T.red : scoreDelta > 5 ? T.green : T.amber }}>
                              {avgRiskScore}
                            </div>
                            <div style={{ fontSize: 10, color: T.text3 }}>
                              {scoreDelta > 0 ? '+' : ''}{scoreDelta}p vs 기본({avgBaseScore})
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: catObj?.bg ?? T.surface2, color: catObj?.c ?? T.text3, fontWeight: 700 }}>{sc.category}</span>
                          <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: T.surface2, color: T.text2 }}>영향: {sc.impact}</span>
                        </div>
                      </div>

                      {/* KPI comparison — 4 cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                        <KpiCard icon="📉" label="결품 주차 변화" color={riskResult.shortageWeeks > baseResult.shortageWeeks ? T.red : T.green}
                          value={`${baseResult.shortageWeeks} → ${riskResult.shortageWeeks}주`}
                          sub={riskResult.shortageWeeks > baseResult.shortageWeeks
                            ? `+${riskResult.shortageWeeks - baseResult.shortageWeeks}주 악화`
                            : riskResult.shortageWeeks < baseResult.shortageWeeks ? `${baseResult.shortageWeeks - riskResult.shortageWeeks}주 개선` : '변동 없음'} />
                        <KpiCard icon="📊" label="수급 갭 변화" color={riskResult.supplyGap > baseResult.supplyGap ? T.red : T.green}
                          value={riskResult.supplyGap > 0 ? `${fmt(riskResult.supplyGap)} 부족` : `${fmt(Math.abs(riskResult.supplyGap))} 여유`}
                          sub={`기본 대비 ${fmt(Math.abs(riskResult.supplyGap - baseResult.supplyGap))} ${riskResult.supplyGap > baseResult.supplyGap ? '악화' : '개선'}`} />
                        <KpiCard icon="📦" label="주간 평균 수요" color={T.purple}
                          value={`${fmt(riskResult.avgWeeklyDemand)}`}
                          sub={`기본 ${fmt(baseResult.avgWeeklyDemand)} (${riskResult.avgWeeklyDemand > baseResult.avgWeeklyDemand ? '+' : ''}${fmt(riskResult.avgWeeklyDemand - baseResult.avgWeeklyDemand)})`} />
                        <KpiCard icon="🏭" label="주간 생산량" color={T.green}
                          value={fmt(riskResult.data[0]?.weeklyProd ?? 0)}
                          sub={`기본 ${fmt(baseResult.data[0]?.weeklyProd ?? 0)} (${sc.params.productionDelta > 0 ? '+' : ''}${sc.params.productionDelta}%)`} />
                      </div>

                      {/* Charts row — 2 columns */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        {/* Demand comparison chart */}
                        <div style={{ ...card }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>수요 비교 (기본 vs 시나리오)</div>
                          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>기본 P50 수요와 시나리오 적용 수요를 비교합니다.</div>
                          <ResponsiveContainer width="100%" height={220}>
                            <ComposedChart data={baseResult.data.map((b: any, i: number) => ({
                              week: b.week,
                              기본수요: b.adjustedDemand,
                              시나리오수요: riskResult.data[i]?.adjustedDemand ?? 0,
                              기본생산: b.weeklyProd,
                              시나리오생산: riskResult.data[i]?.weeklyProd ?? 0,
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                              <XAxis dataKey="week" fontSize={10} tick={{ fill: T.text3 }} />
                              <YAxis fontSize={10} tick={{ fill: T.text3 }} />
                              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${T.border}` }} />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Bar dataKey="기본수요" fill="rgba(107,114,128,0.3)" name="기본 수요" />
                              <Bar dataKey="시나리오수요" fill={`${catObj?.c ?? T.orange}40`} name="시나리오 수요" />
                              <Line type="monotone" dataKey="기본생산" stroke={T.text3} strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="기본 생산" />
                              <Line type="monotone" dataKey="시나리오생산" stroke={T.green} strokeWidth={2} dot={false} name="시나리오 생산" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Radar chart */}
                        <div style={{ ...card }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>리스크 점수 비교</div>
                          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>5축 지표로 기본 상태와 시나리오의 리스크를 비교합니다.</div>
                          <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                              <PolarGrid stroke={T.border} />
                              <PolarAngleAxis dataKey="axis" fontSize={10} tick={{ fill: T.text2 }} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Radar name="기본" dataKey="기본" stroke={T.text3} fill={T.text3} fillOpacity={0.15} strokeWidth={2} />
                              <Radar name="시나리오" dataKey="시나리오" stroke={catObj?.c ?? T.orange} fill={catObj?.c ?? T.orange} fillOpacity={0.2} strokeWidth={2} />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${T.border}` }} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Inventory comparison chart — full width */}
                      <div style={{ ...card, marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>재고 추이 비교 (기본 vs 시나리오)</div>
                        <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
                          회색 선은 기본(조정 없음), 주황색 선은 시나리오 적용 후 재고 추이입니다. 0 아래 빨간 영역은 결품 수량입니다.
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                          <ComposedChart data={baseResult.data.map((b: any, i: number) => ({
                            week: b.week,
                            기본재고: b.rawStock,
                            시나리오재고: riskResult.data[i]?.rawStock ?? 0,
                            safeStock: b.safeStock,
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                            <XAxis dataKey="week" fontSize={11} tick={{ fill: T.text3 }} />
                            <YAxis fontSize={11} tick={{ fill: T.text3 }} />
                            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }}
                              formatter={(val: any, name: string) => [fmt(Math.round(Number(val))), name]} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine y={0} stroke={T.text3} strokeWidth={1} />
                            <ReferenceLine y={baseResult.data[0]?.safeStock ?? 0} stroke={T.red} strokeDasharray="6 3" label={{ value: '안전재고', position: 'right', fontSize: 10, fill: T.red }} />
                            <Area type="monotone" dataKey="시나리오재고" fill="rgba(239,68,68,0.08)" stroke="transparent" name="" baseValue={0} />
                            <Line type="monotone" dataKey="기본재고" stroke={T.text3} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} name="기본 (조정 없음)" />
                            <Line type="monotone" dataKey="시나리오재고" stroke={catObj?.c ?? T.orange} strokeWidth={2.5} dot={{ r: 4 }} name={`시나리오: ${sc.label}`} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>

                      {/* 대응 방안 */}
                      <div style={{ ...card, background: riskResult.shortageWeeks > 0 ? T.redSoft : T.greenSoft, borderLeft: `3px solid ${riskResult.shortageWeeks > 0 ? T.red : T.green}` }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.text1, marginBottom: 10 }}>
                          {riskResult.shortageWeeks > 0 ? '⚠ 대응 방안 (결품 예상)' : '✅ 대응 방안 (안정)'}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {getActions().map((action, i) => (
                            <div key={i} style={{ fontSize: 12, color: T.text2, lineHeight: 1.5, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                              <span style={{ fontSize: 11, color: riskResult.shortageWeeks > 0 ? T.red : T.green, flexShrink: 0 }}>●</span>
                              {action}
                            </div>
                          ))}
                        </div>
                        {riskResult.shortageStart >= 0 && (
                          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.6)', borderRadius: 6, fontSize: 11, color: T.text2 }}>
                            💡 최초 결품 예상: <b>W{String(riskResult.shortageStart + 1).padStart(2, '0')}</b> |
                            결품 기간: <b>{riskResult.shortageWeeks}주</b> |
                            추가 필요 수량: <b>{fmt(Math.max(0, riskResult.supplyGap))}</b>
                          </div>
                        )}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
