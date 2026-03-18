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

/* ─── Chart explanation helper ─────────────────────────────────────────────── */
const chartGuide: React.CSSProperties = {
  marginTop: 10, padding: '10px 14px', borderRadius: 6,
  fontSize: 11, lineHeight: 1.7, color: '#6b7280', background: '#f9fafb',
  borderLeft: '3px solid #d1d5db',
}

/* ─── Tab constants ────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'overview'    as const, label: '종합 요약',    icon: '📊' },
  { id: 'accuracy'    as const, label: '정확도 분석',  icon: '🎯' },
  { id: 'overfitting' as const, label: '과적합 분석',  icon: '⚠️' },
  { id: 'features'    as const, label: '피처 중요도',  icon: '📋' },
  { id: 'executive'   as const, label: '경영진 보고서', icon: '📑' },
]

/* ─── User Guide Panel ────────────────────────────────────────────────────── */
function UserGuidePanel({ onClose }: { onClose: () => void }) {
  const guideCard: React.CSSProperties = {
    background: '#FFFFFF', borderRadius: 10, padding: '16px 20px',
    border: `1px solid #E2E8F0`,
  }
  const guideMetric: React.CSSProperties = {
    display: 'inline-block', fontFamily: mono, fontWeight: 700,
    fontSize: 11, padding: '2px 6px', borderRadius: 4, marginRight: 4,
  }

  return (
    <div style={{
      ...card, marginBottom: 20, padding: '24px 28px',
      background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 50%, #FFFBEB 100%)',
      border: `1px solid ${T.blueMid}`, position: 'relative',
    }}>
      <button onClick={onClose} style={{
        position: 'absolute', top: 12, right: 16, background: 'none', border: 'none',
        fontSize: 18, color: T.text3, cursor: 'pointer', lineHeight: 1,
      }}>×</button>

      <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 4 }}>
        모델 평가 대시보드 활용 가이드
      </div>
      <div style={{ fontSize: 12, color: T.text2, marginBottom: 16 }}>
        AI 수요예측 모델의 성능을 이해하고, 실무 의사결정에 활용하는 방법을 안내합니다.
      </div>

      {/* ── 핵심 지표 해석 가이드 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
        <div style={guideCard}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, marginBottom: 8 }}>핵심 지표 해석</div>
          <div style={{ fontSize: 11, lineHeight: 2, color: T.text2 }}>
            <div><span style={{ ...guideMetric, background: '#DBEAFE', color: T.blue }}>R²</span> 모델이 데이터 변동의 몇 %를 설명하는가 (1에 가까울수록 우수)</div>
            <div><span style={{ ...guideMetric, background: '#D1FAE5', color: T.green }}>MAE</span> 예측과 실제의 평균 오차 (낮을수록 정확)</div>
            <div><span style={{ ...guideMetric, background: '#FEF3C7', color: T.amber }}>RMSE</span> 큰 오차에 가중치를 둔 평균 오차 (MAE보다 크면 이상치 존재)</div>
            <div><span style={{ ...guideMetric, background: '#FEE2E2', color: T.red }}>MAPE</span> 백분율 기준 평균 오차 — 10% 미만이면 우수</div>
            <div><span style={{ ...guideMetric, background: '#E0E7FF', color: '#4338CA' }}>±5 적중률</span> 오차 5개 이내 비율 — 자동화 가능성 판단 기준</div>
          </div>
        </div>

        <div style={guideCard}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 8 }}>R² 기준 의사결정 가이드</div>
          <div style={{ fontSize: 11, lineHeight: 2, color: T.text2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...guideMetric, background: '#D1FAE5', color: T.green, minWidth: 70, textAlign: 'center' }}>0.5 이상</span>
              <span><b style={{ color: T.green }}>실무 활용 가능</b> — AI 예측 기반 생산·발주 계획 수립</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...guideMetric, background: '#FEF3C7', color: T.amber, minWidth: 70, textAlign: 'center' }}>0.2 ~ 0.5</span>
              <span><b style={{ color: T.amber }}>보조 참고용</b> — 담당자 판단과 병행하여 활용</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...guideMetric, background: '#FEE2E2', color: T.red, minWidth: 70, textAlign: 'center' }}>0.2 미만</span>
              <span><b style={{ color: T.red }}>신뢰도 낮음</b> — 모델 개선 필요, 수동 관리 유지</span>
            </div>
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#F0FDF4', borderRadius: 6, fontSize: 11, color: T.text2 }}>
              💡 <b>쉬운 비유</b>: R² = 0.5이면 "10번 예측 중 약 5번 맞춘다"는 의미입니다.
            </div>
          </div>
        </div>
      </div>

      {/* ── 탭별 활용법 ── */}
      <div style={guideCard}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.purple, marginBottom: 10 }}>탭별 활용법</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { icon: '📊', tab: '종합 요약', who: '전체 사용자', desc: '7개 모델 성능 비교, 최적 모델 한눈에 파악' },
            { icon: '🎯', tab: '정확도 분석', who: '데이터 담당자', desc: 'MAE·RMSE·MAPE 상세 비교, 모델별 강약점 분석' },
            { icon: '⚠️', tab: '과적합 분석', who: '데이터 담당자', desc: 'Train vs Validation 차이로 모델 안정성 검증' },
            { icon: '📋', tab: '피처 중요도', who: '분석가·기획자', desc: '예측에 영향 큰 변수 파악 → 데이터 수집 우선순위' },
            { icon: '📑', tab: '경영진 보고서', who: '의사결정권자', desc: '자동 해설 + 실무 권고사항, 비기술인도 이해 가능' },
          ].map(t => (
            <div key={t.tab} style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, fontSize: 11 }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{t.icon}</div>
              <div style={{ fontWeight: 700, color: T.text1, marginBottom: 2 }}>{t.tab}</div>
              <div style={{ color: T.blue, fontWeight: 600, fontSize: 10, marginBottom: 4 }}>{t.who}</div>
              <div style={{ color: T.text3, lineHeight: 1.5 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 실무 활용 팁 ── */}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ ...guideCard, borderLeft: `3px solid ${T.green}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 6 }}>생산·발주 담당자</div>
          <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
            R²가 높은 모델의 예측값을 기반으로 생산 계획을 수립하세요. "오차 상위 제품"은 수동 보정이 필요합니다.
          </div>
        </div>
        <div style={{ ...guideCard, borderLeft: `3px solid ${T.amber}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.amber, marginBottom: 6 }}>재고 관리자</div>
          <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
            ±5 적중률이 높은 제품부터 자동 발주 파일럿을 검토하세요. MAPE가 높은 제품은 안전재고를 상향 조정하세요.
          </div>
        </div>
        <div style={{ ...guideCard, borderLeft: `3px solid ${T.purple}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.purple, marginBottom: 6 }}>경영진</div>
          <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
            "경영진 보고서" 탭에서 기간별 자동 해설과 권고사항을 확인하세요. 주간/월간 추이로 모델 개선 효과를 모니터링할 수 있습니다.
          </div>
        </div>
      </div>
    </div>
  )
}
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
type SegmentResult = {
  label: string; count: number; mae: number; rmse: number; r2: number; mape: number; wmape: number; tolerance_5_rate: number
}

type PeriodResult = {
  period: string; type: string; modelId?: string; n_products: number; n_records: number
  date_range: { start: string; end: string }
  metrics: { mae: number; rmse: number; r2: number; mape: number; wmape?: number; tolerance_5_rate: number }
  segments?: SegmentResult[]
  top_error_products: { product_id: string; product_name: string; product_specification: string; predicted: number; actual: number; error: number }[]
  top_accurate_products: { product_id: string; product_name: string; product_specification: string; predicted: number; actual: number; error: number }[]
}

/* ─── Month Picker Modal ──────────────────────────────────────────────────── */
function MonthPickerModal({ periods, selectedPeriod, onSelect, onClose }: {
  periods: { key: string; label: string; dateRange: string }[]
  selectedPeriod: string
  onSelect: (key: string) => void
  onClose: () => void
}) {
  const availableKeys = new Set(periods.map(p => p.key))
  const initYear = selectedPeriod && selectedPeriod !== 'all' && /^\d{4}-\d{2}$/.test(selectedPeriod)
    ? parseInt(selectedPeriod.split('-')[0])
    : periods.length > 0 ? parseInt(periods[0].key.split('-')[0]) : new Date().getFullYear()
  const [year, setYear] = useState(initYear)
  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const btnBase: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', color: T.text2,
    fontSize: 14, padding: '2px 8px', borderRadius: 4,
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
      <div style={{
        position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
        marginTop: 6, background: '#fff', borderRadius: 12,
        border: `1px solid ${T.border}`, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        padding: '14px 16px', zIndex: 1000, minWidth: 220,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button onClick={() => setYear(y => y - 1)} style={btnBase}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>{year}년</span>
          <button onClick={() => setYear(y => y + 1)} style={btnBase}>▶</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
          {monthNames.map((name, i) => {
            const key = `${year}-${String(i + 1).padStart(2, '0')}`
            const available = availableKeys.has(key)
            const selected = selectedPeriod === key
            return (
              <button
                key={key}
                onClick={() => onSelect(key)}
                title={available ? undefined : '데이터 없음 — 재생성으로 분석 가능'}
                style={{
                  padding: '9px 4px', borderRadius: 8,
                  border: available ? 'none' : `1px dashed ${T.border}`,
                  fontSize: 12, fontWeight: selected ? 700 : 500,
                  background: selected ? T.blue : available ? T.blueSoft : 'transparent',
                  color: selected ? '#fff' : available ? T.blue : T.text3,
                  cursor: 'pointer',
                  transition: 'all .12s',
                  position: 'relative',
                }}
              >
                {name}
                {!available && !selected && (
                  <span style={{ position:'absolute', top:2, right:3, fontSize:7, color:T.text3 }}>+</span>
                )}
              </button>
            )
          })}
        </div>
        {/* 범례 */}
        <div style={{ display:'flex', gap:10, marginTop:10, fontSize:10, color:T.text3 }}>
          <span style={{ display:'flex', alignItems:'center', gap:3 }}>
            <span style={{ width:10, height:10, borderRadius:3, background:T.blueSoft, display:'inline-block' }}/>데이터 있음
          </span>
          <span style={{ display:'flex', alignItems:'center', gap:3 }}>
            <span style={{ width:10, height:10, borderRadius:3, border:`1px dashed ${T.border}`, display:'inline-block' }}/>데이터 없음 (재생성 가능)
          </span>
        </div>
      </div>
    </>
  )
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
  const [showGuide, setShowGuide] = useState(true)


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
  // data(file 기반)가 없어도 기간별 평가는 동작 가능 — 에러 화면 제거

  /* ═══ RENDER ══════════════════════════════════════════════════════════════ */
  return (
    <div>
      <PageHeader title="모델 평가" sub={
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span>ML 모델 기간별 평가 분석{data ? ` · ${data.timestamp.split('T')[0]}` : ''}</span>
          <button onClick={() => setShowGuide(g => !g)}
            style={{
              fontSize:11, fontWeight:700, color: showGuide ? T.blue : T.text3,
              background: showGuide ? T.blueSoft : T.surface2,
              border:`1px solid ${showGuide ? T.blueMid : T.border}`,
              borderRadius:6, padding:'3px 8px', cursor:'pointer',
            }}>
            {showGuide ? '📖 가이드 닫기' : '📖 활용 가이드'}
          </button>
        </div>
      } action={<PeriodToggle />} />

      {/* ── User Guide ── */}
      {showGuide && <UserGuidePanel onClose={() => setShowGuide(false)} />}

      {/* ── Meta info bar ── */}
      {meta && (
        <div style={{ ...card, padding: '10px 20px', marginBottom: 20, display: 'flex', gap: 28, fontSize: 12, color: T.text2 }}>
          <span>테이블(Table): <b style={{ color: T.text1 }}>{meta.table}</b></span>
          <span>전체 데이터(Total): <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.total_rows)}</b>행</span>
          <span>학습 데이터(Train): <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.train_rows)}</b></span>
          <span>테스트 데이터(Test): <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.test_rows)}</b></span>
          <span>피처(Features): <b style={{ fontFamily: mono, color: T.text1 }}>{meta.n_features}</b>개</span>
          <span>제품(Products): <b style={{ fontFamily: mono, color: T.text1 }}>{fmt(meta.n_products)}</b>종</span>
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
      {activeTab === 'overview' && models.length > 0 && (
        <TabOverview models={models} bestR2={bestR2} bestTol={bestTol} avgRmse={avgRmse} minGap={minGap} />
      )}
      {activeTab === 'overview' && models.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
          <div>모델 평가 데이터가 없습니다.</div>
        </div>
      )}
      {activeTab === 'accuracy' && <TabAccuracy models={models} />}
      {activeTab === 'overfitting' && <TabOverfitting models={models} selectedModelIdx={selectedModelIdx} setSelectedModelIdx={setSelectedModelIdx} />}
      {activeTab === 'features' && <TabFeatures models={models} selectedModelIdx={selectedModelIdx} setSelectedModelIdx={setSelectedModelIdx} />}
      {activeTab === 'executive' && <TabExecutive data={data} periodType={period} />}
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
      {/* Tab summary */}
      <div style={{ ...card, padding: '16px 22px', marginBottom: 20, borderLeft: `4px solid ${T.blue}`, background: '#f8faff' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.blue, marginBottom: 6 }}>종합 요약 (Overview)</div>
        <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.8 }}>
          {models.length}개 머신러닝 모델의 핵심 성능 지표를 한눈에 비교합니다.
          <b> R²(결정계수)</b>는 모델이 실제 데이터 변동을 얼마나 잘 설명하는지,
          <b> MAE(평균절대오차)</b>는 예측과 실제의 평균 차이,
          <b> ±5 적중률</b>은 오차 5개 이내로 맞춘 비율을 의미합니다.
          값이 높을수록(MAE·RMSE는 낮을수록) 좋은 모델입니다.
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard icon="🏆" label="최고 결정계수(R²) 모델" value={fmtR(bestR2.val)} sub={bestR2.model} color={T.blue} />
        <KpiCard icon="🎯" label="최고 ±5 적중률(Hit Rate)" value={fmtP(bestTol.val)} sub={bestTol.model} color={T.green} />
        <KpiCard icon="📉" label="평균 RMSE(평균제곱근오차)" value={avgRmse.toFixed(1)} sub={`${models.length}개 모델 평균`} color={T.amber} />
        <KpiCard icon="⚖️" label="최소 과적합 갭(Overfitting Gap)" value={minGap.val.toFixed(3)} sub={minGap.model} color={T.purple} />
      </div>

      {/* Comparison table + R² chart side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Table */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>모델별 성능 비교 (Model Performance Comparison)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {['모델(Model)', '결정계수(R²)', '평균절대오차(MAE)', '평균제곱근오차(RMSE)', '±5 적중률(Hit Rate)'].map(h => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: h.startsWith('모델') ? 'left' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
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
          <div style={chartGuide}>
            현재 {models.length}개 모델 중 <b>{models.sort((a, b) => b.ensemble_metrics.r2 - a.ensemble_metrics.r2)[0]?.model_label}</b>이(가) R²={fmtR(maxR2)}로 가장 높은 설명력을 보입니다.
            R² 값이 <b>0.5(50%) 이상</b>이면 실무 활용 가능, 0.3 미만이면 보조 참고용으로 판단합니다.
            MAE는 낮을수록, ±5 적중률은 높을수록 좋은 모델입니다.
          </div>
        </div>

        {/* R² horizontal bar chart */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>결정계수 비교 (R² — Ensemble)</div>
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
          <div style={chartGuide}>
            막대가 길수록 예측력이 좋은 모델입니다. R²는 "모델이 실제 수주 변동의 몇 %를 설명하는가"를 나타내며,
            0.5(50%) 이상이면 생산계획·발주에 활용할 수 있는 수준입니다.
          </div>
        </div>
      </div>

      {/* MAE + ±5 dual bar chart */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>평균절대오차(MAE) vs ±5 적중률(Hit Rate) 비교</div>
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
        <div style={chartGuide}>
          <b>파란 막대(MAE)</b>는 예측과 실제의 평균 차이 — 낮을수록 좋습니다.
          <b> 초록 선(±5 적중률)</b>은 오차 5개 이내로 맞춘 비율 — 높을수록 좋습니다.
          이상적인 모델은 "MAE는 낮고, 적중률은 높은" 모델입니다.
        </div>
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
      {/* Tab summary */}
      <div style={{ ...card, padding: '16px 22px', marginBottom: 20, borderLeft: `4px solid ${T.green}`, background: '#f0fdf4' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.green, marginBottom: 6 }}>정확도 분석 (Accuracy Analysis)</div>
        <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.8 }}>
          각 모델의 예측 오차를 다양한 관점에서 분석합니다.
          <b> ±5 적중률</b>은 예측값과 실제값의 차이가 5개 이내인 비율로, 실무에서 가장 중요한 정확도 지표입니다.
          <b> 누적 정확도 곡선</b>은 허용 오차를 넓혀갈 때 맞추는 비율이 얼마나 빠르게 올라가는지 보여줍니다.
          곡선이 왼쪽에서 빠르게 올라갈수록 작은 오차 범위에서도 높은 정확도를 보이는 우수한 모델입니다.
        </div>
      </div>

      {/* ±5 bar chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>±5 허용오차 적중률 (Tolerance Hit Rate)</div>
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
          <div style={chartGuide}>
            각 모델이 예측한 결과 중 실제 수주량과 <b>±5개 이내로 맞춘 비율</b>입니다.
            노란 점선(50%)을 넘는 모델은 절반 이상의 예측이 매우 정확하다는 의미입니다.
            이 지표가 높은 모델일수록 소량 제품의 자동 발주에 신뢰할 수 있습니다.
          </div>
        </div>

        {/* Error distribution table */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>오차 분포 통계 (Error Distribution)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                {['모델(Model)', '평균(Mean)', '중앙값(Median)', '상위10%(P90)', '상위1%(P99)'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: h.startsWith('모델') ? 'left' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
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
          <div style={chartGuide}>
            <b>평균(Mean)</b>은 전체 오차의 평균, <b>중앙값(Median)</b>은 정렬했을 때 가운데 값입니다.
            <b> P90</b>은 "전체 예측의 90%가 이 오차 이하"라는 뜻으로, 낮을수록 안정적입니다.
            <b> P99</b>은 극단적 오차로, 이 값이 크면 일부 제품에서 매우 큰 오차가 발생하고 있습니다.
          </div>
        </div>
      </div>

      {/* Cumulative accuracy curves */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>누적 정확도 곡선 (Cumulative Accuracy Curve)</div>
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
        <div style={chartGuide}>
          X축(가로)은 "몇 개까지 오차를 허용할 것인가", Y축(세로)은 "그 범위 안에 들어오는 예측 비율(%)"입니다.
          빨간 점선(±5)에서 <b>곡선이 높이 올라간 모델</b>이 가장 정확합니다.
          곡선이 왼쪽에서 빠르게 올라갈수록 작은 오차 범위에서도 높은 정확도를 보이는 우수한 모델입니다.
        </div>
      </div>

      {/* Band breakdown grouped bar chart */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>허용 밴드별 적중률 비교 (Tolerance Band Hit Rate)</div>
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
        <div style={chartGuide}>
          허용 범위를 ±1, ±5, ±10 등으로 넓혀갈 때 각 모델의 적중률 변화를 비교합니다.
          실무에서 가장 중요한 <b>±5 밴드</b>에서 높은 적중률을 보이는 모델이 자동 발주에 가장 적합합니다.
          ±100까지 가야 100%에 도달하는 모델은 일부 제품에서 큰 오차가 발생하고 있다는 의미입니다.
        </div>
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
      {/* Tab summary */}
      <div style={{ ...card, padding: '16px 22px', marginBottom: 20, borderLeft: `4px solid ${T.amber}`, background: '#fffbeb' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.amber, marginBottom: 6 }}>과적합 분석 (Overfitting Analysis)</div>
        <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.8 }}>
          모델이 학습 데이터에만 지나치게 맞춰져 새로운 데이터에서 성능이 떨어지는 <b>"과적합(Overfitting)"</b>을 진단합니다.
          <b> 학습 R²(Train R²)</b>와 <b>검증 R²(Val R²)</b>의 차이가 작을수록 과적합이 적은 안정적인 모델입니다.
          Gap이 0.1 이하이면 <span style={{ color: T.green, fontWeight: 600 }}>양호</span>,
          0.1~0.3이면 <span style={{ color: T.amber, fontWeight: 600 }}>경계</span>,
          0.3 초과이면 <span style={{ color: T.red, fontWeight: 600 }}>과적합 위험</span>으로 판정합니다.
        </div>
      </div>

      {/* Train vs Val R² chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>학습 R²(Train) vs 검증 R²(Validation) 비교</div>
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
          <div style={chartGuide}>
            <b>파란 막대(학습 R²)</b>는 모델이 학습 데이터에서 보인 성능, <b>초록 막대(검증 R²)</b>는 새로운 데이터에서의 성능입니다.
            두 막대의 높이가 비슷할수록 안정적인 모델입니다.
            <b> 빨간 점선(Gap)</b>이 0에 가까울수록 좋고, 0.3을 넘으면 "학습만 잘하고 실전에서 못하는" 과적합 상태입니다.
          </div>
        </div>

        {/* Fold scatter plot */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>교차검증(Fold)별 학습-검증 R² 산점도 (Scatter Plot)</div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>대각선(45°) 위: 과적합 없음 · 대각선 아래: 과적합 의심 — 점이 대각선에 가까울수록 안정적</div>
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
          <div style={chartGuide}>
            각 점은 교차검증(데이터를 나눠서 여러 번 테스트) 한 번의 결과입니다.
            점이 <b>대각선 위</b>에 있으면 검증 성능이 학습보다 좋은 것(이상적),
            <b>대각선 아래</b>면 학습에서는 잘하지만 실전에서는 못하는 것(과적합)입니다.
            점들이 한 곳에 모여 있으면 모델이 안정적이라는 뜻입니다.
          </div>
        </div>
      </div>

      {/* Fold detail table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>교차검증 상세 (Fold Detail) — {selectedModel.model_label}</div>
          <Select value={String(selectedModelIdx)}
            onChange={v => setSelectedModelIdx(Number(v))}
            options={models.map((m, i) => ({ value: String(i), label: m.model_label }))} />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {['교차검증(Fold)', '학습 샘플(Train)', '검증 샘플(Val)', '학습 R²(Train)', '검증 R²(Val)', '검증 MAE(Val)', '갭(Gap)', '판정(Verdict)'].map(h => (
                <th key={h} style={{ padding: '8px 6px', textAlign: h.startsWith('교차') || h.startsWith('판정') ? 'center' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
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
          평균 갭(Avg Gap): <b style={{ fontFamily: mono }}>{selectedModel.avg_gap.toFixed(4)}</b> · 평균 검증 R²(Avg Val R²): <b style={{ fontFamily: mono }}>{selectedModel.avg_val_r2.toFixed(4)}</b>
        </div>
        <div style={chartGuide}>
          <b>교차검증(Cross-Validation)</b>이란 데이터를 여러 번 나눠서 학습·테스트를 반복하는 방법입니다.
          각 Fold(라운드)마다 학습 R²와 검증 R²의 <b>Gap(차이)</b>이 0.1 이하면 "양호", 0.3 초과면 "과적합 위험"입니다.
          과적합은 "시험 문제는 잘 풀지만, 새로운 문제에는 약한" 상태와 비슷합니다.
          Fold별 결과가 고르게 나올수록 모델이 안정적이라고 판단합니다.
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
      {/* Tab summary */}
      <div style={{ ...card, padding: '16px 22px', marginBottom: 20, borderLeft: `4px solid ${T.purple}`, background: '#faf5ff' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.purple, marginBottom: 6 }}>피처 중요도 (Feature Importance)</div>
        <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.8 }}>
          모델이 예측할 때 어떤 입력 변수(피처)를 가장 많이 참고했는지 보여줍니다.
          <b> 피처 중요도</b>가 높을수록 해당 변수가 수요 예측에 큰 영향을 미칩니다.
          예를 들어 <b>과거 수주량(order_qty)</b>이 높으면 최근 주문 패턴이 예측의 핵심이라는 의미입니다.
          모델마다 중요하게 보는 피처가 다를 수 있으며, <b>레이더 차트</b>로 모델 간 차이를 비교할 수 있습니다.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Top-20 bar chart */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>피처 중요도 상위 20 (Feature Importance Top 20)</div>
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
          <div style={chartGuide}>
            막대가 긴 변수(피처)일수록 모델이 예측할 때 가장 많이 참고하는 정보입니다.
            예를 들어 <b>order_qty(수주량)</b> 관련 변수가 상위에 있으면, 과거 수주 패턴이 미래 예측의 핵심이라는 뜻입니다.
            이 정보는 "어떤 데이터가 예측에 중요한가"를 파악하는 데 활용됩니다.
          </div>
        </div>

        {/* Radar chart */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>모델 간 주요 피처 비교 — 정규화 (Normalized Feature Comparison)</div>
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
          <div style={chartGuide}>
            각 꼭짓점은 주요 변수(피처)이고, 색상별 영역이 각 모델이 해당 변수를 얼마나 중시하는지 나타냅니다.
            <b>여러 모델에서 공통으로 넓은 영역</b>을 차지하는 변수가 예측의 핵심 변수입니다.
            모델마다 중시하는 변수가 다르다면, 각 모델이 서로 다른 관점에서 예측하고 있다는 의미입니다.
          </div>
        </div>
      </div>

      {/* Hyperparameters comparison table */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>모델 하이퍼파라미터 비교 (Hyperparameter Comparison)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                <th style={{ padding: '8px 6px', textAlign: 'left', color: T.text3, fontWeight: 600 }}>파라미터(Parameter)</th>
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
        <div style={chartGuide}>
          모델의 학습 설정값(하이퍼파라미터)입니다. 전문가가 아니면 참고만 하셔도 됩니다.
          주요 파라미터: <b>num_leaves</b>(모델 복잡도), <b>learning_rate</b>(학습 속도), <b>n_estimators</b>(반복 횟수).
          같은 모델이라도 설정에 따라 성능이 달라지며, 최적의 조합을 찾는 과정이 "하이퍼파라미터 튜닝"입니다.
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   기간별 종합 요약 (특정 주차/월 선택 시)
   ═══════════════════════════════════════════════════════════════════════════════ */
function TabPeriodOverview({ data, loading }: { data: PeriodResult; loading: boolean }) {
  if (loading) return null
  const m = data.metrics
  const r2Pct = (m.r2 * 100).toFixed(1)

  // Parse period label
  const isWeekly = data.type === 'weekly'
  const weekMatch = data.period.match(/^(\d{4})-W(\d{2})$/)
  const monthMatch = data.period.match(/^(\d{4})-(\d{2})$/)

  let periodTitle = data.period
  let periodSub = ''
  if (weekMatch) {
    periodTitle = `${weekMatch[1]}년 제${parseInt(weekMatch[2])}주차`
    const s = new Date(data.date_range.start)
    const e = new Date(data.date_range.end)
    e.setDate(e.getDate() - 1) // end is exclusive
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']
    periodSub = `${data.date_range.start} (${dayNames[s.getDay()]}) ~ ${e.toISOString().slice(0, 10)} (${dayNames[e.getDay()]})`
  } else if (monthMatch) {
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
    periodTitle = `${monthMatch[1]}년 ${monthNames[parseInt(monthMatch[2]) - 1]}`
    periodSub = `${data.date_range.start} ~ ${data.date_range.end}`
  }

  return (
    <div>
      {/* Period info banner */}
      <div style={{ ...card, padding: '18px 24px', marginBottom: 20, border: `2px solid ${T.blue}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: '#eff6ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            }}>📅</div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: T.blue }}>{periodTitle}</div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>{periodSub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            {data.modelId && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>모델</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.green, fontFamily: mono }}>{data.modelId}</div>
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>조회 유형</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>{isWeekly ? '주간 예측' : '월간 예측'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>분석 제품</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, fontFamily: mono }}>{fmt(data.n_products)}개</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>예측 건수</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, fontFamily: mono }}>{fmt(data.n_records)}건</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>기간</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>{isWeekly ? '7일' : `${new Date(data.date_range.end).getDate() === 1 ? new Date(new Date(data.date_range.end).getTime() - 86400000).getDate() : '30'}일`}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 사용자 친화적 결과 해석 요약 ── */}
      {(() => {
        const r2Val = m.r2
        const maeVal = m.mae
        const wmapeVal = m.wmape ?? m.mape
        const tolVal = m.tolerance_5_rate
        // 종합 등급 판정
        const grade = r2Val >= 0.5 && wmapeVal < 30 ? 'excellent'
          : r2Val >= 0.3 && wmapeVal < 50 ? 'good'
          : r2Val >= 0.15 ? 'fair' : 'poor'
        const gradeMap = {
          excellent: { label: '우수', color: T.green, bg: '#D1FAE5', icon: '✅', border: '#10B981' },
          good:      { label: '양호', color: T.blue,  bg: '#DBEAFE', icon: '👍', border: '#3B82F6' },
          fair:      { label: '보통', color: T.amber, bg: '#FEF3C7', icon: '⚠️', border: '#F59E0B' },
          poor:      { label: '개선 필요', color: T.red,   bg: '#FEE2E2', icon: '🔧', border: '#EF4444' },
        }
        const g = gradeMap[grade]

        // 해석 문구 생성
        const summaryLines: string[] = []
        if (grade === 'excellent') {
          summaryLines.push(`이 기간의 AI 예측은 <strong>매우 정확</strong>합니다. 실제 수주량의 변동을 <strong>${r2Pct}%</strong> 설명하고 있어 실무 의사결정에 직접 활용할 수 있는 수준입니다.`)
        } else if (grade === 'good') {
          summaryLines.push(`이 기간의 AI 예측은 <strong>양호한 수준</strong>입니다. 전체 변동의 <strong>${r2Pct}%</strong>를 설명하며, 참고 지표로 충분히 활용 가능합니다.`)
        } else if (grade === 'fair') {
          summaryLines.push(`이 기간의 AI 예측은 <strong>보통 수준</strong>입니다. 설명력(${r2Pct}%)이 다소 낮으므로, 다른 정보와 함께 보조적으로 참고하시기 바랍니다.`)
        } else {
          summaryLines.push(`이 기간의 AI 예측은 <strong>개선이 필요한 수준</strong>입니다. 설명력이 ${r2Pct}%로 낮아, 예측값 단독 활용보다는 추세 참고 용도로 사용하시기 바랍니다.`)
        }

        // MAE 해석
        summaryLines.push(`예측과 실제의 평균 차이는 <strong>${maeVal.toFixed(1)}개</strong>이며, 전체 예측 중 <strong>${tolVal.toFixed(1)}%</strong>가 실제값과 ±5개 이내로 정확했습니다.`)

        // WMAPE vs MAPE 비교
        if (m.wmape !== undefined && m.wmape < m.mape * 0.8) {
          summaryLines.push(`MAPE(${m.mape.toFixed(1)}%)보다 수량 가중 WMAPE(<strong>${wmapeVal.toFixed(1)}%</strong>)가 크게 낮아, <strong>대량 수주 제품의 예측이 특히 정확</strong>합니다. 소량 제품의 높은 백분율 오차가 MAPE를 끌어올린 것이므로, 실질적 예측 품질은 WMAPE 기준으로 판단하세요.`)
        } else if (m.wmape !== undefined) {
          summaryLines.push(`수량 가중 오차율(WMAPE)은 <strong>${wmapeVal.toFixed(1)}%</strong>입니다.`)
        }

        return (
          <div style={{
            ...card, marginBottom: 20, padding: '20px 24px',
            border: `2px solid ${g.border}`, borderLeft: `5px solid ${g.border}`,
            background: `linear-gradient(135deg, ${g.bg}44 0%, #FFFFFF 100%)`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>{g.icon}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: T.text1 }}>
                    {periodTitle} 예측 결과 요약
                  </span>
                  <span style={{
                    display: 'inline-block', padding: '3px 12px', borderRadius: 12,
                    fontSize: 12, fontWeight: 700, background: g.bg, color: g.color,
                  }}>
                    종합 평가: {g.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                  {isWeekly ? '주간' : '월간'} 예측 모델이 이 기간 동안 얼마나 정확했는지를 쉽게 요약해 드립니다.
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 2, color: T.text2, paddingLeft: 36 }}>
              {summaryLines.map((line, i) => (
                <div key={i} style={{ marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: `• ${line}` }} />
              ))}
            </div>
            <div style={{
              marginTop: 12, paddingLeft: 36, fontSize: 11, color: T.text3,
              borderTop: `1px solid ${T.border}`, paddingTop: 10,
            }}>
              <strong>용어 안내</strong> &nbsp;|&nbsp;
              <strong>R²</strong> = 모델이 데이터 변동을 설명하는 비율 (100%에 가까울수록 우수) &nbsp;|&nbsp;
              <strong>MAE</strong> = 예측 오차 평균 (개 단위) &nbsp;|&nbsp;
              <strong>WMAPE</strong> = 수량 가중 백분율 오차 (대량 제품 중심 정확도) &nbsp;|&nbsp;
              <strong>±5 적중률</strong> = 오차 5개 이내 비율
            </div>
          </div>
        )
      })()}

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard icon="📊" label="결정계수(R²)" value={`${r2Pct}%`} sub={parseFloat(r2Pct) >= 50 ? '실무 활용 가능 수준' : '보조 지표용 수준'} color={parseFloat(r2Pct) >= 50 ? T.green : T.amber} />
        <KpiCard icon="📉" label="평균절대오차(MAE)" value={m.mae.toFixed(1)} sub="예측 vs 실제 평균 차이" color={T.blue} />
        <KpiCard icon="📐" label="평균제곱근오차(RMSE)" value={m.rmse.toFixed(1)} sub="큰 오차에 더 민감한 지표" color={T.purple} />
        <KpiCard icon="🎯" label="±5 적중률(Hit Rate)" value={`${m.tolerance_5_rate.toFixed(1)}%`} sub="오차 ±5 이내 비율" color={T.green} />
        <KpiCard icon="📊" label="MAPE" value={`${m.mape.toFixed(1)}%`} sub="평균 절대 백분율 오차" color={T.amber} />
        <KpiCard icon="⚖️" label="WMAPE (가중)" value={`${(m.wmape ?? 0).toFixed(1)}%`} sub="수량 가중 백분율 오차" color={m.wmape && m.wmape < m.mape ? T.green : T.amber} />
      </div>

      {/* Segment evaluation table */}
      {data.segments && data.segments.length > 0 && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: T.text1 }}>수량 구간별 모델 성능 비교</div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
            제품 수주량 규모에 따라 모델 정확도가 어떻게 달라지는지 비교합니다. WMAPE는 해당 구간 내 수량 가중 오차율입니다.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}`, background: '#f8fafc' }}>
                {['구간', '건수', 'MAE', 'RMSE', 'R²', 'MAPE', 'WMAPE', '±5 적중률'].map(h => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: h === '구간' ? 'left' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.segments.map((seg, i) => {
                const r2Color = seg.r2 >= 0.5 ? T.green : seg.r2 >= 0.2 ? T.amber : T.red
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '9px 8px', fontWeight: 600, fontSize: 12, color: T.text1 }}>{seg.label}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{fmt(seg.count)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{seg.mae.toFixed(1)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{seg.rmse.toFixed(1)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: r2Color, fontWeight: 700 }}>{seg.r2.toFixed(4)}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{seg.mape.toFixed(1)}%</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, fontSize: 11, fontWeight: 700, color: T.blue }}>{seg.wmape.toFixed(1)}%</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{seg.tolerance_5_rate.toFixed(1)}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={chartGuide}>
            <strong>해석 가이드:</strong> 대량 제품은 MAPE가 낮고 R²가 높아 예측 신뢰도가 높습니다. 소량 제품은 MAPE가 높게 나타나지만, 절대 오차(MAE)는 작으므로 실무 영향은 제한적입니다. WMAPE를 기준으로 구간별 실질 정확도를 비교하세요.
          </div>
        </div>
      )}

      {/* Top error / accurate products side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Top error products */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: T.red }}>오차 상위 10개 제품 (Top Error Products)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                {['제품 ID(Product)', '예측값(Predicted)', '실제값(Actual)', '오차(Error)'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: h.startsWith('제품') ? 'left' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_error_products.map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 6px', fontSize: 11, fontFamily: mono }}>{p.product_id}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{p.predicted.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{p.actual.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: T.red, fontWeight: 700 }}>{p.error.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top accurate products */}
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: T.green }}>정확 예측 상위 10개 제품 (Top Accurate Products)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                {['제품 ID(Product)', '예측값(Predicted)', '실제값(Actual)', '오차(Error)'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: h.startsWith('제품') ? 'left' : 'right', color: T.text3, fontWeight: 600, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_accurate_products.map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 6px', fontSize: 11, fontFamily: mono }}>{p.product_id}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{p.predicted.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{p.actual.toFixed(1)}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: T.green, fontWeight: 700 }}>{p.error.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Tab 5: 경영진 보고서
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ─── Executive sub-components ─────────────────────────────────────────────── */
function SectionHeader({ num, title }: { num: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: T.blue, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
      }}>{num}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: T.text1 }}>{title}</div>
    </div>
  )
}

function Badge({ type, children }: { type: 'good' | 'warn' | 'danger' | 'blue'; children: React.ReactNode }) {
  const map = {
    good: { bg: '#d1fae5', color: '#059669' },
    warn: { bg: '#fef3c7', color: '#d97706' },
    danger: { bg: '#fee2e2', color: '#dc2626' },
    blue: { bg: '#dbeafe', color: '#1e40af' },
  }
  const s = map[type]
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: s.bg, color: s.color }}>
      {children}
    </span>
  )
}

function InsightCard({ icon, title, items }: { icon: string; title: string; items: string[] }) {
  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span>{title}
      </div>
      <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, color: T.text2, lineHeight: 1.8 }}>
        {items.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: item }} />)}
      </ul>
    </div>
  )
}

function TabExecutive({ data, periodType }: {
  data: ComparisonData | null
  periodType: 'weekly' | 'monthly'
}) {
  const MODEL_OPTIONS = {
    weekly: [
      { id: 'lgbm_q_v4', label: 'LightGBM 2-Stage Global v4 (기본)' },
      { id: 'lgbm_q_v3', label: 'LightGBM Quantile v3' },
      { id: 'lgbm_q_v2', label: 'LightGBM Quantile v2' },
      { id: 'ridge_v1', label: 'Ridge Regression' },
      { id: 'svr_linear_v1', label: 'SVR Linear' },
    ],
    monthly: [
      { id: 'lgbm_q_monthly_v2', label: 'LightGBM Quantile v2 (기본)' },
      { id: 'lgbm_q_monthly_v1', label: 'LightGBM Quantile v1' },
      { id: 'ridge_monthly_v1', label: 'Ridge Regression' },
      { id: 'svr_linear_monthly_v1', label: 'SVR Linear' },
    ],
  }
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all')
  const [periods, setPeriods] = useState<{ key: string; label: string; dateRange: string }[]>([])
  const [periodData, setPeriodData] = useState<PeriodResult | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  const [autoGenerate, setAutoGenerate] = useState(false)
  const [showMonthPicker, setShowMonthPicker] = useState(false)

  useEffect(() => {
    setSelectedPeriod('all')
    setPeriodData(null)
    setSelectedModel('')
    setShowMonthPicker(false)
    fetch(`/api/model-evaluation/periods?type=${periodType}`)
      .then(r => r.json())
      .then(json => {
        if (json.periods) {
          setPeriods(json.periods)
          if (json.periods.length > 0) setSelectedPeriod(json.periods[0].key)
        }
      })
      .catch(() => setPeriods([]))
  }, [periodType])

  useEffect(() => {
    if (selectedPeriod === 'all') { setPeriodData(null); return }
    setPeriodLoading(true)
    const modelQ = selectedModel ? `&model=${selectedModel}` : ''
    fetch(`/api/model-evaluation/by-period?type=${periodType}&period=${selectedPeriod}${modelQ}`)
      .then(r => r.json())
      .then(json => { if (!json.error) setPeriodData(json) })
      .catch(() => {})
      .finally(() => setPeriodLoading(false))
  }, [selectedPeriod, periodType, selectedModel])

  const periodSelectorUI = (
    <div style={{ ...card, padding:'12px 20px', marginBottom:20, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
      <span style={{ fontSize:11, color:T.text3, fontWeight:600 }}>
        {periodType === 'weekly' ? '조회 주차' : '조회 월'}
      </span>

      {periodType === 'weekly' && (
        <select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          style={{
            fontSize:12, fontWeight:700, color:T.text1, background:T.surface,
            border:`1px solid ${T.border}`, borderRadius:7, padding:'6px 12px',
            cursor:'pointer', outline:'none', fontFamily:"'IBM Plex Mono',monospace", maxWidth:260,
          }}
        >
          {periods.length === 0 && <option value="all">기간 없음</option>}
          {periods.map(p => <option key={p.key} value={p.key}>{p.label} ({p.key})</option>)}
        </select>
      )}

      {periodType === 'monthly' && (
        <div style={{ position:'relative' }}>
          <button
            onClick={() => setShowMonthPicker(v => !v)}
            style={{
              fontSize:12, fontWeight:700, color:T.text1, background:T.surface,
              border:`1px solid ${showMonthPicker ? T.blue : T.border}`,
              borderRadius:7, padding:'6px 14px', cursor:'pointer', outline:'none',
              display:'flex', alignItems:'center', gap:6, transition:'border .15s',
            }}
          >
            {(() => {
              const m = selectedPeriod?.match(/^(\d{4})-(\d{2})$/)
              return m ? `${m[1]}년 ${parseInt(m[2])}월 (${selectedPeriod})` : '월 선택'
            })()}
            <span style={{ fontSize:9, color:T.text3 }}>▼</span>
          </button>
          {showMonthPicker && (
            <MonthPickerModal
              periods={periods}
              selectedPeriod={selectedPeriod}
              onSelect={key => { setSelectedPeriod(key); setShowMonthPicker(false) }}
              onClose={() => setShowMonthPicker(false)}
            />
          )}
        </div>
      )}

      {selectedPeriod !== 'all' && (
        <>
          <span style={{ fontSize:11, color:T.text3, fontWeight:600 }}>모델</span>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            style={{
              fontSize:12, fontWeight:700, color:T.text1, background:T.surface,
              border:`1px solid ${T.border}`, borderRadius:7, padding:'6px 12px',
              cursor:'pointer', outline:'none',
            }}
          >
            <option value="">기본 모델</option>
            {MODEL_OPTIONS[periodType].map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </>
      )}

      <button
        onClick={() => { setSelectedPeriod(periods.length > 0 ? periods[0].key : 'all'); setSelectedModel(''); setShowMonthPicker(false) }}
        style={{ fontSize:11, fontWeight:600, color:T.blue, background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:6, padding:'5px 10px', cursor:'pointer' }}
      >최신</button>

      <button
        disabled={!selectedPeriod || selectedPeriod === 'all'}
        onClick={() => { if (selectedPeriod && selectedPeriod !== 'all') setAutoGenerate(true) }}
        style={{
          fontSize:11, fontWeight:700, color:'#fff',
          background: (selectedPeriod && selectedPeriod !== 'all') ? T.blue : T.text3,
          border:'none', borderRadius:7, padding:'6px 12px',
          cursor: (selectedPeriod && selectedPeriod !== 'all') ? 'pointer' : 'default',
          transition:'all .15s',
        }}
      >🔄 재생성</button>
    </div>
  )

  // 기간 데이터 로딩 중
  if (periodLoading) {
    return (
      <div>
        {periodSelectorUI}
        <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          <div>{selectedPeriod} 기간 데이터를 불러오는 중...</div>
        </div>
      </div>
    )
  }

  // 기간별 보고서
  if (periodData && selectedPeriod !== 'all') {
    return (
      <div>
        {periodSelectorUI}
        <TabExecutivePeriod data={periodData} comparisonData={data} periodType={periodType} autoGenerate={autoGenerate} onAutoGenerateDone={() => setAutoGenerate(false)} />
      </div>
    )
  }

  // 전체 집계 보고서 (데이터 없거나 기간 미선택 시)
  if (!data) {
    return (
      <div>
        {periodSelectorUI}
        <div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
          <div>모델 평가 데이터를 불러오는 중...</div>
        </div>
      </div>
    )
  }

  // ── 전체 집계 보고서 ──
  const bestMonthly = [...data.monthly].sort((a, b) => b.ensemble_metrics.r2 - a.ensemble_metrics.r2)[0]
  const bestWeekly = [...data.weekly].sort((a, b) => b.ensemble_metrics.r2 - a.ensemble_metrics.r2)[0]

  const mR2 = (bestMonthly.ensemble_metrics.r2 * 100).toFixed(1)
  const wR2 = (bestWeekly.ensemble_metrics.r2 * 100).toFixed(1)

  const secCard: React.CSSProperties = { ...card, padding: '24px 28px', marginBottom: 24 }

  return (
    <div>
      {periodSelectorUI}
      {/* ── 전체 집계 안내 ── */}
      <div style={{ ...card, padding: '12px 20px', marginBottom: 20, borderLeft: `4px solid ${T.amber}`, background: '#fffbeb', fontSize: 12, color: T.text2 }}>
        현재 <b>전체 기간 집계</b> 기준 보고서입니다. 특정 주차/월을 선택하면 해당 기간의 실제 예측 성과 보고서를 확인할 수 있습니다.
      </div>

      {/* ── (1) 한 줄 요약 배너 ── */}
      <div style={{
        ...card, padding: '20px 28px', marginBottom: 24,
        border: `2px solid ${T.blue}`, display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <span style={{ fontSize: 28 }}>📊</span>
        <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.7 }}>
          <b style={{ color: T.blue }}>월간 예측 R²={mR2}%</b>로 실무 활용 가능 수준 달성 — 월 단위 생산계획·발주에 <b style={{ color: T.blue }}>즉시 적용</b> 권장<br />
          주간 예측 R²={wR2}%는 보조 지표로 활용, 구조적 개선 후 고도화 필요
        </div>
      </div>

      {/* ── (2) 모델 성능 현황 ── */}
      <div style={secCard}>
        <SectionHeader num={1} title="모델 성능 현황" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          <div style={{ ...card, borderTop: `3px solid ${T.green}`, padding: '18px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>월간 예측 정확도 (R²)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.green, fontFamily: mono }}>{mR2}%</div>
            <div style={{ fontSize: 11, color: T.green, marginTop: 4 }}>실무 적용 가능</div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${T.amber}`, padding: '18px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>주간 예측 정확도 (R²)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.amber, fontFamily: mono }}>{wR2}%</div>
            <div style={{ fontSize: 11, color: T.amber, marginTop: 4 }}>보조 지표용</div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${T.blue}`, padding: '18px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>월간 평균 오차 (MAE)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.text1, fontFamily: mono }}>{bestMonthly.ensemble_metrics.mae.toFixed(1)}<span style={{ fontSize: 13 }}>개</span></div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>예측값과 실제값의 평균 차이</div>
          </div>
          <div style={{ ...card, borderTop: `3px solid ${T.blue}`, padding: '18px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>주간 평균 오차 (MAE)</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: T.text1, fontFamily: mono }}>{bestWeekly.ensemble_metrics.mae.toFixed(1)}<span style={{ fontSize: 13 }}>개</span></div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>예측값과 실제값의 평균 차이</div>
          </div>
        </div>
        <div style={{ background: T.surface2, borderRadius: 8, padding: '14px 18px', fontSize: 13, color: T.text2, lineHeight: 1.8 }}>
          <b style={{ color: T.blue }}>R² (결정계수)란?</b> 모델이 실제 수주 변동의 몇 %를 설명할 수 있는지 나타내는 지표입니다.<br />
          · <b>{mR2}%</b> = "10번 예측하면 6~7번은 방향과 크기를 맞춘다" → 의사결정 보조에 활용 가능<br />
          · <b>{wR2}%</b> = "10번 중 3번 정도 맞춘다" → 단독 의사결정에는 부족, 알림/참고용
        </div>
      </div>

      {/* ── (3) 주간 vs 월간 비교 ── */}
      <div style={secCard}>
        <SectionHeader num={2} title="주간 vs 월간 — 왜 차이가 나는가?" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {['비교 항목', '주간 예측', '월간 예측', '차이'].map(h => (
                    <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: T.text3, fontWeight: 600, fontSize: 12 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>설명력 (R²)</td>
                  <td style={{ padding: '10px 8px' }}>{wR2}%</td>
                  <td style={{ padding: '10px 8px', fontWeight: 700 }}>{mR2}%</td>
                  <td style={{ padding: '10px 8px' }}><Badge type="good">+{(parseFloat(mR2) - parseFloat(wR2)).toFixed(1)}%p</Badge></td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>평균 오차 (MAE)</td>
                  <td style={{ padding: '10px 8px' }}>{bestWeekly.ensemble_metrics.mae.toFixed(1)}개</td>
                  <td style={{ padding: '10px 8px' }}>{bestMonthly.ensemble_metrics.mae.toFixed(1)}개</td>
                  <td style={{ padding: '10px 8px' }}><Badge type="blue">월간은 절대량이 더 커서 오차도 큼</Badge></td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>과적합 수준</td>
                  <td style={{ padding: '10px 8px' }}>Gap {bestWeekly.avg_gap.toFixed(2)} <Badge type="warn">주의</Badge></td>
                  <td style={{ padding: '10px 8px' }}>Gap {bestMonthly.avg_gap.toFixed(2)} <Badge type="warn">주의</Badge></td>
                  <td style={{ padding: '10px 8px' }}>유사</td>
                </tr>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '10px 8px', fontWeight: 600 }}>학습 데이터</td>
                  <td style={{ padding: '10px 8px' }}>{fmt(data.weekly_meta.train_rows)}행</td>
                  <td style={{ padding: '10px 8px' }}>{fmt(data.monthly_meta.train_rows)}행</td>
                  <td style={{ padding: '10px 8px' }}>—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <InsightCard icon="💡" title="핵심 원인" items={[
            '<b>노이즈 감소 효과</b> — 주 단위 수주는 요일·시점에 따라 변동이 크지만, 월로 합산하면 평균화됩니다',
            '<b>패턴 안정성</b> — 월간 트렌드(계절성, 프로젝트 사이클)는 주간 변동보다 예측 가능한 패턴을 보입니다',
            '<b>과적합 감소</b> — 월간 데이터는 모델이 안정적으로 학습합니다',
          ]} />
        </div>
      </div>

      {/* ── (4) 개선 시도 결과 ── */}
      <div style={secCard}>
        <SectionHeader num={3} title="개선 시도 결과 — 무엇이 효과 있었나?" />
        <p style={{ fontSize: 13, color: T.text2, marginBottom: 16 }}>5가지 다른 접근 방식을 주간·월간 각각 적용하여 총 10건의 실험을 수행했습니다.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {['시도한 방법', '설명', '주간 R²', '월간 R²', '판정'].map(h => (
                <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: T.text3, fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { method: 'V1: 기본 설정', desc: '별도 조정 없이 학습', wr2: '26.4%', mr2: '64.0%', badge: 'good' as const, label: '월간 최적' },
              { method: 'V3: 정규화 강화', desc: '모델 복잡도를 제한하여 안정성 향상', wr2: '26.7%', mr2: '59.8%', badge: 'good' as const, label: '주간 최적' },
              { method: 'V2: Log 변환', desc: '큰 수주량을 압축해서 학습', wr2: '-0.05%', mr2: '29.4%', badge: 'danger' as const, label: '부적합' },
              { method: 'V4: Log+정규화', desc: 'V2와 V3을 결합', wr2: '-0.16%', mr2: '31.8%', badge: 'danger' as const, label: '부적합' },
              { method: 'V5: 종합 개선', desc: 'Log+정규화+파생변수+이상치처리', wr2: '0.01%', mr2: '24.5%', badge: 'danger' as const, label: '부적합' },
            ].map(row => (
              <tr key={row.method} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{row.method}</td>
                <td style={{ padding: '10px 8px', color: T.text2, fontSize: 12 }}>{row.desc}</td>
                <td style={{ padding: '10px 8px', fontFamily: mono, fontSize: 12 }}>{row.wr2}</td>
                <td style={{ padding: '10px 8px', fontFamily: mono, fontSize: 12, fontWeight: row.badge === 'good' ? 700 : 400 }}>{row.mr2}</td>
                <td style={{ padding: '10px 8px' }}><Badge type={row.badge}>{row.label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ background: T.surface2, borderRadius: 8, padding: '14px 18px', marginTop: 16, fontSize: 13, color: T.text2, lineHeight: 1.8 }}>
          <b style={{ color: T.blue }}>핵심 결론:</b><br />
          · <b>Log 변환</b>(큰 수치를 압축하는 기법)은 이 데이터에 맞지 않습니다 — 대규모 수주 예측을 오히려 망가뜨림<br />
          · <b>정규화 강화</b>는 주간 예측의 과적합을 55% 줄이면서 정확도를 유지 → 주간에 효과적<br />
          · 월간 예측은 기본 설정이 이미 충분히 좋아서 추가 조정 시 오히려 성능 하락
        </div>
      </div>

      {/* ── (5) 예측이 어려운 제품 특징 ── */}
      <div style={secCard}>
        <SectionHeader num={4} title="예측이 어려운 제품의 특징" />
        <p style={{ fontSize: 13, color: T.text2, marginBottom: 16 }}>에러가 높은 제품군을 분석한 결과, 다음과 같은 공통 특성이 발견되었습니다.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <InsightCard icon="🔴" title="예측 어려운 제품" items={[
            '<b>수주 변동이 큰 제품</b> — 어떤 주에는 0, 어떤 주에는 수천 개',
            '<b>대규모 스팟 수주</b>가 간헐적으로 발생하는 제품',
            '<b>거래 규모가 큰</b> 전략 제품/핵심 고객 물량',
          ]} />
          <InsightCard icon="🟢" title="예측 잘 되는 제품" items={[
            '<b>수주가 꾸준한</b> 제품 — 매주 비슷한 수량',
            '<b>소량·정기 발주</b> 패턴의 범용 부품',
            '<b>계절성이 뚜렷한</b> 제품 (패턴 학습 용이)',
          ]} />
        </div>
        <div style={{ background: T.surface2, borderRadius: 8, padding: '14px 18px', fontSize: 13, color: T.text2, lineHeight: 1.8 }}>
          <b style={{ color: T.blue }}>실무 제안:</b> 예측이 어려운 고변동 제품은 <b>AI 예측 + 영업 담당자 보정</b>을 병행하는 것이 가장 현실적입니다.
          AI가 기본 예측값을 제시하고, 담당자가 고객 미팅·프로젝트 일정 등 정성적 정보를 반영하여 보정합니다.
        </div>
      </div>

      {/* ── (6) 활용 방안 및 의사결정 요청 ── */}
      <div style={secCard}>
        <SectionHeader num={5} title="활용 방안 및 의사결정 요청" />
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 24 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {['활용 영역', '주간 예측', '월간 예측'].map(h => (
                <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: T.text3, fontWeight: 600, fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { area: '생산계획 수립', weekly: { type: 'warn' as const, label: '보조 참고' }, monthly: { type: 'good' as const, label: '즉시 활용 — 월별 생산 물량 결정' } },
              { area: '원자재 발주', weekly: { type: 'warn' as const, label: '보조 참고' }, monthly: { type: 'good' as const, label: '즉시 활용 — 월별 발주량·시점 결정' } },
              { area: '재고 목표 설정', weekly: null, monthly: { type: 'good' as const, label: '즉시 활용 — 적정 재고 수준 산출' } },
              { area: '이상 징후 감지', weekly: { type: 'good' as const, label: '즉시 활용 — 급등/급락 알림' }, monthly: null },
              { area: '고객별 수요 예측', weekly: { type: 'danger' as const, label: '미지원' }, monthly: { type: 'danger' as const, label: '미지원 (향후 과제)' } },
            ].map(row => (
              <tr key={row.area} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '10px 8px', fontWeight: 600 }}>{row.area}</td>
                <td style={{ padding: '10px 8px' }}>{row.weekly ? <Badge type={row.weekly.type}>{row.weekly.label}</Badge> : '—'}</td>
                <td style={{ padding: '10px 8px' }}>{row.monthly ? <Badge type={row.monthly.type}>{row.monthly.label}</Badge> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Decision requests */}
        <div style={{ border: `2px solid ${T.blue}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: T.blue, color: '#fff', padding: '12px 20px', fontWeight: 600, fontSize: 14 }}>
            경영진 의사결정 요청 사항
          </div>
          {[
            { q: '월간 예측 실무 적용 시점 — R²=64%로 산업 평균(50~70%) 범위 내 달성', a: '권장: 즉시 적용' },
            { q: '주간 예측 활용 범위 — R²=27%로 단독 의사결정에는 부족', a: '권장: 알림/보조용' },
            { q: '고변동 제품 관리 방식 — 수주 변동이 큰 제품군의 예측 한계', a: '권장: AI + 담당자 보정' },
            { q: '추가 모델 개선 투자 — 2-Stage 모델(수주 유무 분류 → 수량 회귀) 개발', a: '권장: 개발 진행' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: i < 3 ? `1px solid ${T.border}` : 'none', gap: 16 }}>
              <div style={{ flex: 1, fontSize: 13 }}><b>{item.q.split(' — ')[0]}</b> — {item.q.split(' — ')[1]}</div>
              <div style={{ background: '#d1fae5', color: '#059669', padding: '4px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{item.a}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── (7) 향후 로드맵 ── */}
      <div style={secCard}>
        <SectionHeader num={6} title="향후 로드맵" />
        <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
          {[
            { phase: '현재', title: '베이스라인 완성', target: `월간 R²=${mR2}%\n주간 R²=${wR2}%`, current: true },
            { phase: '단기', title: '실무 연동', target: '월간 예측 →\n생산계획·발주 자동 연동', current: false },
            { phase: '중기', title: '2-Stage 모델', target: '주간 R² 목표: 50%↑\n수주 유무 분류 + 수량 회귀', current: false },
            { phase: '장기', title: '고도화', target: '월간 R² 목표: 75%↑\n제품군별 특화 모델', current: false },
          ].map((item, i, arr) => (
            <div key={item.phase} style={{
              flex: 1, padding: 20, textAlign: 'center', position: 'relative',
              background: item.current ? '#eff6ff' : 'transparent',
              borderRadius: item.current ? 10 : 0,
              border: item.current ? `2px solid ${T.blue}` : 'none',
            }}>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>{item.phase}</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: item.current ? T.blue : T.text1 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: T.text3, whiteSpace: 'pre-line' }}>{item.target}</div>
              {i < arr.length - 1 && (
                <span style={{ position: 'absolute', right: -8, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: T.text3 }}>→</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ background: T.surface2, borderRadius: 8, padding: '14px 18px', fontSize: 13, color: T.text2, lineHeight: 1.8 }}>
          <b style={{ color: T.blue }}>2-Stage 글로벌 모델 (v4) — 현재 적용 중</b><br />
          기존 v3는 제품별 개별 모델을 학습했지만, v4는 전 제품 데이터를 통합한 <b>글로벌 모델</b>입니다.<br />
          <b>1단계 (분류)</b>: "이 제품에 수주가 있을까, 없을까?" → LightGBM 이진분류로 수주 0 제품 필터링<br />
          <b>2단계 (회귀)</b>: "수주가 있다면, 몇 개?" → log1p 변환 + Quantile Regression으로 P10/P50/P90 예측<br />
          제품 수요 규모·제로 비율 등 5개 메타 피처를 추가하여 수요 패턴이 다른 제품도 하나의 모델로 정확하게 예측합니다.<br />
          결과: WMAPE 39.7~71.4% (v3 대비 22% 개선), Coverage 80%+ (4W 이상 호라이즌)
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   경영진 보고서 — 기간별 (특정 주차/월 선택 시)
   ═══════════════════════════════════════════════════════════════════════════════ */
function TabExecutivePeriod({ data, comparisonData, periodType, autoGenerate, onAutoGenerateDone }: {
  data: PeriodResult
  comparisonData: ComparisonData
  periodType: 'weekly' | 'monthly'
  autoGenerate?: boolean
  onAutoGenerateDone?: () => void
}) {
  const [savedReport, setSavedReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportGenerating, setReportGenerating] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setReportLoading(true)
      try {
        const res = await fetch(`/api/model-evaluation/report?type=${periodType}&period=${encodeURIComponent(data.period)}`)
        const json = await res.json()
        if (!cancelled) setSavedReport(json.report ?? null)
      } catch { if (!cancelled) setSavedReport(null) }
      if (!cancelled) setReportLoading(false)
    })()
    return () => { cancelled = true }
  }, [data.period, periodType])

  // 자동 재생성 트리거
  useEffect(() => {
    if (autoGenerate && !reportLoading && !reportGenerating) {
      generateReport().then(() => onAutoGenerateDone?.())
    }
  }, [autoGenerate, reportLoading])

  async function generateReport() {
    setReportGenerating(true)
    try {
      const res = await fetch('/api/model-evaluation/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: periodType, period: data.period }),
      })
      const json = await res.json()
      if (json.report) setSavedReport(json.report)
    } catch (e) { console.error('보고서 생성 실패:', e) }
    setReportGenerating(false)
  }

  const insights = savedReport?.insights ?? null
  const dbRecommendations = savedReport?.recommendations ?? null

  const m = data.metrics
  const secCard: React.CSSProperties = { ...card, padding: '24px 28px', marginBottom: 24 }

  // ── 기간 라벨 파싱 ──
  const weekMatch = data.period.match(/^(\d{4})-W(\d{2})$/)
  const monthMatch = data.period.match(/^(\d{4})-(\d{2})$/)
  let periodTitle = data.period
  let periodSub = ''
  if (weekMatch) {
    periodTitle = `${weekMatch[1]}년 제${parseInt(weekMatch[2])}주차`
    if (data.date_range?.start) {
      const s = new Date(data.date_range.start)
      const e = new Date(data.date_range.end)
      e.setDate(e.getDate() - 1)
      const dayNames = ['일', '월', '화', '수', '목', '금', '토']
      periodSub = `${data.date_range.start} (${dayNames[s.getDay()]}) ~ ${e.toISOString().slice(0, 10)} (${dayNames[e.getDay()]})`
    }
  } else if (monthMatch) {
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
    periodTitle = `${monthMatch[1]}년 ${monthNames[parseInt(monthMatch[2]) - 1]}`
    if (data.date_range?.start) {
      periodSub = `${data.date_range.start} ~ ${data.date_range.end}`
    }
  }

  // ── 전체 집계 기준 지표 (비교용) ──
  const overallList = periodType === 'monthly'
    ? (comparisonData?.monthly ?? [])
    : (comparisonData?.weekly ?? [])
  const bestOverall = [...overallList].sort((a, b) => b.ensemble_metrics.r2 - a.ensemble_metrics.r2)[0]
  const overallR2  = bestOverall?.ensemble_metrics.r2  ?? 0
  const overallMAE = bestOverall?.ensemble_metrics.mae ?? 0
  const overallTol = bestOverall?.tolerance_analysis.success_rate ?? 0

  // ── 성과 판정 ──
  const r2Pct = m.r2 * 100
  const r2Grade = r2Pct >= 50 ? 'good' : r2Pct >= 20 ? 'warn' : 'danger'
  const r2Label = r2Pct >= 50 ? '실무 활용 가능' : r2Pct >= 20 ? '보조 지표용' : '예측 신뢰 부족'
  const tolGrade = m.tolerance_5_rate >= 50 ? 'good' : m.tolerance_5_rate >= 30 ? 'warn' : 'danger'
  const maeGrade = m.mae <= overallMAE * 1.2 ? 'good' : m.mae <= overallMAE * 2 ? 'warn' : 'danger'

  // ── 오차 상위 제품 분류 ──
  type ErrCls = { label: string; icon: string; color: string; bg: string; why: string; action: string }
  const classifyErrType = (p: { predicted: number; actual: number }): ErrCls => {
    if (p.actual === 0) return {
      label: '주문 중단', icon: '🔴', color: T.red, bg: '#fef2f2',
      why: 'AI는 과거 주문 패턴을 보고 이번에도 수요가 있을 것으로 예상했지만, 실제 주문이 없었습니다. 고객 발주가 일시 중단됐거나 계약 상황이 바뀐 것일 수 있습니다.',
      action: '해당 제품의 주요 고객에게 연락해 다음 주문 일정을 확인하세요.',
    }
    if (p.predicted === 0 && p.actual > 0) return {
      label: '예상 외 주문', icon: '🟡', color: T.amber, bg: '#fffbeb',
      why: 'AI가 이번 기간에 주문이 없을 것으로 판단했지만, 실제로 주문이 들어왔습니다. 간헐적으로 발생하는 불규칙 주문이거나 새로운 수요가 생겼을 수 있습니다.',
      action: '현재 재고가 충분한지 확인하고, 긴급 발주가 필요한지 검토하세요.',
    }
    const upRatio = p.actual / Math.max(p.predicted, 0.1)
    if (upRatio >= 1.5) return {
      label: '급등 미포착', icon: '🔶', color: '#f97316', bg: '#fff7ed',
      why: `AI 예측보다 실제 주문이 ${upRatio.toFixed(1)}배 많았습니다. 갑작스러운 대량 주문이 들어왔거나, 고객사에서 재고를 대량 보충한 것일 수 있습니다.`,
      action: '재고가 부족하지 않은지 즉시 확인하고, 필요하면 긴급 발주를 검토하세요.',
    }
    const downRatio = p.predicted / p.actual
    if (downRatio >= 1.5) return {
      label: '수요 감소', icon: '🟠', color: T.amber, bg: '#fffbeb',
      why: `AI 예측보다 실제 주문이 ${downRatio.toFixed(1)}배 적었습니다. 최근 수요가 줄었거나 고객의 발주 패턴이 바뀐 것일 수 있습니다.`,
      action: '재고가 과잉 쌓이지 않도록 다음 발주량을 줄이는 것을 검토하세요.',
    }
    return {
      label: '수량 차이', icon: '🔵', color: T.blue, bg: '#eff6ff',
      why: '주문 여부와 방향은 예측이 맞았지만, 정확한 수량에 차이가 있었습니다. 비교적 예측이 잘 되는 제품이며, 소폭 조정만으로 활용이 가능합니다.',
      action: 'AI 예측값을 기준으로 ±20% 범위에서 수량을 검토하여 발주하세요.',
    }
  }
  const classifiedErrors = data.top_error_products.map(p => ({ ...p, cls: classifyErrType(p) }))
  const totalErrorSum = classifiedErrors.reduce((s, p) => s + Math.abs(p.error), 0)
  const errorGroups = Object.entries(
    classifiedErrors.reduce((acc, p) => {
      if (!acc[p.cls.label]) acc[p.cls.label] = []
      acc[p.cls.label].push(p)
      return acc
    }, {} as Record<string, typeof classifiedErrors>)
  ).sort((a, b) => {
    const order = ['주문 중단', '급등 미포착', '수요 감소', '예상 외 주문', '수량 차이']
    return order.indexOf(a[0]) - order.indexOf(b[0])
  })

  return (
    <div>
      {/* ── (1) 보고서 헤더 배너 ── */}
      <div style={{
        ...card, padding: '22px 28px', marginBottom: 24,
        border: `2px solid ${T.blue}`, background: '#f0f7ff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12, background: T.blue,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#fff',
            }}>📑</div>
            <div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 2 }}>경영진 보고서 (Executive Report)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.blue }}>{periodTitle}</div>
              <div style={{ fontSize: 12, color: T.text2, marginTop: 2 }}>{periodSub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.text3 }}>조회 유형</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{periodType === 'weekly' ? '주간' : '월간'} 예측</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.text3 }}>분석 제품</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: mono }}>{fmt(data.n_products)}개</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.text3 }}>예측 건수</div>
              <div style={{ fontSize: 13, fontWeight: 700, fontFamily: mono }}>{fmt(data.n_records)}건</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 보고서 상태 + 생성 버튼 ── */}
      <div style={{ ...card, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, color: T.text2, display: 'flex', alignItems: 'center', gap: 8 }}>
          {reportLoading ? (
            <><span style={{ color: T.text3 }}>⏳</span> 저장된 보고서 확인 중...</>
          ) : savedReport ? (
            <><span style={{ color: T.green }}>✅</span> <b>DB 저장 보고서 로드 완료</b> — 생성일: {new Date(savedReport.updated_at ?? savedReport.created_at).toLocaleString('ko-KR')}</>
          ) : (
            <><span style={{ color: T.amber }}>📝</span> 아직 이 기간의 보고서가 DB에 저장되지 않았습니다. <b>"보고서 생성"</b> 버튼을 눌러 인사이트를 생성·저장하세요.</>
          )}
        </div>
        <button
          onClick={generateReport}
          disabled={reportGenerating || reportLoading}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: reportGenerating ? 'wait' : 'pointer',
            background: savedReport ? T.surface2 : T.blue, color: savedReport ? T.text1 : '#fff',
            fontWeight: 600, fontSize: 12, transition: 'all .2s',
            opacity: reportGenerating || reportLoading ? 0.6 : 1,
          }}
        >
          {reportGenerating ? '생성 중...' : savedReport ? '🔄 보고서 재생성' : '📊 보고서 생성'}
        </button>
      </div>

      {/* ── (2) 한 줄 요약 ── */}
      <div style={{
        ...card, padding: '18px 24px', marginBottom: 24,
        borderLeft: `5px solid ${r2Grade === 'good' ? T.green : r2Grade === 'warn' ? T.amber : T.red}`,
      }}>
        <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.7 }}>
          {insights?.summary ? (
            <>{insights.summary}</>
          ) : r2Grade === 'good' ? (
            <>
              <b style={{ color: T.green }}>{periodTitle}</b> 예측 결과: R²={r2Pct.toFixed(1)}%로 <b style={{ color: T.green }}>실무 활용 가능 수준</b>입니다.
              ±5 적중률 {m.tolerance_5_rate.toFixed(1)}%, 평균 오차 {m.mae.toFixed(1)}개 — 해당 기간 예측을 기반으로 생산계획·발주에 반영을 권장합니다.
            </>
          ) : r2Grade === 'warn' ? (
            <>
              <b style={{ color: T.amber }}>{periodTitle}</b> 예측 결과: R²={r2Pct.toFixed(1)}%로 <b style={{ color: T.amber }}>보조 지표 수준</b>입니다.
              단독 의사결정보다는 참고 자료로 활용하되, 담당자 판단과 병행하는 것을 권장합니다.
            </>
          ) : (
            <>
              <b style={{ color: T.red }}>{periodTitle}</b> 예측 결과: R²={r2Pct.toFixed(1)}%로 <b style={{ color: T.red }}>예측 신뢰 부족</b> 상태입니다.
              해당 기간은 수주 패턴이 불규칙하여 모델이 충분히 학습하지 못한 구간입니다. 예측값에 의존하지 말 것을 권장합니다.
            </>
          )}
        </div>
      </div>

      {/* ── (3) 핵심 성과 KPI ── */}
      <div style={secCard}>
        <SectionHeader num={1} title="핵심 성과 지표 (Key Metrics)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: '결정계수(R²)', value: `${r2Pct.toFixed(1)}%`, grade: r2Grade, sub: r2Label },
            { label: '평균절대오차(MAE)', value: m.mae.toFixed(1), grade: maeGrade, sub: `전체 평균: ${overallMAE.toFixed(1)}` },
            { label: '평균제곱근오차(RMSE)', value: m.rmse.toFixed(1), grade: 'blue' as const, sub: 'MAE보다 큰 오차에 민감' },
            { label: '±5 적중률(Hit Rate)', value: `${m.tolerance_5_rate.toFixed(1)}%`, grade: tolGrade, sub: `전체 평균: ${overallTol.toFixed(1)}%` },
            { label: '평균백분율오차(MAPE)', value: `${m.mape.toFixed(1)}%`, grade: m.mape <= 30 ? 'good' as const : m.mape <= 70 ? 'warn' as const : 'danger' as const, sub: m.mape <= 30 ? '우수' : m.mape <= 70 ? '보통' : '개선 필요' },
          ].map((kpi, i) => {
            const colors = { good: T.green, warn: T.amber, danger: T.red, blue: T.blue }
            const c = colors[kpi.grade]
            return (
              <div key={i} style={{ ...card, borderTop: `3px solid ${c}`, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: c, fontFamily: mono }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: c, marginTop: 4 }}>{kpi.sub}</div>
              </div>
            )
          })}
        </div>

        {/* 전체 평균 대비 비교 */}
        <div style={{ background: T.surface2, borderRadius: 8, padding: '14px 18px', fontSize: 13, color: T.text2, lineHeight: 1.8 }}>
          <b style={{ color: T.blue }}>전체 집계 대비 비교:</b><br />
          · R²: 전체 {(overallR2 * 100).toFixed(1)}% → 이 기간 {r2Pct.toFixed(1)}%
            <Badge type={r2Pct >= overallR2 * 100 ? 'good' : 'warn'}>
              {r2Pct >= overallR2 * 100 ? `+${(r2Pct - overallR2 * 100).toFixed(1)}%p 상회` : `${(r2Pct - overallR2 * 100).toFixed(1)}%p 하회`}
            </Badge><br />
          · MAE: 전체 {overallMAE.toFixed(1)} → 이 기간 {m.mae.toFixed(1)}
            <Badge type={m.mae <= overallMAE ? 'good' : 'warn'}>
              {m.mae <= overallMAE ? '전체 평균보다 정확' : '전체 평균보다 오차 큼'}
            </Badge><br />
          · ±5 적중률: 전체 {overallTol.toFixed(1)}% → 이 기간 {m.tolerance_5_rate.toFixed(1)}%
            <Badge type={m.tolerance_5_rate >= overallTol ? 'good' : 'warn'}>
              {m.tolerance_5_rate >= overallTol ? '적중률 양호' : '적중률 저하'}
            </Badge>
        </div>
      </div>

      {/* ── (★) DB 인사이트 — 지표별 상세 해설 ── */}
      {insights && (
        <div style={secCard}>
          <SectionHeader num={2} title="지표별 상세 해설 (AI 분석 인사이트)" />
          <div style={{ ...card, padding: 0, border: 'none', marginBottom: 0 }}>
            {[
              { label: '결정계수 (R²)', text: insights.r2_explanation, icon: '📐', color: T.blue },
              { label: '평균절대오차 (MAE)', text: insights.mae_explanation, icon: '📏', color: T.green },
              { label: '평균제곱근오차 (RMSE)', text: insights.rmse_explanation, icon: '📊', color: T.amber },
              { label: '±5 적중률 (Hit Rate)', text: insights.tolerance_explanation, icon: '🎯', color: '#8b5cf6' },
              { label: '평균백분율오차 (MAPE)', text: insights.mape_explanation, icon: '📉', color: T.red },
            ].map((item, i) => (
              <div key={i} style={{
                padding: '16px 20px', borderBottom: i < 4 ? `1px solid ${T.border}` : 'none',
                display: 'flex', gap: 14, alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: `${item.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.7 }}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── (★) DB 인사이트 — 오차 패턴 + 제품군 분석 ── */}
      {insights && (
        <div style={secCard}>
          <SectionHeader num={3} title="오차 패턴 및 제품군 분석" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ padding: '18px 20px', background: '#fef2f2', borderRadius: 10, borderLeft: `4px solid ${T.red}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.red, marginBottom: 8 }}>🔍 오차 패턴 분석</div>
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.8 }}>{insights.error_pattern}</div>
            </div>
            <div style={{ padding: '18px 20px', background: '#f0fdf4', borderRadius: 10, borderLeft: `4px solid ${T.green}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 8 }}>📦 제품군 분석</div>
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.8 }}>{insights.product_analysis}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── (★) DB 인사이트 — 비즈니스 인사이트 ── */}
      {insights?.business_insights && insights.business_insights.length > 0 && (
        <div style={secCard}>
          <SectionHeader num={4} title="비즈니스 인사이트 (Business Insights)" />
          <div style={{ display: 'grid', gap: 12 }}>
            {insights.business_insights.map((insight: string, i: number) => (
              <div key={i} style={{
                padding: '14px 18px', borderRadius: 8,
                background: i === 0 ? '#eff6ff' : T.surface2,
                borderLeft: `3px solid ${i === 0 ? T.blue : '#d1d5db'}`,
                fontSize: 13, color: T.text2, lineHeight: 1.7,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{i === 0 ? '💡' : '📌'}</span>
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── (4→5) 오차 상위 제품 분석 ── */}
      <div style={secCard}>
        <SectionHeader num={insights ? 5 : 2} title="오차 상위 제품 분석" />

        {/* 요약 배너 */}
        <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
          <div style={{ flex:1, minWidth:180, padding:'12px 16px', borderRadius:8, background:'#fef2f2', borderLeft:`3px solid ${T.red}` }}>
            <div style={{ fontSize:11, color:T.red, fontWeight:700, marginBottom:2 }}>⚠ 오차 합계</div>
            <div style={{ fontSize:22, fontWeight:800, color:T.red, fontFamily:mono }}>{totalErrorSum.toFixed(0)}<span style={{ fontSize:12, marginLeft:4 }}>개</span></div>
            <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>상위 {classifiedErrors.length}개 제품 기준</div>
          </div>
          {errorGroups.map(([type, products]) => (
            <div key={type} style={{ flex:1, minWidth:140, padding:'12px 16px', borderRadius:8, background: products[0].cls.bg, borderLeft:`3px solid ${products[0].cls.color}` }}>
              <div style={{ fontSize:11, color: products[0].cls.color, fontWeight:700, marginBottom:2 }}>
                {products[0].cls.icon} {type}
              </div>
              <div style={{ fontSize:22, fontWeight:800, color: products[0].cls.color, fontFamily:mono }}>{products.length}<span style={{ fontSize:12, marginLeft:4 }}>건</span></div>
              <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>
                {type === '주문 중단' ? '발주 중단 확인 필요' :
                 type === '급등 미포착' ? '재고 부족 가능성' :
                 type === '수요 감소' ? '발주량 조정 검토' :
                 type === '예상 외 주문' ? '긴급 발주 검토' : 'AI 예측 참고 활용'}
              </div>
            </div>
          ))}
        </div>

        {/* 테이블 */}
        <div style={{ overflowX:'auto', marginBottom:28 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${T.border}` }}>
                {['순위','제품 ID','제품명','규격','AI 예측','실제 주문','차이','원인 유형'].map(h => (
                  <th key={h} style={{ padding:'8px 6px', textAlign:['AI 예측','실제 주문','차이'].includes(h)?'right':'left', color:T.text3, fontWeight:600, fontSize:11, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {classifiedErrors.map((p, i) => (
                <tr key={i} style={{ borderBottom:`1px solid ${T.border}`, background: i < 3 ? '#fef2f2' : 'transparent' }}>
                  <td style={{ padding:'7px 6px', fontWeight:700, color:T.red }}>{i + 1}</td>
                  <td style={{ padding:'7px 6px', fontFamily:mono, fontSize:10, whiteSpace:'nowrap' }}>{p.product_id}</td>
                  <td style={{ padding:'7px 6px', fontSize:11, fontWeight:600, color:T.text1 }}>{p.product_name || '-'}</td>
                  <td style={{ padding:'7px 6px', fontSize:10, color:T.text3 }}>{p.product_specification || '-'}</td>
                  <td style={{ padding:'7px 6px', textAlign:'right', fontFamily:mono, fontSize:11 }}>{p.predicted.toFixed(1)}</td>
                  <td style={{ padding:'7px 6px', textAlign:'right', fontFamily:mono, fontSize:11 }}>{p.actual.toFixed(1)}</td>
                  <td style={{ padding:'7px 6px', textAlign:'right', fontFamily:mono, fontSize:11, color:T.red, fontWeight:700 }}>{p.error.toFixed(1)}</td>
                  <td style={{ padding:'7px 6px' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:p.cls.color, background:p.cls.bg, borderRadius:5, padding:'2px 7px', whiteSpace:'nowrap' }}>
                      {p.cls.icon} {p.cls.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 원인 유형별 분석 카드 */}
        <div style={{ fontSize:13, fontWeight:700, color:T.text1, marginBottom:12 }}>📋 원인 유형별 분석 및 권고사항</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14 }}>
          {errorGroups.map(([type, products]) => {
            const cls = products[0].cls
            return (
              <div key={type} style={{ borderRadius:10, overflow:'hidden', border:`1px solid ${cls.color}33` }}>
                {/* 카드 헤더 */}
                <div style={{ padding:'12px 16px', background:cls.bg, display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:18 }}>{cls.icon}</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:cls.color }}>{type}</div>
                    <div style={{ fontSize:11, color:T.text3 }}>{products.length}건 발생</div>
                  </div>
                </div>
                {/* 카드 본문 */}
                <div style={{ padding:'14px 16px', background:'#fff' }}>
                  {/* 해당 제품 태그 */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10 }}>
                    {products.map(p => (
                      <span key={p.product_id} style={{ fontSize:10, fontFamily:mono, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'2px 7px', color:T.text1 }}>
                        {p.product_name || p.product_id}
                        <span style={{ color:T.text3, marginLeft:4 }}>({p.error.toFixed(0)}개 차이)</span>
                      </span>
                    ))}
                  </div>
                  {/* 원인 설명 */}
                  <div style={{ fontSize:12, color:T.text2, lineHeight:1.8, marginBottom:10 }}>
                    {cls.why}
                  </div>
                  {/* 권고사항 */}
                  <div style={{ padding:'8px 12px', borderRadius:6, background:cls.bg, fontSize:12, color:cls.color, fontWeight:600, lineHeight:1.6 }}>
                    💡 {cls.action}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 정확 예측 제품 ── */}
      <div style={secCard}>
        <SectionHeader num={insights ? 6 : 3} title="정확 예측 제품 (Top Accurate Products)" />
        <p style={{ fontSize: 13, color: T.text2, marginBottom: 16 }}>
          예측 오차가 가장 작은 제품들입니다. 이 제품군은 AI 예측을 신뢰하고 자동 발주/생산 계획에 즉시 반영할 수 있습니다.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                {['순위', '제품 ID', '제품명', '규격', '예측', '실제', '오차', '정확도'].map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: ['예측','실제','오차','정확도'].includes(h) ? 'right' : 'left', color: T.text3, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_accurate_products.map((p, i) => {
                const accuracy = p.actual > 0 ? Math.max(0, 100 - (Math.abs(p.error) / p.actual * 100)) : (p.error === 0 ? 100 : 0)
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i < 3 ? '#f0fdf4' : 'transparent' }}>
                    <td style={{ padding: '7px 6px', fontWeight: 700, color: T.green }}>{i + 1}</td>
                    <td style={{ padding: '7px 6px', fontFamily: mono, fontSize: 10, whiteSpace: 'nowrap' }}>{p.product_id}</td>
                    <td style={{ padding: '7px 6px', fontSize: 11, fontWeight: 600, color: T.text1 }}>{p.product_name || '-'}</td>
                    <td style={{ padding: '7px 6px', fontSize: 10, color: T.text3 }}>{p.product_specification || '-'}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{p.predicted.toFixed(1)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11 }}>{p.actual.toFixed(1)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right', fontFamily: mono, fontSize: 11, color: T.green, fontWeight: 700 }}>{p.error.toFixed(1)}</td>
                    <td style={{ padding: '7px 6px', textAlign: 'right' }}>
                      <Badge type="good">{accuracy.toFixed(0)}%</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 실무 적용 권고 ── */}
      <div style={secCard}>
        <SectionHeader num={insights ? 7 : 4} title="실무 적용 권고 (Recommendations)" />

        {/* DB 저장된 권고사항이 있으면 우선 표시 */}
        {dbRecommendations && dbRecommendations.length > 0 ? (
          <div style={{ display: 'grid', gap: 12 }}>
            {dbRecommendations.map((rec: any, i: number) => {
              const prioColor = rec.priority === 'high' ? T.red : rec.priority === 'medium' ? T.amber : T.text3
              const prioLabel = rec.priority === 'high' ? '높음' : rec.priority === 'medium' ? '보통' : '낮음'
              const prioIcon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🔵'
              return (
                <div key={i} style={{
                  ...card, padding: '16px 20px', borderLeft: `4px solid ${prioColor}`,
                  display: 'flex', alignItems: 'flex-start', gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: `${prioColor}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0,
                  }}>{prioIcon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>{rec.area}</span>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        background: `${prioColor}15`, color: prioColor, fontWeight: 600,
                      }}>우선순위: {prioLabel}</span>
                    </div>
                    <div style={{ fontSize: 13, color: T.text1, lineHeight: 1.6, marginBottom: 4 }}>{rec.action}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>근거: {rec.reason}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* 폴백: DB 보고서 없을 때 기존 하드코딩 */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <InsightCard icon="✅" title="즉시 활용 가능" items={
              r2Grade === 'good' ? [
                `<b>생산계획</b> — ${periodTitle} 예측값을 기반으로 ${periodType === 'weekly' ? '주간' : '월간'} 생산 물량 결정`,
                `<b>원자재 발주</b> — 예측 수량에 맞춰 발주량·시점 조정`,
                `<b>정확 예측 제품</b>(오차 5 이하) — 자동 발주/생산계획 연동 권장`,
              ] : r2Grade === 'warn' ? [
                '<b>보조 참고자료</b>로 활용 — 단독 의사결정 근거로는 부족',
                '<b>이상 징후 감지</b> — 급등/급락 알림 용도로 활용',
                `<b>정확 예측 상위 제품</b>에 한해 자동 발주 검토`,
              ] : [
                '<b>예측 의존 금지</b> — 이 기간은 모델 신뢰도가 낮음',
                '<b>담당자 수동 판단</b> 기반으로 운영할 것을 권장',
                '<b>원인 분석</b> — 이 기간 수주 패턴 이상 여부 확인 필요',
              ]
            } />
            <InsightCard icon="⚠️" title="주의 사항" items={[
              `<b>오차 상위 ${classifiedErrors.length}개 제품</b>은 예측을 신뢰하지 말고 담당자가 직접 관리`,
              classifiedErrors.filter(p => p.actual === 0).length > 0 ? `<b>실제 수주 0인 제품에 대한 과대 예측 ${classifiedErrors.filter(p => p.actual === 0).length}건</b> — 불필요한 생산/발주 주의` : '<b>전 제품 수주 발생</b> — 수량 보정에 집중',
              `<b>MAPE ${m.mape.toFixed(0)}%</b> ${m.mape > 50 ? '— 비율 기준 오차가 크므로 소량 제품 예측 시 주의' : '— 비율 기준 오차 양호'}`,
            ]} />
          </div>
        )}
      </div>

      {/* ── 경영진 의사결정 사항 ── */}
      <div style={secCard}>
        <SectionHeader num={insights ? 8 : 5} title="경영진 의사결정 사항" />
        <div style={{ border: `2px solid ${T.blue}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: T.blue, color: '#fff', padding: '12px 20px', fontWeight: 600, fontSize: 14 }}>
            {periodTitle} 결과 기반 의사결정 요청
          </div>
          {[
            {
              q: `${periodTitle} 예측 활용 범위 — R²=${r2Pct.toFixed(1)}%`,
              a: r2Grade === 'good' ? '권장: 즉시 적용' : r2Grade === 'warn' ? '권장: 보조 참고' : '권장: 활용 보류',
              color: r2Grade === 'good' ? '#d1fae5' : r2Grade === 'warn' ? '#fef3c7' : '#fee2e2',
              textColor: r2Grade === 'good' ? '#059669' : r2Grade === 'warn' ? '#d97706' : '#dc2626',
            },
            {
              q: `오차 상위 제품 관리 — 상위 ${classifiedErrors.length}개 제품의 총 오차 ${totalErrorSum.toFixed(0)}개`,
              a: '권장: 담당자 수동 관리',
              color: '#fef3c7', textColor: '#d97706',
            },
            {
              q: `정확 예측 제품군 — ±5 적중률 ${m.tolerance_5_rate.toFixed(1)}%`,
              a: m.tolerance_5_rate >= 30 ? '권장: 자동화 검토' : '권장: 수동 운영 유지',
              color: m.tolerance_5_rate >= 30 ? '#d1fae5' : '#fef3c7',
              textColor: m.tolerance_5_rate >= 30 ? '#059669' : '#d97706',
            },
            {
              q: '향후 개선 방향 — 오차 패턴 기반 모델 고도화',
              a: classifiedErrors.filter(p => p.actual === 0).length > 0 ? '권장: 수주 중단 제품 목록 정기 검토' : '권장: 피처 엔지니어링 강화',
              color: '#dbeafe', textColor: '#1e40af',
            },
          ].map((item, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none', gap: 16 }}>
              <div style={{ flex: 1, fontSize: 13 }}><b>{item.q.split(' — ')[0]}</b> — {item.q.split(' — ')[1]}</div>
              <div style={{ background: item.color, color: item.textColor, padding: '4px 14px', borderRadius: 6, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{item.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
