'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { T, card, sectionTitle, getMonday, getWeekOfMonth } from '@/lib/data'
import { Badge, PageHeader, Btn, Table } from '@/components/ui'

/* ──────── 타입 ──────── */
interface PipelineItem {
  id: string
  name: string
  description: string
  category: '예측' | '분석' | '수집' | '보고서'
  schedule: string
  lastRunAt: string | null
  lastStatus: 'success' | 'failed' | 'running' | 'never'
  lastDurationSec: number | null
  dependsOn: string[]
  periodType: 'weekly' | 'monthly' | 'daily' | 'none'   // 기간 선택 유형
}

interface RunLog {
  id: string
  pipelineId: string
  pipelineName: string
  startedAt: string
  finishedAt: string | null
  status: 'success' | 'failed' | 'running'
  durationSec: number | null
  message: string | null
  dateFrom: string | null
  dateTo: string | null
}

/* ──────── 날짜 헬퍼 ──────── */
const toISO = (d: Date) => d.toISOString().slice(0, 10)
const pad2 = (n: number) => String(n).padStart(2, '0')
const today = () => toISO(new Date())
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d) }
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return toISO(d) }

/* ──────── 파이프라인별 기간 프리셋 ──────── */
interface PeriodPreset { label: string; from: () => string; to: () => string }

const PERIOD_BY_TYPE: Record<string, PeriodPreset[]> = {
  weekly: [
    { label: '최근 1주',  from: () => daysAgo(7),   to: today },
    { label: '최근 2주',  from: () => daysAgo(14),  to: today },
    { label: '최근 4주',  from: () => daysAgo(28),  to: today },
  ],
  monthly: [
    { label: '최근 1개월', from: () => monthsAgo(1), to: today },
    { label: '최근 3개월', from: () => monthsAgo(3), to: today },
    { label: '최근 6개월', from: () => monthsAgo(6), to: today },
  ],
  daily: [
    { label: '오늘',      from: today,              to: today },
    { label: '최근 7일',  from: () => daysAgo(7),   to: today },
    { label: '최근 30일', from: () => daysAgo(30),  to: today },
  ],
}

/* ──────── 파이프라인 정의 ──────── */
const PIPELINES: PipelineItem[] = [
  { id:'forecast-weekly',  name:'주간 수요예측',    description:'7/14/28일 수요 예측 모델 실행',     category:'예측',   schedule:'매일 09:00',        lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:[],                          periodType:'weekly' },
  { id:'forecast-monthly', name:'월간 수요예측',    description:'30/90/180일 수요 예측 모델 실행',   category:'예측',   schedule:'매주 월 06:00',     lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:[],                          periodType:'monthly' },
  { id:'risk-analysis',    name:'리스크 분석',      description:'제품별 리스크 등급 산출',            category:'분석',   schedule:'수요예측 완료 후',   lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:['forecast-weekly'],         periodType:'weekly' },
  { id:'inventory-sync',   name:'재고 현황 동기화', description:'ERP 재고 데이터 연동',               category:'수집',   schedule:'매일 06:00',        lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:[],                          periodType:'daily' },
  { id:'purchase-rec',     name:'구매 추천',        description:'AI 기반 발주량 추천 생성',           category:'분석',   schedule:'리스크 분석 완료 후', lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:['risk-analysis','inventory-sync'], periodType:'weekly' },
  { id:'production-plan',  name:'생산 계획',        description:'최적 생산 스케줄 산출',              category:'분석',   schedule:'리스크 분석 완료 후', lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:['risk-analysis'],           periodType:'weekly' },
  { id:'model-eval',       name:'모델 평가',        description:'R², MAE, MAPE 등 예측 정확도 평가', category:'보고서', schedule:'매주 월 08:00',     lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:['forecast-weekly'],         periodType:'monthly' },
  { id:'ext-indicators',   name:'외부지표 수집',    description:'환율·원자재·글로벌 지표 갱신',       category:'수집',   schedule:'매일 08:00',        lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:[],                          periodType:'daily' },
  { id:'industry-news',    name:'뉴스 수집',        description:'네이버·해외 반도체 뉴스 수집',       category:'수집',   schedule:'6시간마다',          lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:[],                          periodType:'none' },
  { id:'ml-batch-weekly',  name:'ML 배치 (S0→S8)', description:'전체 ML 파이프라인 순차 실행 (집계→예측→리스크→최적화)', category:'예측', schedule:'매주 월 06:00', lastRunAt:null, lastStatus:'never', lastDurationSec:null, dependsOn:[], periodType:'none' },
]

