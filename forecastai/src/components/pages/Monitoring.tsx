'use client'
import React, { useState, useEffect, useCallback } from 'react'
import { T, card, sectionTitle } from '@/lib/data'
import { Badge, PageHeader, Btn, Table } from '@/components/ui'

/* ──────── 타입 ──────── */
interface HealthData {
  status: 'healthy' | 'degraded' | 'down'
  database: { status: string; latency_ms: number }
  pipelines: { stale: number; failed: number; total: number }
  alerts: { critical: number; unread: number }
  checked_at: string
}

interface SystemAlert {
  id: string
  alert_type: string
  severity: string
  title: string
  message: string | null
  source: string | null
  target_page: string | null
  is_read: boolean
  is_dismissed: boolean
  created_at: string
  resolved_at: string | null
}

interface HealthLog {
  id: number
  checked_at: string
  service: string
  status: string
  latency_ms: number | null
  message: string | null
}

interface ApiLogStat {
  route: string
  total: number
  errors: number
  avg_duration: number
  error_rate: number
}

/* ──────── 스타일 헬퍼 ──────── */
const healthColor = (s: string) => {
  switch (s) {
    case 'healthy': return { color: T.green, bg: T.greenSoft, border: T.greenMid, label: '정상', icon: '●' }
    case 'degraded': return { color: T.amber, bg: T.amberSoft, border: T.amberMid, label: '주의', icon: '▲' }
    case 'down': return { color: T.red, bg: T.redSoft, border: T.redMid, label: '장애', icon: '✕' }
    default: return { color: T.text3, bg: T.surface2, border: T.border, label: '알 수 없음', icon: '?' }
  }
}

const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return { color: T.red, bg: T.redSoft, border: T.redMid }
    case 'high': return { color: T.orange, bg: T.orangeSoft, border: T.orangeMid }
    case 'medium': return { color: T.amber, bg: T.amberSoft, border: T.amberMid }
    case 'low': return { color: T.green, bg: T.greenSoft, border: T.greenMid }
    default: return { color: T.text3, bg: T.surface2, border: T.border }
  }
}

const severityLabel: Record<string, string> = {
  critical: '긴급', high: '높음', medium: '보통', low: '낮음',
}

const alertTypeLabel: Record<string, string> = {
  system: '시스템', pipeline: '파이프라인', api: 'API', health: '헬스체크',
}

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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

