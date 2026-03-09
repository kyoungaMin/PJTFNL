'use client'
import React, { useState, useEffect } from 'react'
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { T, card, EXT_SEMI_DATA, EXT_GLOBAL_DATA, EXT_FX_DATA, EXT_SUPPLY_DATA, EXT_RAW_DATA, exportToCsv } from '@/lib/data'
import { fetchSemiData, fetchGlobalData, fetchFXData, fetchSupplyData, fetchRawData, INDICATOR_META } from '@/lib/externalData'
import { PageHeader, Btn } from '@/components/ui'

// ── 데이터 훅 ─────────────────────────────────────────────────────────────────

function useExtData<T>(fetcher: (months: number) => Promise<T>, fallback: T, months: number) {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetcher(months)
      .then(d => setData(d as T))
      .catch(() => {/* fallback 유지 */})
      .finally(() => setLoading(false))
  }, [months])
  return { data, loading }
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────────────

function calcChange(data: Record<string, unknown>[], key: string) {
  if (data.length < 2) return { value: data[0]?.[key] ?? 0, pct: 0 }
  const last = data[data.length - 1][key] as number
  const prev = data[data.length - 2][key] as number
  return { value: last, pct: prev ? (last - prev) / prev * 100 : 0 }
}

function LoadingCard() {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', opacity: 0.5 }}>
      <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>로딩 중...</div>
      <div style={{ height: 30, background: T.surface2, borderRadius: 6 }} />
    </div>
  )
}

function TickerCard({ label, value, unit, changePct, chartData, dataKey, source, freq, isMock }: {
  label: string; value: number; unit: string; changePct: number;
  chartData: Record<string, unknown>[]; dataKey: string;
  source?: string; freq?: string; isMock?: boolean;
}) {
  const up = changePct >= 0
  const vals = chartData.map(x => x[dataKey] as number)
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1
  const pts = chartData.map((d, i) => {
    const x = (i / (chartData.length - 1)) * 80
    const y = 26 - ((d[dataKey] as number - min) / range) * 22
    return `${x},${y}`
  }).join(' ')
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
        {label}
        {isMock && <span style={{ fontSize: 9, fontWeight: 700, color: T.amber, background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 4, padding: '1px 5px' }}>MOCK</span>}
      </div>
      {(source || freq) && (
        <div style={{ fontSize: 9, color: T.text3, marginBottom: 6, display: 'flex', gap: 4 }}>
          {source && <span>{source}</span>}
          {source && freq && <span>·</span>}
          {freq && <span style={{ color: T.blue, fontWeight: 600 }}>{freq}</span>}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text1, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>
            {typeof value === 'number' && value > 100 ? value.toLocaleString() : value}
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 400, marginLeft: 3 }}>{unit}</span>
          </div>
          <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: up ? T.green : T.red }}>{up ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%</span>
            <span style={{ fontSize: 10, color: T.text3 }}>전월비</span>
          </div>
        </div>
        <svg width={82} height={30}><polyline points={pts} fill="none" stroke={up ? T.green : T.red} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </div>
  )
}

