'use client'
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { T, card } from '@/lib/data'
import { StatusBadge, GradeBadge, RiskTypeBadge, ScoreBar,
  PageHeader, Btn, FilterBar, Select, SearchInput, Table, Badge } from '@/components/ui'

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
  const [evalDate,      setEvalDate]      = useState<string>('')
  const [gradeSummary,  setGradeSummary]  = useState<Record<string, number>>({})
  const [totalCount,    setTotalCount]    = useState<number>(0)
  const [hasMore,       setHasMore]       = useState<boolean>(false)
  const [page,          setPage]          = useState<number>(1)
  const [loadingMore,   setLoadingMore]   = useState<boolean>(false)

  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('monthly')
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

  // ─── 날짜 표시 형식 변환 유틸 ───────────────────────────────────────────────
  const getWeekOfMonth = (date: Date) => {
    const day = date.getDate();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return Math.ceil((day + firstDay) / 7);
  };

  const formatDateDisplay = (dateStr: string, type: 'weekly' | 'monthly') => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    
    if (type === 'monthly') {
      return `${year}년 ${String(month).padStart(2, '0')}월`;
    } else {
      const shortYear = String(year).slice(2);
      const week = getWeekOfMonth(d);
      return `${shortYear}년 ${String(month).padStart(2, '0')}월 ${week}주차`;
    }
  };

  // Select 컴포넌트용 옵션 생성
  const dateOptions: { value: string, label: string }[] = [];
  const seenLabels = new Set();
  availDates.forEach(d => {
    const label = formatDateDisplay(d, periodType);
    if (!seenLabels.has(label)) {
      dateOptions.push({ value: d, label });
      seenLabels.add(label);
    }
  });

  /* ── 초기 필터 정보 로드 (periodType 변경 시 재로드) ── */
  useEffect(() => {
    setFiltersLoaded(false)
    fetch(`/api/risk/filters?type=${periodType}`)
      .then(r => r.json())
      .then(d => {
        if (d.categories) setAvailCategories(d.categories)
        if (d.dates && d.dates.length > 0) {
          setAvailDates(d.dates)
          // dashRefWeek의 evalDate가 있으면 대시보드 기준일 우선 사용, 없으면 최신 날짜
          let targetDate = d.dates[0]
          try {
            const raw = sessionStorage.getItem('dashRefWeek')
            if (raw) {
              const ref = JSON.parse(raw)
              if (ref.evalDate && d.dates.includes(ref.evalDate)) targetDate = ref.evalDate
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
    setTotalCount(0)
    setHasMore(false)
    setPage(1)
    
    if (selDate) {
      loadPage(1, selDate, selCategory, periodType, gradeF, false)
    } else if (filtersLoaded && availDates.length === 0) {
       // 필터 로드 완료 후에도 날짜가 없으면 empty 처리
       setDataSource('empty')
    }
  }, [selDate, selCategory, periodType, gradeF, filtersLoaded, availDates.length])

  /* ── 페이지 추가 로드 ── */
  useEffect(() => {
    if (page === 1) return // 최초 로드는 위 effect에서 처리
    setLoadingMore(true)
    loadPage(page, selDate, selCategory, periodType, gradeF, true)
  }, [page])

  function loadPage(p: number, date: string, category: string, pType: string, grade: string, append: boolean) {
    const requestId = ++requestRef.current
    const query = new URLSearchParams()
    query.set('date', date)
    query.set('page', String(p))
    query.set('eval_type', pType)
    if (category !== '전체') query.set('type', category)
    if (grade !== '전체') query.set('grade', grade)

    fetch(`/api/risk?${query.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (requestId !== requestRef.current) return
        if (data.source === 'database') {
          setRiskItems(prev => append ? [...prev, ...(data.items ?? [])] : (data.items ?? []))
          setEvalDate(data.evalDate ?? '')
          setDataSource('database')
          setGradeSummary(data.gradeSummary ?? {})
          setTotalCount(data.totalCount ?? 0)
          setHasMore(data.hasMore ?? false)
        } else if (data.source === 'empty') {
          if (!append) {
            setRiskItems([])
            setEvalDate(data.evalDate ?? date ?? '')
            setGradeSummary({})
            setTotalCount(0)
            setHasMore(false)
          }
          setDataSource('empty')
        } else {
          setDataSource(data.source === 'error' ? 'error' : 'mock')
        }
      })
      .catch(() => {
        if (requestId === requestRef.current) setDataSource('error')
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoadingMore(false)
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

  return (
    <div style={{ position: 'relative' }}>
      <PageHeader
        title="리스크 관리"
        sub="품목별 재고·납기·마진 위험 자동 진단"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SourceBadge source={dataSource}/>
            {evalDate && <span style={{ fontSize: 10, color: T.text3 }}>기준일: {evalDate}</span>}
            <Btn variant="secondary" onClick={() => {
               const query = new URLSearchParams();
               if (selDate) query.set('date', selDate);
               if (selCategory !== '전체') query.set('type', selCategory);
               window.open(`/risk-report?${query.toString()}`, '_blank', 'width=840,height=1188');
            }}>📄 리스크 보고서</Btn>
          </div>
        }
      />

      {/* Grade scoreboard — gradeSummary 기반 (전체 데이터 집계) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
        {['A','B','C','D','E','F'].map(g => (
          <div key={g} onClick={() => setGradeF(gradeF === g ? '전체' : g)} style={{
            ...card, padding: '14px 16px', textAlign: 'center', cursor: 'pointer',
            background: gradeF === g ? `${gradeColors[g]}12` : T.surface,
            border: `1px solid ${gradeF === g ? gradeColors[g] + '50' : T.border}`,
            transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: gradeColors[g], fontFamily: "'IBM Plex Mono',monospace" }}>
              {dataSource === 'loading' ? '—' : (gradeSummary[g] ?? 0)}
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>Grade {g}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        {/* 주간/월간 전환 */}
        <div style={{ display: 'flex', background: T.surface2, borderRadius: 8, padding: 3, gap: 2, marginRight: 10 }}>
          <button 
            onClick={() => setPeriodType('monthly')}
            style={{ 
              padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: periodType === 'monthly' ? T.surface : 'transparent',
              color: periodType === 'monthly' ? T.text1 : T.text3,
              boxShadow: periodType === 'monthly' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.2s'
            }}>월간</button>
          <button 
            onClick={() => setPeriodType('weekly')}
            style={{ 
              padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: periodType === 'weekly' ? T.surface : 'transparent',
              color: periodType === 'weekly' ? T.text1 : T.text3,
              boxShadow: periodType === 'weekly' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.2s'
            }}>주간</button>
        </div>

        {/* 기준일 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>기준일</span>
          <Select
            value={selDate}
            onChange={setSelDate}
            options={dateOptions.length > 0 ? dateOptions : [{ value: selDate, label: formatDateDisplay(selDate, periodType) }]}
          />
        </div>

        {/* 분류 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>분류</span>
          <Select value={selCategory} onChange={setSelCategory} options={['전체', ...availCategories]}/>
        </div>

        {/* SKU / 품목명 */}
        <SearchInput value={search} onChange={setSearch} placeholder="SKU / 품목명 검색"/>

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

        <Btn variant="secondary" onClick={() => {
          setSearch(''); setGradeF('전체'); setTypeF('전체'); setSelCategory('전체');
          if (availDates.length > 0) setSelDate(availDates[0])
        }}>초기화</Btn>
        <span style={{ fontSize: 11, color: T.text3, marginLeft: 'auto' }}>
          {riskItems.length > 0 && totalCount > 0
            ? `${riskItems.length.toLocaleString()} / ${totalCount.toLocaleString()}건 로드`
            : `총 ${filtered.length}건`}
        </span>
      </FilterBar>

      <HighUncertaintyPanel />

      {filtered.some(r => ['E','F'].includes(r.grade)) && (
        <div style={{ padding: '10px 14px', background: T.redSoft, border: `1px solid ${T.redMid}`, borderRadius: 8, fontSize: 12, color: T.red, fontWeight: 500, marginBottom: 16 }}>
          ⚠ E~F 등급 {filtered.filter(r => ['E','F'].includes(r.grade)).length}건 — 이번 주 내 조치가 필요합니다.
        </div>
      )}

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

          {/* 더 보기 버튼 */}
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <Btn
                variant="secondary"
                onClick={() => setPage(p => p + 1)}
                disabled={loadingMore}
              >
                {loadingMore ? '불러오는 중…' : `더 보기 (${riskItems.length.toLocaleString()} / ${totalCount.toLocaleString()}건)`}
              </Btn>
            </div>
          )}
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
