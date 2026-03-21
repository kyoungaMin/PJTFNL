/**
 * 배치 코디네이터
 * - DB(batch_schedule_config)에서 활성 스케줄을 읽어 실행 여부 판단
 * - 실행 후 last_run_at / last_run_status를 DB에 기록
 * - Windows Task Scheduler가 이 파일을 5분마다 실행
 *
 * 실행: node scripts/coordinator.mjs
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY (+ 각 배치가 필요한 키들)
 */

import { createClient } from '@supabase/supabase-js'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── source_id → 실행 스크립트 매핑 ──────────────────────────────────────────
const SCRIPT_MAP = {
  'ext-bdi':      'batch-daily.mjs',
  'ext-eia':      'batch-weekly.mjs',
  'ext-fred':     'batch-monthly.mjs',
  'ext-ecos':     'batch-monthly.mjs',
  'ext-customs':  'batch-monthly.mjs',
  'report-email': 'batch-report-email.mjs',
}

// ─── 지금 실행해야 하는지 판단 ────────────────────────────────────────────────
function shouldRun(cfg, now) {
  if (!cfg.is_active) return false

  const lastRun = cfg.last_run_at ? new Date(cfg.last_run_at) : null
  const h = now.getHours()
  const m = now.getMinutes()
  const dom = now.getDate()
  const dow = (now.getDay() + 6) % 7 // JS 0=일 → 0=월 변환

  // 마지막 실행이 오늘(같은 날짜+시간대) 이미 됐으면 스킵
  function alreadyRanToday() {
    if (!lastRun) return false
    return (
      lastRun.getFullYear() === now.getFullYear() &&
      lastRun.getMonth()    === now.getMonth() &&
      lastRun.getDate()     === now.getDate() &&
      lastRun.getHours()    === cfg.hour
    )
  }
  function alreadyRanThisMonth() {
    if (!lastRun) return false
    return (
      lastRun.getFullYear() === now.getFullYear() &&
      lastRun.getMonth()    === now.getMonth() &&
      lastRun.getDate()     === cfg.day_of_month
    )
  }
  function alreadyRanThisWeek() {
    if (!lastRun) return false
    // 이번 주 해당 요일에 이미 실행했는지 확인
    const daysDiff = (now - lastRun) / (1000 * 60 * 60 * 24)
    return daysDiff < 7 &&
      ((lastRun.getDay() + 6) % 7) === cfg.day_of_week &&
      lastRun.getHours() === cfg.hour
  }

  if (cfg.freq === 'daily') {
    return h === cfg.hour && m < 5 && !alreadyRanToday()
  }
  if (cfg.freq === 'weekly') {
    return dow === cfg.day_of_week && h === cfg.hour && m < 5 && !alreadyRanThisWeek()
  }
  if (cfg.freq === 'monthly') {
    return dom === cfg.day_of_month && h === cfg.hour && m < 5 && !alreadyRanThisMonth()
  }
  if (cfg.freq === 'hourly') {
    if (!lastRun) return true
    const elapsed = (now - lastRun) / (1000 * 60 * 60)
    return elapsed >= cfg.interval_hours
  }
  return false
}

// ─── 스크립트 실행 ────────────────────────────────────────────────────────────
function runScript(scriptName) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName)
    const child = spawn('node', [scriptPath], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })

    child.on('close', code => {
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() })
    })
    child.on('error', err => {
      resolve({ code: 1, stdout: '', stderr: err.message })
    })
  })
}

// ─── DB 상태 업데이트 ─────────────────────────────────────────────────────────
async function updateStatus(sourceId, status) {
  await supabase.from('batch_schedule_config').update({
    last_run_status: status,
    ...(status === 'running' ? {} : { last_run_at: new Date().toISOString() }),
  }).eq('source_id', sourceId)
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
const now = new Date()
console.log(`[coordinator] ${now.toISOString()} 시작`)

const { data: schedules, error } = await supabase
  .from('batch_schedule_config')
  .select('*')
  .eq('is_active', true)

if (error) {
  console.error('[coordinator] DB 조회 실패:', error.message)
  process.exit(1)
}

// 실행 대상 추출 (SCRIPT_MAP에 있는 것만)
const targets = (schedules ?? []).filter(cfg => {
  if (!SCRIPT_MAP[cfg.source_id]) return false
  return shouldRun(cfg, now)
})

// 같은 스크립트가 여러 source_id에 매핑된 경우 중복 실행 방지
const uniqueScripts = new Map()
for (const cfg of targets) {
  const script = SCRIPT_MAP[cfg.source_id]
  if (!uniqueScripts.has(script)) uniqueScripts.set(script, cfg)
}

if (uniqueScripts.size === 0) {
  console.log('[coordinator] 실행할 배치 없음')
  process.exit(0)
}

console.log(`[coordinator] 실행 대상: ${[...uniqueScripts.keys()].join(', ')}`)

// 순차 실행 (동시 실행 시 DB 충돌 방지)
for (const [scriptName, cfg] of uniqueScripts) {
  console.log(`\n▶ ${scriptName} 실행 중...`)
  await updateStatus(cfg.source_id, 'running')

  const result = await runScript(scriptName)

  if (result.stdout) console.log(result.stdout)
  if (result.stderr) console.error(result.stderr)

  const status = result.code === 0 ? 'success' : 'error'
  await updateStatus(cfg.source_id, status)

  // 같은 스크립트를 공유하는 다른 source_id도 상태 업데이트
  for (const t of targets) {
    if (SCRIPT_MAP[t.source_id] === scriptName && t.source_id !== cfg.source_id) {
      await updateStatus(t.source_id, status)
    }
  }

  console.log(`  → ${status === 'success' ? '성공' : '실패'} (exit ${result.code})`)
}

console.log('\n[coordinator] 완료')
