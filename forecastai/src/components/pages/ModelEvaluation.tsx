'use client'
import React, { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell, Legend,
  ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import { T, card } from '@/lib/data'
import { PageHeader, Select } from '@/components/ui'

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const mono = "'IBM Plex Mono',monospace"
const fmt = (n: number) => n.toLocaleString()
const fmtR = (n: number) => n.toFixed(4)
const fmtP = (n: number) => `${n.toFixed(1)}%`

/* ─── Tab constants ────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'overview'    as const, label: '종합 요약',    icon: '📊' },
  { id: 'accuracy'    as const, label: '정확도 분석',  icon: '🎯' },
  { id: 'overfitting' as const, label: '과적합 분석',  icon: '⚠️' },
  { id: 'features'    as const, label: '피처 중요도',  icon: '📋' },
]
type TabId = typeof TABS[number]['id']

/* ─── Types ────────────────────────────────────────────────────────────────── */
type EnsembleMetrics = { mse: number; rmse: number; mae: number; r2: number; mape: number }
type FoldMetric = { fold: number; val_r2: number; val_mae: number; train_r2: number; gap: number; best_iter: number | null; n_train: number; n_val: number }
type ToleranceAnalysis = {
  tolerance: number; n_total: number; n_success: number; n_fail: number; success_rate: number
  error_mean: number; error_median: number; error_p90: number; error_p99: number
  within_1: number; rate_1: number; within_5: number; rate_5: number
  within_10: number; rate_10: number; within_20: number; rate_20: number
  within_50: number; rate_50: number; within_100: number; rate_100: number
  cumulative_x: number[]; cumulative_y: number[]
}
type FeatureImportance = { rank: number; name: string; importance: number }
type ModelResult = {
  model_id: string; model_label: string; model_type: string; color: string
  ensemble_metrics: EnsembleMetrics; fold_metrics: FoldMetric[]
  avg_val_r2: number; avg_gap: number
  tolerance_analysis: ToleranceAnalysis
  feature_importance_top20: FeatureImportance[]
  elapsed_sec: number
  params: Record<string, any>
}
type Meta = { table: string; total_rows: number; train_rows: number; test_rows: number; n_features: number; n_products: number }
type ComparisonData = {
  timestamp: string; tolerance: number
  weekly_meta: Meta; monthly_meta: Meta
  weekly: ModelResult[]; monthly: ModelResult[]
}

/* ─── Sub-components ───────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color = T.blue, icon }: { label: string; value: string; sub: string; color?: string; icon: string }) {
  return (
    <div style={{ ...card, borderTop: `3px solid ${color}`, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 6 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: mono, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.text2, marginTop: 6 }}>{sub}</div>
    </div>
  )
}

function MetricBadge({ val, best, worst }: { val: number; best: number; worst: number }) {
  const isBest = Math.abs(val - best) < 0.0001
  const isWorst = Math.abs(val - worst) < 0.0001
  return (
    <span style={{
      fontFamily: mono, fontSize: 12, fontWeight: isBest ? 800 : 400,
      color: isBest ? T.green : isWorst ? T.red : T.text1,
    }}>
      {val.toFixed(4)}
      {isBest && <span style={{ fontSize: 9, marginLeft: 4, color: T.green }}>BEST</span>}
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════ */
export default function PageModelEvaluation() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('monthly')
  const [data, setData] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedModelIdx, setSelectedModelIdx] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/model-evaluation')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.source === 'file') {
          setData(json)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const models = data ? data[period] : []
  const meta = data ? (period === 'weekly' ? data.weekly_meta : data.monthly_meta) : null

  /* ─── Derived data ──────────────────────────────────────────────────────── */
  const bestR2 = useMemo(() => {
    if (!models.length) return { model: '', val: 0 }
    const sorted = [...models].sort((a, b) => b.ensemble_metrics.r2 - a.ensemble_metrics.r2)
    return { model: sorted[0].model_label, val: sorted[0].ensemble_metrics.r2 }
  }, [models])

  const bestTol = useMemo(() => {
    if (!models.length) return { model: '', val: 0 }
    const sorted = [...models].sort((a, b) => b.tolerance_analysis.success_rate - a.tolerance_analysis.success_rate)
    return { model: sorted[0].model_label, val: sorted[0].tolerance_analysis.success_rate }
  }, [models])

  const avgRmse = useMemo(() => {
    if (!models.length) return 0
    return models.reduce((s, m) => s + m.ensemble_metrics.rmse, 0) / models.length
  }, [models])

  const minGap = useMemo(() => {
    if (!models.length) return { model: '', val: 0 }
    const sorted = [...models].sort((a, b) => Math.abs(a.avg_gap) - Math.abs(b.avg_gap))
    return { model: sorted[0].model_label, val: sorted[0].avg_gap }
  }, [models])

  /* ─── Tab bar style (same as Simulation.tsx) ─────────────────────────────── */
  const tabBarStyle: React.CSSProperties = {
    display: 'flex', gap: 0, borderBottom: `2px solid ${T.border}`, marginBottom: 24,
  }
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? T.blue : T.text3, cursor: 'pointer', position: 'relative',
    borderBottom: active ? `2px solid ${T.blue}` : '2px solid transparent',
    marginBottom: -2, transition: 'all .15s',
  })

  /* ─── Period toggle ──────────────────────────────────────────────────────── */
  const PeriodToggle = () => (
    <div style={{ display: 'flex', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, overflow: 'hidden' }}>
      {(['weekly', 'monthly'] as const).map(p => (
        <button key={p} onClick={() => setPeriod(p)}
          style={{
            padding: '6px 16px', fontSize: 12, fontWeight: period === p ? 700 : 400, border: 'none', cursor: 'pointer',
            background: period === p ? T.blue : 'transparent', color: period === p ? '#fff' : T.text2,
            transition: 'all .15s',
          }}>
          {p === 'weekly' ? '주간' : '월간'}
        </button>
      ))}
    </div>
  )

  /* ─── Loading / Error ────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        <div>모델 평가 데이터를 불러오는 중...</div>
      </div>
    )
  }
  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.red }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div>모델 비교 데이터를 불러올 수 없습니다.</div>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 8 }}>model_comparison.json 파일을 확인해주세요.</div>
      </div>
    )
  }

  /* ═══ RENDER ══════════════════════════════════════════════════════════════ */
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <PageHeader title="모델 평가" sub={`7개 ML 모델 비교 분석 · ${data.timestamp.split('T')[0]}`} />
        <PeriodToggle />
      </div>

      {/* ── Meta info bar ── */}
      {meta && (
        <div style={{ ...card, padding: '10px 20px', marginBottom: 20, display: 'flex', gap: 28, fontSize: 12, color: T.text2 }}>
          <span>테이블: <b style={{ color: T.text1 }}>{meta.table}</b></span>
          <span>전체: <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.total_rows)}</b>행</span>
          <span>학습: <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.train_rows)}</b></span>
          <span>테스트: <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.test_rows)}</b></span>
          <span>피처: <b style={{ fontFamily: mono, color: T.text1 }}>{meta.n_features}</b>개</span>
          <span>제품: <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.n_products)}</b>종</span>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div style={tabBarStyle}>
        {TABS.map(t => (
          <div key={t.id} style={tabStyle(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'overview' && <TabOverview models={models} bestR2={bestR2} bestTol={bestTol} avgRmse={avgRmse} minGap={minGap} />}
      {activeTab === 'accuracy' && <TabAccuracy models={models} />}
      {activeTab === 'overfitting' && <TabOverfitting models={models} selectedModelIdx={selectedModelIdx} setSelectedModelIdx={setSelectedModelIdx} />}
      {activeTab === 'features' && <TabFeatures models={models} selectedModelIdx={selectedModelIdx} setSelectedModelIdx={setSelectedModelIdx} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Tab 1: 종합 요약
   ═══════════════════════════════════════════════════════════════════════════════ */
function TabOverview({ models, bestR2, bestTol, avgRmse, minGap }: {
  models: ModelResult[]
  bestR2: { model: string; val: number }
  bestTol: { model: string; val: number }
  avgRmse: number
  minGap: { model: string; val: number }
}) {
  const r2Values = models.map(m => m.ensemble_metrics.r2)
  const maeValues = models.map(m => m.ensemble_metrics.mae)
  const rmseValues = models.map(m => m.ensemble_metrics.rmse)
  const tolValues = models.map(m => m.tolerance_analysis.success_rate)

  const maxR2 = Math.max(...r2Values), minR2 = Math.min(...r2Values)
  const minMAE = Math.min(...maeValues), maxMAE = Math.max(...maeValues)
  const minRMSE = Math.min(...rmseValues), maxRMSE = Math.max(...rmseValues)
  const maxTol = Math.max(...tolValues), minTolV = Math.min(...tolValues)

  // R² bar chart data
  const r2Data = models.map(m => ({
    name: m.model_label.replace('LightGBM ', 'LGBM '),
    r2: m.ensemble_metrics.r2,
    fill: m.color,
  })).sort((a, b) => b.r2 - a.r2)

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard icon="🏆" label="최고 R² 모델" value={fmtR(bestR2.val)} sub={bestR2.model} color={T.blue} />
        <KpiCard icon="🎯" label="최고 ±5 적중률" value={fmtP(bestTol.val)} sub={bestTol.model} color={T.green} />
        <KpiCard icon="📉" label="평균 RMSE" value={avgRmse.toFixed(1)} sub={`${models.length}개 모델 평균`} color={T.amber} />
        <KpiCard icon="⚖️" label="최소 과적합 Gap" value={minGap.val.toFixed(3)} sub={minGap.model} color={T.purple} />
      </div>

      {/* Comparison table + R² chart side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Table */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>모델별 성능 비교</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {['모델', 'R²', 'MAE', 'RMSE', '±5 적중률'].map(h => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: h === '모델' ? 'left' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map(m => (
                  <tr key={m.model_id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '8px 6px' }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: m.color, marginRight: 6, verticalAlign: 'middle' }} />
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{m.model_label}</span>
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                      <MetricBadge val={m.ensemble_metrics.r2} best={maxR2} worst={minR2} />
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: mono, fontSize: 12, fontWeight: m.ensemble_metrics.mae === minMAE ? 800 : 400, color: m.ensemble_metrics.mae === minMAE ? T.green : T.text1 }}>
                      {m.ensemble_metrics.mae.toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: mono, fontSize: 12, fontWeight: m.ensemble_metrics.rmse === minRMSE ? 800 : 400, color: m.ensemble_metrics.rmse === minRMSE ? T.green : T.text1 }}>
                      {m.ensemble_metrics.rmse.toFixed(1)}
                    </td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontFamily: mono, fontSize: 12, fontWeight: m.tolerance_analysis.success_rate === maxTol ? 800 : 400, color: m.tolerance_analysis.success_rate === maxTol ? T.green : T.text1 }}>
                      {fmtP(m.tolerance_analysis.success_rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* R² horizontal bar chart */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>R² 비교 (앙상블)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={r2Data} layout="vertical" barSize={18} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
              <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [v.toFixed(4), 'R²']} />
              <Bar dataKey="r2" radius={[0, 4, 4, 0]}>
                {r2Data.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* MAE + ±5 dual bar chart */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>MAE vs ±5 적중률 비교</div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={models.map(m => ({
            name: m.model_label.replace('LightGBM ', 'LGBM '),
            mae: m.ensemble_metrics.mae,
            rate: m.tolerance_analysis.success_rate,
            color: m.color,
          }))} margin={{ bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} label={{ value: 'MAE', angle: -90, position: 'insideLeft', fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="%" label={{ value: '±5 적중률', angle: 90, position: 'insideRight', fontSize: 10 }} />
            <Tooltip />
            <Bar yAxisId="left" dataKey="mae" fill={T.blue} barSize={24} name="MAE" opacity={0.7}>
              {models.map((m, i) => <Cell key={i} fill={m.color} opacity={0.5} />)}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="rate" stroke={T.green} strokeWidth={2.5} name="±5 적중률 (%)" dot={{ r: 4, fill: T.green }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Tab 2: 정확도 분석
   ═══════════════════════════════════════════════════════════════════════════════ */
function TabAccuracy({ models }: { models: ModelResult[] }) {
  // ±5 success rate bar chart
  const tolData = models.map(m => ({
    name: m.model_label.replace('LightGBM ', 'LGBM '),
    rate: m.tolerance_analysis.success_rate,
    color: m.color,
  })).sort((a, b) => b.rate - a.rate)

  // Cumulative accuracy curves — merge all models
  const cumulativeData = useMemo(() => {
    if (!models.length) return []
    const xs = models[0].tolerance_analysis.cumulative_x
    return xs.filter((_, i) => i <= 100).map((x, i) => {
      const point: any = { x }
      models.forEach(m => { point[m.model_id] = m.tolerance_analysis.cumulative_y[i] })
      return point
    })
  }, [models])

  // Band breakdown
  const bandData = useMemo(() => {
    const bands = [
      { band: '±1', key: 'rate_1' },
      { band: '±5', key: 'rate_5' },
      { band: '±10', key: 'rate_10' },
      { band: '±20', key: 'rate_20' },
      { band: '±50', key: 'rate_50' },
      { band: '±100', key: 'rate_100' },
    ]
    return bands.map(b => {
      const row: any = { band: b.band }
      models.forEach(m => {
        row[m.model_id] = (m.tolerance_analysis as any)[b.key]
      })
      return row
    })
  }, [models])

  return (
    <div>
      {/* ±5 bar chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>±5 허용 오차 적중률</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tolData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
              <ReferenceLine y={50} stroke={T.amber} strokeDasharray="5 5" label={{ value: '50%', position: 'right', fontSize: 10, fill: T.amber }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '적중률']} />
              <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                {tolData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Error distribution table */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>오차 분포 통계</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                {['모델', 'Mean', 'Median', 'P90', 'P99'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: h === '모델' ? 'left' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map(m => (
                <tr key={m.model_id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 6px' }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: m.color, marginRight: 6, verticalAlign: 'middle' }} />
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{m.model_label}</span>
                  </td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{m.tolerance_analysis.error_mean.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{m.tolerance_analysis.error_median.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{m.tolerance_analysis.error_p90.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{m.tolerance_analysis.error_p99.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cumulative accuracy curves */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>누적 정확도 곡선 (오차 허용 범위별)</div>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 10 }}>X축: 오차 허용 범위 (개), Y축: 해당 범위 이내 예측 비율 (%)</div>
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={cumulativeData} margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="x" tick={{ fontSize: 10 }} label={{ value: '오차 허용 범위', position: 'insideBottom', offset: -5, fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <ReferenceLine x={5} stroke={T.red} strokeDasharray="5 5" label={{ value: '±5', position: 'top', fontSize: 10, fill: T.red }} />
            <Tooltip formatter={(v: number) => [`${(v as number).toFixed(1)}%`]} labelFormatter={(v) => `오차 ±${v}`} />
            {models.map(m => (
              <Line key={m.model_id} type="monotone" dataKey={m.model_id} stroke={m.color}
                strokeWidth={2} dot={false} name={m.model_label} />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Band breakdown grouped bar chart */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>허용 밴드별 적중률 비교</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={bandData} barSize={10}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="band" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
            <Tooltip formatter={(v: number) => [`${(v as number).toFixed(1)}%`]} />
            {models.map(m => (
              <Bar key={m.model_id} dataKey={m.model_id} fill={m.color} name={m.model_label} />
            ))}
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Tab 3: 과적합 분석
   ═══════════════════════════════════════════════════════════════════════════════ */
function TabOverfitting({ models, selectedModelIdx, setSelectedModelIdx }: {
  models: ModelResult[]
  selectedModelIdx: number
  setSelectedModelIdx: (i: number) => void
}) {
  // Train vs Val R² grouped bar + gap line
  const overfitData = models.map(m => {
    const avgTrain = m.fold_metrics.reduce((s, f) => s + f.train_r2, 0) / m.fold_metrics.length
    return {
      name: m.model_label.replace('LightGBM ', 'LGBM '),
      train_r2: parseFloat(avgTrain.toFixed(4)),
      val_r2: parseFloat(m.avg_val_r2.toFixed(4)),
      gap: parseFloat(m.avg_gap.toFixed(4)),
      color: m.color,
    }
  })

  // Fold scatter data
  const foldScatterData = useMemo(() =>
    models.flatMap(m =>
      m.fold_metrics.map(f => ({
        model: m.model_label,
        model_id: m.model_id,
        train_r2: f.train_r2,
        val_r2: f.val_r2,
        gap: f.gap,
        fold: f.fold,
        color: m.color,
      }))
    ), [models])

  const selectedModel = models[selectedModelIdx] ?? models[0]

  return (
    <div>
      {/* Train vs Val R² chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Train R² vs Val R² 비교</div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={overfitData} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip />
              <Bar dataKey="train_r2" fill={T.blue} barSize={16} name="Train R²" opacity={0.6} />
              <Bar dataKey="val_r2" fill={T.green} barSize={16} name="Val R²" />
              <Line type="monotone" dataKey="gap" stroke={T.red} strokeWidth={2} strokeDasharray="5 3" name="Gap" dot={{ r: 3, fill: T.red }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Fold scatter plot */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Fold별 Train-Val R² 산점도</div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>대각선 위: 과적합 없음, 대각선 아래: 과적합</div>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ left: 10, right: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
              <XAxis type="number" dataKey="train_r2" name="Train R²" tick={{ fontSize: 10 }}
                label={{ value: 'Train R²', position: 'insideBottom', offset: -5, fontSize: 10 }} domain={['auto', 'auto']} />
              <YAxis type="number" dataKey="val_r2" name="Val R²" tick={{ fontSize: 10 }}
                label={{ value: 'Val R²', angle: -90, position: 'insideLeft', fontSize: 10 }} domain={['auto', 'auto']} />
              <ZAxis range={[50, 50]} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 0.8, y: 0.8 }]} stroke={T.text3} strokeDasharray="5 5" />
              <Tooltip content={({ payload }) => {
                if (!payload?.length) return null
                const d = payload[0].payload
                return (
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px', fontSize: 11 }}>
                    <div style={{ fontWeight: 700 }}>{d.model} — Fold {d.fold}</div>
                    <div>Train R²: <b>{d.train_r2.toFixed(4)}</b></div>
                    <div>Val R²: <b>{d.val_r2.toFixed(4)}</b></div>
                    <div>Gap: <b style={{ color: T.red }}>{d.gap.toFixed(4)}</b></div>
                  </div>
                )
              }} />
              {models.map(m => (
                <Scatter key={m.model_id} name={m.model_label}
                  data={foldScatterData.filter(d => d.model_id === m.model_id)}
                  fill={m.color} />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fold detail table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Fold 상세 — {selectedModel.model_label}</div>
          <Select value={String(selectedModelIdx)}
            onChange={v => setSelectedModelIdx(Number(v))}
            options={models.map((m, i) => ({ value: String(i), label: m.model_label }))} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {['Fold', 'Train 샘플', 'Val 샘플', 'Train R²', 'Val R²', 'Val MAE', 'Gap', '판정'].map(h => (
                <th key={h} style={{ padding: '8px 6px', textAlign: h === 'Fold' || h === '판정' ? 'center' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedModel.fold_metrics.map(f => {
              const verdict = f.gap > 0.3 ? '과적합' : f.gap > 0.1 ? '경계' : '양호'
              const vColor = f.gap > 0.3 ? T.red : f.gap > 0.1 ? T.amber : T.green
              return (
                <tr key={f.fold} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 6px', textAlign: 'center', fontWeight: 700 }}>F{f.fold}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{fmt(f.n_train)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{fmt(f.n_val)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{f.train_r2.toFixed(4)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: f.val_r2 < 0 ? T.red : T.text1 }}>{f.val_r2.toFixed(4)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{f.val_mae.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: vColor }}>{f.gap.toFixed(4)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: vColor, background: `${vColor}15`, padding: '2px 8px', borderRadius: 10 }}>{verdict}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 10, fontSize: 11, color: T.text3 }}>
          평균 Gap: <b style={{ fontFamily: mono }}>{selectedModel.avg_gap.toFixed(4)}</b> · 평균 Val R²: <b style={{ fontFamily: mono }}>{selectedModel.avg_val_r2.toFixed(4)}</b>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Tab 4: 피처 중요도
   ═══════════════════════════════════════════════════════════════════════════════ */
function TabFeatures({ models, selectedModelIdx, setSelectedModelIdx }: {
  models: ModelResult[]
  selectedModelIdx: number
  setSelectedModelIdx: (i: number) => void
}) {
  const selectedModel = models[selectedModelIdx] ?? models[0]
  const fiData = [...(selectedModel.feature_importance_top20 ?? [])].reverse()

  // Radar: common top features across tree-based models
  const radarData = useMemo(() => {
    const treeModels = models.filter(m => (m.feature_importance_top20?.length ?? 0) > 0)
    if (treeModels.length === 0) return []

    // Collect top-5 features from each model, deduplicate, take first 8
    const allFeats = new Set<string>()
    treeModels.forEach(m => {
      m.feature_importance_top20.slice(0, 5).forEach(f => allFeats.add(f.name))
    })
    const commonFeats = Array.from(allFeats).slice(0, 8)

    // Normalize importance per model to 0-100 for radar
    return commonFeats.map(feat => {
      const point: any = { feature: feat.replace('order_qty_', 'oq_').replace('revenue_', 'rev_') }
      treeModels.forEach(m => {
        const maxImp = m.feature_importance_top20[0]?.importance ?? 1
        const fi = m.feature_importance_top20.find(f => f.name === feat)
        point[m.model_id] = fi ? Math.round((fi.importance / maxImp) * 100) : 0
      })
      return point
    })
  }, [models])

  const treeModels = models.filter(m => (m.feature_importance_top20?.length ?? 0) > 0)

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Top-20 bar chart */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Feature Importance Top 20</div>
            <Select value={String(selectedModelIdx)}
              onChange={v => setSelectedModelIdx(Number(v))}
              options={models.map((m, i) => ({ value: String(i), label: m.model_label }))} />
          </div>
          {fiData.length > 0 ? (
            <ResponsiveContainer width="100%" height={500}>
              <BarChart data={fiData} layout="vertical" barSize={14} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [v.toFixed(1), 'Importance']} />
                <Bar dataKey="importance" fill={selectedModel.color} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>
              이 모델은 피처 중요도 데이터가 없습니다.
            </div>
          )}
        </div>

        {/* Radar chart */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>모델 간 주요 피처 비교 (정규화)</div>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={420}>
              <RadarChart data={radarData} outerRadius={130}>
                <PolarGrid stroke={T.border} />
                <PolarAngleAxis dataKey="feature" tick={{ fontSize: 9 }} />
                <PolarRadiusAxis tick={{ fontSize: 8 }} domain={[0, 100]} />
                {treeModels.map(m => (
                  <Radar key={m.model_id} name={m.model_label} dataKey={m.model_id}
                    stroke={m.color} fill={m.color} fillOpacity={0.08} strokeWidth={1.5} />
                ))}
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>레이더 차트 데이터 없음</div>
          )}
        </div>
      </div>

      {/* Hyperparameters comparison table */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>모델 하이퍼파라미터 비교</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                <th style={{ padding: '8px 6px', textAlign: 'left', color: T.text3, fontWeight: 600 }}>파라미터</th>
                {models.map(m => (
                  <th key={m.model_id} style={{ padding: '8px 6px', textAlign: 'center', color: T.text3, fontWeight: 600, fontSize: 10 }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: m.color, marginRight: 4, verticalAlign: 'middle' }} />
                    {m.model_label.replace('LightGBM ', 'LGBM ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const allKeys = new Set<string>()
                models.forEach(m => Object.keys(m.params).forEach(k => allKeys.add(k)))
                return Array.from(allKeys).sort().map(key => (
                  <tr key={key} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '6px', fontWeight: 600, fontSize: 11 }}>{key}</td>
                    {models.map(m => (
                      <td key={m.model_id} style={{ padding: '6px', textAlign: 'center', fontFamily: mono, fontSize: 10, color: m.params[key] != null ? T.text1 : T.text3 }}>
                        {m.params[key] != null ? String(m.params[key]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