function PeriodTable({ data, keys, labels, units }: {
  data: Record<string, unknown>[];
  keys: string[]; labels: string[]; units: string[];
}) {
  if (data.length < 2) return null
  const last = data[data.length - 1]
  const prev1 = data[data.length - 2] ?? data[0]
  const prev4 = data.length >= 5 ? data[data.length - 5] : data[0]
  const prev12 = data[0]
  const Chg = ({ v }: { v: string }) => {
    const n = parseFloat(v)
    return <span style={{ color: n >= 0 ? T.green : T.red, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>{n >= 0 ? '▲' : '▼'}{Math.abs(n).toFixed(2)}%</span>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: T.surface2, borderBottom: `2px solid ${T.border}` }}>
            {['지표', '현재값', '전월 대비', '4주 전 대비', '연초 대비'].map(h => (
              <th key={h} style={{ padding: '9px 14px', textAlign: h === '지표' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: T.text3, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((k, i) => {
            const cur = last[k] as number, p1 = prev1[k] as number
            const p4 = prev4[k] as number, p12 = prev12[k] as number
            return (
              <tr key={k} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: T.text1 }}>
                  {labels[i]}<span style={{ fontSize: 10, color: T.text3, marginLeft: 5, fontWeight: 400 }}>{units[i]}</span>
                </td>
                <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: T.text1 }}>{cur.toLocaleString()}</td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}><Chg v={p1 ? ((cur - p1) / p1 * 100).toFixed(2) : '0'} /></td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}><Chg v={p4 ? ((cur - p4) / p4 * 100).toFixed(2) : '0'} /></td>
                <td style={{ padding: '10px 14px', textAlign: 'right' }}><Chg v={p12 ? ((cur - p12) / p12 * 100).toFixed(2) : '0'} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ExtChartCard({ title, data, lineKeys, colors, height = 155, mockKeys }: {
  title: string; data: Record<string, unknown>[]; lineKeys: string[]; colors: string[]; height?: number; mockKeys?: string[];
}) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 12 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
          <XAxis dataKey="d" tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 9, fill: T.text3 }} axisLine={false} tickLine={false} width={38} tickFormatter={v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v} />
          <Tooltip contentStyle={{ fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 8 }} />
          {lineKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={colors[i]} strokeWidth={2.2} dot={false}
              strokeDasharray={mockKeys?.includes(k) ? '5 3' : undefined}
              activeDot={{ r: 4, fill: colors[i], stroke: 'white', strokeWidth: 2 }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {lineKeys.map((k, i) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.text2 }}>
            <div style={{ width: 14, height: mockKeys?.includes(k) ? 0 : 2, borderTop: mockKeys?.includes(k) ? `2px dashed ${colors[i]}` : undefined, background: mockKeys?.includes(k) ? undefined : colors[i], borderRadius: 1 }} />
            {k.toUpperCase()}{mockKeys?.includes(k) ? ' (MOCK)' : ''}
          </div>
        ))}
      </div>
    </div>
  )
}

function DataBadge({ isLive }: { isLive: boolean }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 99, marginLeft: 8,
      background: isLive ? T.greenSoft : T.amberSoft,
      color: isLive ? T.green : T.amber,
      border: `1px solid ${isLive ? T.greenMid : T.amberMid}`,
    }}>
      {isLive ? '● LIVE' : '● MOCK'}
    </span>
  )
}

/** 기간 필터 버튼 (options: 월 단위 숫자 배열) */
function PeriodFilter({ period, onChange, options = [3, 6, 12] }: {
  period: number; onChange: (n: number) => void; options?: readonly number[]
}) {
  const label = (m: number) => m >= 24 ? `${m / 12}Y` : m === 12 ? '1Y' : `${m}M`
  return (
    <div style={{ display: 'flex', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, overflow: 'hidden' }}>
      {options.map(m => (
        <button key={m} onClick={() => onChange(m)} style={{
          fontSize: 12, fontWeight: 600, padding: '6px 14px', border: 'none', cursor: 'pointer',
          background: period === m ? T.blue : 'transparent',
          color: period === m ? 'white' : T.text2,
        }}>
          {label(m)}
        </button>
      ))}
    </div>
  )
}

