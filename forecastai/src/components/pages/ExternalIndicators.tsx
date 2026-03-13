'use client'
import React, { useState, useEffect } from 'react'
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { T, card, EXT_SEMI_DATA, EXT_GLOBAL_DATA, EXT_FX_DATA, EXT_SUPPLY_DATA, EXT_RAW_DATA, exportToCsv } from '@/lib/data'
import { fetchSemiData, fetchGlobalData, fetchFXData, fetchSupplyData, fetchRawData, INDICATOR_META } from '@/lib/externalData'
import { Freq, periodOptionsForFreq, periodLabel } from '@/lib/freqUtils'
import { PageHeader, Btn } from '@/components/ui'

// ── AI 외부지표 분석 패널 ─────────────────────────────────────────────────────

interface AiExtItem {
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple'
  title: string
  text: string
}

const AI_EXT_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  blue:   { text: T.blue,   bg: T.blueSoft,   border: T.blueMid },
  red:    { text: T.red,    bg: T.redSoft,    border: T.redMid },
  amber:  { text: T.amber,  bg: T.amberSoft,  border: T.amberMid },
  green:  { text: T.green,  bg: T.greenSoft,  border: T.greenMid },
  purple: { text: T.purple, bg: '#F5F3FF',    border: '#C4B5FD' },
}

