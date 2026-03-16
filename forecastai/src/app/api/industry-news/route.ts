import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── 인메모리 캐시 (기간별 분리, 6시간 유지) ──────────────────────────────────
const cacheMap: Record<string, { news: NewsItem[]; summary: SummaryData; generatedAt: number }> = {}
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface NewsItem {
  title: string
  url: string
  source: string
  publishedDate: string
  summary: string
  category: string
  locale: 'domestic' | 'international'
}

interface SummaryData {
  keywords: string[]
  insights: { color: string; text: string }[]
}

// ─── 언론사 도메인 매핑 ────────────────────────────────────────────────────────
const KNOWN_SOURCES: Record<string, string> = {
  etnews: '전자신문', zdnet: 'ZDNet Korea', chosun: '조선비즈',
  hankyung: '한국경제', mk: '매일경제', yna: '연합뉴스',
  newsis: '뉴시스', newspim: '뉴스핌', bloter: '블로터',
  naver: '네이버뉴스', daum: '다음뉴스', reuters: 'Reuters',
  bloomberg: 'Bloomberg', wsj: 'WSJ', techcrunch: 'TechCrunch',
  theverge: 'The Verge', eetimes: 'EE Times', digitimes: 'Digitimes',
  sedaily: '서울경제', heraldcorp: '헤럴드경제', dt: '디지털타임스',
}

function extractSource(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    const name = hostname.split('.')[0] ?? hostname
    return KNOWN_SOURCES[name] ?? name.toUpperCase()
  } catch {
    return '출처 불명'
  }
}

function detectCategory(title: string, content: string): string {
  const text = (title + ' ' + content).toLowerCase()
  // 공급망 먼저 — 원자재/거시경제 포함 키워드가 공급망과 겹치는 경우 대비
  if (/공급망|supply chain|물류|해운|freight|logistics|지연|배송|납기|lead.?time|수출 규제|export.?control/.test(text)) return '공급망'
  if (/\bai\b|인공지능|\bllm\b|chatgpt|엔비디아|\bnvidia\b|\bgpu\b|데이터센터|data.?center|hbm/.test(text)) return 'AI'
  // '거시경제', '원자재'는 UI에 탭이 없으므로 '반도체'로 통합
  return '반도체'
}

// ─── Google News RSS 검색 (국내) ──────────────────────────────────────────────
// 이미지 기준 키워드: 대기업 수주/실적, AI 반도체, 공급망·원자재
const GOOGLE_NEWS_QUERIES = [
  'SK하이닉스 수주 OR 실적',
  '삼성전자 반도체 수주 OR 투자',
  '반도체 부품 납품',
  'HBM 수요 AI 반도체 시장',
  '반도체 공급망 소재 수출 규제',
]

// HTML 태그·엔티티 제거
// 순서 중요: 엔티티 디코딩 먼저 → 태그 제거 (RSS에서 &lt;a&gt; 형태로 인코딩된 태그 처리)
function stripHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/gi, ' ')    // 줄바꿈 없는 공백 → 일반 공백
    .replace(/&#160;/g, ' ')     // &nbsp; 숫자 버전
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/gi, '')   // 그 외 named entity 제거
    .replace(/<[^>]*>/g, '')     // HTML 태그 제거 (엔티티 디코딩 후)
    .replace(/\s{2,}/g, ' ')     // 연속 공백 → 단일 공백
    .trim()
}