function ExtLayout({ title, sub, isLive, loading, period, onPeriodChange, periodOptions, tickerItems, chartL, chartR, tableData, tableKeys, tableLabels, tableUnits, filename }: {
  title: string; sub: string; isLive: boolean; loading: boolean;
  period: number; onPeriodChange: (n: number) => void; periodOptions?: readonly number[];
  tickerItems: React.ReactNode; chartL: React.ReactNode; chartR: React.ReactNode;
  tableData: Record<string, unknown>[]; tableKeys: string[]; tableLabels: string[]; tableUnits: string[];
  filename: string;
}) {
  const handleCsv = () => exportToCsv(
    filename,
    ['날짜', ...tableLabels.map((l, i) => `${l}(${tableUnits[i] || '-'})`)],
    tableData.map(row => [row['d'] as string, ...tableKeys.map(k => row[k] as number ?? '')])
  )
  return (
    <div>
      <PageHeader
        title={<>{title}<DataBadge isLive={isLive} /></>}
        sub={sub}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <PeriodFilter period={period} onChange={onPeriodChange} options={periodOptions} />
            <Btn variant="secondary" onClick={handleCsv}>CSV 내보내기</Btn>
          </div>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12, marginBottom: 20 }}>
        {loading ? [1, 2, 3].map(i => <LoadingCard key={i} />) : tickerItems}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {chartL}{chartR}
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 14 }}>기간별 변동률</div>
        <PeriodTable data={tableData} keys={tableKeys} labels={tableLabels} units={tableUnits} />
      </div>
    </div>
  )
}

// ── 페이지 컴포넌트 ───────────────────────────────────────────────────────────

// SOX=일간, DRAM/NAND=주간(매주 목)
const SEMI_PERIOD_OPTIONS = [3, 6, 12, 24] as const

export function PageExtSemi() {
  const [period, setPeriod] = useState(12)
  const { data, loading } = useExtData(fetchSemiData, EXT_SEMI_DATA, period)
  const isLive = data !== EXT_SEMI_DATA
  const sox = calcChange(data, 'sox'), dram = calcChange(data, 'dram'), nand = calcChange(data, 'nand')
  return <ExtLayout
    title="산업 지표" sub="SOX 지수(일간) · DRAM / NAND 현물가(주간, 매주 목) · 반도체 업황"
    isLive={isLive} loading={loading} period={period} onPeriodChange={setPeriod} periodOptions={SEMI_PERIOD_OPTIONS}
    tickerItems={[
      <TickerCard key="sox"  label="SOX 지수"   value={sox.value as number}  unit="pt"   changePct={sox.pct}  chartData={data} dataKey="sox"
        source={INDICATOR_META.SOX.source} freq={INDICATOR_META.SOX.freq} isMock={!isLive} />,
      <TickerCard key="dram" label="DRAM 현물가" value={dram.value as number} unit="$/Gb" changePct={dram.pct} chartData={data} dataKey="dram"
        source={INDICATOR_META.DRAM_DDR4.source} freq={INDICATOR_META.DRAM_DDR4.freq} isMock={!isLive} />,
      <TickerCard key="nand" label="NAND 현물가" value={nand.value as number} unit="$/GB" changePct={nand.pct} chartData={data} dataKey="nand"
        source={INDICATOR_META.NAND_TLC.source} freq={INDICATOR_META.NAND_TLC.freq} isMock={!isLive} />,
    ]}
    chartL={<ExtChartCard title="SOX 지수 추이" data={data} lineKeys={['sox']} colors={[T.blue]} />}
    chartR={<ExtChartCard title="DRAM / NAND 현물가" data={data} lineKeys={['dram', 'nand']} colors={[T.purple, '#0D9488']} />}
    tableData={data} tableKeys={['sox', 'dram', 'nand']}
    tableLabels={['SOX 지수', 'DRAM', 'NAND']} tableUnits={['pt', '$/Gb', '$/GB']}
    filename="ext_semi.csv"
  />
}

// IPI=월간(익월 중순), PMI=월간(익월 1영업일), HS8541=월간(익월 15일)
const GLOBAL_PERIOD_OPTIONS = [6, 12, 24] as const