/* ──────── 스타일 헬퍼 ──────── */
const statusColor = (s: string) => {
  switch(s) {
    case 'success': return { color:T.green, bg:T.greenSoft, border:T.greenMid, label:'성공' }
    case 'failed':  return { color:T.red,   bg:T.redSoft,   border:T.redMid,   label:'실패' }
    case 'running': return { color:T.blue,  bg:T.blueSoft,  border:T.blueMid,  label:'실행 중' }
    default:        return { color:T.text3, bg:T.surface2,  border:T.border,   label:'미실행' }
  }
}

const catColor = (c: string) => {
  switch(c) {
    case '예측':   return { color:T.blue,   bg:T.blueSoft,   border:T.blueMid }
    case '분석':   return { color:T.purple, bg:T.purpleSoft, border:T.purpleMid }
    case '수집':   return { color:T.green,  bg:T.greenSoft,  border:T.greenMid }
    case '보고서': return { color:T.amber,  bg:T.amberSoft,  border:T.amberMid }
    default:       return { color:T.text3,  bg:T.surface2,   border:T.border }
  }
}

const periodTypeLabel = (t: string) => {
  switch(t) {
    case 'weekly':  return '주 단위'
    case 'monthly': return '월 단위'
    case 'daily':   return '일 단위'
    default:        return '즉시'
  }
}

const timeAgo = (iso: string | null) => {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '방금 전'
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  return `${Math.floor(hours / 24)}일 전`
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

/* ──────── 주차 헬퍼 (공통 유틸 활용) ──────── */
function getWeeksInMonth(year: number, month: number) {
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const startMon = getMonday(firstDay)

  const weeks: { week: number; from: string; to: string; label: string }[] = []
  const cursor = new Date(startMon)
  let safety = 0

  while ((cursor <= lastDay || safety === 0) && safety < 6) {
    const mon = new Date(cursor)
    const sun = new Date(cursor)
    sun.setDate(sun.getDate() + 6)

    if (sun >= firstDay && mon <= lastDay) {
      const wom = getWeekOfMonth(mon)
      weeks.push({
        week: wom,
        from: toISO(mon),
        to: toISO(sun),
        label: `${pad2(mon.getMonth()+1)}월 ${wom}주차 (${pad2(mon.getMonth()+1)}/${pad2(mon.getDate())} ~ ${pad2(sun.getMonth()+1)}/${pad2(sun.getDate())})`,
      })
    }

    cursor.setDate(cursor.getDate() + 7)
    safety++
  }

  return weeks
}

/* ──────── 팝오버 공통 래퍼 ──────── */
const popoverStyle: React.CSSProperties = {
  position:'absolute', top:'100%', right:0, marginTop:6, zIndex:100,
  background:T.surface, border:`1px solid ${T.border}`,
  borderRadius:10, boxShadow:'0 8px 28px rgba(15,23,42,0.14)', padding:'16px',
}

function useClickOutside(ref: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, onClose])
}

