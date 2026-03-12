'use client'
import React, { useState, useEffect } from 'react'
import { T, card, RISK_ITEMS } from '@/lib/data'
import { StatusBadge, GradeBadge, RiskTypeBadge, ScoreBar,
  PageHeader, Btn, FilterBar, Select, SearchInput, Table, Badge } from '@/components/ui'

type RiskItem = {
  id: number; sku: string; name: string; score: number; grade: string;
  type: string; action: string; status: string;
  stock: number; safeStock: number; leadTime: number; customer: string;
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
  const [riskItems, setRiskItems] = useState<RiskItem[]>([])
  const [dataSource, setDataSource] = useState<string>('loading')
  const [evalDate,   setEvalDate]   = useState<string>('')
  const [search,  setSearch]  = useState('')
  const [gradeF,  setGradeF]  = useState('전체')
  const [typeF,   setTypeF]   = useState('전체') // 마진, 납기, 결품 등 위기상황
  const [drawer,  setDrawer]  = useState<RiskItem | null>(null)

  // API 필터 목록 상태
  const [availCategories, setAvailCategories] = useState<string[]>([])
  const [availDates, setAvailDates] = useState<string[]>([])
  
  // 사용자가 선택한 필터 상태
  const [selCategory, setSelCategory] = useState<string>('전체')
  const [selDate, setSelDate] = useState<string>('') // 빈사슬이면 최신 날짜 자동 사용

  /* ── 데이터 로드 ── */
  /* ── 초기 필터 정보 로드 ── */
  useEffect(() => {
    let dashWeekStart: string | null = null
    let dashPlanDate: string | null = null
    let dashEvalDate: string | null = null
    try {
      const raw = sessionStorage.getItem('dashRefWeek')
      if (raw) {
        const ref = JSON.parse(raw)
        dashWeekStart = ref.weekStart ?? null
        dashPlanDate  = ref.planDate ?? null
        dashEvalDate  = ref.evalDate ?? null  // risk_score 실제 eval_date
      }
    } catch {}

    fetch('/api/risk/filters')
      .then(r => r.json())
      .then(d => {
        if (d.categories) setAvailCategories(d.categories)
        if (d.dates && d.dates.length > 0) {
           setAvailDates(d.dates)
           // 대시보드 기준 주차 우선 선택: evalDate → planDate → weekStart → 최신 순으로 시도
           if (!selDate) {
             const preferred =
               (dashEvalDate  && d.dates.includes(dashEvalDate))  ? dashEvalDate  :
               (dashPlanDate  && d.dates.includes(dashPlanDate))  ? dashPlanDate  :
               (dashWeekStart && d.dates.includes(dashWeekStart)) ? dashWeekStart :
               d.dates[0]
             setSelDate(preferred)
           }
        }
      })
      .catch(e => console.error('Filter load error', e))
  }, []) // 빈 배열: 최초 1회만

  /* ── 데이터 로드 ── */
  useEffect(() => {
    setDataSource('loading')
    setRiskItems([])
    
    // 선택된 날짜가 아직 확정되지 않았다면 기다림 (최초 로드 시점)
    if (availDates.length > 0 && !selDate) return;

    const query = new URLSearchParams()
    if (selDate) query.set('date', selDate)
    if (selCategory !== '전체') query.set('type', selCategory)

    fetch(`/api/risk?${query.toString()}`)
      .then(r => r.json())
      .then(data => {
        if (data.source === 'database' && data.items?.length > 0) {
          setRiskItems(data.items)
          setEvalDate(data.evalDate ?? '')
          setDataSource('database')
        } else if (data.source === 'empty') {
          // 조회 결과가 없을 경우
          setRiskItems([])
          setEvalDate(data.evalDate ?? selDate ?? '')
          setDataSource('empty')
        } else {
          setDataSource(data.source === 'error' ? 'error' : 'mock')
        }
      })
      .catch(() => setDataSource('error'))
  }, [selDate, selCategory, availDates])

  const filtered = riskItems.filter(r => {
    const matchSearch = r.sku.includes(search) || r.name.includes(search)
    const matchGrade  = gradeF === '전체' || r.grade === gradeF
    const matchType   = typeF  === '전체' || r.type  === typeF
    return matchSearch && matchGrade && matchType
  })

  const gradeCounts = Object.fromEntries(
    ['A','B','C','D','E','F'].map(g => [g, riskItems.filter(r => r.grade === g).length])
  )
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

      {/* Grade scoreboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
        {['A','B','C','D','E','F'].map(g => (
          <div key={g} onClick={() => setGradeF(gradeF === g ? '전체' : g)} style={{
            ...card, padding: '14px 16px', textAlign: 'center', cursor: 'pointer',
            background: gradeF === g ? `${gradeColors[g]}12` : T.surface,
            border: `1px solid ${gradeF === g ? gradeColors[g] + '50' : T.border}`,
            transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: gradeColors[g], fontFamily: "'IBM Plex Mono',monospace" }}>
              {dataSource === 'loading' ? '—' : gradeCounts[g]}
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>Grade {g}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="SKU / 품목명 검색"/>
        
        {/* 분리된 필터 영역 (위험 등급, 위험 유형) */}
        <Select value={gradeF} onChange={setGradeF} options={['전체','A','B','C','D','E','F']}/>
        <Select value={typeF}  onChange={setTypeF}  options={['전체','결품','과잉','납기','마진']}/>
        
        <div style={{ width: 1, height: 24, background: T.border, margin: '0 8px' }} />

        {/* 제품 카테고리 (제품, 반제품 등) 필터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
           <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>분류</span>
           <Select value={selCategory} onChange={setSelCategory} options={['전체', ...availCategories]} />
        </div>

        {/* 기준일 선택 달력 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 10 }}>
           <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>기준일</span>
           <select 
             value={selDate}
             onChange={e => setSelDate(e.target.value)}
             style={{ 
               padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`,
               background: T.surface, color: T.text1, fontSize: 13, outline: 'none', cursor: 'pointer'
             }}
           >
             {availDates.map(d => <option key={d} value={d}>{d}</option>)}
           </select>
        </div>

        <Btn variant="secondary" onClick={() => { 
            setSearch(''); setGradeF('전체'); setTypeF('전체'); 
            setSelCategory('전체'); 
            if (availDates.length > 0) setSelDate(availDates[0]);
        }}>초기화</Btn>
        <span style={{ fontSize: 11, color: T.text3, marginLeft: 'auto' }}>총 {filtered.length}건</span>
      </FilterBar>

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