export function PageExtGlobal() {
  const [period, setPeriod] = useState(12)
  const { data, loading } = useExtData(fetchGlobalData, EXT_GLOBAL_DATA, period)
  const isLive = data !== EXT_GLOBAL_DATA
  const ipi = calcChange(data, 'ipi'), pmi = calcChange(data, 'pmi'), hs = calcChange(data, 'hs8541')
  return <ExtLayout
    title="글로벌 수요" sub="산업생산지수 IPI(월간, 익월 중순) · PMI(월간, 익월 1영업일) · HS8541 수출입(월간, 익월 15일)"
    isLive={isLive} loading={loading} period={period} onPeriodChange={setPeriod} periodOptions={GLOBAL_PERIOD_OPTIONS}
    tickerItems={[
      <TickerCard key="ipi" label="산업생산지수 (IPI)" value={ipi.value as number} unit=""   changePct={ipi.pct} chartData={data} dataKey="ipi"
        source={INDICATOR_META.INDPRO.source} freq={INDICATOR_META.INDPRO.freq} isMock={!isLive} />,
      <TickerCard key="pmi" label="글로벌 PMI"         value={pmi.value as number} unit=""   changePct={pmi.pct} chartData={data} dataKey="pmi"
        source={INDICATOR_META.CN_PMI_MFG.source} freq={INDICATOR_META.CN_PMI_MFG.freq} isMock />,
      <TickerCard key="hs"  label="HS8541 수출"         value={hs.value as number}  unit="$M" changePct={hs.pct}  chartData={data} dataKey="hs8541"
        source={INDICATOR_META.HS8541.source} freq={INDICATOR_META.HS8541.freq} isMock={!isLive} />,
    ]}
    chartL={<ExtChartCard title="IPI · PMI 추이" data={data} lineKeys={['ipi', 'pmi']} colors={[T.blue, T.green]} />}
    chartR={<ExtChartCard title="HS8541 수출 동향" data={data} lineKeys={['hs8541']} colors={[T.purple]} />}
    tableData={data} tableKeys={['ipi', 'pmi', 'hs8541']}
    tableLabels={['IPI', 'PMI', 'HS8541 수출']} tableUnits={['', '', '$M']}
    filename="ext_global.csv"
  />
}

// 환율=일간(영업일), 기준금리=비정기(연 8회)
const FX_PERIOD_OPTIONS = [1, 3, 6, 12] as const