/* ──────── 주차 선택 팝오버 (년월 → 주차 2단계) ──────── */
function WeekPicker({ pipeline, onRun, onClose }: {
  pipeline: PipelineItem
  onRun: (from: string, to: string) => void
  onClose: () => void
}) {
  const now = new Date()
  const [viewYear, setViewYear]   = useState(now.getFullYear())
  const [selMonth, setSelMonth]   = useState(now.getMonth() + 1)
  const [selWeekIdx, setSelWeekIdx] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)

  const monthLabels = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
  const isFutureMonth = (m: number) => viewYear > now.getFullYear() || (viewYear === now.getFullYear() && m > now.getMonth() + 1)

  const weeks = getWeeksInMonth(viewYear, selMonth)

  // 월 변경 시 주차 선택 초기화
  const handleMonthSelect = (m: number) => {
    if (isFutureMonth(m)) return
    setSelMonth(m)
    setSelWeekIdx(null)
  }

  const selectedWeek = selWeekIdx !== null ? weeks[selWeekIdx] : null

  return (
    <div ref={ref} style={{ ...popoverStyle, width:320 }}>
      <div style={{ fontSize:13, fontWeight:700, color:T.text1, marginBottom:4 }}>{pipeline.name}</div>
      <div style={{ fontSize:11, color:T.text3, marginBottom:12 }}>참고할 주차를 선택하세요</div>

      {/* 연도 네비게이션 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <button onClick={() => { setViewYear(v => v - 1); setSelWeekIdx(null) }}
          style={{ width:28, height:28, borderRadius:7, border:`1px solid ${T.border}`, background:T.surface2, cursor:'pointer', fontSize:12, color:T.text2, display:'flex', alignItems:'center', justifyContent:'center' }}>
          ◀
        </button>
        <span style={{ fontSize:14, fontWeight:800, color:T.text1 }}>{viewYear}년</span>
        <button onClick={() => { if (viewYear < now.getFullYear()) { setViewYear(v => v + 1); setSelWeekIdx(null) } }}
          style={{ width:28, height:28, borderRadius:7, border:`1px solid ${T.border}`, background:T.surface2, cursor:viewYear >= now.getFullYear() ? 'not-allowed' : 'pointer', fontSize:12, color:viewYear >= now.getFullYear() ? T.text3 : T.text2, display:'flex', alignItems:'center', justifyContent:'center', opacity:viewYear >= now.getFullYear() ? 0.4 : 1 }}>
          ▶
        </button>
      </div>

      {/* 월 그리드 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:4, marginBottom:12 }}>
        {monthLabels.map((label, i) => {
          const m = i + 1
          const future = isFutureMonth(m)
          const sel = m === selMonth
          const isCurrent = viewYear === now.getFullYear() && m === now.getMonth() + 1
          return (
            <button key={m} onClick={() => handleMonthSelect(m)} style={{
              padding:'7px 0', borderRadius:6, cursor:future?'not-allowed':'pointer',
              fontSize:12, fontWeight:sel?700:isCurrent?600:400, textAlign:'center',
              color:future?T.text3:sel?'#fff':isCurrent?T.blue:T.text2,
              background:sel?T.blue:isCurrent?T.blueSoft:T.surface2,
              border:sel?'none':isCurrent?`1px solid ${T.blueMid}`:`1px solid ${T.border}`,
              opacity:future?0.35:1,
            }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* 주차 목록 */}
      <div style={{ fontSize:11, fontWeight:600, color:T.text2, marginBottom:6 }}>{viewYear}년 {selMonth}월</div>
      <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:14 }}>
        {weeks.map((w, i) => {
          const sel = selWeekIdx === i
          // 미래 주 비활성화
          const weekEnd = new Date(w.to)
          const isFutureWeek = weekEnd > now
          const isCurrentWeek = new Date(w.from) <= now && weekEnd >= now

          return (
            <button key={i} onClick={() => !isFutureWeek && setSelWeekIdx(i)} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'8px 12px', borderRadius:7, cursor:isFutureWeek?'not-allowed':'pointer', textAlign:'left',
              fontSize:12, fontWeight:sel?700:isCurrentWeek?600:400,
              color:isFutureWeek?T.text3:sel?T.blue:T.text2,
              background:sel?T.blueSoft:isCurrentWeek?`${T.blueSoft}88`:T.surface2,
              border:sel?`1px solid ${T.blueMid}`:`1px solid ${T.border}`,
              opacity:isFutureWeek?0.4:1,
            }}>
              <span>{w.label} {isCurrentWeek ? '(이번 주)' : ''}</span>
            </button>
          )
        })}
      </div>

      {/* 선택 결과 */}
      {selectedWeek && (
        <div style={{ fontSize:12, color:T.text2, marginBottom:12, padding:'8px 10px', background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:7, textAlign:'center', fontWeight:600 }}>
          {selectedWeek.label}
        </div>
      )}

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose}
          style={{ flex:1, padding:'8px 0', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, fontSize:12, color:T.text3, cursor:'pointer' }}>
          취소
        </button>
        <button onClick={() => selectedWeek && onRun(selectedWeek.from, selectedWeek.to)}
          style={{ flex:2, padding:'8px 0', background:selectedWeek?T.blue:T.surface2, border:'none', borderRadius:7, fontSize:12, fontWeight:700, color:selectedWeek?'#fff':T.text3, cursor:selectedWeek?'pointer':'not-allowed', boxShadow:selectedWeek?'0 2px 8px rgba(37,99,235,0.28)':'none' }}>
          실행
        </button>
      </div>
    </div>
  )
}

