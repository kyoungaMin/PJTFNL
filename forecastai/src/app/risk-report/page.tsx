'use client'

import React, { useEffect, useState } from 'react'

type RiskItem = {
  id: number; sku: string; name: string; score: number; grade: string;
  type: string; action: string; status: string;
  stock: number; safeStock: number; leadTime: number; customer: string;
}

const GRADE_COLOR: Record<string, string> = {
  A: '#10B981', B: '#84CC16', C: '#F59E0B', D: '#F97316', E: '#EF4444', F: '#7C3AED',
}
const GRADE_BG: Record<string, string> = {
  A: '#ecfdf5', B: '#f7fee7', C: '#fffbeb', D: '#fff7ed', E: '#fef2f2', F: '#f5f3ff',
}
const TYPE_COLOR: Record<string, string> = {
  '결품': '#EF4444', '납기': '#F97316', '과잉': '#3B82F6', '마진': '#F59E0B',
}

export default function RiskReportPage() {
  const [items,        setItems]        = useState<RiskItem[]>([])
  const [gradeSummary, setGradeSummary] = useState<Record<string, number>>({})
  const [typeSummary,  setTypeSummary]  = useState<Record<string, number>>({})
  const [totalCount,   setTotalCount]   = useState(0)
  const [evalDate,     setEvalDate]     = useState('')
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(false)
  const [params,       setParams]       = useState({ date: '', type: '전체', evalType: 'monthly' })

  useEffect(() => {
    const p        = new URLSearchParams(window.location.search)
    const date     = p.get('date')      || ''
    const type     = p.get('type')      || '전체'
    const evalType = p.get('eval_type') || 'monthly'
    setParams({ date, type, evalType })

    const q = new URLSearchParams()
    if (date)          q.set('date', date)
    if (type !== '전체') q.set('type', type)
    q.set('eval_type', evalType)

    fetch(`/api/risk?${q.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.source === 'database' || data.source === 'empty') {
          setItems(data.items ?? [])
          setGradeSummary(data.gradeSummary ?? {})
          setTypeSummary(data.typeSummary ?? {})
          setTotalCount(data.totalCount ?? 0)
          setEvalDate(data.evalDate ?? date)
        } else {
          setError(true)
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ padding: 60, fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", color: '#64748b', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      보고서를 생성하는 중입니다…
    </div>
  )
  if (error) return (
    <div style={{ padding: 60, fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", color: '#dc2626', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
      데이터를 불러올 수 없습니다.
    </div>
  )

  // ── 계산 ─────────────────────────────────────────────────────────────────
  const criticalCount = (gradeSummary['E'] ?? 0) + (gradeSummary['F'] ?? 0)
  const warningCount  = gradeSummary['D'] ?? 0

  const criticalItems = items.filter(r => ['E','F'].includes(r.grade))

  // 결품 위험 우선 정렬, 건수 제한 없음
  const warningItems = [
    ...items.filter(r => r.grade === 'D' && r.type === '결품'),
    ...items.filter(r => r.grade === 'D' && r.type !== '결품'),
  ]

  // API에서 받은 전체 기준 typeSummary 사용 (없으면 로드된 items로 근사치 계산)
  const typeCount: Record<string, number> =
    Object.keys(typeSummary).length > 0
      ? typeSummary
      : items.reduce((acc, r) => { acc[r.type] = (acc[r.type] ?? 0) + 1; return acc }, {} as Record<string, number>)

  const pendingCount = criticalItems.filter(r => r.status === '미처리').length

  const printDate = new Date().toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ background: '#e2e8f0', minHeight: '100vh', padding: '24px 0', fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
          .sheet { box-shadow: none !important; border: none !important; margin: 0 !important; width: 100% !important; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
        * { box-sizing: border-box; }
      `}} />

      {/* ── 인쇄 버튼 (화면에서만 표시) ─────────────────────────────────── */}
      <div className="no-print" style={{ maxWidth: '210mm', margin: '0 auto 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => window.print()} style={{
          background: '#1e40af', color: '#fff', border: 'none', padding: '8px 20px',
          borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 13,
        }}>🖨 인쇄 / PDF 저장</button>
        <button onClick={() => window.close()} style={{
          background: '#e2e8f0', color: '#475569', border: 'none', padding: '8px 16px',
          borderRadius: 6, cursor: 'pointer', fontSize: 13,
        }}>닫기</button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          A4 시트
      ══════════════════════════════════════════════════════════════════ */}
      <div className="sheet" style={{
        width: '210mm', minHeight: '297mm', margin: '0 auto', background: '#fff',
        padding: '14mm 16mm', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        border: '1px solid #cbd5e1', color: '#0f172a',
      }}>

        {/* ── 상단 헤더 ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 14, marginBottom: 20, borderBottom: '3px solid #0f172a' }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', letterSpacing: '0.08em', marginBottom: 4 }}>CONFIDENTIAL — 내부용 브리핑</div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', color: '#0f172a' }}>리스크 종합 브리핑</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>ForecastAI Risk Monitoring Report</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#475569', lineHeight: 1.8 }}>
            <div><strong>출력일시</strong>　{printDate}</div>
            <div><strong>기준일자</strong>　{evalDate || '최신'}</div>
            <div><strong>분류기준</strong>　{params.type} / {params.evalType === 'weekly' ? '주간' : '월간'}</div>
            <div><strong>전체 관리 품목</strong>　<strong style={{ color: '#0f172a', fontSize: 13 }}>{totalCount.toLocaleString()}건</strong></div>
          </div>
        </div>

        {/* ── SECTION 1: 경영 요약 KPI ────────────────────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle num="1" title="경영 요약" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {([
              { label: '즉시 조치 필요', value: criticalCount, sub: 'E · F 등급 — 이번 주 내 조치 필수', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
              { label: '주의 필요',      value: warningCount,  sub: 'D 등급 — 조기 대응 권고',          color: '#f97316', bg: '#fff7ed', border: '#fed7aa' },
              { label: '전체 관리 품목', value: totalCount,    sub: '현재 기준일 기준 전체 품목 수',     color: '#334155', bg: '#f8fafc', border: '#e2e8f0' },
              { label: '미처리 건수',    value: pendingCount,  sub: 'E·F 중 아직 조치 미실시',           color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
            ] as { label: string; value: number; sub: string; color: string; bg: string; border: string }[]).map(({ label, value, sub, color, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 8, padding: '12px 14px', borderLeftColor: color, borderLeftWidth: 4, borderLeftStyle: 'solid' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, fontFamily: 'monospace' }}>{value.toLocaleString()}</div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 5 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* 요약 코멘트 */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#334155', lineHeight: 1.8 }}>
            {criticalCount > 0
              ? <span>⚠ <strong style={{ color: '#dc2626' }}>E·F 등급 {criticalCount}건</strong>은 즉각적인 조치가 필요합니다. {pendingCount > 0 && <span>이 중 <strong>{pendingCount}건</strong>이 아직 미처리 상태입니다. </span>}담당자는 아래 목록을 확인하고 이번 주 내 조치를 완료해 주세요.</span>
              : <span>✅ 현재 E·F 등급에 해당하는 즉시 조치 필요 품목은 없습니다. D 등급 {warningCount}건에 대해 지속적인 모니터링을 권고합니다.</span>
            }
          </div>
        </div>

        {/* ── SECTION 2: 등급별 현황 ──────────────────────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle num="2" title="등급별 현황 (전체 기준)" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 12 }}>
            {['A','B','C','D','E','F'].map(g => (
              <div key={g} style={{
                textAlign: 'center', borderRadius: 8, padding: '10px 6px',
                background: GRADE_BG[g], border: `1px solid ${GRADE_COLOR[g]}40`,
              }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: GRADE_COLOR[g], fontFamily: 'monospace' }}>
                  {(gradeSummary[g] ?? 0).toLocaleString()}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: GRADE_COLOR[g], marginTop: 2 }}>Grade {g}</div>
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                  {totalCount > 0 ? `${Math.round((gradeSummary[g] ?? 0) / totalCount * 100)}%` : '-'}
                </div>
              </div>
            ))}
          </div>
          {/* 등급 범례 */}
          <div style={{ display: 'flex', gap: 16, fontSize: 10, color: '#64748b', flexWrap: 'wrap' }}>
            {([
              ['A·B', '정상 — 특별 조치 불필요', '#10B981'],
              ['C',   '경계 — 지속 모니터링 필요', '#F59E0B'],
              ['D',   '위험 — 조기 대응 권고', '#F97316'],
              ['E·F', '심각 — 즉시 조치 필수', '#EF4444'],
            ] as [string,string,string][]).map(([g, desc, c]) => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
                <strong style={{ color: '#334155' }}>{g}</strong> {desc}
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 3: 위험유형 분포 ───────────────────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle num="3" title={`위험유형 분포 — 전체 ${totalCount.toLocaleString()}건 기준`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {([
              ['결품', '재고 부족 → 납품 차질 위험'],
              ['납기', '리드타임 초과 → 입고 지연'],
              ['과잉', '재고 과다 → 보관비·자금 부담'],
              ['마진', '수익성 악화 → 단가 재협의 필요'],
            ] as [string,string][]).map(([type, desc]) => {
              const cnt  = typeCount[type] ?? 0
              const base = totalCount > 0 ? totalCount : items.length
              const pct  = base > 0 ? Math.round(cnt / base * 100) : 0
              return (
                <div key={type} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: TYPE_COLOR[type] }}>{type}</span>
                    <span style={{ fontSize: 16, fontWeight: 900, color: TYPE_COLOR[type], fontFamily: 'monospace' }}>{cnt}</span>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginBottom: 6 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: TYPE_COLOR[type], borderRadius: 3, opacity: 0.75 }} />
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8', lineHeight: 1.5 }}>{desc}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── SECTION 4: 즉시 조치 필요 품목 (E·F) ──────────────────── */}
        <div style={{ marginBottom: 22 }}>
          <SectionTitle num="4" title={`즉시 조치 필요 품목 — E·F 등급 (${criticalItems.length}건)`} color="#dc2626" />
          {criticalItems.length === 0 ? (
            <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, fontSize: 12, color: '#166534', textAlign: 'center' }}>
              ✅ 현재 즉시 조치가 필요한 E·F 등급 품목이 없습니다.
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: '#fef2f2', borderTop: '2px solid #fca5a5', borderBottom: '1px solid #fca5a5' }}>
                    <th style={{ padding: '8px', textAlign: 'left', width: '22%' }}>SKU / 품목명</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '6%' }}>등급</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '7%' }}>점수</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '7%' }}>유형</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '16%' }}>재고 / 안전재고</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '7%' }}>리드타임</th>
                    <th style={{ padding: '8px', textAlign: 'left', width: '24%' }}>권고 액션</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '11%' }}>처리 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {criticalItems.map((r, i) => {
                    const ratio    = r.safeStock > 0 ? Math.round(r.stock / r.safeStock * 100) : null
                    const stockWarn = ratio !== null && ratio < 100
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '8px' }}>
                          <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>{r.sku}</div>
                          <div style={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{r.name}</div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            fontWeight: 900, fontSize: 13, color: GRADE_COLOR[r.grade],
                            background: GRADE_BG[r.grade], padding: '2px 7px', borderRadius: 4,
                            border: `1px solid ${GRADE_COLOR[r.grade]}40`,
                          }}>{r.grade}</span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 800, fontFamily: 'monospace', color: GRADE_COLOR[r.grade] }}>{r.score}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: TYPE_COLOR[r.type] ?? '#334155', fontSize: 11 }}>{r.type}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <div style={{ fontFamily: 'monospace', color: stockWarn ? '#dc2626' : '#0f172a', fontWeight: 600 }}>
                            {r.stock.toLocaleString()} / {r.safeStock.toLocaleString()}
                          </div>
                          {ratio !== null && (
                            <div style={{ fontSize: 9, color: stockWarn ? '#dc2626' : '#94a3b8', fontWeight: stockWarn ? 700 : 400 }}>
                              {ratio}% {stockWarn ? '⚠' : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', color: '#475569' }}>
                          {r.leadTime > 0 ? `${r.leadTime}일` : '—'}
                        </td>
                        <td style={{ padding: '8px', color: '#1d4ed8', fontWeight: 600, lineHeight: 1.4 }}>{r.action}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: r.status === '완료' ? '#f0fdf4' : r.status === '검토중' ? '#eff6ff' : '#fef2f2',
                            color:      r.status === '완료' ? '#166534' : r.status === '검토중' ? '#1d4ed8' : '#dc2626',
                            border:     `1px solid ${r.status === '완료' ? '#86efac' : r.status === '검토중' ? '#bfdbfe' : '#fca5a5'}`,
                          }}>{r.status}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {criticalCount > criticalItems.length && (
                <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 6 }}>
                  * 전체 E·F 등급 {criticalCount}건 중 현재 로드된 {criticalItems.length}건 표시 — 전체 조회는 리스크 관리 페이지에서 확인하세요.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── SECTION 5: 주의 품목 (D 등급) ──────────────────────────── */}
        {warningItems.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SectionTitle num="5" title={`주의 품목 — D 등급 (전체 ${warningCount}건 중 ${warningItems.length}건 표시)`} color="#f97316" />
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#fff7ed', borderTop: '2px solid #fed7aa', borderBottom: '1px solid #fed7aa' }}>
                  <th style={{ padding: '7px 8px', textAlign: 'left', width: '28%' }}>SKU / 품목명</th>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '8%' }}>점수</th>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '8%' }}>유형</th>
                  <th style={{ padding: '7px 8px', textAlign: 'right', width: '18%' }}>재고 / 안전재고</th>
                  <th style={{ padding: '7px 8px', textAlign: 'left' }}>권고 액션</th>
                  <th style={{ padding: '7px 8px', textAlign: 'center', width: '12%' }}>처리 상태</th>
                </tr>
              </thead>
              <tbody>
                {warningItems.map((r, i) => {
                  const ratio = r.safeStock > 0 ? Math.round(r.stock / r.safeStock * 100) : null
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '7px 8px' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#94a3b8' }}>{r.sku}</div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.name}</div>
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, fontFamily: 'monospace', color: '#f97316' }}>{r.score}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700, color: TYPE_COLOR[r.type] ?? '#334155' }}>{r.type}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', fontSize: 10 }}>
                        <div>{r.stock.toLocaleString()} / {r.safeStock.toLocaleString()}</div>
                        {ratio !== null && <div style={{ color: '#94a3b8' }}>{ratio}%</div>}
                      </td>
                      <td style={{ padding: '7px 8px', color: '#475569', lineHeight: 1.4 }}>{r.action}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                          background: r.status === '완료' ? '#f0fdf4' : r.status === '검토중' ? '#eff6ff' : '#fff7ed',
                          color:      r.status === '완료' ? '#166534' : r.status === '검토중' ? '#1d4ed8' : '#b45309',
                          border:     `1px solid ${r.status === '완료' ? '#86efac' : r.status === '검토중' ? '#bfdbfe' : '#fed7aa'}`,
                        }}>{r.status}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SECTION 6: 확인·결재란 (인쇄용) ────────────────────────── */}
        <div style={{ marginTop: 32, borderTop: '1px solid #cbd5e1', paddingTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginBottom: 14 }}>확인 · 결재</div>
          <div style={{ display: 'flex', gap: 12 }}>
            {['작성 (생산관리)', '검토 (팀장)', '승인 (경영진)'].map(role => (
              <div key={role} style={{
                flex: 1, border: '1px solid #cbd5e1', borderRadius: 6,
                padding: '10px 12px',
              }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 20 }}>{role}</div>
                <div style={{ borderTop: '1px solid #cbd5e1', marginTop: 24, paddingTop: 6, fontSize: 9, color: '#94a3b8', textAlign: 'center' }}>서명 / 날인</div>
              </div>
            ))}
            <div style={{ flex: 2, border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>특이사항 / 조치 메모</div>
              <div style={{ height: 60 }} />
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 9, color: '#94a3b8' }}>
          ForecastAI System Generated Report — {new Date().getFullYear()}
        </div>

      </div>
    </div>
  )
}

function SectionTitle({ num, title, color = '#0f172a' }: { num: string; title: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: color,
        color: '#fff', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{num}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color, borderBottom: `2px solid ${color}40`, paddingBottom: 2, flex: 1 }}>{title}</div>
    </div>
  )
}