// RSS XML에서 특정 태그 첫 번째 값 추출 (CDATA 처리 포함)
function extractXmlTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`, 'i')
  const m = xml.match(re)
  return (m?.[1] ?? m?.[2] ?? '').trim()
}

async function searchGoogleNewsRSS(query: string, days: number): Promise<NewsItem[]> {
  // when:7d → 최근 7일, when:1m → 최근 1달 (Google News RSS 기간 필터)
  const when  = days <= 7 ? 'when:7d' : 'when:1m'
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + ' ' + when)}&hl=ko&gl=KR&ceid=KR:ko`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
    // 캐시 없이 최신 기사 수신
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Google News RSS 오류: ${res.status}`)

  const xml = await res.text()
  const items: NewsItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]

    // 제목 — Google News는 "기사제목 - 언론사" 형식인 경우가 많음
    const rawTitle = stripHtml(extractXmlTag(itemXml, 'title'))
    if (!rawTitle) continue

    // 제목 끝 " - 언론사" 분리
    const titleParts = rawTitle.split(/\s+[-–]\s+/)
    const title  = titleParts.length > 1 ? titleParts.slice(0, -1).join(' - ') : rawTitle
    const srcFallback = titleParts.length > 1 ? (titleParts[titleParts.length - 1] ?? '') : ''

    const link    = extractXmlTag(itemXml, 'link') || ''
    const pubRaw  = extractXmlTag(itemXml, 'pubDate')
    const pubDate = pubRaw ? new Date(pubRaw).toISOString().slice(0, 10) : ''
    const desc    = stripHtml(extractXmlTag(itemXml, 'description'))

    // <source> 태그에 언론사 이름이 있으면 우선 사용
    const sourceTagMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)
    const source = stripHtml(sourceTagMatch?.[1] ?? '') || srcFallback || extractSource(link)

    items.push({
      title,
      url:           link,
      source,
      publishedDate: pubDate,
      summary:       desc.slice(0, 200),
      category:      detectCategory(title, desc),
      locale:        'domestic' as const,
    })

    if (items.length >= 5) break
  }

  return items
}

// ─── Tavily 뉴스 검색 (국외) ──────────────────────────────────────────────────
const TAVILY_QUERIES = [
  'semiconductor industry news',
  'semiconductor supply chain disruption 2026',
  'AI chip demand TSMC Samsung NVIDIA',
]

async function searchTavily(query: string, days: number): Promise<NewsItem[]> {
  const apiKey = process.env.TAVILY_API_KEY
  if (!apiKey) throw new Error('TAVILY_API_KEY가 설정되지 않았습니다.')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      include_answer: false,
      max_results: 5,
      days,
      topic: 'news',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Tavily API 오류: ${res.status} — ${err}`)
  }

  const data = await res.json()
  return (data.results ?? []).map((r: Record<string, unknown>) => ({
    title:         String(r.title ?? '제목 없음'),
    url:           String(r.url ?? ''),
    source:        extractSource(String(r.url ?? '')),
    publishedDate: String(r.published_date ?? ''),
    summary:       r.content ? String(r.content).slice(0, 200) : '',
    category:      detectCategory(String(r.title ?? ''), String(r.content ?? '')),
    locale:        'international' as const,
  }))
}

// ─── GPT 요약 생성 ─────────────────────────────────────────────────────────────
async function generateSummary(news: NewsItem[], period: string): Promise<SummaryData> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || news.length === 0) {
    return {
      keywords: ['반도체', 'AI', '공급망'],
      insights: [{ color: 'blue', text: '뉴스 데이터를 기반으로 업계 동향을 분석 중입니다.' }],
    }
  }

  const periodLabel = period === 'month' ? '이번 달' : '이번 주'
  const newsText = news.slice(0, 10).map((n, i) =>
    `${i + 1}. [${n.category}] ${n.title} — ${n.summary}`
  ).join('\n')

  const prompt = `
당신은 반도체 부품·소재 업계 전문 애널리스트입니다.
아래 최신 뉴스를 분석하여 ${periodLabel} 업계 핵심 동향을 요약해주세요.

[뉴스 목록]
${newsText}

[출력 규칙]
- 반드시 아래 JSON 형식으로만 답변 (다른 텍스트 절대 금지)
- keywords: ${periodLabel} 핵심 키워드 3~5개 (짧은 명사/구문)
- insights: 핵심 인사이트 3개 (color: blue/red/amber/green/purple, text: 한국어 1문장)

{"keywords":["키워드1","키워드2","키워드3"],"insights":[{"color":"blue","text":"..."},{"color":"red","text":"..."},{"color":"green","text":"..."}]}
`.trim()

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) throw new Error('GPT 호출 실패')

    const json = await response.json()
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}')
    const allowed = ['blue', 'red', 'amber', 'green', 'purple']

    return {
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 5).map(String) : ['반도체', 'AI', '공급망'],
      insights: Array.isArray(parsed.insights)
        ? parsed.insights.slice(0, 4).map((ins: { color?: string; text?: string }) => ({
            color: allowed.includes(ins.color ?? '') ? ins.color! : 'blue',
            text:  String(ins.text ?? ''),
          }))
        : [],
    }
  } catch {
    return {
      keywords: ['반도체', 'AI', '공급망'],
      insights: [{ color: 'amber', text: 'AI 요약 생성 중 오류가 발생했습니다.' }],
    }
  }
}