function AiExtIndicatorPanel({
  indicatorType,
  latestData,
}: {
  indicatorType: string
  latestData: Record<string, unknown>[]
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AiExtItem[]>([])
  const [loading, setLoading] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [source, setSource] = useState('')

  async function fetchAnalysis(refresh = false) {
    setLoading(true)
    try {
      // 최신 2개 포인트를 직렬화해서 전달
      const snapshot = latestData.slice(-2)
      const params = new URLSearchParams({
        type: indicatorType,
        snapshot: JSON.stringify(snapshot),
        ...(refresh ? { refresh: '1' } : {}),
      })
      const res = await fetch(`/api/ai-indicator-insight?${params}`)
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

  return (
    <div style={{ ...card, marginTop: 16, border: `1.5px solid ${T.blueMid}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text1 }}>AI 수요 영향 분석</div>
            <div style={{ fontSize: 11, color: T.text3 }}>현재 외부지표가 반도체 부품 수요에 미치는 영향 · gpt-4o-mini</div>
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
            {open ? '닫기' : 'AI 수요 영향 분석'}
          </Btn>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: T.text3 }}>
              <div style={{ width: 18, height: 18, border: `2px solid ${T.blueMid}`, borderTopColor: T.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13 }}>GPT가 외부지표와 수요 영향을 분석하는 중...</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {items.map((item, i) => {
                  const s = AI_EXT_COLOR[item.color] ?? AI_EXT_COLOR.blue
                  return (
                    <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: s.text, marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: T.text1, lineHeight: 1.6 }}>{item.text}</div>
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

// ── 데이터 훅 ─────────────────────────────────────────────────────────────────

function useExtData<T>(fetcher: (months: number, freq: Freq) => Promise<T>, fallback: T, months: number, freq: Freq) {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    fetcher(months, freq)
      .then(d => setData(d as T))
      .catch(() => {/* fallback 유지 */})
      .finally(() => setLoading(false))
  }, [months, freq])
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

function DataListTable({
  data, keys, labels, units, startIdx, endIdx, freq,
}: {
  data: Record<string, unknown>[]
  keys: string[]
  labels: string[]
  units: string[]
  startIdx: number
  endIdx: number
  freq?: Freq
}) {
  const slice = data.slice(startIdx, endIdx + 1)
  const rows = [...slice].reverse()
  return (
    <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: T.surface2, borderBottom: `2px solid ${T.border}` }}>
            <th style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: T.text3, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: T.surface2, zIndex: 1 }}>날짜</th>
            {labels.map((l, i) => (
              <th key={i} style={{ padding: '8px 14px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.text3, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: T.surface2, zIndex: 1 }}>
                {l}{units[i] ? ` (${units[i]})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const prevRow = rows[ri + 1]
            const isLatest = ri === 0
            return (
              <tr key={ri} style={{ borderBottom: `1px solid ${T.border}`, background: isLatest ? `${T.blue}18` : 'transparent' }}>
                <td style={{ padding: '8px 14px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: isLatest ? T.blue : T.text2, fontWeight: isLatest ? 700 : 400, whiteSpace: 'nowrap' }}>
                  {(row['_key'] && freq) ? periodLabel(row['_key'] as string, freq) : row['d'] as string}
                  {isLatest ? ' ●' : ''}
                </td>
                {keys.map((k) => {
                  const cur = (row[k] ?? 0) as number
                  const prev = prevRow ? (prevRow[k] ?? 0) as number : null
                  const pct = (prev !== null && prev !== 0) ? (cur - prev) / Math.abs(prev) * 100 : null
                  return (
                    <td key={k} style={{ padding: '8px 14px', textAlign: 'right' }}>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, color: T.text1, fontSize: 12 }}>
                        {cur !== 0 ? (cur >= 1000 ? cur.toLocaleString() : cur.toFixed(2)) : '-'}
                      </div>
                      {pct !== null && cur !== 0 && (
                        <div style={{ fontSize: 10, color: pct >= 0 ? T.green : T.red, fontWeight: 700, marginTop: 1 }}>
                          {pct >= 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(2)}%
                        </div>
                      )}
                    </td>
                  )
                })}
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


/** 데이터 주기 필터 버튼 */
function FreqFilter({ freq, onChange, options }: {
  freq: Freq; onChange: (f: Freq) => void; options: Freq[]
}) {
  const label = (f: Freq) => f === 'day' ? '일별' : f === 'week' ? '주별' : '월별'
  return (
    <div style={{ display: 'flex', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, overflow: 'hidden' }}>
      {options.map(f => (
        <button key={f} onClick={() => onChange(f)} style={{
          fontSize: 12, fontWeight: 600, padding: '6px 14px', border: 'none', cursor: 'pointer',
          background: freq === f ? T.purple : 'transparent',
          color: freq === f ? 'white' : T.text2,
        }}>
          {label(f)}
        </button>
      ))}
    </div>
  )
}

function ExtLayout({ title, sub, isLive, loading, tickerItems, chartL, chartR, tableData, tableKeys, tableLabels, tableUnits, filename, freqOptions, freq, onFreqChange, indicatorType }: {
  title: string; sub: string; isLive: boolean; loading: boolean;
  tickerItems: React.ReactNode; chartL: React.ReactNode; chartR?: React.ReactNode;
  tableData: Record<string, unknown>[]; tableKeys: string[]; tableLabels: string[]; tableUnits: string[];
  filename: string;
  freqOptions?: Freq[]; freq?: Freq; onFreqChange?: (f: Freq) => void;
  indicatorType?: string;
}) {
  const [startIdx, setStartIdx] = useState(0)
  const [endIdx, setEndIdx] = useState(() => Math.max(0, tableData.length - 1))

  useEffect(() => {
    setStartIdx(0)
    setEndIdx(Math.max(0, tableData.length - 1))
  }, [tableData, freq])

  const handleCsv = () => exportToCsv(
    filename,
    ['날짜', ...tableLabels.map((l, i) => `${l}(${tableUnits[i] || '-'})`)],
    tableData.map(row => [row['d'] as string, ...tableKeys.map(k => row[k] as number ?? '')])
  )

  const selectStyle = {
    fontSize: 12, fontWeight: 700, color: T.text1, background: T.surface,
    border: `1px solid ${T.border}`, borderRadius: 7, padding: '5px 10px',
    cursor: 'pointer', outline: 'none', fontFamily: "'IBM Plex Mono',monospace",
  } as const

  const rowLabel = (row: Record<string, unknown>) => {
    const dk = row['_key'] as string | undefined
    return dk ? periodLabel(dk, freq ?? 'month') : row['d'] as string
  }

  const periodSelect = tableData.length > 0 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>시작</span>
      <select
        value={startIdx}
        onChange={e => { const v = Number(e.target.value); setStartIdx(v); if (v > endIdx) setEndIdx(v) }}
        style={selectStyle}
      >
        {tableData.map((row, idx) => (
          <option key={idx} value={idx}>{rowLabel(row)}</option>
        ))}
      </select>
      <span style={{ fontSize: 11, color: T.text3 }}>~</span>
      <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>종료</span>
      <select
        value={endIdx}
        onChange={e => { const v = Number(e.target.value); setEndIdx(v); if (v < startIdx) setStartIdx(v) }}
        style={selectStyle}
      >
        {[...tableData].reverse().map((row, ri) => {
          const idx = tableData.length - 1 - ri
          return <option key={idx} value={idx}>{rowLabel(row)}</option>
        })}
      </select>
      <button
        onClick={() => { setStartIdx(0); setEndIdx(tableData.length - 1) }}
        style={{ fontSize: 11, fontWeight: 600, color: T.blue, background: T.blueSoft, border: `1px solid ${T.blueMid}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}
      >
        전체
      </button>
    </div>
  ) : null

  return (
    <div>
      <PageHeader
        title={<>{title}<DataBadge isLive={isLive} /></>}
        sub={sub}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {freqOptions && freq && onFreqChange && (
              <FreqFilter freq={freq} onChange={onFreqChange} options={freqOptions} />
            )}
            {freqOptions && <div style={{ width: 1, height: 24, background: T.border }} />}
            {!loading && periodSelect}
            <Btn variant="secondary" onClick={handleCsv}>CSV 내보내기</Btn>
          </div>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 12, marginBottom: 20 }}>
        {loading ? [1, 2, 3].map(i => <LoadingCard key={i} />) : tickerItems}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: chartR ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
        {chartL}{chartR}
      </div>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 14 }}>기간별 변동률</div>
        <PeriodTable data={tableData} keys={tableKeys} labels={tableLabels} units={tableUnits} />
      </div>
      {!loading && tableData.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', marginTop: 16, boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 4 }}>데이터 내역</div>
          <div style={{ fontSize: 10, color: T.text3, marginBottom: 12 }}>
            {freq === 'day' ? '일간' : freq === 'week' ? '주간' : '월간'} 연동 · 조회 {endIdx - startIdx + 1}건 / 전체 {tableData.length}건
          </div>
          <DataListTable
            data={tableData}
            keys={tableKeys}
            labels={tableLabels}
            units={tableUnits}
            startIdx={startIdx}
            endIdx={endIdx}
            freq={freq}
          />
        </div>
      )}
      {indicatorType && !loading && tableData.length > 0 && (
        <AiExtIndicatorPanel indicatorType={indicatorType} latestData={tableData} />
      )}
    </div>
  )
}

// ── 페이지 컴포넌트 ───────────────────────────────────────────────────────────

// SOX=일간, DRAM/NAND=주간(매주 목)
export function PageExtSemi() {
  const [freq, setFreq] = useState<Freq>('month')
  const period = Math.max(...(periodOptionsForFreq(freq) as unknown as number[]))

  const { data, loading } = useExtData(fetchSemiData, EXT_SEMI_DATA, period, freq)
  const isLive = data !== EXT_SEMI_DATA
  const sox = calcChange(data, 'sox'), dram = calcChange(data, 'dram'), nand = calcChange(data, 'nand')
  return <ExtLayout
    title="산업 지표" sub="SOX 지수(일간) · DRAM / NAND 현물가(주간, 매주 목) · 반도체 업황"
    isLive={isLive} loading={loading}
    freqOptions={['week', 'month']} freq={freq} onFreqChange={setFreq}
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
    indicatorType="semi"
  />
}

// IPI=월간(익월 중순), PMI=월간(익월 1영업일), HS8541=월간(익월 15일)
export function PageExtGlobal() {
  const fetchGlobalDataWrapped = (months: number, _freq: Freq) => fetchGlobalData(months)
  const { data, loading } = useExtData(fetchGlobalDataWrapped, EXT_GLOBAL_DATA, 24, 'month')
  const isLive = data !== EXT_GLOBAL_DATA
  const ipi = calcChange(data, 'ipi')
  return <ExtLayout
    title="글로벌 수요" sub="산업생산지수 IPI(월간, 익월 중순) — PMI·HS8541 미연동"
    isLive={isLive} loading={loading}
    tickerItems={[
      <TickerCard key="ipi" label="산업생산지수 (IPI)" value={ipi.value as number} unit="" changePct={ipi.pct} chartData={data} dataKey="ipi"
        source={INDICATOR_META.INDPRO.source} freq={INDICATOR_META.INDPRO.freq} isMock={!isLive} />,
    ]}
    chartL={<ExtChartCard title="IPI 추이" data={data} lineKeys={['ipi']} colors={[T.blue]} />}
    tableData={data} tableKeys={['ipi']}
    tableLabels={['IPI']} tableUnits={['']}
    filename="ext_global.csv"
    indicatorType="global"
  />
}

// 환율=일간(영업일), 기준금리=비정기(연 8회)
export function PageExtFX() {
  const [freq, setFreq] = useState<Freq>('day')
  const period = Math.max(...(periodOptionsForFreq(freq) as unknown as number[]))

  const { data, loading } = useExtData(fetchFXData, EXT_FX_DATA, period, freq)

  const [fxStartIdx, setFxStartIdx] = useState(0)
  const [fxEndIdx, setFxEndIdx] = useState(() => Math.max(0, data.length - 1))

  useEffect(() => { setFxStartIdx(0); setFxEndIdx(Math.max(0, data.length - 1)) }, [data])
  useEffect(() => { setFxStartIdx(0); setFxEndIdx(Math.max(0, data.length - 1)) }, [freq])

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
            <FreqFilter freq={freq} onChange={setFreq} options={['day', 'week', 'month']} />
            <div style={{ width: 1, height: 24, background: T.border }} />
            {!loading && data.length > 0 && (() => {
              const selStyle = {
                fontSize: 12, fontWeight: 700, color: T.text1, background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 7, padding: '5px 10px',
                cursor: 'pointer', outline: 'none', fontFamily: "'IBM Plex Mono',monospace",
              } as const
              const lbl = (row: Record<string, unknown>) => {
                const dk = row['_key'] as string | undefined
                return dk ? periodLabel(dk, freq) : row['d'] as string
              }
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>시작</span>
                  <select value={fxStartIdx} onChange={e => { const v = Number(e.target.value); setFxStartIdx(v); if (v > fxEndIdx) setFxEndIdx(v) }} style={selStyle}>
                    {data.map((row, idx) => <option key={idx} value={idx}>{lbl(row)}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: T.text3 }}>~</span>
                  <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>종료</span>
                  <select value={fxEndIdx} onChange={e => { const v = Number(e.target.value); setFxEndIdx(v); if (v < fxStartIdx) setFxStartIdx(v) }} style={selStyle}>
                    {[...data].reverse().map((row, ri) => {
                      const idx = data.length - 1 - ri
                      return <option key={idx} value={idx}>{lbl(row)}</option>
                    })}
                  </select>
                  <button
                    onClick={() => { setFxStartIdx(0); setFxEndIdx(data.length - 1) }}
                    style={{ fontSize: 11, fontWeight: 600, color: T.blue, background: T.blueSoft, border: `1px solid ${T.blueMid}`, borderRadius: 6, padding: '5px 8px', cursor: 'pointer' }}
                  >
                    전체
                  </button>
                </div>
              )
            })()}
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

      {/* 데이터 내역 */}
      {!loading && data.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 16, boxShadow: '0 1px 4px rgba(15,23,42,0.07)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 4 }}>데이터 내역</div>
          <div style={{ fontSize: 10, color: T.text3, marginBottom: 12 }}>
            {freq === 'day' ? '일간' : freq === 'week' ? '주간' : '월간'} 연동 · 조회 {fxEndIdx - fxStartIdx + 1}건 / 전체 {data.length}건
          </div>
          <DataListTable
            data={data}
            keys={['usd', 'eur', 'jpy', 'cny', 'rate', 'us_rate']}
            labels={['USD/KRW', 'EUR/KRW', 'JPY/KRW', 'CNY/KRW', '한국금리', '미국금리']}
            units={['원', '원', '원', '원', '%', '%']}
            startIdx={fxStartIdx}
            endIdx={fxEndIdx}
            freq={freq}
          />
        </div>
      )}

      {/* AI 수요 영향 분석 */}
      {!loading && data.length > 0 && (
        <AiExtIndicatorPanel indicatorType="fx" latestData={data} />
      )}
    </div>
  )
}

// BDI=일간(영업일), 해상운임=일간
export function PageExtSupply() {
  const [freq, setFreq] = useState<Freq>('month')
  const period = Math.max(...(periodOptionsForFreq(freq) as unknown as number[]))

  const { data, loading } = useExtData(fetchSupplyData, EXT_SUPPLY_DATA, period, freq)
  const isLive = data !== EXT_SUPPLY_DATA
  const bdi = calcChange(data, 'bdi')
  return <ExtLayout
    title="물류" sub="BDI 발틱운임지수(일간, 영업일) — 해상 운임 미연동"
    isLive={isLive} loading={loading}
    freqOptions={['day', 'week', 'month']} freq={freq} onFreqChange={setFreq}
    tickerItems={[
      <TickerCard key="bdi" label="BDI 발틱운임지수" value={bdi.value as number} unit="pt" changePct={bdi.pct} chartData={data} dataKey="bdi"
        source={INDICATOR_META.BALTIC_DRY.source} freq={INDICATOR_META.BALTIC_DRY.freq} />,
    ]}
    chartL={<ExtChartCard title="BDI 추이" data={data} lineKeys={['bdi']} colors={[T.blue]} />}
    tableData={data} tableKeys={['bdi']}
    tableLabels={['BDI']} tableUnits={['pt']}
    filename="ext_supply.csv"
    indicatorType="supply"
  />
}

// WTI=일간(거래일), 구리 LME=일간(거래일), 금=일간
export function PageExtRaw() {
  const [freq, setFreq] = useState<Freq>('month')
  const period = Math.max(...(periodOptionsForFreq(freq) as unknown as number[]))

  const { data, loading } = useExtData(fetchRawData, EXT_RAW_DATA, period, freq)
  const isLive = data !== EXT_RAW_DATA
  const wti = calcChange(data, 'wti')
  return <ExtLayout
    title="원자재" sub="WTI 원유(일간, 거래일) — 구리·금 미연동"
    isLive={isLive} loading={loading}
    freqOptions={['day', 'week', 'month']} freq={freq} onFreqChange={setFreq}
    tickerItems={[
      <TickerCard key="wti" label="WTI 원유" value={wti.value as number} unit="$/bbl" changePct={wti.pct} chartData={data} dataKey="wti"
        source={INDICATOR_META.WTI_MONTHLY.source} freq={INDICATOR_META.WTI_MONTHLY.freq} />,
    ]}
    chartL={<ExtChartCard title="WTI 원유 추이" data={data} lineKeys={['wti']} colors={[T.amber]} />}
    tableData={data} tableKeys={['wti']}
    tableLabels={['WTI']} tableUnits={['$/bbl']}
    filename="ext_raw.csv"
    indicatorType="raw"
  />
}
