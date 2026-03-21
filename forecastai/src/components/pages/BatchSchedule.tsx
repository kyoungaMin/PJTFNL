'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { T, card } from '@/lib/data'
import { PageHeader, Btn, Badge } from '@/components/ui'

/* ──────────────────────────────────────────────
   타입 정의
────────────────────────────────────────────── */
type Freq = 'daily' | 'weekly' | 'monthly' | 'hourly'
type Category = 'ERP연동' | '외부지표' | 'AI파이프라인' | '기타'

interface ScheduleConfig {
  source_id: string
  source_name: string
  description: string
  category: Category
  is_active: boolean
  freq: Freq
  hour: number
  minute: number
  day_of_week: number    // 0=월 ~ 6=일
  day_of_month: number   // 1~31
  interval_hours: number // hourly 전용
  updated_at: string | null
  last_run_at: string | null
  last_run_status: string | null
}

/* ──────────────────────────────────────────────
   기본 스케줄 정의
   (DB에 데이터 없을 때 fallback + 설명 포함)
────────────────────────────────────────────── */
const DEFAULT_SCHEDULES: ScheduleConfig[] = [
  // ERP 연동
  { source_id:'erp-order',     source_name:'수주 데이터',         description:'ERP에서 일별 수주 실적을 가져옵니다',          category:'ERP연동',      is_active:true,  freq:'daily',   hour:6,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'erp-inventory', source_name:'재고 데이터',         description:'ERP에서 제품별 현재 재고 현황을 가져옵니다',   category:'ERP연동',      is_active:true,  freq:'daily',   hour:6,  minute:30, day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'erp-purchase',  source_name:'구매발주 데이터',     description:'ERP에서 발주 내역을 가져옵니다',               category:'ERP연동',      is_active:true,  freq:'daily',   hour:7,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'erp-product',   source_name:'제품 마스터',         description:'ERP에서 제품 기준 정보를 가져옵니다',          category:'ERP연동',      is_active:true,  freq:'monthly', hour:3,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  // 외부지표
  { source_id:'ext-bdi',       source_name:'발틱 운임지수 (BDI)', description:'해운 운임 동향 — Stooq에서 매일 수집',         category:'외부지표',     is_active:true,  freq:'daily',   hour:1,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ext-fred',      source_name:'FRED 경제지표',       description:'미국 연준 금리·구리가격 등 월간 지표',         category:'외부지표',     is_active:true,  freq:'monthly', hour:9,  minute:0,  day_of_week:0, day_of_month:2,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ext-eia',       source_name:'EIA 에너지 가격',     description:'미국 에너지부 WTI 유가 — 매주 수집',           category:'외부지표',     is_active:true,  freq:'weekly',  hour:8,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ext-customs',   source_name:'관세청 무역통계',     description:'한국 관세청 수출입 통계 데이터',               category:'외부지표',     is_active:true,  freq:'monthly', hour:10, minute:0,  day_of_week:0, day_of_month:15, interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ext-ecos',      source_name:'한국은행 ECOS',       description:'한국은행 기준금리·환율 등 월간 지표',          category:'외부지표',     is_active:true,  freq:'monthly', hour:9,  minute:0,  day_of_week:0, day_of_month:2,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  // AI 파이프라인
  { source_id:'ml-s0',         source_name:'데이터 집계 (S0)',    description:'수주·재고·발주를 주간 단위로 묶어서 정리',     category:'AI파이프라인', is_active:true,  freq:'weekly',  hour:2,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ml-s3',         source_name:'피처 생성 (S3)',      description:'AI가 학습할 수 있도록 데이터를 가공',          category:'AI파이프라인', is_active:true,  freq:'weekly',  hour:3,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ml-s4',         source_name:'AI 수요예측 (S4)',    description:'P10/P50/P90 예측값 생성 (1~13주 앞)',          category:'AI파이프라인', is_active:true,  freq:'weekly',  hour:4,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ml-s5',         source_name:'리스크 분석 (S5)',    description:'제품별 A/B/C/D 위험 등급 산출',               category:'AI파이프라인', is_active:true,  freq:'weekly',  hour:5,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ml-s6',         source_name:'생산·구매 권고 (S6)', description:'AI 기반 생산·발주 우선순위 생성',             category:'AI파이프라인', is_active:true,  freq:'weekly',  hour:6,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  // 기타
  { source_id:'report-email',  source_name:'주간 임원 보고서 메일', description:'매주 월요일 오전 AI 요약 보고서를 이메일 발송', category:'기타',        is_active:true,  freq:'weekly',  hour:9,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'news-collect',  source_name:'업계 동향 뉴스',      description:'반도체·부품 관련 뉴스 자동 수집',             category:'기타',         is_active:true,  freq:'hourly',  hour:0,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
  { source_id:'ai-insights',   source_name:'AI 인사이트 요약',    description:'대시보드 AI 분석 요약 자동 갱신',             category:'기타',         is_active:true,  freq:'hourly',  hour:0,  minute:0,  day_of_week:0, day_of_month:1,  interval_hours:6,  updated_at:null, last_run_at:null, last_run_status:null },
]

/* ──────────────────────────────────────────────
   상수
────────────────────────────────────────────── */
const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일']
const CATEGORIES: { key: Category | '전체'; label: string }[] = [
  { key:'전체',       label:'전체' },
  { key:'ERP연동',    label:'ERP 연동' },
  { key:'외부지표',   label:'외부지표' },
  { key:'AI파이프라인', label:'AI 파이프라인' },
  { key:'기타',       label:'기타' },
]

const CAT_COLOR: Record<Category, { color: string; bg: string; border: string }> = {
  'ERP연동':     { color: T.blue,   bg: T.blueSoft,   border: T.blueMid },
  '외부지표':    { color: T.green,  bg: T.greenSoft,  border: T.greenMid },
  'AI파이프라인':{ color: T.purple, bg: '#F5F3FF',    border: '#C4B5FD' },
  '기타':        { color: T.amber,  bg: T.amberSoft,  border: T.amberMid },
}

/* ──────────────────────────────────────────────
   다음 실행 시각 계산
────────────────────────────────────────────── */
function getNextRun(cfg: ScheduleConfig): string {
  if (!cfg.is_active) return '비활성'
  const now = new Date()
  const next = new Date(now)

  if (cfg.freq === 'hourly') {
    const ms = cfg.interval_hours * 60 * 60 * 1000
    next.setTime(Math.ceil(now.getTime() / ms) * ms)
  } else if (cfg.freq === 'daily') {
    next.setHours(cfg.hour, cfg.minute, 0, 0)
    if (next <= now) next.setDate(next.getDate() + 1)
  } else if (cfg.freq === 'weekly') {
    const nowDow = (now.getDay() + 6) % 7 // JS: 0=일 → 0=월 변환
    let diff = (cfg.day_of_week - nowDow + 7) % 7
    next.setHours(cfg.hour, cfg.minute, 0, 0)
    if (diff === 0 && next <= now) diff = 7
    next.setDate(next.getDate() + diff)
  } else if (cfg.freq === 'monthly') {
    next.setDate(cfg.day_of_month)
    next.setHours(cfg.hour, cfg.minute, 0, 0)
    if (next <= now) {
      next.setMonth(next.getMonth() + 1)
      next.setDate(cfg.day_of_month)
    }
  }

  const mm = String(next.getMonth() + 1).padStart(2, '0')
  const dd = String(next.getDate()).padStart(2, '0')
  const hh = String(next.getHours()).padStart(2, '0')
  const mn = String(next.getMinutes()).padStart(2, '0')
  return `${mm}/${dd} ${hh}:${mn}`
}

/* ──────────────────────────────────────────────
   스케줄 요약 텍스트
────────────────────────────────────────────── */
function scheduleText(cfg: ScheduleConfig): string {
  if (cfg.freq === 'daily')   return `매일 ${String(cfg.hour).padStart(2,'0')}:${String(cfg.minute).padStart(2,'0')}`
  if (cfg.freq === 'weekly')  return `매주 ${DAYS_KO[cfg.day_of_week]}요일 ${String(cfg.hour).padStart(2,'0')}:${String(cfg.minute).padStart(2,'0')}`
  if (cfg.freq === 'monthly') return `매월 ${cfg.day_of_month}일 ${String(cfg.hour).padStart(2,'0')}:${String(cfg.minute).padStart(2,'0')}`
  if (cfg.freq === 'hourly')  return `${cfg.interval_hours}시간마다`
  return '—'
}

/* ──────────────────────────────────────────────
   스케줄 카드 컴포넌트
────────────────────────────────────────────── */
function ScheduleCard({
  item,
  onSave,
}: {
  item: ScheduleConfig
  onSave: (updated: ScheduleConfig) => Promise<void>
}) {
  const [local, setLocal] = useState<ScheduleConfig>(item)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const isDirty = JSON.stringify(local) !== JSON.stringify(item)

  const set = (patch: Partial<ScheduleConfig>) =>
    setLocal(prev => ({ ...prev, ...patch }))

  const handleSave = async () => {
    setSaving(true)
    await onSave(local)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const cc = CAT_COLOR[local.category]

  return (
    <div style={{
      ...card,
      padding: '18px 20px',
      border: `1px solid ${local.is_active ? T.border : T.border}`,
      opacity: local.is_active ? 1 : 0.65,
      transition: 'opacity 0.2s',
    }}>
      {/* 상단: 이름 + 배지 + 토글 */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
            <span style={{ fontSize:14, fontWeight:700, color:T.text1 }}>{local.source_name}</span>
            <Badge color={cc.color} bg={cc.bg} border={cc.border}>{local.category}</Badge>
            <Badge
              color={local.is_active ? T.green : T.text3}
              bg={local.is_active ? T.greenSoft : T.surface2}
              border={local.is_active ? T.greenMid : T.border}
            >
              {local.is_active ? '활성' : '비활성'}
            </Badge>
          </div>
          <div style={{ fontSize:12, color:T.text3 }}>{local.description}</div>
        </div>

        {/* ON/OFF 토글 */}
        <div
          onClick={() => set({ is_active: !local.is_active })}
          style={{
            width:44, height:24, borderRadius:12, cursor:'pointer', flexShrink:0,
            background: local.is_active ? T.blue : T.border,
            position:'relative', transition:'background 0.2s',
          }}
        >
          <div style={{
            width:18, height:18, borderRadius:'50%', background:'#fff',
            position:'absolute', top:3,
            left: local.is_active ? 23 : 3,
            transition:'left 0.2s',
            boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
          }}/>
        </div>
      </div>

      {/* 설정 영역 */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>

        {/* 주기 선택 */}
        <div>
          <div style={{ fontSize:10, fontWeight:600, color:T.text3, marginBottom:4 }}>실행 주기</div>
          <select
            value={local.freq}
            onChange={e => set({ freq: e.target.value as Freq })}
            style={{ fontSize:12, color:T.text1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 10px', outline:'none', cursor:'pointer' }}
          >
            <option value="daily">매일</option>
            <option value="weekly">매주</option>
            <option value="monthly">매월</option>
            <option value="hourly">N시간마다</option>
          </select>
        </div>

        {/* 요일 선택 (weekly) */}
        {local.freq === 'weekly' && (
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T.text3, marginBottom:4 }}>요일</div>
            <div style={{ display:'flex', gap:4 }}>
              {DAYS_KO.map((d, i) => (
                <button
                  key={i}
                  onClick={() => set({ day_of_week: i })}
                  style={{
                    width:30, height:30, borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:600,
                    color: local.day_of_week === i ? '#fff' : T.text2,
                    background: local.day_of_week === i ? T.blue : T.surface2,
                    border: local.day_of_week === i ? 'none' : `1px solid ${T.border}`,
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 날짜 선택 (monthly) */}
        {local.freq === 'monthly' && (
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T.text3, marginBottom:4 }}>매월 몇 일</div>
            <select
              value={local.day_of_month}
              onChange={e => set({ day_of_month: Number(e.target.value) })}
              style={{ fontSize:12, color:T.text1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 10px', outline:'none', cursor:'pointer' }}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <option key={d} value={d}>{d}일</option>
              ))}
            </select>
          </div>
        )}

        {/* N시간 선택 (hourly) */}
        {local.freq === 'hourly' && (
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T.text3, marginBottom:4 }}>실행 간격</div>
            <select
              value={local.interval_hours}
              onChange={e => set({ interval_hours: Number(e.target.value) })}
              style={{ fontSize:12, color:T.text1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 10px', outline:'none', cursor:'pointer' }}
            >
              {[1,2,3,4,6,8,12,24].map(h => (
                <option key={h} value={h}>{h}시간마다</option>
              ))}
            </select>
          </div>
        )}

        {/* 시간 선택 (daily / weekly / monthly) */}
        {local.freq !== 'hourly' && (
          <div>
            <div style={{ fontSize:10, fontWeight:600, color:T.text3, marginBottom:4 }}>실행 시각</div>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <select
                value={local.hour}
                onChange={e => set({ hour: Number(e.target.value) })}
                style={{ fontSize:12, color:T.text1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 8px', outline:'none', cursor:'pointer' }}
              >
                {Array.from({ length: 24 }, (_, i) => i).map(h => (
                  <option key={h} value={h}>{String(h).padStart(2,'0')}시</option>
                ))}
              </select>
              <span style={{ fontSize:11, color:T.text3 }}>:</span>
              <select
                value={local.minute}
                onChange={e => set({ minute: Number(e.target.value) })}
                style={{ fontSize:12, color:T.text1, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'6px 8px', outline:'none', cursor:'pointer' }}
              >
                {[0, 30].map(m => (
                  <option key={m} value={m}>{String(m).padStart(2,'0')}분</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 하단: 요약 + 다음 실행 + 저장 버튼 */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:16, fontSize:11 }}>
          <span style={{ color:T.text3 }}>
            설정: <span style={{ color:T.text2, fontWeight:600 }}>{scheduleText(local)}</span>
          </span>
          <span style={{ color:T.text3 }}>
            다음 실행:{' '}
            <span style={{ color: local.is_active ? T.blue : T.text3, fontWeight:600 }}>
              {getNextRun(local)}
            </span>
          </span>
          {local.updated_at && (
            <span style={{ color:T.text3 }}>
              마지막 저장: <span style={{ color:T.text2 }}>{local.updated_at.slice(0,16).replace('T',' ')}</span>
            </span>
          )}
          {local.last_run_at && (
            <span style={{ color:T.text3 }}>
              마지막 실행:{' '}
              <span style={{
                color: local.last_run_status === 'success' ? T.green
                     : local.last_run_status === 'error'   ? T.red ?? '#EF4444'
                     : local.last_run_status === 'running'  ? T.blue
                     : T.text2,
                fontWeight: 600,
              }}>
                {local.last_run_at.slice(0,16).replace('T',' ')}
                {local.last_run_status === 'success' ? ' ✓' : local.last_run_status === 'error' ? ' ✗' : local.last_run_status === 'running' ? ' ⋯' : ''}
              </span>
            </span>
          )}
        </div>

        <Btn
          variant={saved ? 'secondary' : isDirty ? 'primary' : 'ghost'}
          onClick={handleSave}
          style={{ minWidth:72, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? '저장 중…' : saved ? '✓ 저장됨' : '저장'}
        </Btn>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   메인 페이지
────────────────────────────────────────────── */
export default function BatchSchedule() {
  const [schedules, setSchedules] = useState<ScheduleConfig[]>(DEFAULT_SCHEDULES)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Category | '전체'>('전체')
  const [dbBadge, setDbBadge] = useState<'none' | 'db' | 'mock'>('none')

  /* DB에서 설정 불러오기 */
  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/batch-schedule', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const dbList: Omit<ScheduleConfig, 'description' | 'category'>[] = data.schedules ?? []

      if (dbList.length > 0) {
        // DB 값으로 기본값을 덮어씌우기 (description/category는 DEFAULT_SCHEDULES에서 유지)
        setSchedules(DEFAULT_SCHEDULES.map(def => {
          const db = dbList.find(d => d.source_id === def.source_id)
          if (!db) return def
          return {
            ...def,
            is_active:       db.is_active,
            freq:            db.freq as Freq,
            hour:            db.hour,
            minute:          db.minute,
            day_of_week:     db.day_of_week,
            day_of_month:    db.day_of_month,
            interval_hours:  db.interval_hours,
            updated_at:      db.updated_at,
            last_run_at:     (db as any).last_run_at     ?? null,
            last_run_status: (db as any).last_run_status ?? null,
          }
        }))
        setDbBadge('db')
      } else {
        setDbBadge('mock')
      }
    } catch {
      setDbBadge('mock')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])

  /* 저장 핸들러 */
  const handleSave = async (updated: ScheduleConfig) => {
    await fetch('/api/batch-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id:      updated.source_id,
        source_name:    updated.source_name,
        is_active:      updated.is_active,
        freq:           updated.freq,
        hour:           updated.hour,
        minute:         updated.minute,
        day_of_week:    updated.day_of_week,
        day_of_month:   updated.day_of_month,
        interval_hours: updated.interval_hours,
      }),
    })
    // 로컬 상태 업데이트 (updated_at 갱신)
    setSchedules(prev =>
      prev.map(s => s.source_id === updated.source_id
        ? { ...updated, updated_at: new Date().toISOString() }
        : s
      )
    )
  }

  /* 탭 필터 */
  const filtered = activeTab === '전체'
    ? schedules
    : schedules.filter(s => s.category === activeTab)

  /* 요약 통계 */
  const summary = {
    total:    schedules.length,
    active:   schedules.filter(s => s.is_active).length,
    inactive: schedules.filter(s => !s.is_active).length,
    today:    schedules.filter(s => {
      if (!s.is_active) return false
      if (s.freq === 'daily' || s.freq === 'hourly') return true
      if (s.freq === 'weekly') {
        const nowDow = (new Date().getDay() + 6) % 7
        return s.day_of_week === nowDow
      }
      if (s.freq === 'monthly') return s.day_of_month === new Date().getDate()
      return false
    }).length,
  }

  return (
    <div>
      <PageHeader
        title="배치 스케줄 설정"
        sub="데이터 수집 및 AI 파이프라인 자동 실행 주기를 관리합니다"
        action={
          dbBadge === 'db'
            ? <span style={{ fontSize:10, fontWeight:700, color:T.green, background:T.greenSoft, border:`1px solid ${T.greenMid}`, borderRadius:4, padding:'3px 8px' }}>✓ DB 연동</span>
            : dbBadge === 'mock'
            ? <span style={{ fontSize:10, fontWeight:700, color:T.amber, background:T.amberSoft, border:`1px solid ${T.amberMid}`, borderRadius:4, padding:'3px 8px' }}>기본값 표시 중</span>
            : null
        }
      />

      {/* ── 요약 카드 ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'전체 항목',    value:summary.total,    color:T.text1, bg:T.surface },
          { label:'활성',         value:summary.active,   color:T.green, bg:T.greenSoft },
          { label:'비활성',       value:summary.inactive, color:T.text3, bg:T.surface2 },
          { label:'오늘 실행 예정', value:summary.today,  color:T.blue,  bg:T.blueSoft },
        ].map((s, i) => (
          <div key={i} style={{ ...card, padding:'14px 16px', background:s.bg, textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:T.text3, marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── 카테고리 탭 ── */}
      <div style={{ display:'flex', gap:4, marginBottom:16, flexWrap:'wrap' }}>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setActiveTab(c.key)}
            style={{
              fontSize:12, fontWeight:activeTab===c.key?700:500,
              color:activeTab===c.key?T.blue:T.text3,
              background:activeTab===c.key?T.blueSoft:'transparent',
              border:activeTab===c.key?`1px solid ${T.blueMid}`:'1px solid transparent',
              borderRadius:7, padding:'7px 16px', cursor:'pointer',
            }}
          >
            {c.label}
            {c.key !== '전체' && (
              <span style={{ marginLeft:6, fontSize:10, color:activeTab===c.key?T.blue:T.text3 }}>
                ({schedules.filter(s => s.category === c.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── 스케줄 카드 목록 ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:T.text3, fontSize:13 }}>로딩 중...</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filtered.length === 0 ? (
            <div style={{ ...card, padding:40, textAlign:'center', color:T.text3, fontSize:13 }}>항목이 없습니다.</div>
          ) : (
            filtered.map(item => (
              <ScheduleCard
                key={item.source_id}
                item={item}
                onSave={handleSave}
              />
            ))
          )}
        </div>
      )}

      {/* 안내 문구 */}
      <div style={{ marginTop:24, padding:'12px 16px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, color:T.text3, lineHeight:1.6 }}>
        ⚠️ 설정한 주기는 저장만 됩니다. 실제 자동 실행은 서버 연동 후 적용됩니다. 지금 바로 실행하려면 <strong style={{ color:T.text2 }}>데이터 관리</strong> 메뉴를 이용하세요.
      </div>
    </div>
  )
}
