"""
ECOS(한국은행 경제통계시스템) API 연동 — 실데이터 적재
economic_indicator 테이블에 source='ECOS'로 적재

연동 지표 (10종):
  [ECOS] KR_BASE_RATE       — 한국 기준금리 (월간, 722Y001/0101000)
  [ECOS] KR_CPI             — 소비자물가지수 총지수 (월간, 901Y009/0)
  [ECOS] KR_IPI_MFG         — 광공업 생산지수 계절조정 (월간, 901Y033/AB00/2)
  [ECOS] KR_BSI_MFG         — 제조업 BSI 업황전망 (월간, 512Y014/C0000/BA)
  [ECOS] KR_PPI             — 생산자물가지수 총지수 (월간, 404Y014/*AA)
  [ECOS] KR_USD_RATE        — 원/달러 환율 종가 (일간, 731Y003/0000003)
  [ECOS] KR_TRADE_PRICE_EX  — 수출물가지수 원화기준 (월간, 402Y014/*AA/W)
  [ECOS] KR_TRADE_PRICE_IM  — 수입물가지수 원화기준 (월간, 401Y015/*AA/W)
  [ECOS] KR_EQUIP_INVEST    — 자본재 생산지수 계절조정 (월간, 901Y034/I31AA/I10B)
  [ECOS] KR_INVENTORY_MFG   — 중간재 재고지수 (월간, 901Y034/I31AB/I10E)

실행: python DB/12_load_ecos.py
옵션: --only=kr_base_rate,kr_cpi   (특정 지표만)
"""

