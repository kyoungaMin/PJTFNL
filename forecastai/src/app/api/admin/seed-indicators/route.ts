import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/admin/seed-indicators
 * Body: { access_token }
 *
 * economic_indicator 테이블에 Gold, Copper, China PMI 데이터를 적재한다.
 *   - Gold    (GOLD_LBMA)  : Yahoo Finance GC=F 월간 종가 (USD/oz)
 *   - Copper  (COPPER_LME) : FRED PCOPPUSDM 월간 평균 (USD/mt)
 *   - CN PMI  (CN_PMI_MFG) : NBS 공식 사이트 스크래핑 (월간)
 *
 * 관리자(admin) 권한 필요.
 */

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

// ─── 인증 헬퍼 ─────────────────────────────────────────────────────────────────
async function requireAdmin(access_token: string): Promise<{ ok: boolean; error?: string }> {
  const { data: userData, error } = await supabase.auth.getUser(access_token)
  if (error || !userData.user) return { ok: false, error: '인증 실패' }

  const { data: profile } = await supabase
    .from('user_profile')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profile?.role !== 'admin') return { ok: false, error: '권한 없음 (admin만 가능)' }
  return { ok: true }
}

// ─── 날짜 헬퍼 ────────────────────────────────────────────────────────────────
function startDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

// ─── Yahoo Finance GC=F 월간 종가 (금, USD/oz) ────────────────────────────────
async function fetchGold(months: number): Promise<{ date: string; value: number }[]> {
  const range = months <= 12 ? '2y' : '5y'
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1mo&range=${range}`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Yahoo Finance 오류: ${res.status}`)

  const json = await res.json()
  const result = json?.chart?.result?.[0]
  if (!result) throw new Error('Yahoo Finance 응답 파싱 실패')

  const timestamps: number[] = result.timestamp ?? []
  const closes: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? []
  const start = startDate(months)
  const output: { date: string; value: number }[] = []

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i]
    const val = closes[i]
    if (!ts || !val || isNaN(val)) continue

    const d = new Date(ts * 1000)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (ym < start.slice(0, 7)) continue

    output.push({ date: ym + '-01', value: Math.round(val * 100) / 100 })
  }
  return output
}

// ─── FRED PCOPPUSDM 월간 평균 (구리, USD/mt) ──────────────────────────────────
async function fetchCopper(months: number, apiKey: string): Promise<{ date: string; value: number }[]> {
  const start = startDate(months)
  const url = `${FRED_BASE}?series_id=PCOPPUSDM&api_key=${apiKey}&file_type=json&observation_start=${start}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`FRED 오류: ${res.status}`)

  const json = await res.json()
  if (json.error_code) throw new Error(`FRED 오류: ${json.error_message}`)

  return (json.observations as { date: string; value: string }[])
    .filter(r => r.value !== '.' && !isNaN(parseFloat(r.value)))
    .map(r => ({ date: r.date, value: Math.round(parseFloat(r.value) * 100) / 100 }))
}

// ─── NBS 중국 제조업 PMI 스크래핑 ────────────────────────────────────────────
// NBS는 공식 API를 제공하지 않아 최신 보도자료에서 PMI 수치를 파싱함.
// 파싱에 실패하면 빈 배열을 반환하고 기존 DB 데이터를 유지.
async function fetchChinaPMI(): Promise<{ date: string; value: number }[]> {
  try {
    const res = await fetch(
      'https://www.stats.gov.cn/english/PressRelease/',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return []

    const html = await res.text()

    // 보도자료 제목에서 PMI 수치 파싱
    // 패턴 예시: "Manufacturing PMI Came in at 50.2 percent in February 2026"
    const results: { date: string; value: number }[] = []
    const regex = /Manufacturing PMI[^0-9]*([0-9]{2}\.[0-9])[^0-9]*(?:percent|%)[^A-Za-z]*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/gi
    const monthMap: Record<string, string> = {
      January: '01', February: '02', March: '03', April: '04',
      May: '05', June: '06', July: '07', August: '08',
      September: '09', October: '10', November: '11', December: '12',
    }

    let match
    while ((match = regex.exec(html)) !== null) {
      const value = parseFloat(match[1])
      const month = monthMap[match[2]]
      const year = match[3]
      if (value && month && year) {
        results.push({ date: `${year}-${month}-01`, value })
      }
    }

    return results
  } catch {
    return []
  }
}

// ─── DB upsert ────────────────────────────────────────────────────────────────
async function upsertIndicators(
  rows: { indicator_code: string; date: string; value: number }[]
): Promise<number> {
  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('economic_indicator')
    .upsert(rows, { onConflict: 'date,indicator_code' })

  if (error) throw new Error(`DB upsert 실패: ${error.message}`)
  return rows.length
}

// ─── 메인 핸들러 ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { access_token, months = 24 } = body

  if (!access_token) return NextResponse.json({ error: 'access_token 필수' }, { status: 401 })

  const auth = await requireAdmin(access_token)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 })

  const fredKey = process.env.FRED_API_KEY
  if (!fredKey) return NextResponse.json({ error: 'FRED_API_KEY 환경변수 없음' }, { status: 500 })

  const result: Record<string, { count: number; error?: string }> = {}

  // Gold
  try {
    const rows = await fetchGold(months)
    const count = await upsertIndicators(rows.map(r => ({ ...r, indicator_code: 'GOLD_LBMA' })))
    result.gold = { count }
  } catch (e: any) {
    result.gold = { count: 0, error: e.message }
  }

  // Copper
  try {
    const rows = await fetchCopper(months, fredKey)
    const count = await upsertIndicators(rows.map(r => ({ ...r, indicator_code: 'COPPER_LME' })))
    result.copper = { count }
  } catch (e: any) {
    result.copper = { count: 0, error: e.message }
  }

  // China PMI
  try {
    const rows = await fetchChinaPMI()
    if (rows.length > 0) {
      const count = await upsertIndicators(rows.map(r => ({ ...r, indicator_code: 'CN_PMI_MFG' })))
      result.cn_pmi = { count }
    } else {
      result.cn_pmi = { count: 0, error: 'NBS 파싱 실패 (기존 DB 데이터 유지)' }
    }
  } catch (e: any) {
    result.cn_pmi = { count: 0, error: e.message }
  }

  return NextResponse.json({ success: true, result })
}
