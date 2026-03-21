import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── 캐시 (지표 타입별, 12시간) ───────────────────────────────────────────────
const cache = new Map<string, { items: InsightItem[]; generatedAt: number }>()
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

interface InsightItem {
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple'
  title: string
  text: string
}

// ─── 지표 타입별 컨텍스트 ────────────────────────────────────────────────────

const INDICATOR_CONTEXT: Record<string, { label: string; keys: string[]; units: string[] }> = {
  semi: {
    label: '반도체 산업지표 (SOX 지수, DRAM/NAND 현물가, Micron 주가, WDC 주가, 반도체 PPI)',
    keys: ['sox', 'dram', 'nand', 'mu', 'wdc', 'semi_ppi'],
    units: ['pt', '$/Gb', '$/GB', '$', '$', 'idx'],
  },
  global: {
    label: '글로벌 수요지표 (산업생산지수 IPI)',
    keys: ['ipi'],
    units: ['index'],
  },
  fx: {
    label: '환율·금리 (USD/KRW, EUR/KRW, JPY/KRW, CNY/KRW, 한국 기준금리, 미국 기준금리)',
    keys: ['usd', 'eur', 'jpy', 'cny', 'rate', 'us_rate'],
    units: ['원', '원', '원', '원', '%', '%'],
  },
  supply: {
    label: '물류지표 (BDI 발틱운임지수, 해상 운임)',
    keys: ['bdi', 'freight'],
    units: ['pt', '$'],
  },
  raw: {
    label: '원자재 (WTI 원유)',
    keys: ['wti'],
    units: ['$/bbl'],
  },
}

// ─── GPT 호출 ─────────────────────────────────────────────────────────────────

async function callGPT(type: string, snapshot: Record<string, unknown>[]): Promise<InsightItem[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY 미설정')

  const ctx = INDICATOR_CONTEXT[type] ?? {
    label: type,
    keys: Object.keys(snapshot[0] ?? {}).filter(k => k !== 'd'),
    units: [],
  }

  // 최신 포인트와 이전 포인트 비교
  const latest = snapshot[snapshot.length - 1] ?? {}
  const prev = snapshot[snapshot.length - 2] ?? {}

  const dataLines = ctx.keys.map((k, i) => {
    const cur = Number(latest[k] ?? 0)
    const old = Number(prev[k] ?? 0)
    const chg = old > 0 ? (((cur - old) / old) * 100).toFixed(2) : 'N/A'
    const unit = ctx.units[i] ?? ''
    return `  - ${k}: ${cur.toLocaleString()}${unit} (전기 대비 ${chg}%)`
  }).join('\n')

  const prompt = `
당신은 반도체 부품·소재 제조업체의 수요예측 전문 AI입니다.
아래 외부 경제지표 데이터를 분석하여 생산계획팀을 위한 핵심 인사이트 4개를 생성하세요.

[분석 대상 지표]
${ctx.label}

[최신 데이터 (기간: ${latest['d'] ?? '최근'})]
${dataLines}

[분석 요점]
1. 현재 지표 수준이 반도체 부품·소재 수요에 미치는 영향 평가
2. 전기 대비 변화가 수요예측 정확도에 미치는 위험 요인 식별
3. 생산계획팀이 선제적으로 대응해야 할 조치 권고
4. 향후 1~3개월 수요 방향성 전망 (낙관/중립/비관)

[출력 규칙]
- JSON 배열만 출력 (다른 텍스트 없음)
- 4개 인사이트, 각각 title(10자 이내)과 text(1~2문장, 구체적 수치 포함)
- color: blue(정보)/red(위험)/amber(주의)/green(긍정)/purple(외부요인)

[JSON 형식]
[
  {"color": "blue", "title": "현황 분석", "text": "..."},
  {"color": "amber", "title": "리스크", "text": "..."},
  {"color": "purple", "title": "수요 영향", "text": "..."},
  {"color": "green", "title": "대응 권고", "text": "..."}
]
`.trim()

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI API 오류: ${response.status} — ${err}`)
  }

  const json = await response.json()
  const raw = json.choices?.[0]?.message?.content ?? '[]'
  let parsed: any = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]))
    parsed = key ? parsed[key] : []
  }

  const allowed = ['blue', 'red', 'amber', 'green', 'purple']
  return (parsed as any[]).slice(0, 4).map((item: any) => ({
    color: allowed.includes(item.color) ? item.color : 'blue',
    title: String(item.title ?? '분석'),
    text: String(item.text ?? ''),
  })) as InsightItem[]
}

// ─── GET 핸들러 ───────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') ?? 'fx'
  const snapshotRaw = searchParams.get('snapshot')
  const refresh = searchParams.get('refresh') === '1'

  let snapshot: Record<string, unknown>[] = []
  try {
    snapshot = JSON.parse(snapshotRaw ?? '[]')
  } catch {
    return NextResponse.json({ error: 'snapshot 파싱 오류' }, { status: 400 })
  }

  if (snapshot.length === 0) {
    return NextResponse.json({ error: 'snapshot 데이터 없음' }, { status: 400 })
  }

  const cacheKey = `${type}__${JSON.stringify(snapshot[snapshot.length - 1])}`

  if (!refresh) {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
      return NextResponse.json({
        items: cached.items,
        generatedAt: new Date(cached.generatedAt).toISOString(),
        source: 'cache',
      })
    }
  }

  try {
    const items = await callGPT(type, snapshot)

    if (items.length === 0) throw new Error('GPT 빈 응답')

    cache.set(cacheKey, { items, generatedAt: Date.now() })

    return NextResponse.json({
      items,
      generatedAt: new Date().toISOString(),
      source: 'gpt',
    })
  } catch (err: any) {
    console.error('[AI-Indicator-Insight] 오류:', err.message)
    return NextResponse.json({
      items: [{ color: 'amber', title: '분석 오류', text: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }],
      generatedAt: new Date().toISOString(),
      source: 'error',
      error: err.message,
    }, { status: 200 })
  }
}
