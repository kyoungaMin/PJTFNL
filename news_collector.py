"""
반도체 부품·소재 수요예측 관련 뉴스 수집기
- Google News RSS 기반 (무료, API 키 불필요)
- 설치: pip install feedparser
"""

import feedparser
import urllib.parse
import sys
import io
from datetime import datetime

# Windows 콘솔 한글 출력 호환
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ── 검색 키워드 설정 ──────────────────────────────────────────

KEYWORDS = {
    "국내 대기업 수주·실적": [
        "SK하이닉스 수주",
        "삼성전자 반도체 수주",
        "SK하이닉스 실적",
        "삼성전자 반도체 투자",
        "반도체 부품 납품",
    ],
    "글로벌 AI 반도체 시장": [
        "HBM 수요",
        "NVIDIA 반도체 공급",
        "AI 반도체 시장 전망",
        "TSMC 실적",
        "AI 서버 수요",
    ],
    "공급망·원자재 이슈": [
        "반도체 공급망 이슈",
        "반도체 소재 가격",
        "반도체 수출 규제",
        "반도체 재고",
    ],
}

# 카테고리별 최대 뉴스 수
MAX_NEWS_PER_KEYWORD = 5


def fetch_google_news(query, max_results=5):
    """Google News RSS에서 뉴스를 가져옵니다."""
    encoded = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=ko&gl=KR&ceid=KR:ko"
    feed = feedparser.parse(url)

    results = []
    for entry in feed.entries[:max_results]:
        # 발행일 파싱
        pub_date = ""
        if hasattr(entry, "published"):
            try:
                dt = datetime.strptime(entry.published, "%a, %d %b %Y %H:%M:%S %Z")
                pub_date = dt.strftime("%Y-%m-%d")
            except ValueError:
                pub_date = entry.published

        results.append({
            "title": entry.title,
            "link": entry.link,
            "date": pub_date,
            "source": entry.source.title if hasattr(entry, "source") else "",
        })
    return results


def collect_all():
    """전체 키워드로 뉴스를 수집합니다."""
    all_news = {}
    for category, keywords in KEYWORDS.items():
        all_news[category] = {}
        for kw in keywords:
            articles = fetch_google_news(kw, MAX_NEWS_PER_KEYWORD)
            all_news[category][kw] = articles
    return all_news


def print_report(all_news):
    """수집 결과를 보기 좋게 출력합니다."""
    total = 0
    print("=" * 70)
    print(f"  반도체 뉴스 수집 결과  |  {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print("=" * 70)

    for category, keywords in all_news.items():
        print(f"\n■ {category}")
        print("-" * 60)
        for kw, articles in keywords.items():
            print(f"\n  🔍 [{kw}] — {len(articles)}건")
            if not articles:
                print("     (검색 결과 없음)")
            for i, a in enumerate(articles, 1):
                source = f" ({a['source']})" if a["source"] else ""
                date = f" [{a['date']}]" if a["date"] else ""
                print(f"     {i}. {a['title']}{source}{date}")
                total += 1

    print("\n" + "=" * 70)
    print(f"  총 {total}건 수집 완료")
    print("=" * 70)


def save_markdown(all_news, filepath="news_report.md"):
    """수집 결과를 마크다운 파일로 저장합니다."""
    lines = []
    date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines.append(f"# 반도체 뉴스 수집 리포트")
    lines.append(f"> 수집 일시: {date_str}\n")

    total = 0
    for category, keywords in all_news.items():
        lines.append(f"## {category}\n")
        for kw, articles in keywords.items():
            lines.append(f"### {kw} ({len(articles)}건)\n")
            if not articles:
                lines.append("- (검색 결과 없음)\n")
            for a in articles:
                source = f" — {a['source']}" if a["source"] else ""
                date = f" `{a['date']}`" if a["date"] else ""
                lines.append(f"- {date} [{a['title']}]({a['link']}){source}")
                total += 1
            lines.append("")

    lines.append(f"---\n총 **{total}건** 수집")

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\n📄 리포트 저장: {filepath}")


if __name__ == "__main__":
    print("뉴스 수집 중...")
    news = collect_all()
    print_report(news)
    save_markdown(news)
