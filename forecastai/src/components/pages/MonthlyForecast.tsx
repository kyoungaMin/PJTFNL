'use client'
import React, { useState, useEffect } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { T, card, sectionTitle, MONTHLY_FORECAST_DATA, SIM_SKUS, exportToCsv } from '@/lib/data'
import { PageHeader, Btn, FilterBar, Select, Table } from '@/components/ui'
import { fetchFXData, fetchSemiData } from '@/lib/externalData'

type MonthRow = { m: string; p10: number; p50: number; p90: number; fx?: number; sox?: number; dram?: number }
type CustomerItem = { year_month: string; order_qty: number; revenue_qty: number }
type ApiResp = { items: MonthRow[]; forecastDate?: string; model?: string; source: string; customerItems?: CustomerItem[] }
type FXRow = Record<string, string | number>
type SemiRow = Record<string, string | number>

const SKU_OPTIONS = SIM_SKUS.map(s => ({ value: s.id, label: `${s.id} — ${s.name}` }))

/** Pearson 상관계수. 데이터 부족·분산 없음 시 null 반환 */
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

function useMonthlyData(sku: string, customer: string, months: number) {
  const [forecast, setForecast] = useState<MonthRow[]>(MONTHLY_FORECAST_DATA as any)
  const [customerData, setCustomerData] = useState<CustomerItem[]>([])
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<{ date?: string; live: boolean }>({ live: false })

  useEffect(() => {
    if (!sku) return
    setLoading(true)

    const customerParam = customer && customer !== '전체 고객사'
      ? `&customer=${encodeURIComponent(customer)}`
      : ''

    Promise.all([
      fetch(`/api/forecast-monthly?sku=${encodeURIComponent(sku)}${customerParam}&months=${months}`).then(r => r.json()),
      fetchFXData(),
      fetchSemiData(),
    ])
      .then(([forecastResp, fxData, semiData]: [ApiResp, FXRow[], SemiRow[]]) => {
        // 환율·SOX·DRAM을 월 레이블 기준 맵으로 변환
        const fxByMonth: Record<string, number> = {}
        for (const row of fxData) { fxByMonth[row.d as string] = row.usd as number }
        const soxByMonth: Record<string, number> = {}
        const dramByMonth: Record<string, number> = {}
        for (const row of semiData) {
          soxByMonth[row.d as string] = row.sox as number
          dramByMonth[row.d as string] = row.dram as number
        }

        if (forecastResp.source === 'database' && forecastResp.items?.length >= 2) {
          const merged = forecastResp.items.map(r => ({
            ...r,
            fx: fxByMonth[r.m] ?? 0,
            sox: soxByMonth[r.m] ?? 0,
            dram: dramByMonth[r.m] ?? 0,
          }))
          setForecast(merged)
          setMeta({ date: forecastResp.forecastDate, live: true })
        } else {
          setForecast(MONTHLY_FORECAST_DATA as any)
          setMeta({ live: false })
        }
        setCustomerData(forecastResp.customerItems ?? [])
      })
      .catch(() => {
        setForecast(MONTHLY_FORECAST_DATA as any)
        setCustomerData([])
        setMeta({ live: false })
      })
      .finally(() => setLoading(false))
  }, [sku, customer, months])

  return { forecast, customerData, loading, meta }
}