export function PageExtFX() {
  const [period, setPeriod] = useState(6)
  const { data, loading } = useExtData(fetchFXData, EXT_FX_DATA, period)
  const isLive   = data !== EXT_FX_DATA
  const usd      = calcChange(data, 'usd')
  const eur      = calcChange(data, 'eur')
  const jpy      = calcChange(data, 'jpy')
  const cny      = calcChange(data, 'cny')
  const krRate   = calcChange(data, 'rate')
  const usRate   = calcChange(data, 'us_rate')

  const latestUsd    = usd.value as number
  const latestJpy    = jpy.value as number
  const latestCny    = cny.value as number
  const latestKrRate = krRate.value as number
  const latestUsRate = usRate.value as number
  const rateDiff     = +(latestUsRate - latestKrRate).toFixed(2)

  const today = new Date()
  const isPast = (y: number, m: number, d: number) => new Date(y, m - 1, d) < today

  const fomcSchedule = [
    { date: '1/27~28',  result: '동결 4.25%', done: isPast(2026, 1, 28)  },
    { date: '3/17~18',  result: '예정',        done: isPast(2026, 3, 18)  },
    { date: '4/28~29',  result: '예정',        done: isPast(2026, 4, 29)  },
    { date: '6/9~10',   result: '예정',        done: isPast(2026, 6, 10)  },
    { date: '7/28~29',  result: '예정',        done: isPast(2026, 7, 29)  },
    { date: '9/15~16',  result: '예정',        done: isPast(2026, 9, 16)  },
    { date: '10/27~28', result: '예정',        done: isPast(2026, 10, 28) },
    { date: '12/8~9',   result: '예정',        done: isPast(2026, 12, 9)  },
  ]
  const bokSchedule = [
    { date: '1/15',  result: '인하 2.75%', done: isPast(2026, 1, 15)  },
    { date: '2/26',  result: '동결 2.75%', done: isPast(2026, 2, 26)  },
    { date: '4/17',  result: '예정',        done: isPast(2026, 4, 17)  },
    { date: '5/28',  result: '예정',        done: isPast(2026, 5, 28)  },
    { date: '7/9',   result: '예정',        done: isPast(2026, 7, 9)   },
    { date: '8/27',  result: '예정',        done: isPast(2026, 8, 27)  },
    { date: '10/15', result: '예정',        done: isPast(2026, 10, 15) },
    { date: '11/26', result: '예정',        done: isPast(2026, 11, 26) },
  ]

  return (
    <div>
      {/* ── Header ── */}
      <PageHeader
        title={<>환율 / 금리<DataBadge isLive={isLive} /></>}
        sub="USD/KRW · EUR/KRW · JPY/KRW · CNY/KRW(일간, 영업일) · 한국/미국 기준금리(비정기, 연 8회)"
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <PeriodFilter period={period} onChange={setPeriod} options={FX_PERIOD_OPTIONS} />
            <Btn variant="secondary" onClick={() => exportToCsv(
              'ext_fx.csv',
              ['날짜', 'USD/KRW(원)', 'EUR/KRW(원)', 'JPY/KRW(원)', 'CNY/KRW(원)', '한국금리(%)', '미국금리(%)'],
              data.map(row => [row['d'] as string, row['usd'] as number, row['eur'] as number, row['jpy'] as number, row['cny'] as number, row['rate'] as number, row['us_rate'] as number])
            )}>CSV 내보내기</Btn>
          </div>
        }
      />

      {/* ── 티커 카드 6개 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12, marginBottom: 20 }}>
        {loading ? [1,2,3,4,5,6].map(i => <LoadingCard key={i} />) : <>
          <TickerCard label="USD/KRW" value={usd.value as number} unit="원" changePct={usd.pct} chartData={data} dataKey="usd"
            source={INDICATOR_META.USD.source} freq={INDICATOR_META.USD.freq} />
          <TickerCard label="EUR/KRW" value={eur.value as number} unit="원" changePct={eur.pct} chartData={data} dataKey="eur"
            source={INDICATOR_META.EUR.source} freq={INDICATOR_META.EUR.freq} />
          <TickerCard label="JPY/KRW" value={jpy.value as number} unit="원" changePct={jpy.pct} chartData={data} dataKey="jpy"
            source={INDICATOR_META.JPY.source} freq={INDICATOR_META.JPY.freq} />
          <TickerCard label="CNY/KRW" value={cny.value as number} unit="원" changePct={cny.pct} chartData={data} dataKey="cny"
            source={INDICATOR_META.CNY.source} freq={INDICATOR_META.CNY.freq} />
          <TickerCard label="한국 기준금리" value={krRate.value as number} unit="%" changePct={krRate.pct} chartData={data} dataKey="rate"
            source={INDICATOR_META.KR_BASE_RATE.source} freq={INDICATOR_META.KR_BASE_RATE.freq} />
          <TickerCard label="미국 기준금리" value={usRate.value as number} unit="%" changePct={usRate.pct} chartData={data} dataKey="us_rate"
            source={INDICATOR_META.US_FED_RATE.source} freq={INDICATOR_META.US_FED_RATE.freq} />
        </>}
      </div>

      {/* ── 차트 Row 1: USD·EUR | 금리 비교 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ExtChartCard title="USD · EUR 환율 추이 (KRW)" data={data} lineKeys={['usd', 'eur']} colors={[T.blue, T.purple]} />
        <ExtChartCard title="한국 · 미국 기준금리 비교" data={data} lineKeys={['rate', 'us_rate']} colors={[T.amber, T.red]} />
      </div>

      {/* ── 차트 Row 2: JPY | CNY ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <ExtChartCard title="JPY/KRW 추이 (100엔당)" data={data} lineKeys={['jpy']} colors={[T.green]} />
        <ExtChartCard title="CNY/KRW 추이 (위안당)" data={data} lineKeys={['cny']} colors={[T.orange]} />
      </div>

      {/* ── 기간별 변동률 테이블 ── */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 14 }}>기간별 변동률</div>
        <PeriodTable
          data={data}
          keys={['usd', 'eur', 'jpy', 'cny', 'rate', 'us_rate']}
          labels={['USD/KRW', 'EUR/KRW', 'JPY/KRW', 'CNY/KRW', '한국 기준금리', '미국 기준금리']}
          units={['원', '원', '원', '원', '%', '%']}
        />
      </div>

      {/* ── 하단 Row: 환율 영향도 | 금리결정 일정 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* 환율 영향도 분석 */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 14 }}>환율 영향도 분석</div>

          {latestUsd > 1350 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: T.redSoft, border: `1px solid ${T.redMid}`, borderRadius: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, marginTop: 1 }}>⚠</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>USD/KRW 고환율 경보</div>
                <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>1,350원 초과 — 수입 원자재 비용 상승 압박. 원가율 점검 권고.</div>
              </div>
            </div>
          )}
          {rateDiff > 1.0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13, marginTop: 1 }}>!</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.amber }}>한미 금리 역전 지속</div>
                <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>금리차 {rateDiff}%p — 자본유출 압력으로 원화 약세 요인 지속.</div>
              </div>
            </div>
          )}

          {[
            {
              icon: '🏭',
              label: '수입 원자재 비용',
              value: `USD 1% 상승 시 원가 약 +0.35% 압박 (현재 ${latestUsd.toLocaleString()}원${latestUsd > 1400 ? ' — 고환율 위험' : latestUsd > 1350 ? ' — 주의 구간' : ''})`,
              color: latestUsd > 1350 ? T.red : T.text2,
            },
            {
              icon: '🇯🇵',
              label: '일본 경쟁사 가격 경쟁력',
              value: latestJpy > 9.0
                ? `JPY 약세 (${latestJpy.toFixed(2)}원) — 일본산 경쟁력 약화, 국내 업체 유리`
                : `JPY 강세 (${latestJpy.toFixed(2)}원) — 일본산 가격 경쟁 심화 주의`,
              color: latestJpy > 9.0 ? T.green : T.red,
            },
            {
              icon: '🇨🇳',
              label: '중국 소재 수입 비용',
              value: `CNY/KRW ${latestCny.toFixed(0)}원 — 중국산 소재 단가 모니터링 필요`,
              color: T.text2,
            },
            {
              icon: '💱',
              label: '환헤지 권고',
              value: latestUsd > 1340
                ? 'USD 결제 비중 높은 거래 환헤지 검토 (선물환/옵션)'
                : '현 환율 수준 안정적 — 정기 모니터링 유지',
              color: latestUsd > 1340 ? T.amber : T.green,
            },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < 3 ? `1px solid ${T.border}` : 'none' }}>
              <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text2 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: item.color, marginTop: 2 }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 금리결정 일정 */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 14 }}>
            금리결정 일정
            <span style={{ fontSize: 10, fontWeight: 400, color: T.text3, marginLeft: 6 }}>2026년 기준 · 연 8회</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 8 }}>
                🇺🇸 FOMC
              </div>
              {fomcSchedule.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: i < fomcSchedule.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.done ? T.text3 : T.red, flexShrink: 0 }} />
                  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: s.done ? T.text3 : T.text1, fontWeight: 600, minWidth: 54 }}>{s.date}</div>
                  <div style={{ fontSize: 10, color: s.done ? T.text3 : T.text2 }}>{s.result}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, marginBottom: 8 }}>
                🇰🇷 한국은행 금통위
              </div>
              {bokSchedule.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 0', borderBottom: i < bokSchedule.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.done ? T.text3 : T.blue, flexShrink: 0 }} />
                  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: s.done ? T.text3 : T.text1, fontWeight: 600, minWidth: 40 }}>{s.date}</div>
                  <div style={{ fontSize: 10, color: s.done ? T.text3 : T.text2 }}>{s.result}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// BDI=일간(영업일), 해상운임=일간
