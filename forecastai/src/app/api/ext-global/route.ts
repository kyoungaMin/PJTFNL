import { NextResponse } from 'next/server'

/**
 * /api/ext-global — 글로벌 수요 외부 API 프록시
 *
 * 데이터 소스:
 *   - FRED API: INDPRO (미국 산업생산지수, 월간)
 *   - 관세청 UNIPASS: HS8541 수출통계 (월간) — UNIPASS_API_KEY 필요
 *   - CN_PMI_MFG: 공식 무료 API 없음 → 0 반환 (프론트에서 MOCK 처리)
 *
 * 환경변수:
 *   - FRED_API_KEY: FRED API 키
 *   - UNIPASS_API_KEY: 관세청 UNIPASS API 키 (선택, 없으면 HS8541 MOCK)
 *
 * 응답: externalData.ts fetchGlobalData() 반환 형식과 동일
 *   [{ d: 'N월', ipi, pmi, hs8541 }]
 */

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const UNIPASS_BASE = 'https://unipass.customs.go.kr:38010/ext/rest/trtImpExpStas/retrieveTrtImpExpStasExcel'

function toMonthLabel(dateStr: string): string {
  const m = parseInt(dateStr.slice(5, 7), 10)
  return `${m}월`
}

function startDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - (months - 1))
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

/** FRED API — INDPRO 산업생산지수 */
async function fetchIndpro(apiKey: string, months: number) {
  const start = startDate(months)
  const url = `${FRED_BASE}?series_id=INDPRO&api_key=${apiKey}&file_type=json&observation_start=${start}&frequency=m`
  const res = await fetch(url, { next: { revalidate: 86400 } })
  if (!res.ok) return []
  const json = await res.json()
  return (json?.observations ?? []) as { date: string; value: string }[]
}

/** 관세청 UNIPASS — HS8541 수출 통계 */
async function fetchHs8541(apiKey: string, months: number): Promise<Record<string, number>> {
  const now = new Date()
  const result: Record<string, number> = {}

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    const url = `${UNIPASS_BASE}?crkyCn=${apiKey}&hdlStatCd=HS&hsSgn=8541&qryYm=${ym}&inCtrCd=&expTpCd=&imgExptTpCd=`
    try {
      const res = await fetch(url, { next: { revalidate: 86400 } })
      if (!res.ok) continue
      const json = await res.json()
      const rows = json?.trtImpExpStas?.trtImpExpStasExcel ?? []
      let total = 0
      for (const r of rows) {
        total += Number(r.expAmt ?? 0)
      }
      const ymKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      result[ymKey] = Math.round(total / 1_000_000) // USD → $M
    } catch {
      // 개별 월 실패 시 건너뜀
    }
  }
  return result
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const months = parseInt(searchParams.get('months') ?? '12', 10)

  const fredKey = process.env.FRED_API_KEY
  const unipassKey = process.env.UNIPASS_API_KEY

  if (!fredKey) {
    return NextResponse.json({ items: [], source: 'no_api_key' })
  }

  try {
    const [indproRows, hs8541Map] = await Promise.all([
      fetchIndpro(fredKey, months),
      unipassKey ? fetchHs8541(unipassKey, months) : Promise.resolve({} as Record<string, number>),
    ])

    // INDPRO 월별 맵
    const indproMap: Record<string, number> = {}
    for (const r of indproRows) {
      const ym = r.date.slice(0, 7)
      const v = parseFloat(r.value)
      if (!isNaN(v)) indproMap[ym] = v
    }

    // 전체 월 집합
    const allYms = Array.from(new Set([...Object.keys(indproMap), ...Object.keys(hs8541Map)])).sort()

    const items = allYms.map(ym => ({
      d: toMonthLabel(ym),
      ipi: indproMap[ym] ?? 0,
      pmi: 0,              // 공식 무료 API 없음 → MOCK 유지
      hs8541: hs8541Map[ym] ?? 0,
    }))

    if (items.filter(r => r.ipi || r.hs8541).length < 2) {
      return NextResponse.json({ items: [], source: 'insufficient_data' })
    }

    return NextResponse.json({
      items,
      source: unipassKey ? 'fred_unipass' : 'fred',
      pmiMock: true, // PMI는 MOCK임을 명시
    })
  } catch (err: any) {
    console.error('[API] ext-global error:', err)
    return NextResponse.json({ items: [], source: 'error', error: err.message }, { status: 500 })
  }
}