// ─── 영문 뉴스 한국어 번역 ─────────────────────────────────────────────────────
function isEnglish(text: string): boolean {
  const korean = (text.match(/[\uAC00-\uD7A3]/g) ?? []).length
  const total  = text.replace(/\s/g, '').length
  return total > 0 && korean / total < 0.15
}

async function translateEnglishNews(news: NewsItem[]): Promise<NewsItem[]> {
  const engIdx = news.map((n, i) => ({ i, n })).filter(({ n }) => isEnglish(n.title))
  if (engIdx.length === 0) return news

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return news

  const input = engIdx.map(({ n }) => ({ title: n.title, summary: n.summary }))
  const prompt = `반도체·IT 업계 전문 뉴스를 한국어로 번역하세요.
규칙: TSMC, Samsung, NVIDIA, AI, GPU, CoWoS 등 고유명사·브랜드명은 영어 그대로.
아래 JSON 배열을 받아 번역된 JSON으로만 답변 (다른 텍스트 금지).

입력: ${JSON.stringify(input)}

출력 형식 (items 키 사용):
{"items":[{"title":"번역된 제목","summary":"번역된 요약"},...]}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) return news

    const json = await res.json()
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}')
    const translated: { title: string; summary: string }[] = parsed.items ?? []
    if (translated.length === 0) return news

    const result = [...news]
    engIdx.forEach(({ i }, k) => {
      if (k >= translated.length) return
      result[i] = {
        ...result[i],
        title:   translated[k].title   || result[i].title,
        summary: translated[k].summary || result[i].summary,
      }
    })
    return result
  } catch {
    return news
  }
}

// ─── 카테고리별 상위 N개 선별 + 유사 제목 중복 제거 ──────────────────────────
const MAX_PER_CATEGORY = 3

function titleKey(title: string): string {
  return title.replace(/[\s\W]/g, '').slice(0, 20).toLowerCase()
}

// locale별로 각각 카테고리 3개씩 선별 → 최대 국내 15건 + 국외 15건
function selectTopNews(news: NewsItem[]): NewsItem[] {
  const domestic      = news.filter(n => n.locale === 'domestic')
  const international = news.filter(n => n.locale === 'international')

  function pickTop(items: NewsItem[]): NewsItem[] {
    const countMap: Record<string, number> = {}
    const seenKeys = new Set<string>()
    const result: NewsItem[] = []
    for (const item of items) {
      const key = titleKey(item.title)
      if ((countMap[item.category] ?? 0) >= MAX_PER_CATEGORY) continue
      if (seenKeys.has(key)) continue
      countMap[item.category] = (countMap[item.category] ?? 0) + 1
      seenKeys.add(key)
      result.push(item)
    }
    return result
  }

  return [...pickTop(domestic), ...pickTop(international)]
}

// ─── Mock 데이터 (API 실패 시 Fallback) ───────────────────────────────────────
const MOCK_NEWS: NewsItem[] = [
  { title: '국내 반도체 부품 수요 2분기 회복 전망', url: '#', source: '전자신문', publishedDate: new Date().toISOString().slice(0, 10), summary: 'AI 서버 투자 확대로 메모리·비메모리 수요 동반 상승 예상.', category: '반도체', locale: 'domestic' },
  { title: 'TSMC, AI 칩 수요 급증으로 2분기 매출 가이던스 상향', url: '#', source: 'Reuters', publishedDate: new Date().toISOString().slice(0, 10), summary: '빅테크 기업들의 AI 인프라 투자가 지속되며 반도체 수요 견인.', category: 'AI', locale: 'international' },
  { title: '홍해 우회항로 장기화 — 반도체 공급망 비용 압박', url: '#', source: '한국경제', publishedDate: new Date().toISOString().slice(0, 10), summary: '해운 운임 고공행진으로 반도체 부품 공급망 비용 압박 지속.', category: '공급망', locale: 'domestic' },
  { title: 'Global semiconductor supply chain disruption continues', url: '#', source: 'Bloomberg', publishedDate: new Date().toISOString().slice(0, 10), summary: 'Freight costs remain elevated amid Red Sea rerouting and geopolitical tensions.', category: '공급망', locale: 'international' },
  { title: '구리 가격 3개월 최고치 — AI 데이터센터 수요 급증', url: '#', source: '매일경제', publishedDate: new Date().toISOString().slice(0, 10), summary: '구리 선물 가격 톤당 9,500달러 돌파. AI 서버 배선 수요가 주된 원인.', category: '원자재', locale: 'domestic' },
  { title: '미 연준 금리 동결 — 반도체 업계 설비투자 재개 기대', url: '#', source: '연합뉴스', publishedDate: new Date().toISOString().slice(0, 10), summary: '연준 금리 동결로 반도체 장비 투자 심리 개선 전망.', category: '거시경제', locale: 'domestic' },
]

const MOCK_SUMMARY: SummaryData = {
  keywords: ['반도체 수요 회복', 'AI 서버 투자', '공급망 비용 상승'],
  insights: [
    { color: 'blue', text: 'AI 서버 수요 급증으로 반도체 업계 2분기 회복 전망이 우세하며 파운드리 가동률이 상승 중입니다.' },
    { color: 'amber', text: '홍해 우회 장기화로 해운 운임이 30% 상승, 부품 조달 비용 증가 리스크가 지속되고 있습니다.' },
    { color: 'green', text: '미 연준 금리 동결 기조로 설비투자 심리가 개선되어 중장기 수요 전망은 긍정적입니다.' },
  ],
}

// ─── GET 핸들러 ───────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period') === 'month' ? 'month' : 'week'
  const days   = period === 'month' ? 30 : 7

  // 캐시 유효 시 반환
  const cached = cacheMap[period]
  if (cached && Date.now() - cached.generatedAt < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached, source: 'cache', period })
  }

  try {
    const allNews: NewsItem[] = []
    const seen = new Set<string>()

    function addNews(items: NewsItem[]) {
      for (const item of items) {
        if (item.url && !seen.has(item.url)) {
          seen.add(item.url)
          allNews.push(item)
        }
      }
    }

    // 국내: Google News RSS (대한민국 기사 크롤링)
    for (const query of GOOGLE_NEWS_QUERIES) {
      try {
        addNews(await searchGoogleNewsRSS(query, days))
      } catch (e) {
        console.warn(`[Industry-News] Google News RSS 쿼리 실패: ${query}`, e)
      }
    }

    // 국외: Tavily (영문 쿼리만)
    for (const query of TAVILY_QUERIES) {
      try {
        addNews(await searchTavily(query, days))
      } catch (e) {
        console.warn(`[Industry-News] Tavily 쿼리 실패: ${query}`, e)
      }
    }

    if (allNews.length === 0) throw new Error('뉴스 검색 결과 없음')

    // 날짜 내림차순 정렬
    allNews.sort((a, b) => {
      if (!a.publishedDate) return 1
      if (!b.publishedDate) return -1
      return new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime()
    })

    // locale별 카테고리당 최대 3개 선별 → 최대 30건
    const filtered = selectTopNews(allNews)

    // 국외 뉴스 한국어 번역 (GPT 1회 호출)
    const translatedNews = await translateEnglishNews(filtered)

    const summary = await generateSummary(translatedNews, period)
    cacheMap[period] = { news: translatedNews, summary, generatedAt: Date.now() }

    return NextResponse.json({ news: translatedNews, summary, source: 'live', period })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Industry-News] 오류:', msg)

    return NextResponse.json({
      news:    MOCK_NEWS,
      summary: MOCK_SUMMARY,
      source:  'mock',
      period,
    }, { status: 200 })
  }
}
