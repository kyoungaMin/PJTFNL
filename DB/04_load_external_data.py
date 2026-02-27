"""
외부지표 데이터 수집 & Supabase 적재 스크립트
- FRED: 미국 경제지표 (산업생산, 환율, PPI 등)
- EIA: 에너지 가격 (WTI 원유)
- 관세청: 반도체 HS코드별 수출입 통계
- 실행: python DB/04_load_external_data.py
- 옵션: --only=fred,eia,customs  (특정 소스만)
"""

import io
import os
import sys
import time
import json
from datetime import datetime, timedelta
from xml.etree import ElementTree

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

# ── 설정 ──────────────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
FRED_API_KEY = os.getenv("FRED_API_KEY")
EIA_API_KEY = os.getenv("EIA_API_KEY")
CUSTOMS_ENDPOINT = os.getenv("DATA_GO_KR_CUSTOMS_ENDPOINT")
CUSTOMS_SERVICE_KEY = os.getenv("DATA_GO_KR_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH_SIZE = 500
MAX_RETRIES = 3


# ── FRED 지표 정의 ─────────────────────────────────────
FRED_INDICATORS = [
    {"code": "INDPRO",      "name": "Industrial Production Index",     "unit": "Index 2017=100", "freq": "monthly"},
    {"code": "IPMAN",       "name": "Manufacturing IP Index",          "unit": "Index 2017=100", "freq": "monthly"},
    {"code": "DEXKOUS",     "name": "USD/KRW Exchange Rate",           "unit": "KRW per USD",    "freq": "daily"},
    {"code": "MANEMP",      "name": "Manufacturing Employment",        "unit": "Thousands",      "freq": "monthly"},
    {"code": "UMCSENT",     "name": "Consumer Sentiment Index",        "unit": "Index 1966Q1=100","freq": "monthly"},
    {"code": "PCUOMFGOMFG", "name": "PPI Manufacturing",              "unit": "Index 1982=100",  "freq": "monthly"},
    {"code": "DTWEXBGS",    "name": "Trade Weighted USD Index",        "unit": "Index Jan2006=100","freq": "daily"},
    {"code": "CPIAUCSL",    "name": "CPI All Urban Consumers",        "unit": "Index 1982-84=100","freq": "monthly"},
    {"code": "UNRATE",      "name": "Unemployment Rate",               "unit": "Percent",        "freq": "monthly"},
    {"code": "FEDFUNDS",    "name": "Federal Funds Rate",              "unit": "Percent",        "freq": "monthly"},
]

# FRED 데이터 수집 기간: 최근 5년
FRED_START = "2021-01-01"
FRED_END = datetime.now().strftime("%Y-%m-%d")


# ── EIA 지표 정의 ──────────────────────────────────────
EIA_INDICATORS = [
    {"series_id": "PET.RWTC.W", "code": "WTI_WEEKLY",  "name": "WTI Crude Oil Spot Price (Weekly)", "unit": "USD/barrel"},
    {"series_id": "PET.RWTC.M", "code": "WTI_MONTHLY", "name": "WTI Crude Oil Spot Price (Monthly)", "unit": "USD/barrel"},
]


# ── 관세청 HS코드 정의 ─────────────────────────────────
CUSTOMS_HS_CODES = [
    {"code": "8541", "name": "반도체 디바이스 (다이오드, 트랜지스터 등)"},
    {"code": "8542", "name": "전자집적회로"},
]

# 관세청 수집 기간: 최근 3년
CUSTOMS_START_YM = "202101"
CUSTOMS_END_YM = datetime.now().strftime("%Y%m")


# ── 공통 함수 ──────────────────────────────────────────
def upsert_batch(table_name: str, rows: list, on_conflict: str = None, retries: int = MAX_RETRIES) -> int:
    """Supabase upsert (conflict 시 update)"""
    if not rows:
        return 0
    for attempt in range(retries):
        try:
            if on_conflict:
                supabase.table(table_name).upsert(rows, on_conflict=on_conflict).execute()
            else:
                supabase.table(table_name).upsert(rows).execute()
            return len(rows)
        except Exception as e:
            err = str(e)
            if attempt < retries - 1 and ("502" in err or "504" in err or "rate" in err.lower()):
                wait = (attempt + 1) * 5
                print(f"    >> 재시도 {attempt+2}/{retries} ({wait}s 대기)")
                time.sleep(wait)
            else:
                raise
    return 0


# ── FRED 수집 ──────────────────────────────────────────
def fetch_fred() -> int:
    """FRED API에서 경제지표 수집 후 Supabase 적재"""
    if not FRED_API_KEY:
        print("  [!] FRED_API_KEY 미설정 — 건너뜀")
        return 0

    total = 0
    for ind in FRED_INDICATORS:
        code = ind["code"]
        print(f"  ▷ {code} ({ind['name']})")

        url = "https://api.stlouisfed.org/fred/series/observations"
        params = {
            "series_id": code,
            "api_key": FRED_API_KEY,
            "file_type": "json",
            "observation_start": FRED_START,
            "observation_end": FRED_END,
        }

        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"    [!] 요청 실패: {e}")
            continue

        observations = data.get("observations", [])
        if not observations:
            print(f"    [!] 데이터 없음")
            continue

        rows = []
        for obs in observations:
            val = obs.get("value", "").strip()
            if val == "." or val == "" or val is None:
                continue
            try:
                numeric_val = float(val)
            except ValueError:
                continue

            rows.append({
                "source": "FRED",
                "indicator_code": code,
                "indicator_name": ind["name"],
                "date": obs["date"],
                "value": numeric_val,
                "unit": ind["unit"],
            })

        # 배치 적재
        count = 0
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i+BATCH_SIZE]
            count += upsert_batch("economic_indicator", batch, on_conflict="source,indicator_code,date")
            time.sleep(0.3)

        print(f"    ✓ {count:,}건 적재")
        total += count
        time.sleep(1)  # FRED rate limit: 120 req/min

    return total


