'use client'
import React, { useState, useEffect } from 'react'
import { T, card } from '@/lib/data'

// ─── 타입 ────────────────────────────────────────────────────────────────────
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

interface ApiData {
  news: NewsItem[]
  summary: SummaryData
  source: 'live' | 'cache' | 'mock'
  period: string
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const CATEGORY_LIST = ['전체', '반도체', 'AI', '공급망']

const CATEGORY_COLORS: Record<string, { c: string; bg: string; b: string }> = {
  반도체:   { c: T.blue,   bg: T.blueSoft,   b: T.blueMid   },
  AI:       { c: T.purple, bg: T.purpleSoft, b: T.purpleMid },
  공급망:   { c: T.orange, bg: T.orangeSoft, b: T.orangeMid },
}

const INSIGHT_STYLE: Record<string, { bg: string; border: string; dot: string }> = {
  blue:   { bg: T.blueSoft,   border: T.blueMid,   dot: T.blue   },
  red:    { bg: T.redSoft,    border: T.redMid,    dot: T.red    },
  amber:  { bg: T.amberSoft,  border: T.amberMid,  dot: T.amber  },
  green:  { bg: T.greenSoft,  border: T.greenMid,  dot: T.green  },
  purple: { bg: T.purpleSoft, border: T.purpleMid, dot: T.purple },
}

const KEYWORD_COLORS = [
  { bg: T.blueSoft,   c: T.blue,   b: T.blueMid   },
  { bg: T.purpleSoft, c: T.purple, b: T.purpleMid },
  { bg: T.greenSoft,  c: T.green,  b: T.greenMid  },
  { bg: T.amberSoft,  c: T.amber,  b: T.amberMid  },
  { bg: T.redSoft,    c: T.red,    b: T.redMid    },
]

// ─── 유틸 ────────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  if (!dateStr) return '날짜 미상'
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr.slice(0, 10)
  }
}

