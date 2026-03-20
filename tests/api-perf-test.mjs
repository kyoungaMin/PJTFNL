/**
 * API 성능 테스트 스크립트
 * - 53개 API 엔드포인트 응답 시간 측정
 * - 3회 반복 측정 → 평균/최소/최대/P95 산출
 * - 결과를 콘솔 + Markdown 파일로 출력
 */

const BASE = 'http://localhost:3000'
const REPEAT = 3              // 반복 횟수
const TIMEOUT_MS = 30_000     // 타임아웃

// ─── 테스트 대상 API 목록 ──────────────────────────────────────────────
const ENDPOINTS = [
  // 핵심 비즈니스 API
  { method: 'GET', path: '/api/dashboard', group: '대시보드' },
  { method: 'GET', path: '/api/forecast-weekly?week=2026-W09', group: '주간예측' },
  { method: 'GET', path: '/api/forecast-weekly/dates', group: '주간예측' },
  { method: 'GET', path: '/api/forecast-weekly/customers', group: '주간예측' },
  { method: 'GET', path: '/api/forecast-weekly/actions', group: '주간예측' },
  { method: 'GET', path: '/api/forecast-weekly/risk-summary', group: '주간예측' },
  { method: 'GET', path: '/api/forecast-weekly/confidence', group: '주간예측' },
  { method: 'GET', path: '/api/forecast-monthly', group: '월간예측' },
  { method: 'GET', path: '/api/forecast-monthly/dates', group: '월간예측' },
  { method: 'GET', path: '/api/forecast-monthly/customers', group: '월간예측' },
  { method: 'GET', path: '/api/forecast-skus', group: '예측' },
  { method: 'GET', path: '/api/ext-semi', group: '외부지표' },
  { method: 'GET', path: '/api/ext-global', group: '외부지표' },
  { method: 'GET', path: '/api/ext-fx', group: '외부지표' },
  { method: 'GET', path: '/api/ext-supply', group: '외부지표' },
  { method: 'GET', path: '/api/ext-raw', group: '외부지표' },
  { method: 'GET', path: '/api/risk', group: '리스크' },
  { method: 'GET', path: '/api/risk/filters', group: '리스크' },
  { method: 'GET', path: '/api/inventory', group: '재고' },
  { method: 'GET', path: '/api/production-plan', group: '생산' },
  { method: 'GET', path: '/api/purchase-recommendation', group: '구매' },
  { method: 'GET', path: '/api/model-evaluation', group: '모델평가' },
  { method: 'GET', path: '/api/model-evaluation/periods', group: '모델평가' },
  { method: 'GET', path: '/api/model-evaluation/by-period', group: '모델평가' },
  { method: 'GET', path: '/api/model-evaluation/report', group: '모델평가' },
  { method: 'GET', path: '/api/model-scenario', group: '시나리오' },
  { method: 'GET', path: '/api/simulation-skus', group: '시뮬레이션' },
  { method: 'GET', path: '/api/ai-insights', group: 'AI' },
  { method: 'GET', path: '/api/alerts', group: '알림' },
  { method: 'GET', path: '/api/weekly-report', group: '리포트' },
  { method: 'GET', path: '/api/industry-news', group: '뉴스' },
  { method: 'GET', path: '/api/executive-report', group: '리포트' },
  { method: 'GET', path: '/api/data-pipeline', group: '파이프라인' },
  { method: 'GET', path: '/api/me', group: '인증' },
  { method: 'GET', path: '/api/quick-accounts', group: '인증' },
  { method: 'GET', path: '/api/admin/users', group: '관리자' },
  { method: 'GET', path: '/api/batch-schedule', group: '배치' },
  // 모니터링 API
  { method: 'GET', path: '/api/health', group: '모니터링' },
  { method: 'GET', path: '/api/monitoring/alerts', group: '모니터링' },
  { method: 'GET', path: '/api/monitoring/health-logs', group: '모니터링' },
  { method: 'GET', path: '/api/monitoring/api-stats', group: '모니터링' },
  // Cron API
  { method: 'GET', path: '/api/cron/daily', group: 'Cron' },
  { method: 'GET', path: '/api/cron/weekly', group: 'Cron' },
  { method: 'GET', path: '/api/cron/monthly', group: 'Cron' },
]

// ─── 측정 함수 ─────────────────────────────────────────────────────────

async function measure(method, url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const start = performance.now()
  try {
    const res = await fetch(url, { method, signal: controller.signal })
    const elapsed = performance.now() - start
    const body = await res.text()
    clearTimeout(timer)
    return { status: res.status, ms: elapsed, size: body.length, ok: true }
  } catch (err) {
    clearTimeout(timer)
    const elapsed = performance.now() - start
    return { status: 0, ms: elapsed, size: 0, ok: false, error: err.message }
  }
}