export default function PageMonthlyForecast() {
  const [showFX, setShowFX] = useState(true)
  const [showSOX, setShowSOX] = useState(true)
  const [sku, setSku] = useState(SIM_SKUS[0].id)
  const [customer, setCustomer] = useState('전체 고객사')
  const [horizon, setHorizon] = useState(6)

  const { forecast: allForecast, customerData, loading, meta } = useMonthlyData(sku, customer, horizon)
  const forecast = allForecast.slice(0, horizon)

  // ── 상관계수 계산 ──────────────────────────────────────────────────────────
  const FALLBACK_CORR = { fx: -0.72, sox: 0.68, gdp: 0.44, dram: 0.58 }
  const p50s  = forecast.map(d => d.p50)
  const fxs   = forecast.map(d => d.fx   ?? 0)
  const soxs  = forecast.map(d => d.sox  ?? 0)
  const drams = forecast.map(d => d.dram ?? 0)
  const corrFX   = (fxs.some(v => v > 0)   ? pearson(p50s, fxs)   : null) ?? FALLBACK_CORR.fx
  const corrSOX  = (soxs.some(v => v > 0)  ? pearson(p50s, soxs)  : null) ?? FALLBACK_CORR.sox
  const corrDRAM = (drams.some(v => v > 0) ? pearson(p50s, drams) : null) ?? FALLBACK_CORR.dram
  const isCalced = fxs.some(v => v > 0) || soxs.some(v => v > 0)

  const CorrVal = ({ v }: { v: number }) => (
    <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: v >= 0 ? T.green : T.red, fontWeight: 700 }}>
      {v >= 0 ? '+' : ''}{v.toFixed(2)}
    </span>
  )
  const CorrDir = ({ v }: { v: number }) => (
    <span style={{ color: v >= 0 ? T.green : T.red }}>{v >= 0 ? '정상관 ↑' : '역상관 ↓'}</span>
  )

  const TT = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ ...card, padding: '10px 14px', boxShadow: '0 4px 14px rgba(15,23,42,0.1)' }}>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, fontWeight: 600 }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} style={{ fontSize: 12, color: p.color, fontWeight: 600, marginTop: 2 }}>
            {p.name}: {p.value?.toLocaleString()} {p.dataKey === 'p50' ? 'EA' : p.dataKey === 'fx' ? 'KRW/USD' : 'pt'}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="월간 수요예측" sub={`${horizon}개월 중장기 트렌드 · 외부 지표 영향 분석 · 월간 파이프라인`}
        action={<Btn variant="secondary" onClick={() => exportToCsv(
          `monthly_forecast_${sku}.csv`,
          ['월', 'P10(EA)', 'P50(EA)', 'P90(EA)'],
          forecast.map(d => [d.m, d.p10, d.p50, d.p90])
        )}>CSV 내보내기</Btn>} />

      <FilterBar>
        <Select value={sku} onChange={setSku} options={SKU_OPTIONS} />
        <Select value={customer} onChange={setCustomer} options={['전체 고객사', 'A사', 'B사', 'C사']} />
        <div style={{ display: 'flex', background: '#F8FAFC', border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden' }}>
          {([1, 3, 6] as const).map(m => (
            <button key={m} onClick={() => setHorizon(m)}
              style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', border: 'none', cursor: 'pointer',
                background: horizon === m ? T.blue : 'transparent',
                color: horizon === m ? 'white' : T.text2 }}>
              {m}개월
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text2 }}>
          <input type="checkbox" checked={showFX} onChange={e => setShowFX(e.target.checked)} style={{ accentColor: T.blue }} /> KRW/USD 환율
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text2 }}>
          <input type="checkbox" checked={showSOX} onChange={e => setShowSOX(e.target.checked)} style={{ accentColor: T.purple }} /> SOX 지수
        </label>
        {!loading && (
          meta.live
            ? <span style={{ fontSize: 11, fontWeight: 700, color: T.green, background: T.greenSoft, border: `1px solid ${T.greenMid}`, borderRadius: 6, padding: '3px 8px' }}>● LIVE</span>
            : <span style={{ fontSize: 11, fontWeight: 700, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 6, padding: '3px 8px' }}>● MOCK</span>
        )}
      </FilterBar>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={sectionTitle}>월별 수요 추세 + 외부 지표</div>
          <div style={{ fontSize: 11, color: T.text3 }}>좌측: 수량(EA) · 우측: 외부 지표</div>
        </div>

        {loading ? (
          <div style={{ height: 240, background: T.surface2, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: T.text3, fontSize: 13 }}>로딩 중...</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={forecast} margin={{ top: 4, right: 50, left: 0, bottom: 0 }}>
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
              <Tooltip content={<TT />} />
              <Area yAxisId="left" type="monotone" dataKey="p90" name="P90" stroke="#BFDBFE" strokeWidth={1} fill="url(#monthBand)" dot={false} />
              <Area yAxisId="left" type="monotone" dataKey="p10" name="P10" stroke="#BFDBFE" strokeWidth={1} fill="white" dot={false} />
              <Line yAxisId="left" type="monotone" dataKey="p50" name="수요 P50" stroke={T.blue} strokeWidth={2.5} dot={{ r: 4, fill: T.blue, stroke: 'white', strokeWidth: 2 }} activeDot={{ r: 5 }} />
              {showFX && <Line yAxisId="right" type="monotone" dataKey="fx" name="KRW/USD" stroke={T.amber} strokeWidth={1.8} strokeDasharray="5 3" dot={false} />}
              {showSOX && <Line yAxisId="right" type="monotone" dataKey="sox" name="SOX Index" stroke={T.purple} strokeWidth={1.8} strokeDasharray="5 3" dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        <div style={{ display: 'flex', gap: 20, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
          {[['P50 수요', T.blue, 'solid'], ['예측 밴드', '#93C5FD', 'dashed'], ['KRW/USD', T.amber, 'dashed'], ['SOX Index', T.purple, 'dashed']].map(([lbl, col, dash]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.text2 }}>
              <div style={{ width: 18, borderTop: `2px ${dash} ${col}` }} />{lbl}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={card}>
          <div style={sectionTitle}>
            월별 예측 요약
            {customer !== '전체 고객사' && (
              <span style={{ fontSize: 11, color: T.blue, fontWeight: 400, marginLeft: 8 }}>— {customer}</span>
            )}
          </div>
          {customer !== '전체 고객사' && customerData.length > 0 ? (
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
          ) : customer !== '전체 고객사' && customerData.length === 0 && !loading ? (
            <div style={{ fontSize: 12, color: T.text3, padding: '16px 0' }}>해당 고객사의 실적 데이터가 없습니다.</div>
          ) : (
            <Table
              headers={['월', 'P50 (EA)', '전월 대비']}
              rows={forecast.map((d, i) => ({
                cells: [
                  <span style={{ fontWeight: 600, color: T.text1 }}>{d.m}</span>,
                  <span style={{ fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace", color: T.blue }}>{d.p50.toLocaleString()}</span>,
                  i === 0 ? <span style={{ color: T.text3 }}>─</span> :
                    (() => {
                      const diff = d.p50 - forecast[i - 1].p50
                      const pct = ((diff / forecast[i - 1].p50) * 100).toFixed(1)
                      return <span style={{ color: diff > 0 ? T.green : T.red, fontWeight: 600 }}>{diff > 0 ? '↑' : '↓'} {Math.abs(Number(pct))}%</span>
                    })()
                ]
              }))}
            />
          )}
        </div>
        <div style={card}>
          <div style={sectionTitle}>
            외부 지표 영향도 분석
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 400, marginLeft: 6 }}>
              {isCalced ? '(예측 데이터 기반 산출)' : '(AI 분석 · 기본값)'}
            </span>
          </div>
          <Table
            headers={['지표', '상관계수', '영향 방향']}
            rows={[
              { cells: ['KRW/USD 환율',   <CorrVal v={corrFX} />,              <CorrDir v={corrFX} />] },
              { cells: ['SOX 반도체지수',  <CorrVal v={corrSOX} />,             <CorrDir v={corrSOX} />] },
              { cells: ['국내 GDP 성장률', <CorrVal v={FALLBACK_CORR.gdp} />,   <CorrDir v={FALLBACK_CORR.gdp} />] },
              { cells: ['DRAM 현물가',    <CorrVal v={corrDRAM} />,             <CorrDir v={corrDRAM} />] },
            ]}
          />
          <div style={{ marginTop: 12, fontSize: 11, color: T.text3 }}>
            ⓘ 상관계수: -1~+1. |값|이 클수록 영향도 높음.
            {!isCalced && ' 실데이터 연동 시 자동 재계산됩니다.'}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: T.text3 }}>
        ⓘ 모델: LightGBM Quantile (lgbm_q_monthly_v1) | horizon: 30/90/180일
        {meta.live && meta.date ? ` | 마지막 예측일: ${meta.date}` : ''}
      </div>
    </div>
  )
}