import io
import os
import sys
import time
import argparse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
except ImportError:
    print("requests 패키지가 필요합니다: pip install requests")
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print("supabase 패키지가 필요합니다: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

load_dotenv()

# ── 환경변수 ──────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
ECOS_API_KEY = os.getenv("ECOS_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요")
    sys.exit(1)

if not ECOS_API_KEY:
    print("ERROR: .env에 ECOS_API_KEY 필요")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── 상수 ──────────────────────────────────────────────
BATCH_SIZE = 500
MAX_RETRIES = 3
ECOS_BASE_URL = "https://ecos.bok.or.kr/api/StatisticSearch"

# 수집 기간
START_MONTHLY = "202101"       # 월간 시작
END_MONTHLY = "202602"         # 월간 종료
START_DAILY = "20210101"       # 일간 시작
END_DAILY = "20260228"         # 일간 종료

# ── 지표 정의 (API 탐색 결과 기반 확정) ───────────────
ECOS_INDICATORS = {
    "kr_base_rate": {
        "code": "KR_BASE_RATE",
        "stat_code": "722Y001",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["0101000"],
        "name": "한국 기준금리",
        "unit": "Percent",
    },
    "kr_cpi": {
        "code": "KR_CPI",
        "stat_code": "901Y009",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["0"],
        "name": "소비자물가지수 (총지수)",
        "unit": "Index 2020=100",
    },
    "kr_ipi_mfg": {
        "code": "KR_IPI_MFG",
        "stat_code": "901Y033",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["AB00", "2"],   # 광공업 / 계절조정
        "name": "광공업 생산지수 (계절조정)",
        "unit": "Index 2020=100",
    },
    "kr_bsi_mfg": {
        "code": "KR_BSI_MFG",
        "stat_code": "512Y014",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["C0000", "BA"],  # 제조업 / 업황전망BSI
        "name": "제조업 BSI (업황전망)",
        "unit": "Index",
    },
    "kr_ppi": {
        "code": "KR_PPI",
        "stat_code": "404Y014",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["*AA"],          # 총지수 (item_code2 없음)
        "name": "생산자물가지수 (총지수)",
        "unit": "Index 2020=100",
    },
    "kr_usd_rate": {
        "code": "KR_USD_RATE",
        "stat_code": "731Y003",
        "freq": "D",
        "start": START_DAILY,
        "end": END_DAILY,
        "item_codes": ["0000003"],      # 원/달러 종가(15:30)
        "name": "원/달러 환율 (종가)",
        "unit": "KRW per USD",
    },
    "kr_trade_price_ex": {
        "code": "KR_TRADE_PRICE_EX",
        "stat_code": "402Y014",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["*AA", "W"],     # 총지수 / 원화기준
        "name": "수출물가지수 (원화기준)",
        "unit": "Index 2020=100",
    },
    "kr_trade_price_im": {
        "code": "KR_TRADE_PRICE_IM",
        "stat_code": "401Y015",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["*AA", "W"],     # 총지수 / 원화기준
        "name": "수입물가지수 (원화기준)",
        "unit": "Index 2020=100",
    },
    "kr_equip_invest": {
        "code": "KR_EQUIP_INVEST",
        "stat_code": "901Y034",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["I31AA", "I10B"],  # 자본재 / 생산지수(계절조정)
        "name": "자본재 생산지수 (설비투자, 계절조정)",
        "unit": "Index 2020=100",
    },
    "kr_inventory_mfg": {
        "code": "KR_INVENTORY_MFG",
        "stat_code": "901Y034",
        "freq": "M",
        "start": START_MONTHLY,
        "end": END_MONTHLY,
        "item_codes": ["I31AB", "I10E"],  # 중간재 / 재고지수(원지수)
        "name": "중간재 재고지수 (제조업)",
        "unit": "Index 2020=100",
    },
}


# ── 공통 함수 ─────────────────────────────────────────
def upsert_batch(table_name: str, rows: list, on_conflict: str = None) -> int:
    """배치 UPSERT — 재시도 포함"""
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        for attempt in range(MAX_RETRIES):
            try:
                q = supabase.table(table_name)
                if on_conflict:
                    q.upsert(batch, on_conflict=on_conflict).execute()
                else:
                    q.upsert(batch).execute()
                total += len(batch)
                break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    print(f"  [!] 재시도 {attempt + 1}/{MAX_RETRIES}: {e}")
                    time.sleep((attempt + 1) * 3)
                else:
                    raise
        time.sleep(0.3)
    return total


def deduplicate(rows: list) -> list:
    """(source, indicator_code, date) 기준 중복 제거 — 마지막 값 유지"""
    dedup = {}
    for row in rows:
        key = (row["source"], row["indicator_code"], row["date"])
        dedup[key] = row
    return list(dedup.values())


def time_to_date(time_str: str, freq: str) -> str:
    """ECOS TIME 필드를 YYYY-MM-DD 형식으로 변환"""
    if freq == "D":
        return f"{time_str[:4]}-{time_str[4:6]}-{time_str[6:8]}"
    elif freq == "M":
        return f"{time_str[:4]}-{time_str[4:6]}-01"
    elif freq == "Q":
        year = time_str[:4]
        quarter = int(time_str[4:])
        month = (quarter - 1) * 3 + 1
        return f"{year}-{month:02d}-01"
    elif freq == "A":
        return f"{time_str}-01-01"
    return time_str


def fetch_ecos(ind: dict) -> list[dict]:
    """
    ECOS API에서 단일 지표 데이터를 조회

    URL: /StatisticSearch/{KEY}/json/kr/{START}/{END}/{STAT_CODE}/{FREQ}/{START_DATE}/{END_DATE}/{ITEM1}/{ITEM2}/{ITEM3}
    """
    stat_code = ind["stat_code"]
    freq = ind["freq"]
    start_date = ind["start"]
    end_date = ind["end"]
    item_codes = ind.get("item_codes", [])

    # URL 구성 (경로 파라미터 방식)
    url_parts = [
        ECOS_BASE_URL,
        ECOS_API_KEY,
        "json",
        "kr",
        "1",       # 시작 행
        "10000",   # 종료 행
        stat_code,
        freq,
        start_date,
        end_date,
    ]

    # 아이템 코드 추가
    for ic in item_codes:
        if ic:
            url_parts.append(ic)

    url = "/".join(url_parts)

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        data = resp.json()
    except requests.exceptions.ConnectionError as e:
        print(f"  [!] 연결 실패 (DNS/네트워크): {e}")
        print(f"      → ISS-001 참조: ecos.bok.or.kr DNS 해석 실패 가능성")
        return []
    except requests.exceptions.Timeout:
        print(f"  [!] 요청 타임아웃 (30초)")
        return []
    except Exception as e:
        print(f"  [!] API 요청 실패: {e}")
        return []

    # 응답 파싱
    stat_search = data.get("StatisticSearch")
    if not stat_search:
        err = data.get("RESULT")
        if err:
            print(f"  [!] ECOS 에러: [{err.get('CODE')}] {err.get('MESSAGE')}")
        else:
            print(f"  [!] 예상 외 응답 구조: {list(data.keys())}")
        return []

    total_count = stat_search.get("list_total_count", 0)
    rows = stat_search.get("row", [])

    print(f"  → API 응답: {total_count}건, 수신: {len(rows)}건")

    # 파싱
    parsed = []
    for row in rows:
        val_str = row.get("DATA_VALUE", "").strip()
        if not val_str or val_str == "-" or val_str == ".":
            continue

        try:
            value = float(val_str.replace(",", ""))
        except ValueError:
            continue

        time_str = row.get("TIME", "").strip()
        if not time_str:
            continue

        date_str = time_to_date(time_str, freq)

        parsed.append({
            "source": "ECOS",
            "indicator_code": ind["code"],
            "indicator_name": ind["name"],
            "date": date_str,
            "value": value,
            "unit": ind["unit"],
        })

    return parsed


def load_indicator(key: str, ind: dict) -> int:
    """단일 지표 조회 → 중복 제거 → 적재"""
    code = ind["code"]
    name = ind["name"]
    items_str = "/".join(ind.get("item_codes", []))
    print(f"\n[{code}] {name} ({ind['stat_code']}/{items_str}, {ind['freq']})")

    rows = fetch_ecos(ind)
    if not rows:
        print(f"  → 적재 건수: 0 (데이터 없음)")
        return 0

    # 중복 제거 (동일 date에 여러 행 반환되는 경우 방지)
    before = len(rows)
    rows = deduplicate(rows)
    after = len(rows)
    if before != after:
        print(f"  → 중복 제거: {before} → {after}건")

    count = upsert_batch(
        "economic_indicator", rows,
        on_conflict="source,indicator_code,date"
    )
    print(f"  → 적재 건수: {count}")
    return count


# ── 메인 ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="ECOS API → economic_indicator 적재")
    parser.add_argument(
        "--only",
        type=str,
        default="",
        help="특정 지표만 실행 (쉼표 구분, 예: kr_base_rate,kr_cpi)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("ECOS(한국은행) API → economic_indicator 적재")
    print(f"API Key: {ECOS_API_KEY[:8]}...")
    print(f"기간: 월간 {START_MONTHLY}~{END_MONTHLY} / 일간 {START_DAILY}~{END_DAILY}")
    print("=" * 60)

    # 대상 지표 결정
    if args.only:
        selected = [k.strip().lower() for k in args.only.split(",")]
        targets = {k: v for k, v in ECOS_INDICATORS.items() if k in selected}
        if not targets:
            print(f"[!] 유효한 지표 없음. 사용 가능: {', '.join(ECOS_INDICATORS.keys())}")
            sys.exit(1)
    else:
        targets = ECOS_INDICATORS

    print(f"\n대상 지표: {len(targets)}종")
    for k, v in targets.items():
        print(f"  - {v['code']}: {v['name']}")

    # 순차 실행
    grand_total = 0
    results = {}

    for key, ind in targets.items():
        try:
            count = load_indicator(key, ind)
            results[ind["code"]] = count
            grand_total += count
        except Exception as e:
            print(f"  [!] 실패: {e}")
            results[ind["code"]] = 0
        time.sleep(1)  # API 부하 방지

    # 결과 요약
    print("\n" + "=" * 60)
    print("적재 결과 요약")
    print("=" * 60)
    for code, cnt in results.items():
        status = "OK" if cnt > 0 else "FAIL"
        print(f"  [{status}] {code}: {cnt}건")
    print(f"\n총 적재: {grand_total}건")
    print("=" * 60)


if __name__ == "__main__":
    main()