const SUPPLY_PERIOD_OPTIONS = [1, 3, 6, 12] as const

export function PageExtSupply() {
  const [period, setPeriod] = useState(6)
  const { data, loading } = useExtData(fetchSupplyData, EXT_SUPPLY_DATA, period)
  const isLive = data !== EXT_SUPPLY_DATA
  const bdi = calcChange(data, 'bdi'), frt = calcChange(data, 'freight')
  return <ExtLayout
    title="물류" sub="BDI 발틱운임지수(일간, 영업일) · 아시아 해상 운임(일간)"
    isLive={isLive} loading={loading} period={period} onPeriodChange={setPeriod} periodOptions={SUPPLY_PERIOD_OPTIONS}
    tickerItems={[
      <TickerCard key="bdi" label="BDI 발틱운임지수"  value={bdi.value as number} unit="pt" changePct={bdi.pct} chartData={data} dataKey="bdi"
        source={INDICATOR_META.BALTIC_DRY.source} freq={INDICATOR_META.BALTIC_DRY.freq} />,
      <TickerCard key="frt" label="해상 운임 (아시아)" value={frt.value as number} unit="$"  changePct={frt.pct} chartData={data} dataKey="freight"
        source={INDICATOR_META.BALTIC_DRY.source} freq={INDICATOR_META.BALTIC_DRY.freq} isMock />,
    ]}
    chartL={<ExtChartCard title="BDI 추이" data={data} lineKeys={['bdi']} colors={[T.blue]} />}
    chartR={<ExtChartCard title="해상 운임 추이" data={data} lineKeys={['freight']} colors={[T.amber]} />}
    tableData={data} tableKeys={['bdi', 'freight']}
    tableLabels={['BDI', '해상 운임']} tableUnits={['pt', '$']}
    filename="ext_supply.csv"
  />
}

