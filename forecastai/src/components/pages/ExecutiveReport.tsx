'use client'
import React, { useState, useEffect, useRef } from 'react'
import { T, card, formatWeekLabel } from '@/lib/data'

/** API label → 공통 포맷 변환 */
function displayWeekLabel(raw: string): string {
  const m = raw.match(/\((\d{4}-\d{2}-\d{2})/)
  if (m) return formatWeekLabel(m[1])
  return raw
}

// ─── 타입 ───────────────────────────────────────────────────────────────────
interface WeekOption { value: string; label: string; start: string; end: string }
interface KPI {
  weekOrderQty: number; weekProducedQty: number; weekOrderAmt: number
  changeRate: string | null; coverageDays: number; coverageStatus: string
  pendingPO: number; forecastAccuracy: number | null
}
interface Report { summary: string; changes: string[]; risks: string[]; actions: string[] }
interface ReportData {
  meta: { targetWeek: string; weekStart: string; weekEnd: string; generatedAt: string }
  weekOptions: WeekOption[]; kpi: KPI
  topProducts: { product_id: string; order_qty: number }[]
  topActions: { product_id: string; action_type: string; priority: string; reason: string }[]
  riskSummary: Record<string, number>
  report: Report
}

// ─── KPI 카드 ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? T.text1, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─── 섹션 카드 ───────────────────────────────────────────────────────────────
function SectionCard({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 4, height: 18, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
export default function ExecutiveReport() {
  const [weekOptions, setWeekOptions] = useState<WeekOption[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(true)
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  // 실데이터 최신일 기준 (weekly_product_summary 데이터가 2026-02-28까지)
  // → 이 날짜가 포함된 주차를 기본 선택으로 설정
  const SYSTEM_BASE_DATE = '2026-02-28'

  // 첫 로드: 주차 목록만 가져오기 (GPT 미호출, daily_order 기반 26주)
  useEffect(() => {
    fetch('/api/executive-report?optionsOnly=true')
      .then(r => r.json())
      .then(d => {
        if (d.weekOptions?.length) {
          setWeekOptions(d.weekOptions)

          // SYSTEM_BASE_DATE(2026-02-28)가 포함된 주차 자동 선택
          // 라벨 형식: "2026-W09  (2026-02-23 ~ 2026-03-01)"
          const sysDate = new Date(SYSTEM_BASE_DATE)
          const matched = (d.weekOptions as WeekOption[]).find(w => {
            const m = w.label.match(/\((\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})\)/)
            if (!m) return false
            return sysDate >= new Date(m[1]) && sysDate <= new Date(m[2])
          })
          setSelectedWeek(matched?.value ?? d.weekOptions[0].value)
        }
      })
      .catch(() => {})
      .finally(() => setInitLoading(false))
  }, [])

  // 보고서 생성 버튼
  const handleGenerate = async () => {
    if (!selectedWeek) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/executive-report?week=${selectedWeek}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '보고서 생성에 실패했습니다.')
      setData(json)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // PDF 저장 (브라우저 인쇄 → PDF)
  const handlePrint = () => {
    window.print()
  }

  // CSV 다운로드
  const handleCSV = () => {
    if (!data) return
    const { kpi, meta, topProducts } = data
    const rows: string[][] = [
      ['항목', '값'],
      ['보고 기간', formatWeekLabel(meta.weekStart)],
      ['주간 수주량 (EA)', String(kpi.weekOrderQty)],
      ['주간 생산량 (EA)', String(kpi.weekProducedQty)],
      ['전주 대비 변화율 (%)', kpi.changeRate ?? '-'],
      ['재고 커버리지 (일)', String(kpi.coverageDays)],
      ['재고 커버리지 상태', kpi.coverageStatus],
      ['미처리 구매 발주 (건)', String(kpi.pendingPO)],
      ['예측 정확도 (%)', kpi.forecastAccuracy != null ? String(kpi.forecastAccuracy) : '-'],
      [],
      ['제품ID', '주간 수주량 (EA)'],
      ...topProducts.map(p => [p.product_id, String(p.order_qty)]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const bom = '\uFEFF'  // UTF-8 BOM (엑셀 한글 깨짐 방지)
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `임원보고서_${formatWeekLabel(meta.weekStart)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmt = (n: number) => n.toLocaleString('ko-KR')

  return (
    <>
      {/* 인쇄용 CSS — @media print에서 컨트롤·사이드바 숨기고 보고서만 표시 */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 20mm; }
          body * { visibility: hidden; }
          #exec-report-print, #exec-report-print * {
            visibility: visible;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          #exec-report-print {
            position: absolute;
            top: 0; left: 0;
            width: 100%;
            padding: 24px;
            background: #ffffff;
          }
          #exec-report-controls { display: none !important; }
        }
      ` }} />

      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* ─── 헤더 ─── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text1, marginBottom: 4 }}>수주 예측 기반 경영진 주간 보고서</div>
          <div style={{ fontSize: 13, color: T.text3 }}>주차를 선택하면 AI가 수주 실적·재고 리스크·발주 현황을 자동 분석하여 경영진 보고서를 생성합니다.</div>
        </div>

        {/* ─── 컨트롤 영역 ─── */}
        <div id="exec-report-controls" style={{ ...card, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text2, flexShrink: 0 }}>보고 기간</div>

          {initLoading ? (
            <div style={{ fontSize: 13, color: T.text3 }}>주차 목록 로딩 중…</div>
          ) : (
            <select
              value={selectedWeek}
              onChange={e => { setSelectedWeek(e.target.value); setData(null) }}
              style={{
                padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: 7,
                fontSize: 13, color: T.text1, background: T.surface2,
                cursor: 'pointer', outline: 'none', minWidth: 260,
              }}
            >
              {weekOptions.map(w => (
                <option key={w.value} value={w.value}>{displayWeekLabel(w.label)}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading || !selectedWeek}
            style={{
              padding: '9px 20px', background: loading ? T.border : 'linear-gradient(135deg,#2563EB,#3B82F6)',
              border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700,
              color: loading ? T.text3 : '#fff', cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'opacity 0.15s', flexShrink: 0,
            }}
          >
            {loading ? '생성 중…' : '보고서 생성'}
          </button>

          {data && (
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button
                onClick={handlePrint}
                style={{
                  padding: '8px 16px', background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.text2, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                📄 PDF 저장
              </button>
              <button
                onClick={handleCSV}
                style={{
                  padding: '8px 16px', background: T.greenSoft, border: `1px solid ${T.greenMid}`,
                  borderRadius: 7, fontSize: 12, fontWeight: 600, color: T.green, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                📊 CSV 다운로드
              </button>
            </div>
          )}
        </div>

        {/* ─── 에러 ─── */}
        {error && (
          <div style={{ ...card, background: T.redSoft, border: `1px solid ${T.redMid}`, marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: T.red, fontWeight: 600 }}>보고서 생성 실패</div>
            <div style={{ fontSize: 12, color: T.red, marginTop: 4 }}>{error}</div>
          </div>
        )}

        {/* ─── 로딩 ─── */}
        {loading && (
          <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text1, marginBottom: 6 }}>AI 보고서 생성 중</div>
            <div style={{ fontSize: 13, color: T.text3 }}>DB 데이터 수집 및 GPT 분석 중입니다. 잠시 기다려 주세요.</div>
          </div>
        )}

        {/* ─── 보고서 본문 ─── */}
        {data && !loading && (
          <div id="exec-report-print" ref={reportRef}>

            {/* 보고서 제목 (인쇄용) */}
            <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `2px solid ${T.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text1 }}>
                주간 임원 보고서 — {formatWeekLabel(data.meta.weekStart)}
              </div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
                보고 기간: {formatWeekLabel(data.meta.weekStart)}　|　생성: {new Date(data.meta.generatedAt).toLocaleString('ko-KR')}
              </div>
            </div>

            {/* ─── KPI 카드 4개 ─── */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
              <KpiCard
                label="이번 주 수주량"
                value={`${fmt(data.kpi.weekOrderQty)} EA`}
                sub={data.kpi.changeRate != null
                  ? `전주 대비 ${Number(data.kpi.changeRate) >= 0 ? '▲ +' : '▼ '}${data.kpi.changeRate}%`
                  : '전주 대비 데이터 없음'}
                color={data.kpi.changeRate != null && Number(data.kpi.changeRate) < 0 ? T.red : T.blue}
              />
              <KpiCard
                label="이번 주 생산 실적"
                value={`${fmt(data.kpi.weekProducedQty)} EA`}
                sub="생산 완료 수량"
              />
              <KpiCard
                label="재고 안전 여유"
                value={`${data.kpi.coverageDays}일`}
                sub={
                  data.kpi.coverageDays > 90
                    ? '⚠️ 목표 21일 크게 초과 (과잉 재고 위험)'
                    : data.kpi.coverageDays >= 21
                    ? '✅ 목표 달성 (21일 이상)'
                    : data.kpi.coverageDays >= 14
                    ? '⚠️ 주의 (목표 21일 미달)'
                    : '🚨 재고 부족 위험'
                }
                color={
                  data.kpi.coverageDays > 90 ? T.red
                    : data.kpi.coverageDays >= 21 ? T.green
                    : data.kpi.coverageDays >= 14 ? T.amber
                    : T.red
                }
              />
              <KpiCard
                label="수주 예측 정확도"
                value={data.kpi.forecastAccuracy != null ? `${data.kpi.forecastAccuracy}%` : '-'}
                sub={data.kpi.forecastAccuracy != null && data.kpi.forecastAccuracy >= 70 ? '✅ 목표 달성 (70% 이상)' : '목표 70% · 개선 중'}
                color={data.kpi.forecastAccuracy != null && data.kpi.forecastAccuracy >= 70 ? T.green : T.amber}
              />
            </div>

            {/* ─── 보고서 섹션 2열 ─── */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>

              {/* 요약 */}
              <SectionCard title="이번 주 수주 동향 요약" accent={T.blue}>
                <p style={{ fontSize: 13, color: T.text2, lineHeight: 1.75, margin: 0 }}>
                  {data.report.summary || '요약 내용이 없습니다.'}
                </p>
              </SectionCard>

              {/* 주요 변화 */}
              <SectionCard title="전주 대비 주요 변화" accent={T.purple}>
                {data.report.changes.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.report.changes.map((c, i) => (
                      <li key={i} style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, paddingLeft: 14, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, top: 6, width: 5, height: 5, borderRadius: '50%', background: T.purple, display: 'inline-block' }} />
                        {c.replace(/^-\s*/, '')}
                      </li>
                    ))}
                  </ul>
                ) : <p style={{ fontSize: 13, color: T.text3, margin: 0 }}>데이터 없음</p>}
              </SectionCard>
            </div>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>

              {/* 리스크 */}
              <SectionCard title="재고·수주 리스크 현황" accent={T.red}>
                {data.report.risks.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.report.risks.map((r, i) => (
                      <li key={i} style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, paddingLeft: 14, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, top: 6, width: 5, height: 5, borderRadius: '50%', background: T.red, display: 'inline-block' }} />
                        {r.replace(/^-\s*/, '')}
                      </li>
                    ))}
                  </ul>
                ) : <p style={{ fontSize: 13, color: T.text3, margin: 0 }}>데이터 없음</p>}
              </SectionCard>

              {/* 추천 액션 */}
              <SectionCard title="AI 권고 — 우선 대응 사항" accent={T.green}>
                {data.report.actions.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.report.actions.map((a, i) => (
                      <li key={i} style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, paddingLeft: 14, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, top: 6, width: 5, height: 5, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
                        {a.replace(/^-\s*/, '')}
                      </li>
                    ))}
                  </ul>
                ) : <p style={{ fontSize: 13, color: T.text3, margin: 0 }}>데이터 없음</p>}
              </SectionCard>
            </div>

            {/* ─── 미처리 구매 발주 ─── */}
            {data.kpi.pendingPO > 0 && (
              <div style={{ ...card, marginTop: 14, background: T.amberSoft, border: `1px solid ${T.amberMid}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.amber }}>
                  ⚠ 미결 구매 발주 {data.kpi.pendingPO}건 — 납기 지연 방지를 위해 즉시 처리 검토 필요
                </div>
              </div>
            )}

            {/* ─── 인쇄용 꼬리말 ─── */}
            <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.text3, textAlign: 'center' }}>
              본 보고서는 ForecastAI 시스템에서 AI 자동 생성되었습니다. · {new Date(data.meta.generatedAt).toLocaleString('ko-KR')}
            </div>

          </div>
        )}

        {/* ─── 초기 안내 (보고서 생성 전) ─── */}
        {!data && !loading && !error && (
          <div style={{ ...card, textAlign: 'center', padding: '48px 24px', color: T.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text2, marginBottom: 6 }}>주차를 선택하고 보고서를 생성해 주세요</div>
            <div style={{ fontSize: 13 }}>
              AI가 해당 주차의 <strong>수주 실적 · 전주 대비 증감 · 재고 리스크 · 우선 대응 사항</strong>을<br />
              자동으로 분석하여 경영진 보고서를 작성합니다.
            </div>
          </div>
        )}

      </div>
    </>
  )
}