# ── EIA 수집 ───────────────────────────────────────────
def fetch_eia() -> int:
    """EIA API에서 에너지 가격 수집 후 Supabase 적재"""
    if not EIA_API_KEY:
        print("  [!] EIA_API_KEY 미설정 — 건너뜀")
        return 0

    total = 0
    for ind in EIA_INDICATORS:
        series_id = ind["series_id"]
        code = ind["code"]
        print(f"  ▷ {code} ({ind['name']})")

        url = f"https://api.eia.gov/v2/petroleum/pri/spt/data/"
        params = {
            "api_key": EIA_API_KEY,
            "frequency": "weekly" if "W" in series_id else "monthly",
            "data[0]": "value",
            "facets[series][]": "RWTC",
            "sort[0][column]": "period",
            "sort[0][direction]": "asc",
            "start": "2021-01",
            "length": 5000,
        }

        try:
            resp = requests.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"    [!] 요청 실패: {e}")
            continue

        records = data.get("response", {}).get("data", [])
        if not records:
            print(f"    [!] 데이터 없음")
            continue

        rows = []
        seen_dates = set()
        for rec in records:
            period = rec.get("period", "")
            val = rec.get("value")
            if val is None or period == "":
                continue

            # period를 date로 변환 (YYYY-MM-DD 또는 YYYY-MM)
            if len(period) == 7:  # YYYY-MM
                date_str = f"{period}-01"
            elif len(period) == 10:  # YYYY-MM-DD
                date_str = period
            else:
                continue

            # 중복 방지 (같은 frequency의 같은 날짜)
            key = f"{code}_{date_str}"
            if key in seen_dates:
                continue
            seen_dates.add(key)

            try:
                numeric_val = float(val)
            except (ValueError, TypeError):
                continue

            rows.append({
                "source": "EIA",
                "indicator_code": code,
                "indicator_name": ind["name"],
                "date": date_str,
                "value": numeric_val,
                "unit": ind["unit"],
            })

        # 배치 적재
        count = 0
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i+BATCH_SIZE]
            count += upsert_batch("economic_indicator", batch, on_conflict="source,indicator_code,date")
            time.sleep(0.3)

        print(f"    ✓ {count:,}건 적재")
        total += count
        time.sleep(1)

    return total