/* ──────── 메인 컴포넌트 ──────── */
export default function Monitoring() {
  const [tab, setTab] = useState<'health' | 'alerts' | 'api-logs' | 'history'>('health')
  const [health, setHealth] = useState<HealthData | null>(null)
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [alertTotal, setAlertTotal] = useState(0)
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([])
  const [apiStats, setApiStats] = useState<ApiLogStat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [alertFilter, setAlertFilter] = useState<string>('all')
  const [evaluating, setEvaluating] = useState(false)

  /* 헬스 체크 조회 */
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health')
      if (res.ok) setHealth(await res.json())
    } catch { /* */ }
  }, [])

  /* 알림 조회 */
  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ is_dismissed: 'false', limit: '50' })
      if (alertFilter !== 'all') params.set('severity', alertFilter)
      const res = await fetch(`/api/monitoring/alerts?${params}`)
      if (res.ok) {
        const d = await res.json()
        setAlerts(d.alerts ?? [])
        setAlertTotal(d.total ?? 0)
      }
    } catch { /* */ }
  }, [alertFilter])

  /* 헬스 로그 조회 */
  const fetchHealthLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring/health-logs')
      if (res.ok) {
        const d = await res.json()
        setHealthLogs(d.logs ?? [])
      }
    } catch { /* */ }
  }, [])

  /* API 에러 통계 조회 */
  const fetchApiStats = useCallback(async () => {
    try {
      const res = await fetch('/api/monitoring/api-stats')
      if (res.ok) {
        const d = await res.json()
        setApiStats(d.stats ?? [])
      }
    } catch { /* */ }
  }, [])

  /* 초기 로드 + 30초 자동 갱신 */
  useEffect(() => {
    Promise.all([fetchHealth(), fetchAlerts()]).finally(() => setLoading(false))

    const autoRefresh = setInterval(() => {
      fetchHealth()
      fetchAlerts()
    }, 30000)

    return () => clearInterval(autoRefresh)
  }, [fetchHealth, fetchAlerts])

  /* 탭 변경 시 데이터 로드 */
  useEffect(() => {
    if (tab === 'history') fetchHealthLogs()
    if (tab === 'api-logs') fetchApiStats()
  }, [tab, fetchHealthLogs, fetchApiStats])

  /* 새로고침 */
  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchHealth(), fetchAlerts()])
    if (tab === 'history') await fetchHealthLogs()
    if (tab === 'api-logs') await fetchApiStats()
    setRefreshing(false)
  }

  /* 규칙 평가 실행 */
  const handleEvaluate = async () => {
    setEvaluating(true)
    try {
      await fetch('/api/monitoring/evaluate-rules', { method: 'POST' })
      await fetchAlerts()
      await fetchHealth()
    } catch { /* */ }
    setEvaluating(false)
  }

  /* 알림 읽음/해제 */
  const handleAlertAction = async (ids: string[], action: 'read' | 'dismiss') => {
    try {
      await fetch('/api/monitoring/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      })
      await fetchAlerts()
    } catch { /* */ }
  }

  const hc = health ? healthColor(health.status) : healthColor('unknown')

  return (
    <div>
      <PageHeader
        title="모니터링"
        sub="시스템 상태, API 에러율, 파이프라인 실행 결과, 알림 관리"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn onClick={handleEvaluate} variant="secondary" style={{ opacity: evaluating ? 0.6 : 1 }}>
              {evaluating ? '점검 중...' : '규칙 점검'}
            </Btn>
            <Btn onClick={handleRefresh} variant="primary" style={{ opacity: refreshing ? 0.6 : 1 }}>
              {refreshing ? '갱신 중...' : '새로고침'}
            </Btn>
          </div>
        }
      />

      {/* ── 요약 카드 ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 13 }}>로딩 중...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            {/* 시스템 상태 */}
            <div style={{ ...card, padding: '16px 18px', background: hc.bg, borderColor: hc.border }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20, color: hc.color }}>{hc.icon}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: hc.color }}>{hc.label}</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3 }}>시스템 상태</div>
            </div>

            {/* DB 응답 */}
            <div style={{ ...card, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: (health?.database.latency_ms ?? 0) > 3000 ? T.amber : T.green }}>
                {health?.database.latency_ms ?? '—'}
                <span style={{ fontSize: 12, fontWeight: 500, color: T.text3, marginLeft: 2 }}>ms</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>DB 응답시간</div>
            </div>

            {/* 파이프라인 */}
            <div style={{ ...card, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: (health?.pipelines.failed ?? 0) > 0 ? T.red : T.green }}>
                {health?.pipelines.failed ?? 0}
                <span style={{ fontSize: 12, fontWeight: 500, color: T.text3 }}>/{health?.pipelines.total ?? 0}</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>파이프라인 실패</div>
            </div>

            {/* 미갱신 */}
            <div style={{ ...card, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: (health?.pipelines.stale ?? 0) > 3 ? T.amber : T.text1 }}>
                {health?.pipelines.stale ?? 0}
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>24h 미갱신</div>
            </div>

            {/* 긴급 알림 */}
            <div style={{ ...card, padding: '16px 18px', textAlign: 'center', background: (health?.alerts.critical ?? 0) > 0 ? T.redSoft : T.surface }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: (health?.alerts.critical ?? 0) > 0 ? T.red : T.green }}>
                {health?.alerts.critical ?? 0}
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>긴급 알림</div>
            </div>

            {/* 미읽은 알림 */}
            <div style={{ ...card, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: (health?.alerts.unread ?? 0) > 0 ? T.blue : T.text1 }}>
                {health?.alerts.unread ?? 0}
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>미읽은 알림</div>
            </div>
          </div>

          {/* ── 탭 ── */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {([
              { key: 'health', label: '시스템 상태' },
              { key: 'alerts', label: `알림 (${alertTotal})` },
              { key: 'api-logs', label: 'API 현황' },
              { key: 'history', label: '체크 이력' },
            ] as const).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                fontSize: 12, fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? T.blue : T.text3,
                background: tab === t.key ? T.blueSoft : 'transparent', border: tab === t.key ? `1px solid ${T.blueMid}` : '1px solid transparent',
                borderRadius: 7, padding: '7px 16px', cursor: 'pointer',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── 시스템 상태 탭 ── */}
          {tab === 'health' && health && (
            <div style={{ ...card, padding: '20px 24px' }}>
              <div style={{ ...sectionTitle }}>서비스 상태 상세</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* DB */}
                <StatusRow
                  name="데이터베이스 (Supabase)"
                  status={health.database.status}
                  detail={`응답시간: ${health.database.latency_ms}ms`}
                />
                {/* 파이프라인 */}
                <StatusRow
                  name="데이터 파이프라인"
                  status={health.pipelines.failed > 0 ? 'degraded' : health.pipelines.stale > 3 ? 'degraded' : 'healthy'}
                  detail={`전체 ${health.pipelines.total}개 | 실패 ${health.pipelines.failed}개 | 미갱신 ${health.pipelines.stale}개`}
                />
                {/* 알림 */}
                <StatusRow
                  name="알림 시스템"
                  status={health.alerts.critical > 0 ? 'degraded' : 'healthy'}
                  detail={`긴급 ${health.alerts.critical}건 | 미읽은 ${health.alerts.unread}건`}
                />
              </div>
              <div style={{ marginTop: 16, fontSize: 11, color: T.text3 }}>
                마지막 체크: {formatDateTime(health.checked_at)}
              </div>
            </div>
          )}

          {/* ── 알림 탭 ── */}
          {tab === 'alerts' && (
            <div style={{ ...card, padding: '20px 24px' }}>
              {/* 필터 */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {[
                  { key: 'all', label: '전체' },
                  { key: 'critical', label: '긴급' },
                  { key: 'high', label: '높음' },
                  { key: 'medium', label: '보통' },
                  { key: 'low', label: '낮음' },
                ].map(f => (
                  <button key={f.key} onClick={() => setAlertFilter(f.key)} style={{
                    fontSize: 11, fontWeight: alertFilter === f.key ? 700 : 500,
                    color: alertFilter === f.key ? T.blue : T.text3,
                    background: alertFilter === f.key ? T.blueSoft : 'transparent',
                    border: alertFilter === f.key ? `1px solid ${T.blueMid}` : `1px solid ${T.border}`,
                    borderRadius: 6, padding: '5px 12px', cursor: 'pointer',
                  }}>
                    {f.label}
                  </button>
                ))}
                {alerts.length > 0 && (
                  <Btn variant="danger" onClick={() => handleAlertAction(alerts.map(a => a.id), 'dismiss')}
                    style={{ marginLeft: 'auto', fontSize: 11, padding: '5px 12px' }}>
                    전체 해제
                  </Btn>
                )}
              </div>

              {alerts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 13 }}>알림이 없습니다.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {alerts.map(a => {
                    const sc = severityColor(a.severity)
                    return (
                      <div key={a.id} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 16px', background: a.is_read ? T.surface : T.surface2,
                        borderRadius: 8, border: `1px solid ${a.severity === 'critical' ? T.redMid : T.border}`,
                      }}>
                        {/* 심각도 */}
                        <Badge color={sc.color} bg={sc.bg} border={sc.border}>
                          {severityLabel[a.severity] ?? a.severity}
                        </Badge>

                        {/* 타입 */}
                        <Badge color={T.text3} bg={T.surface2} border={T.border} size={10}>
                          {alertTypeLabel[a.alert_type] ?? a.alert_type}
                        </Badge>

                        {/* 내용 */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.text1, marginBottom: 2 }}>{a.title}</div>
                          {a.message && <div style={{ fontSize: 12, color: T.text3 }}>{a.message}</div>}
                        </div>

                        {/* 시간 */}
                        <div style={{ fontSize: 11, color: T.text3, whiteSpace: 'nowrap' }} title={formatDateTime(a.created_at)}>
                          {timeAgo(a.created_at)}
                        </div>

                        {/* 액션 */}
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!a.is_read && (
                            <button onClick={() => handleAlertAction([a.id], 'read')}
                              style={{ fontSize: 10, color: T.blue, background: T.blueSoft, border: `1px solid ${T.blueMid}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                              읽음
                            </button>
                          )}
                          <button onClick={() => handleAlertAction([a.id], 'dismiss')}
                            style={{ fontSize: 10, color: T.text3, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                            해제
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── API 현황 탭 ── */}
          {tab === 'api-logs' && (
            <div style={{ ...card, padding: '20px 24px' }}>
              <div style={{ ...sectionTitle }}>API 라우트별 현황 (최근 1시간)</div>
              {apiStats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 13 }}>
                  아직 API 로그가 없습니다. API 요청이 쌓이면 여기에 표시됩니다.
                </div>
              ) : (
                <Table
                  headers={['라우트', '요청 수', '에러 수', '에러율', '평균 응답']}
                  aligns={['left', 'right', 'right', 'right', 'right']}
                  rows={apiStats.map(s => ({
                    cells: [
                      <span key="r" style={{ fontWeight: 600, color: T.text1, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{s.route}</span>,
                      <span key="t" style={{ fontSize: 12, color: T.text2 }}>{s.total}</span>,
                      <span key="e" style={{ fontSize: 12, color: s.errors > 0 ? T.red : T.text3 }}>{s.errors}</span>,
                      <span key="p" style={{ fontSize: 12, fontWeight: 600, color: s.error_rate > 10 ? T.red : s.error_rate > 0 ? T.amber : T.green }}>
                        {s.error_rate.toFixed(1)}%
                      </span>,
                      <span key="d" style={{ fontSize: 12, color: s.avg_duration > 3000 ? T.amber : T.text2, fontFamily: "'IBM Plex Mono',monospace" }}>
                        {Math.round(s.avg_duration)}ms
                      </span>,
                    ]
                  }))}
                />
              )}
            </div>
          )}

          {/* ── 체크 이력 탭 ── */}
          {tab === 'history' && (
            <div style={{ ...card, padding: '20px 24px' }}>
              <div style={{ ...sectionTitle }}>헬스체크 이력 (최근 50건)</div>
              {healthLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: T.text3, fontSize: 13 }}>체크 이력이 없습니다.</div>
              ) : (
                <Table
                  headers={['시각', '서비스', '상태', '응답시간', '메시지']}
                  aligns={['left', 'left', 'center', 'right', 'left']}
                  rows={healthLogs.map(l => {
                    const sc = healthColor(l.status)
                    return {
                      cells: [
                        <span key="t" style={{ fontSize: 12, color: T.text2, fontFamily: "'IBM Plex Mono',monospace" }}>{formatDateTime(l.checked_at)}</span>,
                        <span key="s" style={{ fontWeight: 600, color: T.text1, fontSize: 12 }}>{l.service}</span>,
                        <Badge key="st" color={sc.color} bg={sc.bg} border={sc.border}>{sc.label}</Badge>,
                        <span key="l" style={{ fontSize: 12, color: T.text2, fontFamily: "'IBM Plex Mono',monospace" }}>{l.latency_ms != null ? `${l.latency_ms}ms` : '—'}</span>,
                        <span key="m" style={{ fontSize: 12, color: T.text3 }}>{l.message ?? '—'}</span>,
                      ]
                    }
                  })}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ──────── 상태 행 ──────── */
function StatusRow({ name, status, detail }: { name: string; status: string; detail: string }) {
  const sc = healthColor(status)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16, color: sc.color }}>{sc.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>{name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: T.text3 }}>{detail}</span>
        <Badge color={sc.color} bg={sc.bg} border={sc.border}>{sc.label}</Badge>
      </div>
    </div>
  )
}
