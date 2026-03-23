'use client'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { T, card, formatPeriodLabel } from '@/lib/data'
import { StatusBadge, GradeBadge, RiskTypeBadge, ScoreBar,
  PageHeader, Btn, Select, SearchInput, Table, Badge } from '@/components/ui'

type RiskItem = {
  id: number; sku: string; name: string; score: number; grade: string;
  type: string; action: string; status: string;
  stock: number; safeStock: number; leadTime: number; customer: string;
}

// ─── 예측 주의 제품 패널 ───────────────────────────────────────────────────────

type ConfidenceItem = {
  productId: string
  zeroRatio: number  // 0~100 (수요 공백률 %)
  cv: number         // 변동계수
  level: 'high' | 'medium'
}

function useHighUncertaintySkus(limit = 6) {
  const [items, setItems] = useState<ConfidenceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/forecast-weekly/confidence?limit=${limit}`)
      .then(r => r.json())
      .then(d => setItems(d.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [limit])

  return { items, loading }
}

function HighUncertaintyPanel() {
  const [open, setOpen] = useState(true)
  const { items, loading } = useHighUncertaintySkus(6)

  // 로드 완료 후 데이터 없으면 패널 숨김
  if (!loading && items.length === 0) return null

  return (
    <div style={{ ...card, marginBottom: 20, border: `1px solid ${T.amberMid}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>⚠ 예측 주의 제품</span>
            <span style={{
              fontSize: 10, fontWeight: 600, color: T.amber,
              background: T.amberSoft, border: `1px solid ${T.amberMid}`,
              borderRadius: 4, padding: '1px 7px',
            }}>AI 예측 신뢰도 낮음</span>
          </div>
          <p style={{ fontSize: 12, color: T.text2, margin: 0, lineHeight: 1.7 }}>
            아래 제품들은 <strong>주문이 불규칙하거나 주문량 변동이 큰</strong> 제품입니다.
            AI가 예측하기 어려운 패턴이므로, <strong>발주 전 담당자가 직접 수요를 확인</strong>하는 것을 권장합니다.
          </p>
        </div>
        <Btn
          variant="ghost"
          onClick={() => setOpen(o => !o)}
          style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0, marginLeft: 12 }}
        >
          {open ? '접기' : '펼치기'}
        </Btn>
      </div>

      {open && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: 10,
          marginTop: 14,
        }}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  height: 78, borderRadius: 8,
                  background: T.surface2, border: `1px solid ${T.border}`,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }} />
              ))
            : items.map(item => {
                const isHigh = item.level === 'high'
                return (
                  <div key={item.productId} style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: isHigh ? T.redSoft : T.amberSoft,
                    border: `1px solid ${isHigh ? T.redMid : T.amberMid}`,
                  }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: T.text1,
                      fontFamily: "'IBM Plex Mono',monospace",
                      marginBottom: 4,
                    }}>
                      {item.productId}
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, lineHeight: 1.6 }}>
                      주문 없던 기간{' '}
                      <span style={{ fontWeight: 700, color: T.text2 }}>최근 13주 중 {item.zeroRatio}%</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, lineHeight: 1.6 }}>
                      주문량 변동성{' '}
                      <span style={{ fontWeight: 700, color: T.text2 }}>
                        {item.cv >= 1.5 ? '매우 높음' : item.cv >= 1.0 ? '높음' : '보통'}
                      </span>
                    </div>
                    <div style={{
                      marginTop: 6,
                      display: 'inline-block',
                      fontSize: 10, fontWeight: 700,
                      color: isHigh ? T.red : T.amber,
                    }}>
                      {isHigh ? '⚠ 발주 전 직접 확인 필요' : '△ 예측값 참고 후 확인'}
                    </div>
                  </div>
                )
              })
          }
        </div>
      )}
    </div>
  )
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'database')
    return <Badge color={T.green} bg={T.greenSoft} border={T.greenMid} size={10}>DB 실데이터</Badge>
  if (source === 'error')
    return <Badge color={T.red} bg={T.redSoft} border={T.redMid} size={10}>API 오류 (Mock)</Badge>
  if (source === 'loading')
    return <Badge color={T.text3} bg={T.surface2} border={T.border} size={10}>불러오는 중…</Badge>
  return <Badge color={T.amber} bg={T.amberSoft} border={T.amberMid} size={10}>Mock 데이터</Badge>
}