// ─── 통계 함수 ─────────────────────────────────────────────────────────

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b)
  const avg = times.reduce((s, v) => s + v, 0) / times.length
  const p95idx = Math.min(Math.ceil(sorted.length * 0.95) - 1, sorted.length - 1)
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg,
    p95: sorted[p95idx],
  }
}

// ─── 메인 ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔬 API 성능 테스트 시작 — ${ENDPOINTS.length}개 엔드포인트 × ${REPEAT}회\n`)
  console.log('='.repeat(100))

  const results = []

  for (const ep of ENDPOINTS) {
    const url = `${BASE}${ep.path}`
    const times = []
    let lastStatus = 0
    let lastSize = 0
    let lastError = null

    for (let i = 0; i < REPEAT; i++) {
      const r = await measure(ep.method, url)
      times.push(r.ms)
      lastStatus = r.status
      lastSize = r.size
      if (!r.ok) lastError = r.error
    }

    const s = stats(times)
    const row = {
      group: ep.group,
      method: ep.method,
      path: ep.path,
      status: lastStatus,
      avg: s.avg,
      min: s.min,
      max: s.max,
      p95: s.p95,
      size: lastSize,
      error: lastError,
    }
    results.push(row)

    // 실시간 출력
    const badge = lastStatus >= 200 && lastStatus < 400 ? '✅' :
                  lastStatus >= 400 && lastStatus < 500 ? '⚠️' : '❌'
    const avgStr = s.avg.toFixed(0).padStart(6)
    console.log(`${badge} ${lastStatus} | avg ${avgStr}ms | ${ep.method.padEnd(4)} ${ep.path}`)
  }

  console.log('\n' + '='.repeat(100))

  // ─── 요약 통계 ───────────────────────────────────────────────────────

  const ok = results.filter(r => r.status >= 200 && r.status < 400)
  const slow = results.filter(r => r.avg > 2000)
  const errors = results.filter(r => r.status === 0 || r.status >= 500)
  const warn = results.filter(r => r.status >= 400 && r.status < 500)

  console.log(`\n📊 요약`)
  console.log(`  총 API: ${results.length}개`)
  console.log(`  정상 (2xx/3xx): ${ok.length}개`)
  console.log(`  클라이언트 오류 (4xx): ${warn.length}개`)
  console.log(`  서버 오류 (5xx/timeout): ${errors.length}개`)
  console.log(`  느린 API (>2s): ${slow.length}개`)

  if (ok.length > 0) {
    const allAvg = ok.reduce((s, r) => s + r.avg, 0) / ok.length
    const fastest = ok.reduce((a, b) => a.avg < b.avg ? a : b)
    const slowest = ok.reduce((a, b) => a.avg > b.avg ? a : b)
    console.log(`\n  전체 평균 응답: ${allAvg.toFixed(0)}ms`)
    console.log(`  가장 빠른 API: ${fastest.path} (${fastest.avg.toFixed(0)}ms)`)
    console.log(`  가장 느린 API: ${slowest.path} (${slowest.avg.toFixed(0)}ms)`)
  }

  // ─── 그룹별 통계 ─────────────────────────────────────────────────────

  const groups = {}
  for (const r of results) {
    if (!groups[r.group]) groups[r.group] = []
    groups[r.group].push(r)
  }

  console.log(`\n📈 그룹별 평균 응답 시간`)
  const groupStats = []
  for (const [name, items] of Object.entries(groups)) {
    const okItems = items.filter(i => i.status >= 200 && i.status < 400)
    const avg = okItems.length > 0 ? okItems.reduce((s, i) => s + i.avg, 0) / okItems.length : -1
    groupStats.push({ name, count: items.length, avg })
  }
  groupStats.sort((a, b) => b.avg - a.avg)
  for (const g of groupStats) {
    const avgStr = g.avg >= 0 ? `${g.avg.toFixed(0)}ms` : 'N/A'
    console.log(`  ${g.name.padEnd(12)} (${g.count}개): ${avgStr}`)
  }

  // ─── 느린 API 상세 ───────────────────────────────────────────────────

  if (slow.length > 0) {
    console.log(`\n🐢 느린 API (>2초) 상세`)
    for (const r of slow.sort((a, b) => b.avg - a.avg)) {
      console.log(`  ${r.path} — avg ${r.avg.toFixed(0)}ms, max ${r.max.toFixed(0)}ms`)
    }
  }

  // ─── Markdown 리포트 생성 ────────────────────────────────────────────

  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

  let md = `# API 성능 테스트 결과 — ${dateStr}\n\n`
  md += `> **측정일시**: ${dateStr} ${timeStr}  \n`
  md += `> **반복 횟수**: ${REPEAT}회  \n`
  md += `> **대상**: ${results.length}개 API 엔드포인트  \n`
  md += `> **타임아웃**: ${TIMEOUT_MS / 1000}초  \n\n`
  md += `---\n\n`

  // 요약
  md += `## 1. 요약\n\n`
  md += `| 항목 | 값 |\n|------|----|\n`
  md += `| 정상 응답 (2xx/3xx) | ${ok.length}개 |\n`
  md += `| 클라이언트 오류 (4xx) | ${warn.length}개 |\n`
  md += `| 서버 오류 (5xx/timeout) | ${errors.length}개 |\n`
  md += `| 느린 API (>2초) | ${slow.length}개 |\n`
  if (ok.length > 0) {
    const allAvg = ok.reduce((s, r) => s + r.avg, 0) / ok.length
    md += `| 전체 평균 응답 시간 | **${allAvg.toFixed(0)}ms** |\n`
  }
  md += `\n`

  // 성능 등급 기준
  md += `### 성능 등급 기준\n\n`
  md += `| 등급 | 응답 시간 | 의미 |\n|------|----------|------|\n`
  md += `| 🟢 빠름 | < 500ms | 즉시 응답 |\n`
  md += `| 🟡 보통 | 500ms ~ 2s | 사용자 체감 가능 |\n`
  md += `| 🔴 느림 | > 2s | 개선 필요 |\n`
  md += `| ⚫ 오류 | 5xx/timeout | 장애 |\n\n`

  // 그룹별 요약
  md += `## 2. 그룹별 평균 응답 시간\n\n`
  md += `| 그룹 | API 수 | 평균 응답 | 등급 |\n|------|--------|----------|------|\n`
  for (const g of groupStats) {
    const avgStr = g.avg >= 0 ? `${g.avg.toFixed(0)}ms` : 'N/A'
    const grade = g.avg < 0 ? '⚫' : g.avg < 500 ? '🟢' : g.avg < 2000 ? '🟡' : '🔴'
    md += `| ${g.name} | ${g.count} | ${avgStr} | ${grade} |\n`
  }
  md += `\n`

  // 전체 결과 테이블
  md += `## 3. 전체 API 상세 결과\n\n`
  md += `| 등급 | 그룹 | API | 상태 | 평균(ms) | 최소(ms) | 최대(ms) | P95(ms) | 응답크기 |\n`
  md += `|------|------|-----|------|----------|----------|----------|---------|----------|\n`
  const sorted = [...results].sort((a, b) => b.avg - a.avg)
  for (const r of sorted) {
    const grade = (r.status === 0 || r.status >= 500) ? '⚫' :
                  r.status >= 400 ? '⚠️' :
                  r.avg < 500 ? '🟢' : r.avg < 2000 ? '🟡' : '🔴'
    const sizeStr = r.size > 1024 ? `${(r.size/1024).toFixed(1)}KB` : `${r.size}B`
    md += `| ${grade} | ${r.group} | \`${r.path}\` | ${r.status} | ${r.avg.toFixed(0)} | ${r.min.toFixed(0)} | ${r.max.toFixed(0)} | ${r.p95.toFixed(0)} | ${sizeStr} |\n`
  }
  md += `\n`

  // 이슈 및 권장 조치
  md += `## 4. 이슈 및 권장 조치\n\n`
  if (errors.length > 0) {
    md += `### 🔴 서버 오류\n\n`
    md += `| API | 상태 | 오류 | 권장 조치 |\n|-----|------|------|-----------|\n`
    for (const r of errors) {
      md += `| \`${r.path}\` | ${r.status} | ${r.error || 'Server Error'} | 로그 확인 및 쿼리 최적화 |\n`
    }
    md += `\n`
  }
  if (slow.length > 0) {
    md += `### 🟡 느린 API (>2초)\n\n`
    md += `| API | 평균 | 최대 | 권장 조치 |\n|-----|------|------|-----------|\n`
    for (const r of slow.sort((a, b) => b.avg - a.avg)) {
      md += `| \`${r.path}\` | ${r.avg.toFixed(0)}ms | ${r.max.toFixed(0)}ms | DB 인덱스 추가, 캐시 적용, 쿼리 최적화 |\n`
    }
    md += `\n`
  }
  if (errors.length === 0 && slow.length === 0) {
    md += `특이사항 없음 — 모든 API가 2초 이내 정상 응답\n\n`
  }

  md += `---\n\n`
  md += `> 🔬 자동 생성 — \`tests/api-perf-test.mjs\` (${REPEAT}회 반복 측정)\n`

  // 파일 저장
  const fs = await import('fs')
  const reportPath = `DEV_LOG/API_성능테스트_${dateStr}.md`
  fs.writeFileSync(reportPath, md, 'utf-8')
  console.log(`\n📄 리포트 저장: ${reportPath}`)
}

main().catch(console.error)