function escapeCsv(v: string | number | null | undefined): string {
  const s = String(v ?? '')
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function IndustryNews() {
  const [period, setPeriod]     = useState<'week' | 'month'>('week')
  const [locale, setLocale]     = useState<'all' | 'domestic' | 'international'>('all')
  const [category, setCategory] = useState('전체')
  const [data, setData]         = useState<ApiData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/industry-news?period=${period}`)
      .then(r => r.json())
      .then((d: ApiData) => { setData(d); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [period])

  const filteredNews = (data?.news ?? []).filter(n => {
    if (locale !== 'all' && n.locale !== locale) return false
    if (category !== '전체' && n.category !== category) return false
    return true
  })

  const isMock  = data?.source === 'mock'
  const isLive  = data?.source === 'live'

  const handleCsvDownload = () => {
    if (filteredNews.length === 0) return
    const bom     = '\uFEFF'
    const headers = ['날짜', '뉴스 제목', '언론사', '요약', '기사 링크', '카테고리']
    const rows    = filteredNews.map(n => [
      n.publishedDate, n.title, n.source, n.summary, n.url, n.category,
    ])
    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map(r => r.map(escapeCsv).join(',')),
    ].join('\n')
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `업계동향_${period === 'week' ? '이번주' : '이번달'}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>

      {/* ── 페이지 헤더 ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: T.text1, margin: 0 }}>업계 동향</h1>
            {isMock && (
              <span style={{ fontSize: 10, fontWeight: 700, background: T.amberSoft, color: T.amber, border: `1px solid ${T.amberMid}`, borderRadius: 6, padding: '2px 7px' }}>
                샘플 데이터
              </span>
            )}
            {isLive && (
              <span style={{ fontSize: 10, fontWeight: 700, background: T.greenSoft, color: T.green, border: `1px solid ${T.greenMid}`, borderRadius: 6, padding: '2px 7px' }}>
                ✓ 실시간
              </span>
            )}
            {data?.source === 'cache' && (
              <span style={{ fontSize: 10, fontWeight: 700, background: T.blueSoft, color: T.blue, border: `1px solid ${T.blueMid}`, borderRadius: 6, padding: '2px 7px' }}>
                캐시
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
            Google News (국내)·Tavily (국외) + GPT 요약 · 6시간 캐시
          </div>
        </div>

        <button
          onClick={handleCsvDownload}
          disabled={filteredNews.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            border: `1px solid ${T.blue}`, background: T.blue,
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: filteredNews.length === 0 ? 'not-allowed' : 'pointer',
            opacity: filteredNews.length === 0 ? 0.5 : 1,
          }}
        >
          ↓ CSV 다운로드
        </button>
      </div>

      {/* ── 이번 주 업계 동향 요약 카드 ─────────────────────────────────── */}
      <div style={{
        ...card,
        marginBottom: 20,
        background: 'linear-gradient(135deg, #EFF6FF 0%, #F5F3FF 100%)',
        border: `1px solid ${T.blueMid}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 4, height: 18, borderRadius: 2, background: T.blue, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>
            {period === 'week' ? '이번 주 업계 동향' : '이번 달 업계 동향'}
          </span>
        </div>

        {loading ? (
          <div style={{ color: T.text3, fontSize: 13, padding: '8px 0' }}>동향 요약 불러오는 중...</div>
        ) : data?.summary ? (
          <>
            {/* 핵심 키워드 */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {data.summary.keywords.map((kw, i) => {
                const kc = KEYWORD_COLORS[i % KEYWORD_COLORS.length]
                return (
                  <span key={i} style={{
                    fontSize: 12, fontWeight: 700,
                    background: kc.bg, color: kc.c, border: `1px solid ${kc.b}`,
                    borderRadius: 20, padding: '4px 14px',
                  }}>
                    {kw}
                  </span>
                )
              })}
            </div>

            {/* 인사이트 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.summary.insights.map((ins, i) => {
                const s = INSIGHT_STYLE[ins.color] ?? INSIGHT_STYLE.blue
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: s.bg, border: `1px solid ${s.border}`,
                    borderRadius: 8, padding: '10px 14px',
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, marginTop: 5, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: T.text1, lineHeight: 1.6 }}>{ins.text}</span>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: T.text3 }}>
              이 내용은 뉴스 데이터를 기반으로 AI가 요약한 핵심 인사이트입니다.
            </div>
          </>
        ) : (
          <div style={{ color: T.text3, fontSize: 13 }}>요약 데이터가 없습니다.</div>
        )}
      </div>

      {/* ── 필터 바 ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {/* 1행: 기간(왼쪽) · 국내/국외(오른쪽) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => { setPeriod(p); setCategory('전체') }}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${period === p ? T.blue : T.border}`,
                  background: period === p ? T.blue : T.surface,
                  color: period === p ? '#fff' : T.text2,
                  cursor: 'pointer',
                }}
              >
                {p === 'week' ? '이번 주' : '이번 달'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {([
              { value: 'all',           label: '전체' },
              { value: 'domestic',      label: '국내' },
              { value: 'international', label: '국외' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setLocale(value); setCategory('전체') }}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${locale === value ? T.blue : T.border}`,
                  background: locale === value ? T.blueSoft : T.surface,
                  color: locale === value ? T.blue : T.text2,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 2행: 카테고리 필터 */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CATEGORY_LIST.map(cat => {
            const active = category === cat
            const cc = cat !== '전체' ? CATEGORY_COLORS[cat] : null
            return (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? (cc?.b ?? T.blue) : T.border}`,
                  background: active ? (cc?.bg ?? T.blueSoft) : T.surface,
                  color: active ? (cc?.c ?? T.blue) : T.text2,
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 뉴스 목록 ────────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        {/* 뉴스 목록 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text1 }}>관련 뉴스</span>
          <span style={{ fontSize: 12, color: T.text3 }}>
            {loading ? '로딩 중...' : `총 ${filteredNews.length}건`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: T.text3, fontSize: 13 }}>
            뉴스 불러오는 중...
          </div>
        ) : error ? (
          <div style={{ padding: 48, textAlign: 'center', color: T.red, fontSize: 13 }}>
            오류가 발생했습니다: {error}
          </div>
        ) : filteredNews.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: T.text3, fontSize: 13 }}>
            해당 조건의 뉴스가 없습니다.
          </div>
        ) : (
          filteredNews.map((news, idx) => {
            const cc     = CATEGORY_COLORS[news.category] ?? CATEGORY_COLORS['반도체']
            const isLast = idx === filteredNews.length - 1
            const hasLink = news.url && news.url !== '#'

            return (
              <div
                key={idx}
                onClick={() => hasLink && window.open(news.url, '_blank', 'noopener,noreferrer')}
                style={{
                  padding: '16px 20px',
                  borderBottom: isLast ? 'none' : `1px solid ${T.border}`,
                  cursor: hasLink ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (hasLink) e.currentTarget.style.background = T.surface2 }}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* 카테고리 배지 — 너비 고정으로 타이틀 시작점 정렬 */}
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    background: cc.bg, color: cc.c, border: `1px solid ${cc.b}`,
                    borderRadius: 6, padding: '2px 0',
                    width: 54, textAlign: 'center', display: 'inline-block',
                    flexShrink: 0, marginTop: 3,
                  }}>
                    {news.category}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 제목 — 행 전체가 클릭되므로 <a> 없이 span으로 표시 */}
                    <div style={{
                      fontSize: 14, fontWeight: 600, marginBottom: 4, lineHeight: 1.5,
                      color: hasLink ? T.text1 : T.text2,
                    }}>
                      {news.title}
                      {hasLink && (
                        <span style={{ fontSize: 11, color: T.blue, marginLeft: 6, fontWeight: 500 }}>↗</span>
                      )}
                    </div>

                    {/* 요약 */}
                    {news.summary && (
                      <div style={{
                        fontSize: 12, color: T.text3, marginBottom: 6, lineHeight: 1.55,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const,
                        maxHeight: '2.4em',
                      }}>
                        {news.summary}
                      </div>
                    )}

                    {/* 메타: 국내/국외 뱃지 · 언론사 · 날짜 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.text3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: news.locale === 'domestic' ? T.greenSoft : T.purpleSoft,
                        color: news.locale === 'domestic' ? T.green : T.purple,
                        border: `1px solid ${news.locale === 'domestic' ? T.greenMid : T.purpleMid}`,
                        borderRadius: 4, padding: '1px 5px',
                      }}>
                        {news.locale === 'domestic' ? '국내' : '국외'}
                      </span>
                      <span style={{ fontWeight: 600, color: T.text2 }}>{news.source}</span>
                      <span>·</span>
                      <span>{formatDate(news.publishedDate)}</span>
                      {hasLink && (
                        <>
                          <span>·</span>
                          <span style={{ color: T.blue, fontWeight: 500 }}>기사 보기 →</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