export default function PageRiskManagement() {
  const [riskItems,     setRiskItems]     = useState<RiskItem[]>([])
  const [dataSource,    setDataSource]    = useState<string>('loading')
  const [gradeSummary,  setGradeSummary]  = useState<Record<string, number>>({})
  const [typeSummary,   setTypeSummary]   = useState<Record<string, number>>({})
  const [topCriticalItems, setTopCriticalItems] = useState<RiskItem[]>([])
  const [pendingCriticalCount, setPendingCriticalCount] = useState<number>(0)
  const [totalCount,    setTotalCount]    = useState<number>(0)

  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly')
  const [search,  setSearch]  = useState('')
  const [gradeF,  setGradeF]  = useState('전체')
  const [typeF,   setTypeF]   = useState('전체') // 마진, 납기, 결품 등 위기상황
  const [drawer,  setDrawer]  = useState<RiskItem | null>(null)

  // API 필터 목록 상태
  const [availCategories, setAvailCategories] = useState<string[]>([])
  const [availDates,      setAvailDates]      = useState<string[]>([])

  // 사용자가 선택한 필터 상태
  const [selCategory, setSelCategory] = useState<string>('전체')
  const [selDate,     setSelDate]     = useState<string>('')
  const [filtersLoaded, setFiltersLoaded] = useState<boolean>(false)
  const requestRef = useRef(0)

  // Select 컴포넌트용 옵션 생성
  const dateOptions: { value: string, label: string }[] = [];
  const seenLabels = new Set();
  availDates.forEach(d => {
    const label = formatPeriodLabel(d, periodType);
    if (!seenLabels.has(label)) {
      dateOptions.push({ value: d, label });
      seenLabels.add(label);
    }
  });

  /* ── 대시보드에서 진입 시 weekly 강제 전환 ── */
  const dashInitRef = useRef(false)
  useEffect(() => {
    if (dashInitRef.current) return
    try {
      const raw = sessionStorage.getItem('dashRefWeek')
      if (raw) {
        const ref = JSON.parse(raw)
        if (ref.fromDashboard) {
          dashInitRef.current = true
          ref.fromDashboard = false
          sessionStorage.setItem('dashRefWeek', JSON.stringify(ref))
          if (periodType !== 'weekly') {
            setPeriodType('weekly')  // weekly 필터 로드 트리거
            return                   // periodType 변경으로 아래 effect가 재실행됨
          }
        }
      }
    } catch {}
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 초기 필터 정보 로드 (periodType 변경 시 재로드) ── */
  useEffect(() => {
    setFiltersLoaded(false)
    fetch(`/api/risk/filters?type=${periodType}`)
      .then(r => r.json())
      .then(d => {
        if (d.categories) setAvailCategories(d.categories)
        if (d.dates && d.dates.length > 0) {
          setAvailDates(d.dates)
          let targetDate = d.dates[0]
          try {
            const raw = sessionStorage.getItem('dashRefWeek')
            if (raw) {
              const ref = JSON.parse(raw)
              // 주간 모드: weeklyEvalDate 우선, 월간 모드: evalDate 우선
              const primaryDate = periodType === 'weekly' ? (ref.weeklyEvalDate || ref.evalDate) : ref.evalDate
              // 1순위: 해당 주기의 evalDate 정확 매칭
              if (primaryDate && d.dates.includes(primaryDate)) {
                targetDate = primaryDate
              }
              // 2순위: weekStart 기준 가장 가까운 날짜
              else if (ref.weekStart) {
                const ws = new Date(ref.weekStart).getTime()
                let minDiff = Infinity
                for (const dt of d.dates) {
                  const diff = Math.abs(new Date(dt).getTime() - ws)
                  if (diff < minDiff) { minDiff = diff; targetDate = dt }
                }
              }
            }
          } catch {}
          setSelDate(targetDate)
        } else {
          setAvailDates([])
          setSelDate('')
        }
      })
      .catch(e => console.error('Filter load error', e))
      .finally(() => setFiltersLoaded(true))
  }, [periodType])

  /* ── 데이터 로드 (필터 변경 시 1페이지부터) ── */
  useEffect(() => {
    // 날짜가 없어도 'loading' 상태로 초기화하여 빈 화면 방지
    setDataSource('loading')
    setRiskItems([])
    setGradeSummary({})
    setTypeSummary({})
    setTopCriticalItems([])
    setPendingCriticalCount(0)
    setTotalCount(0)
    
    if (selDate) {
      loadData(selDate, selCategory, periodType, gradeF)
    } else if (filtersLoaded && availDates.length === 0) {
       // 필터 로드 완료 후에도 날짜가 없으면 empty 처리
       setDataSource('empty')
    }
  }, [selDate, selCategory, periodType, gradeF, filtersLoaded, availDates.length])

  function loadData(date: string, category: string, pType: string, grade: string) {
    const requestId = ++requestRef.current
    const query = new URLSearchParams()
    query.set('date', date)
    query.set('eval_type', pType)
    if (category !== '전체') query.set('type', category)
    if (grade !== '전체') query.set('grade', grade)

    fetch(`/api/risk?${query.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (requestId !== requestRef.current) return
        if (data.source === 'database') {
          setRiskItems(data.items ?? [])
          setDataSource('database')
          setGradeSummary(data.gradeSummary ?? {})
          setTypeSummary(data.typeSummary ?? {})
          setTopCriticalItems(data.topCriticalItems ?? [])
          setPendingCriticalCount(data.pendingCriticalCount ?? 0)
          setTotalCount(data.totalCount ?? 0)
        } else if (data.source === 'empty') {
          setRiskItems([])
          setGradeSummary({})
          setTypeSummary({})
          setTopCriticalItems([])
          setPendingCriticalCount(0)
          setTotalCount(0)
          setDataSource('empty')
        } else {
          setDataSource(data.source === 'error' ? 'error' : 'mock')
        }
      })
      .catch(() => {
        if (requestId === requestRef.current) setDataSource('error')
      })
  }

  const filtered = useMemo(() => {
    return riskItems.filter(r => {
      const matchSearch = r.sku.includes(search) || r.name.includes(search)
      const matchGrade  = gradeF === '전체' || r.grade === gradeF
      const matchType   = typeF  === '전체' || r.type  === typeF
      return matchSearch && matchGrade && matchType
    })
  }, [riskItems, search, gradeF, typeF])

  const gradeColors: Record<string, string> = {
    A: '#10B981', B: '#84CC16', C: '#F59E0B', D: '#F97316', E: '#EF4444', F: '#7C3AED',
  }

  const criticalCount   = (gradeSummary['E'] ?? 0) + (gradeSummary['F'] ?? 0)
  const warningCount    = gradeSummary['D'] ?? 0
  const normalizedTypeSummary = useMemo(() => ({
    '결품': typeSummary['결품'] ?? 0,
    '과잉': typeSummary['과잉'] ?? 0,
    '납기': typeSummary['납기'] ?? 0,
    '마진': typeSummary['마진'] ?? 0,
  }), [typeSummary])
  const typeTotalCount = Object.values(normalizedTypeSummary).reduce((sum, cnt) => sum + cnt, 0)

  return (
    <div style={{ position: 'relative' }}>
      <PageHeader
        title="리스크 관리"
        sub="품목별 재고·납기·마진 위험 자동 진단"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SourceBadge source={dataSource}/>
            <Btn variant="secondary" onClick={() => {
               const query = new URLSearchParams();
               if (selDate) query.set('date', selDate);
               if (selCategory !== '전체') query.set('type', selCategory);
               window.open(`/risk-report?${query.toString()}`, '_blank', 'width=840,height=1188');
            }}>📄 리스크 보고서</Btn>
          </div>
        }
      />

      {/* ── 조회조건 ─────────────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: '14px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* 주간/월간 토글 */}
          <div style={{ display: 'flex', background: T.surface2, borderRadius: 8, padding: 3, gap: 2 }}>
            <button
              onClick={() => setPeriodType('weekly')}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: periodType === 'weekly' ? T.surface : 'transparent',
                color: periodType === 'weekly' ? T.text1 : T.text3,
                boxShadow: periodType === 'weekly' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s'
              }}>주간</button>
            <button
              onClick={() => setPeriodType('monthly')}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: periodType === 'monthly' ? T.surface : 'transparent',
                color: periodType === 'monthly' ? T.text1 : T.text3,
                boxShadow: periodType === 'monthly' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s'
              }}>월간</button>
          </div>

          <div style={{ width: 1, height: 24, background: T.border }} />

          {/* 조회 주차 / 조회월 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>
              {periodType === 'weekly' ? '조회 주차' : '조회월'}
            </span>
            <Select
              value={selDate}
              onChange={setSelDate}
              options={dateOptions.length > 0 ? dateOptions : [{ value: selDate, label: formatPeriodLabel(selDate, periodType) }]}
            />
          </div>

          <div style={{ width: 1, height: 24, background: T.border }} />

          {/* 분류 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>분류</span>
            <Select value={selCategory} onChange={setSelCategory} options={['전체', ...availCategories]}/>
          </div>

          {/* 등급 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>등급</span>
            <Select value={gradeF} onChange={setGradeF} options={['전체','A','B','C','D','E','F']}/>
          </div>

          {/* 위험유형 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>위험유형</span>
            <Select value={typeF} onChange={setTypeF} options={['전체','결품','과잉','납기','마진']}/>
          </div>

          {/* SKU / 품목명 검색 */}
          <SearchInput value={search} onChange={setSearch} placeholder="SKU / 품목명 검색"/>

          <Btn variant="secondary" onClick={() => {
            setSearch(''); setGradeF('전체'); setTypeF('전체'); setSelCategory('전체');
            if (availDates.length > 0) setSelDate(availDates[0])
          }}>초기화</Btn>

          <span style={{ fontSize: 11, color: T.text3, marginLeft: 'auto' }}>
            {`${filtered.length.toLocaleString()} / ${totalCount.toLocaleString()}건`}
          </span>
        </div>
      </div>

      {/* ── KPI 4종 ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
        {([
          { label: '즉시 조치 필요',   value: criticalCount,   sub: `E · F 등급 — ${periodType === 'weekly' ? '이번 주' : '이번 달'} 내 조치 필수`,    color: T.red,           bg: T.redSoft,               border: T.redMid },
          { label: '주의 필요',        value: warningCount,    sub: 'D 등급 — 조기 대응 권고',                color: gradeColors['D'], bg: `${gradeColors['D']}12`, border: `${gradeColors['D']}40` },
          { label: '전체 관리 품목',   value: totalCount,      sub: `${formatPeriodLabel(selDate, periodType) || '선택된 기간'} 기준 전체 품목 수`,          color: T.text2,          bg: T.surface2,              border: T.border },
          { label: '미처리 (E·F 중)', value: pendingCriticalCount, sub: '즉시 조치 필요 중 아직 미실시',   color: T.blue,           bg: T.blueSoft,              border: T.blueMid },
        ] as { label: string; value: number; sub: string; color: string; bg: string; border: string }[]).map(({ label, value, sub, color, bg, border }) => (
          <div key={label} style={{ ...card, padding: '16px 20px', background: bg, border: `1px solid ${border}`, borderLeftWidth: 4, borderLeftColor: color, borderLeftStyle: 'solid' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 34, fontWeight: 800, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>
              {dataSource === 'loading' ? '—' : value}
            </div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* 2-컬럼: 왼쪽(등급현황 + 위험유형 분포) / 오른쪽(즉시 조치 TOP 5) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 14, marginBottom: 20 }}>

        {/* 왼쪽 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* 등급별 현황 */}
          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text1 }}>등급별 현황</span>
              <span style={{ fontSize: 10, color: T.text3 }}>카드 클릭 시 해당 등급만 필터링 · 전체 {totalCount.toLocaleString()}건 기준</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
              {['A','B','C','D','E','F'].map(g => (
                <div key={g} onClick={() => setGradeF(gradeF === g ? '전체' : g)} style={{
                  textAlign: 'center', cursor: 'pointer', padding: '12px 6px', borderRadius: 8,
                  background: gradeF === g ? `${gradeColors[g]}15` : T.surface2,
                  border: `1px solid ${gradeF === g ? gradeColors[g] + '60' : T.border}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: gradeColors[g], fontFamily: "'IBM Plex Mono',monospace" }}>
                    {dataSource === 'loading' ? '—' : (gradeSummary[g] ?? 0)}
                  </div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>Grade {g}</div>
                </div>
              ))}
            </div>
            {/* 등급 의미 범례 */}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
              {[['A·B', '정상 — 특별 조치 불필요', T.green], ['C', '경계 — 모니터링 필요', gradeColors['C']], ['D', '위험 — 조기 대응 권고', gradeColors['D']], ['E·F', '심각 — 즉시 조치 필수', T.red]].map(([g, desc, c]) => (
                <div key={g as string} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c as string, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: T.text3 }}><strong style={{ color: T.text2 }}>{g}</strong> {desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 위험유형 분포 */}
          <div style={{ ...card, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text1 }}>위험유형 분포</span>
              <span style={{ fontSize: 10, color: T.text3 }}>DB 전체 {typeTotalCount.toLocaleString()}건 기준 — 가장 빈번한 위험 원인 파악용</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {([
                { type: '결품', color: T.red,           desc: '재고 바닥 위험 — 납품 차질 가능성' },
                { type: '납기', color: gradeColors['D'], desc: '리드타임 초과 — 제때 입고 불가' },
                { type: '과잉', color: T.blue,           desc: '재고 과다 — 보관비·운전자금 부담' },
                { type: '마진', color: T.amber,          desc: '수익성 악화 — 단가 재협의 필요' },
              ] as { type: string; color: string; desc: string }[]).map(({ type, color, desc }) => {
                const cnt = normalizedTypeSummary[type] ?? 0
                const pct = typeTotalCount > 0 ? Math.round(cnt / typeTotalCount * 100) : 0
                return (
                  <div key={type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{type}</span>
                        <span style={{ fontSize: 11, color: T.text3, marginLeft: 6 }}>{desc}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", flexShrink: 0, marginLeft: 8 }}>
                        {cnt}건
                      </span>
                    </div>
                    <div style={{ height: 7, background: T.surface2, borderRadius: 4 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s', opacity: 0.75 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* 오른쪽: 즉시 조치 필요 TOP 5 */}
        <div style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 3 }}>🚨 즉시 조치 필요 TOP 5</div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 14, lineHeight: 1.6 }}>
            E·F 등급 중 리스크 점수 최상위<br/>
            <span style={{ color: T.red, fontWeight: 600 }}>{periodType === 'weekly' ? '이번 주' : '이번 달'} 내 반드시 확인이 필요한 품목입니다</span>
          </div>
          <div style={{ flex: 1 }}>
            {dataSource === 'loading'
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ height: 66, borderRadius: 8, background: T.surface2, marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))
              : topCriticalItems.length === 0
              ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: T.text3, fontSize: 12 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
                  즉시 조치 필요 품목이 없습니다
                </div>
              )
              : topCriticalItems.map((r) => (
                <div
                  key={r.sku}
                  onClick={() => setDrawer(r)}
                  style={{
                    padding: '10px 12px', borderRadius: 8, marginBottom: 8, cursor: 'pointer',
                    background: r.grade === 'F' ? T.redSoft : T.amberSoft,
                    border: `1px solid ${r.grade === 'F' ? T.redMid : T.amberMid}`,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace", color: T.text3, marginBottom: 2 }}>{r.sku}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: T.text2, marginTop: 3 }}>{r.action}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>
                        재고 {r.stock.toLocaleString()} / 안전재고 {r.safeStock.toLocaleString()} EA
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: r.grade === 'F' ? T.red : T.amber, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{r.score}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: r.grade === 'F' ? T.red : T.amber, marginTop: 2 }}>Grade {r.grade}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{r.status}</div>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <HighUncertaintyPanel />


{dataSource === 'loading' ? (
        <div style={{ ...card, padding: '48px', textAlign: 'center', color: T.text3, fontSize: 13 }}>
          리스크 데이터를 불러오는 중…
        </div>
      ) : dataSource === 'empty' ? (
        <div style={{ ...card, padding: '48px', textAlign: 'center', color: T.text3, fontSize: 13 }}>
          해당 조건(날짜 및 분류)에 해당하는 리스크 데이터가 없습니다.
        </div>
      ) : (
        <>
          <div style={card}>
            <Table
              headers={['SKU 코드','품목명','위험 점수','등급','위험 유형','권고 액션','상태']}
              onRowClick={(row: { _raw: RiskItem }) => setDrawer(row._raw)}
              rows={filtered.map(r => ({ _raw: r, cells: [
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 600, color: T.text2 }}>{r.sku}</span>,
                <span style={{ fontWeight: 600, color: T.text1 }}>{r.name}</span>,
                <ScoreBar score={r.score}/>,
                <GradeBadge grade={r.grade}/>,
                <RiskTypeBadge type={r.type}/>,
                <span style={{ fontSize: 12, color: T.text2 }}>{r.action}</span>,
                <StatusBadge status={r.status}/>,
              ]}))}
            />
          </div>
        </>
      )}

      {/* Drawer */}
      {drawer && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 100 }} onClick={() => setDrawer(null)}/>
          <div style={{ position: 'fixed', top: 0, right: 0, width: 440, height: '100vh', background: T.surface, borderLeft: `1px solid ${T.border}`, zIndex: 101, overflowY: 'auto', boxShadow: '-4px 0 24px rgba(15,23,42,0.12)' }}>
            <div style={{ padding: '24px 24px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.text3, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 4 }}>{drawer.sku}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text1 }}>{drawer.name}</div>
                </div>
                <button onClick={() => setDrawer(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, width: 30, height: 30, cursor: 'pointer', fontSize: 16, color: T.text3 }}>×</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <GradeBadge grade={drawer.grade}/>
                <RiskTypeBadge type={drawer.type}/>
                <StatusBadge status={drawer.status}/>
              </div>

              <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 12 }}>위험 점수</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1, height: 10, background: T.border, borderRadius: 5 }}>
                    <div style={{ width: `${drawer.score}%`, height: '100%', background: drawer.score >= 80 ? T.purple : drawer.score >= 60 ? T.red : T.amber, borderRadius: 5, transition: 'width 0.6s' }}/>
                  </div>
                  <span style={{ fontSize: 22, fontWeight: 800, color: T.text1, fontFamily: "'IBM Plex Mono',monospace" }}>{drawer.score}</span>
                  <span style={{ fontSize: 13, color: T.text3 }}>/ 100</span>
                </div>
              </div>

              <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text1, marginBottom: 12 }}>📦 재고 현황</div>
                {([
                  ['현재 재고', `${drawer.stock.toLocaleString()} EA`, drawer.stock < drawer.safeStock],
                  ['안전재고', `${drawer.safeStock.toLocaleString()} EA`, false],
                  ['리드타임', drawer.leadTime > 0 ? `${drawer.leadTime}일` : '—', false],
                  ['담당 고객사', drawer.customer, false],
                ] as [string, string, boolean][]).map(([k, v, warn]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: T.text3 }}>{k}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: warn ? T.red : T.text1 }}>{v} {warn ? '⚠' : ''}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: T.blueSoft, border: `1px solid ${T.blueMid}`, borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.blue, marginBottom: 10 }}>🤖 AI 권고 액션</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 6 }}>{drawer.action}</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}>
                  {drawer.stock > 0 && drawer.safeStock > 0 && (
                    <div>• 현재 재고 / 안전재고 비율: {Math.round(drawer.stock / drawer.safeStock * 100)}%</div>
                  )}
                  {drawer.leadTime > 0 && <div>• 평균 리드타임: {drawer.leadTime}일</div>}
                  <div>• 권고 등급: Grade {drawer.grade}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="success" style={{ flex: 1 }}>✓ 승인</Btn>
                <Btn variant="secondary" style={{ flex: 1 }}>✏ 수정 요청</Btn>
                <Btn variant="secondary">보류</Btn>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