/* ──────── 월 선택 달력 모달 ──────── */
function MonthPicker({ pipeline, onRun, onClose }: {
  pipeline: PipelineItem
  onRun: (from: string, to: string) => void
  onClose: () => void
}) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [selYear, setSelYear]   = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)

  const months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']
  const isFuture = (m: number) => viewYear > now.getFullYear() || (viewYear === now.getFullYear() && m > now.getMonth() + 1)
  const isSelected = (m: number) => viewYear === selYear && m === selMonth

  const handleSelect = (m: number) => {
    if (isFuture(m)) return
    setSelYear(viewYear)
    setSelMonth(m)
  }

  const handleRun = () => {
    const from = `${selYear}-${String(selMonth).padStart(2,'0')}-01`
    const lastDay = new Date(selYear, selMonth, 0).getDate()
    const to = `${selYear}-${String(selMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    onRun(from, to)
  }

  return (
    <div ref={ref} style={{ ...popoverStyle, width:300 }}>
      <div style={{ fontSize:13, fontWeight:700, color:T.text1, marginBottom:4 }}>{pipeline.name}</div>
      <div style={{ fontSize:11, color:T.text3, marginBottom:14 }}>참고할 월을 선택하세요</div>

      {/* 연도 네비게이션 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <button onClick={() => setViewYear(v => v - 1)}
          style={{ width:32, height:32, borderRadius:8, border:`1px solid ${T.border}`, background:T.surface2, cursor:'pointer', fontSize:14, color:T.text2, display:'flex', alignItems:'center', justifyContent:'center' }}>
          ◀
        </button>
        <span style={{ fontSize:15, fontWeight:800, color:T.text1 }}>{viewYear}년</span>
        <button onClick={() => { if (viewYear < now.getFullYear()) setViewYear(v => v + 1) }}
          style={{ width:32, height:32, borderRadius:8, border:`1px solid ${T.border}`, background:viewYear >= now.getFullYear() ? T.surface2 : T.surface2, cursor:viewYear >= now.getFullYear() ? 'not-allowed' : 'pointer', fontSize:14, color:viewYear >= now.getFullYear() ? T.text3 : T.text2, display:'flex', alignItems:'center', justifyContent:'center', opacity:viewYear >= now.getFullYear() ? 0.4 : 1 }}>
          ▶
        </button>
      </div>

      {/* 12개월 그리드 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6, marginBottom:14 }}>
        {months.map((label, i) => {
          const m = i + 1
          const future = isFuture(m)
          const sel = isSelected(m)
          const isCurrent = viewYear === now.getFullYear() && m === now.getMonth() + 1
          return (
            <button key={m} onClick={() => handleSelect(m)} style={{
              padding:'10px 0', borderRadius:8, cursor:future?'not-allowed':'pointer',
              fontSize:13, fontWeight:sel?800:isCurrent?700:500, textAlign:'center',
              color:future?T.text3:sel?'#fff':isCurrent?T.blue:T.text1,
              background:sel?T.blue:isCurrent?T.blueSoft:T.surface2,
              border:sel?'none':isCurrent?`1px solid ${T.blueMid}`:`1px solid ${T.border}`,
              opacity:future?0.35:1,
              transition:'all 0.12s',
            }}>
              {label}
            </button>
          )
        })}
      </div>

      {/* 선택 결과 */}
      <div style={{ fontSize:12, color:T.text2, marginBottom:12, padding:'8px 10px', background:T.blueSoft, border:`1px solid ${T.blueMid}`, borderRadius:7, textAlign:'center', fontWeight:600 }}>
        {selYear}년 {selMonth}월
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose}
          style={{ flex:1, padding:'8px 0', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, fontSize:12, color:T.text3, cursor:'pointer' }}>
          취소
        </button>
        <button onClick={handleRun}
          style={{ flex:2, padding:'8px 0', background:T.blue, border:'none', borderRadius:7, fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', boxShadow:'0 2px 8px rgba(37,99,235,0.28)' }}>
          실행
        </button>
      </div>
    </div>
  )
}

/* ──────── 일 선택 팝오버 ──────── */
function DayPicker({ pipeline, onRun, onClose }: {
  pipeline: PipelineItem
  onRun: (from: string, to: string) => void
  onClose: () => void
}) {
  const presets = PERIOD_BY_TYPE['daily']
  const [from, setFrom] = useState(today())
  const [to, setTo]     = useState(today())
  const [activeLabel, setActiveLabel] = useState('오늘')
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClose)

  return (
    <div ref={ref} style={{ ...popoverStyle, width:300 }}>
      <div style={{ fontSize:13, fontWeight:700, color:T.text1, marginBottom:4 }}>{pipeline.name}</div>
      <div style={{ fontSize:11, color:T.text3, marginBottom:14 }}>참고할 날짜를 선택하세요</div>

      <div style={{ display:'flex', gap:5, marginBottom:12, flexWrap:'wrap' }}>
        {presets.map(p => (
          <button key={p.label} onClick={() => { setFrom(p.from()); setTo(p.to()); setActiveLabel(p.label) }}
            style={{
              fontSize:11, fontWeight:activeLabel===p.label?700:500,
              color:activeLabel===p.label?T.blue:T.text2,
              background:activeLabel===p.label?T.blueSoft:T.surface2,
              border:activeLabel===p.label?`1px solid ${T.blueMid}`:`1px solid ${T.border}`,
              borderRadius:6, padding:'5px 10px', cursor:'pointer',
            }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:14 }}>
        <input type="date" value={from}
          onChange={e => { setFrom(e.target.value); setActiveLabel('') }}
          style={{ flex:1, fontSize:12, color:T.text1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 8px', outline:'none' }}
        />
        <span style={{ fontSize:12, color:T.text3 }}>~</span>
        <input type="date" value={to}
          onChange={e => { setTo(e.target.value); setActiveLabel('') }}
          style={{ flex:1, fontSize:12, color:T.text1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 8px', outline:'none' }}
        />
      </div>

      <div style={{ fontSize:11, color:T.text3, marginBottom:12, padding:'6px 10px', background:T.surface2, borderRadius:6, textAlign:'center' }}>
        {from} ~ {to}
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onClose}
          style={{ flex:1, padding:'8px 0', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, fontSize:12, color:T.text3, cursor:'pointer' }}>
          취소
        </button>
        <button onClick={() => onRun(from, to)}
          style={{ flex:2, padding:'8px 0', background:T.blue, border:'none', borderRadius:7, fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', boxShadow:'0 2px 8px rgba(37,99,235,0.28)' }}>
          실행
        </button>
      </div>
    </div>
  )
}

/* ──────── 기간 선택 분기 ──────── */
function PeriodPopover({ pipeline, onRun, onClose }: {
  pipeline: PipelineItem
  onRun: (from: string, to: string) => void
  onClose: () => void
}) {
  switch (pipeline.periodType) {
    case 'weekly':  return <WeekPicker  pipeline={pipeline} onRun={onRun} onClose={onClose} />
    case 'monthly': return <MonthPicker pipeline={pipeline} onRun={onRun} onClose={onClose} />
    case 'daily':   return <DayPicker   pipeline={pipeline} onRun={onRun} onClose={onClose} />
    default:        return null
  }
}

/* ──────── 메인 컴포넌트 ──────── */
export default function DataPipelineManager() {
  const [pipelines, setPipelines] = useState<PipelineItem[]>(PIPELINES)
  const [runLogs, setRunLogs] = useState<RunLog[]>([])
  const [loading, setLoading] = useState(true)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'pipelines' | 'logs'>('pipelines')
  const [filterCat, setFilterCat] = useState<string>('전체')
  const [openPopover, setOpenPopover] = useState<string | null>(null) // 열린 팝오버의 pipeline id

  /* 데이터 조회 */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/data-pipeline')
      if (res.ok) {
        const data = await res.json()
        if (data.pipelines?.length) {
          setPipelines(prev => prev.map(p => {
            const remote = data.pipelines.find((r: any) => r.pipeline_id === p.id)
            if (!remote) return p
            return { ...p, lastRunAt: remote.last_run_at, lastStatus: remote.last_status, lastDurationSec: remote.last_duration_sec }
          }))
        }
        if (data.logs?.length) setRunLogs(data.logs)
      }
    } catch { /* DB 연결 전이면 기본값 유지 */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  /* 파이프라인 실행 */
  const runPipeline = async (id: string, dateFrom?: string, dateTo?: string) => {
    setOpenPopover(null)
    setRunningIds(prev => new Set(prev).add(id))
    setPipelines(prev => prev.map(p => p.id === id ? { ...p, lastStatus: 'running' as const } : p))

    try {
      const body: any = { pipelineId: id }
      if (dateFrom && dateTo) { body.dateFrom = dateFrom; body.dateTo = dateTo }

      const res = await fetch('/api/data-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()

      setPipelines(prev => prev.map(p => p.id === id ? {
        ...p,
        lastRunAt: result.finishedAt ?? new Date().toISOString(),
        lastStatus: result.status ?? 'success',
        lastDurationSec: result.durationSec ?? null,
      } : p))

      if (result.log) {
        setRunLogs(prev => [result.log, ...prev].slice(0, 50))
      }
    } catch {
      setPipelines(prev => prev.map(p => p.id === id ? { ...p, lastStatus: 'failed' as const } : p))
    }

    setRunningIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  /* 전체 실행 — 각 파이프라인 기본 기간으로 */
  const runAll = async () => {
    const getDefaultPeriod = (p: PipelineItem) => {
      const presets = PERIOD_BY_TYPE[p.periodType]
      if (!presets?.length) return { from: undefined, to: undefined }
      return { from: presets[0].from(), to: presets[0].to() }
    }

    const independent = pipelines.filter(p => p.dependsOn.length === 0)
    const dependent = pipelines.filter(p => p.dependsOn.length > 0)

    await Promise.all(independent.map(p => {
      const { from, to } = getDefaultPeriod(p)
      return runPipeline(p.id, from, to)
    }))
    for (const p of dependent) {
      const { from, to } = getDefaultPeriod(p)
      await runPipeline(p.id, from, to)
    }
  }

  /* 실행 버튼 클릭 핸들러 */
  const handleRunClick = (p: PipelineItem) => {
    if (runningIds.has(p.id)) return
    // 기간 불필요 → 즉시 실행
    if (p.periodType === 'none') {
      runPipeline(p.id)
      return
    }
    // 팝오버 토글
    setOpenPopover(prev => prev === p.id ? null : p.id)
  }

  const filtered = filterCat === '전체' ? pipelines : pipelines.filter(p => p.category === filterCat)
  const categories = ['전체', '예측', '분석', '수집', '보고서']

  const summary = {
    total: pipelines.length,
    success: pipelines.filter(p => p.lastStatus === 'success').length,
    failed: pipelines.filter(p => p.lastStatus === 'failed').length,
    never: pipelines.filter(p => p.lastStatus === 'never').length,
    running: pipelines.filter(p => p.lastStatus === 'running').length,
  }

  const staleCount = pipelines.filter(p => {
    if (!p.lastRunAt) return true
    return Date.now() - new Date(p.lastRunAt).getTime() > 24 * 60 * 60 * 1000
  }).length

  return (
    <div>
      <PageHeader
        title="데이터 생성 관리"
        sub="예측·분석·수집 파이프라인 실행 상태 및 수동 트리거"
        action={
          <Btn onClick={runAll} variant="primary" style={{ display:'flex', alignItems:'center', gap:6 }}>
            전체 갱신
          </Btn>
        }
      />

      {/* ── 요약 카드 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'전체 파이프라인', value:summary.total, color:T.text1,  bg:T.surface },
          { label:'성공',          value:summary.success,color:T.green,  bg:T.greenSoft },
          { label:'실패',          value:summary.failed, color:T.red,    bg:T.redSoft },
          { label:'실행 중',       value:summary.running,color:T.blue,   bg:T.blueSoft },
          { label:'미실행',        value:summary.never,  color:T.text3,  bg:T.surface2 },
          { label:'24h 미갱신',    value:staleCount,     color:T.amber,  bg:T.amberSoft },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding:'14px 16px', background:s.bg, textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:T.text3, marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── 탭 ── */}
      <div style={{ display:'flex', gap:4, marginBottom:16 }}>
        {(['pipelines', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize:12, fontWeight:tab===t?700:500, color:tab===t?T.blue:T.text3,
            background:tab===t?T.blueSoft:'transparent', border:tab===t?`1px solid ${T.blueMid}`:'1px solid transparent',
            borderRadius:7, padding:'7px 16px', cursor:'pointer',
          }}>
            {t === 'pipelines' ? '파이프라인 목록' : '실행 이력'}
          </button>
        ))}
      </div>

      {tab === 'pipelines' && (
        <div style={{ ...card, padding:'20px 24px' }}>
          {/* 카테고리 필터 */}
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
            {categories.map(c => (
              <button key={c} onClick={() => setFilterCat(c)} style={{
                fontSize:11, fontWeight:filterCat===c?700:500, color:filterCat===c?T.blue:T.text3,
                background:filterCat===c?T.blueSoft:'transparent', border:filterCat===c?`1px solid ${T.blueMid}`:`1px solid ${T.border}`,
                borderRadius:6, padding:'5px 12px', cursor:'pointer',
              }}>
                {c}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:40, color:T.text3, fontSize:13 }}>로딩 중...</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map(p => {
                const sc = statusColor(p.lastStatus)
                const cc = catColor(p.category)
                const isRunning = runningIds.has(p.id)
                const isStale = !p.lastRunAt || (Date.now() - new Date(p.lastRunAt).getTime() > 24 * 60 * 60 * 1000)

                return (
                  <div key={p.id} style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'14px 18px', background:T.surface2, borderRadius:9,
                    border:`1px solid ${p.lastStatus === 'failed' ? T.redMid : T.border}`,
                    gap:16, flexWrap:'wrap',
                  }}>
                    {/* 왼쪽: 이름 + 설명 */}
                    <div style={{ flex:'1 1 220px', minWidth:200 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:T.text1 }}>{p.name}</span>
                        <Badge color={cc.color} bg={cc.bg} border={cc.border}>{p.category}</Badge>
                        <Badge color={sc.color} bg={sc.bg} border={sc.border}>{sc.label}</Badge>
                        {isStale && p.lastStatus !== 'never' && (
                          <Badge color={T.amber} bg={T.amberSoft} border={T.amberMid}>24h+</Badge>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:T.text3 }}>{p.description}</div>
                    </div>

                    {/* 중간: 스케줄 + 마지막 실행 + 기간 유형 */}
                    <div style={{ flex:'0 0 180px', fontSize:12 }}>
                      <div style={{ color:T.text3, marginBottom:3 }}>
                        <span style={{ fontWeight:600, color:T.text2 }}>스케줄:</span> {p.schedule}
                      </div>
                      <div style={{ color:T.text3, marginBottom:3 }}>
                        <span style={{ fontWeight:600, color:T.text2 }}>마지막:</span>{' '}
                        {p.lastRunAt ? (
                          <span title={formatDateTime(p.lastRunAt)}>{timeAgo(p.lastRunAt)}</span>
                        ) : '—'}
                        {p.lastDurationSec != null && (
                          <span style={{ color:T.text3, marginLeft:6 }}>({p.lastDurationSec}초)</span>
                        )}
                      </div>
                      <div style={{ color:T.text3 }}>
                        <span style={{ fontWeight:600, color:T.text2 }}>기간:</span>{' '}
                        <span style={{ color: p.periodType === 'none' ? T.green : T.blue }}>{periodTypeLabel(p.periodType)}</span>
                      </div>
                    </div>

                    {/* 의존성 */}
                    <div style={{ flex:'0 0 140px', fontSize:11, color:T.text3 }}>
                      {p.dependsOn.length > 0 && (
                        <div>
                          <span style={{ fontWeight:600, color:T.text2 }}>선행:</span>{' '}
                          {p.dependsOn.map(d => pipelines.find(x => x.id === d)?.name ?? d).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* 실행 버튼 + 팝오버 */}
                    <div style={{ flex:'0 0 auto', position:'relative' }}>
                      <Btn
                        variant={isRunning ? 'secondary' : 'primary'}
                        onClick={() => handleRunClick(p)}
                        style={{ minWidth:72, opacity:isRunning?0.6:1, cursor:isRunning?'not-allowed':'pointer' }}
                      >
                        {isRunning ? '실행 중...' : p.periodType === 'none' ? '즉시 실행' : '기간 선택'}
                      </Btn>

                      {openPopover === p.id && (
                        <PeriodPopover
                          pipeline={p}
                          onRun={(from, to) => runPipeline(p.id, from, to)}
                          onClose={() => setOpenPopover(null)}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div style={{ ...card, padding:'20px 24px' }}>
          <div style={{ ...sectionTitle }}>실행 이력 (최근 50건)</div>
          {runLogs.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:T.text3, fontSize:13 }}>실행 이력이 없습니다.</div>
          ) : (
            <Table
              headers={['파이프라인', '대상 기간', '시작 시각', '소요 시간', '상태', '메시지']}
              aligns={['left', 'center', 'left', 'right', 'center', 'left']}
              rows={runLogs.map(log => {
                const sc = statusColor(log.status)
                return {
                  cells: [
                    <span key="n" style={{ fontWeight:600, color:T.text1 }}>{log.pipelineName}</span>,
                    <span key="p" style={{ fontSize:11, color:T.text2, fontFamily:"'IBM Plex Mono',monospace" }}>
                      {log.dateFrom && log.dateTo ? `${log.dateFrom} ~ ${log.dateTo}` : '즉시'}
                    </span>,
                    <span key="t" style={{ fontSize:12, color:T.text2, fontFamily:"'IBM Plex Mono',monospace" }}>{formatDateTime(log.startedAt)}</span>,
                    <span key="d" style={{ fontSize:12, color:T.text2, fontFamily:"'IBM Plex Mono',monospace" }}>{log.durationSec != null ? `${log.durationSec}초` : '—'}</span>,
                    <Badge key="s" color={sc.color} bg={sc.bg} border={sc.border}>{sc.label}</Badge>,
                    <span key="m" style={{ fontSize:12, color:log.status==='failed'?T.red:T.text3 }}>{log.message ?? '—'}</span>,
                  ]
                }
              })}
            />
          )}
        </div>
      )}
    </div>
  )
}