// WTI=일간(거래일), 구리 LME=일간(거래일), 금=일간
const RAW_PERIOD_OPTIONS = [1, 3, 6, 12] as const

export function PageExtRaw() {
  const [period, setPeriod] = useState(6)
  const { data, loading } = useExtData(fetchRawData, EXT_RAW_DATA, period)
  const isLive = data !== EXT_RAW_DATA
  const cu = calcChange(data, 'copper'), wti = calcChange(data, 'wti'), gold = calcChange(data, 'gold')
  return <ExtLayout
    title="원자재" sub="구리 LME(일간, 거래일) · WTI 원유(일간, 거래일) · 금 COMEX(일간)"
    isLive={isLive} loading={loading} period={period} onPeriodChange={setPeriod} periodOptions={RAW_PERIOD_OPTIONS}
    tickerItems={[
      <TickerCard key="cu"   label="구리 (LME)" value={cu.value as number}   unit="$/t"   changePct={cu.pct}   chartData={data} dataKey="copper"
        source={INDICATOR_META.COPPER_LME.source} freq={INDICATOR_META.COPPER_LME.freq} />,
      <TickerCard key="wti"  label="WTI 원유"   value={wti.value as number}  unit="$/bbl" changePct={wti.pct}  chartData={data} dataKey="wti"
        source={INDICATOR_META.WTI_MONTHLY.source} freq={INDICATOR_META.WTI_MONTHLY.freq} />,
      <TickerCard key="gold" label="금 (COMEX)" value={gold.value as number} unit="$/oz"  changePct={gold.pct} chartData={data} dataKey="gold"
        source="COMEX" freq="일간" isMock />,
    ]}
    chartL={<ExtChartCard title="구리 가격 추이" data={data} lineKeys={['copper']} colors={[T.orange]} />}
    chartR={<ExtChartCard title="WTI · 금 추이" data={data} lineKeys={['wti', 'gold']} colors={[T.amber, T.green]} mockKeys={['gold']} />}
    tableData={data} tableKeys={['copper', 'wti', 'gold']}
    tableLabels={['구리', 'WTI', '금']} tableUnits={['$/t', '$/bbl', '$/oz']}
    filename="ext_raw.csv"
  />
}