# ── 관세청 수집 ────────────────────────────────────────
def fetch_customs() -> int:
    """관세청 API에서 반도체 수출입 통계 수집 후 Supabase 적재"""
    if not CUSTOMS_ENDPOINT or not CUSTOMS_SERVICE_KEY:
        print("  [!] 관세청 API 설정 미완료 — 건너뜀")
        return 0

    # 1년 이내 제한 → 연도별 분할 호출
    start_year = int(CUSTOMS_START_YM[:4])
    end_year = int(CUSTOMS_END_YM[:4])
    end_month = CUSTOMS_END_YM[4:6]

    total = 0
    for hs in CUSTOMS_HS_CODES:
        hs_code = hs["code"]
        hs_name = hs["name"]
        print(f"  ▷ HS {hs_code} ({hs_name})")

        all_rows = []
        for year in range(start_year, end_year + 1):
            strt = f"{year}01"
            if year == end_year:
                endy = f"{year}{end_month}"
            else:
                endy = f"{year}12"

            url = f"{CUSTOMS_ENDPOINT}/getItemtradeList"
            params = {
                "serviceKey": CUSTOMS_SERVICE_KEY,
                "strtYymm": strt,
                "endYymm": endy,
                "hsSgn": hs_code,
                "numOfRows": 10000,
            }

            try:
                resp = requests.get(url, params=params, timeout=60)
                resp.raise_for_status()
            except Exception as e:
                print(f"    [!] {year}년 요청 실패: {e}")
                continue

            try:
                root = ElementTree.fromstring(resp.content)
            except Exception as e:
                print(f"    [!] {year}년 XML 파싱 실패: {e}")
                continue

            result_code = root.findtext(".//resultCode")
            if result_code != "00":
                msg = root.findtext(".//resultMsg")
                print(f"    [!] {year}년 API 오류: {result_code} - {msg}")
                continue

            items = root.findall(".//item")
            for item in items:
                raw_ym = item.findtext("year", "").strip()
                detail_code = item.findtext("hsCode", "").strip()
                desc = item.findtext("statKor", "").strip()
                exp_dlr = item.findtext("expDlr", "0").strip()
                exp_wgt = item.findtext("expWgt", "0").strip()
                imp_dlr = item.findtext("impDlr", "0").strip()
                imp_wgt = item.findtext("impWgt", "0").strip()
                bal = item.findtext("balPayments", "0").strip()

                if not raw_ym or not detail_code:
                    continue
                # 총계/합계 행 제외
                if "총계" in raw_ym or detail_code == "-":
                    continue

                year_month = raw_ym.replace(".", "-")
                try:
                    all_rows.append({
                        "hs_code": detail_code,
                        "hs_description": desc,
                        "year_month": year_month,
                        "export_amount": float(exp_dlr) if exp_dlr else 0,
                        "export_weight": float(exp_wgt) if exp_wgt else 0,
                        "import_amount": float(imp_dlr) if imp_dlr else 0,
                        "import_weight": float(imp_wgt) if imp_wgt else 0,
                        "balance": float(bal) if bal else 0,
                    })
                except (ValueError, TypeError):
                    continue

            print(f"    {year}년: {len(items)}건")
            time.sleep(1)

        # 중복 제거 (hs_code + year_month)
        dedup = {}
        for r in all_rows:
            dedup[(r["hs_code"], r["year_month"])] = r
        rows = list(dedup.values())

        # 배치 적재
        count = 0
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i:i+BATCH_SIZE]
            count += upsert_batch("trade_statistics", batch, on_conflict="hs_code,year_month")
            time.sleep(0.3)

        print(f"    ✓ {count:,}건 적재 ({len(set(r['hs_code'] for r in rows))} 세부코드)")
        total += count
        time.sleep(1)

    return total


# ── 메인 ───────────────────────────────────────────────
def main():
    # --only 옵션
    only_sources = None
    for arg in sys.argv[1:]:
        if arg.startswith("--only="):
            only_sources = set(arg.split("=", 1)[1].lower().split(","))

    sources = {
        "fred": ("FRED (미국 경제지표)", fetch_fred),
        "eia": ("EIA (에너지 가격)", fetch_eia),
        "customs": ("관세청 (반도체 수출입)", fetch_customs),
    }

    print("=" * 60)
    print("외부지표 데이터 수집 & Supabase 적재")
    print(f"수집 기간: FRED/EIA {FRED_START}~, 관세청 {CUSTOMS_START_YM}~")
    if only_sources:
        print(f"대상: {', '.join(only_sources)}")
    print("=" * 60)

    results = {}
    start_all = time.time()

    for key, (label, func) in sources.items():
        if only_sources and key not in only_sources:
            continue

        print(f"\n▶ {label}")
        start = time.time()
        try:
            count = func()
            elapsed = time.time() - start
            results[label] = {"count": count, "status": "OK", "time": elapsed}
            print(f"  ✓ 총 {count:,}건 ({elapsed:.1f}s)")
        except Exception as e:
            elapsed = time.time() - start
            results[label] = {"count": 0, "status": f"ERROR: {e}", "time": elapsed}
            print(f"  ✗ 오류: {e}")

    # 결과 요약
    total_time = time.time() - start_all
    print("\n" + "=" * 60)
    print("적재 결과 요약")
    print("=" * 60)
    print(f"{'소스':<30} {'건수':>8} {'소요시간':>10} {'상태':<10}")
    print("-" * 60)
    total_rows = 0
    for label, info in results.items():
        total_rows += info["count"]
        print(f"{label:<30} {info['count']:>8,} {info['time']:>9.1f}s {info['status']}")
    print("-" * 60)
    print(f"{'합계':<30} {total_rows:>8,} {total_time:>9.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
