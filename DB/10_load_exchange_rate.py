"""
환율 데이터 생성 & Supabase 적재 스크립트
- FRED API 사용 가능 시: 실제 USD/KRW 환율 수집
- API 미설정 시: 현실적 환율 데이터 생성 (USD, JPY, EUR, CNY → KRW)
- 기간: 2021-01-01 ~ 2026-02-28

실행: python DB/10_load_exchange_rate.py
옵션: --only=usd,jpy,eur,cny   (특정 통화만)
      --generate                (API 무시, 강제 생성 모드)
"""

import io
import os
import sys
import time
import math
import random
from datetime import datetime, date, timedelta

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    import requests
except ImportError:
    requests = None

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

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH_SIZE = 500
MAX_RETRIES = 3

# 데이터 기간
START_DATE = date(2021, 1, 1)
END_DATE = date(2026, 2, 28)


# ── 환율 앵커 포인트 (실제 시세 기반) ─────────────────
# 월별 대표값으로 보간하여 일별 데이터 생성
# 출처: 한국은행, FRED, investing.com 참고

# USD/KRW: 1 USD = ? KRW
USD_KRW_ANCHORS = {
    "2021-01": 1097, "2021-02": 1107, "2021-03": 1128,
    "2021-04": 1118, "2021-05": 1121, "2021-06": 1115,
    "2021-07": 1149, "2021-08": 1163, "2021-09": 1175,
    "2021-10": 1172, "2021-11": 1184, "2021-12": 1185,
    "2022-01": 1197, "2022-02": 1200, "2022-03": 1215,
    "2022-04": 1250, "2022-05": 1270, "2022-06": 1290,
    "2022-07": 1310, "2022-08": 1330, "2022-09": 1400,
    "2022-10": 1430, "2022-11": 1340, "2022-12": 1265,
    "2023-01": 1233, "2023-02": 1275, "2023-03": 1290,
    "2023-04": 1320, "2023-05": 1325, "2023-06": 1275,
    "2023-07": 1280, "2023-08": 1320, "2023-09": 1335,
    "2023-10": 1350, "2023-11": 1300, "2023-12": 1290,
    "2024-01": 1325, "2024-02": 1330, "2024-03": 1335,
    "2024-04": 1370, "2024-05": 1375, "2024-06": 1380,
    "2024-07": 1370, "2024-08": 1340, "2024-09": 1330,
    "2024-10": 1370, "2024-11": 1400, "2024-12": 1470,
    "2025-01": 1455, "2025-02": 1440, "2025-03": 1450,
    "2025-04": 1420, "2025-05": 1390, "2025-06": 1380,
    "2025-07": 1370, "2025-08": 1365, "2025-09": 1350,
    "2025-10": 1365, "2025-11": 1380, "2025-12": 1390,
    "2026-01": 1400, "2026-02": 1405,
}

# JPY/KRW: 100 JPY = ? KRW (DB에는 1 JPY = ? KRW로 저장)
JPY100_KRW_ANCHORS = {
    "2021-01": 1058, "2021-02": 1048, "2021-03": 1032,
    "2021-04": 1025, "2021-05": 1028, "2021-06": 1010,
    "2021-07": 1042, "2021-08": 1060, "2021-09": 1067,
    "2021-10": 1031, "2021-11": 1037, "2021-12": 1033,
    "2022-01": 1040, "2022-02": 1040, "2022-03": 995,
    "2022-04": 975, "2022-05": 985, "2022-06": 955,
    "2022-07": 960, "2022-08": 975, "2022-09": 970,
    "2022-10": 960, "2022-11": 965, "2022-12": 955,
    "2023-01": 950, "2023-02": 960, "2023-03": 975,
    "2023-04": 985, "2023-05": 955, "2023-06": 895,
    "2023-07": 905, "2023-08": 910, "2023-09": 900,
    "2023-10": 895, "2023-11": 870, "2023-12": 885,
    "2024-01": 895, "2024-02": 885, "2024-03": 882,
    "2024-04": 880, "2024-05": 875, "2024-06": 870,
    "2024-07": 880, "2024-08": 905, "2024-09": 920,
    "2024-10": 910, "2024-11": 910, "2024-12": 945,
    "2025-01": 935, "2025-02": 940, "2025-03": 960,
    "2025-04": 970, "2025-05": 955, "2025-06": 950,
    "2025-07": 945, "2025-08": 940, "2025-09": 945,
    "2025-10": 950, "2025-11": 955, "2025-12": 960,
    "2026-01": 965, "2026-02": 970,
}

# EUR/KRW: 1 EUR = ? KRW
EUR_KRW_ANCHORS = {
    "2021-01": 1335, "2021-02": 1340, "2021-03": 1330,
    "2021-04": 1340, "2021-05": 1360, "2021-06": 1330,
    "2021-07": 1350, "2021-08": 1370, "2021-09": 1370,
    "2021-10": 1360, "2021-11": 1340, "2021-12": 1340,
    "2022-01": 1350, "2022-02": 1355, "2022-03": 1340,
    "2022-04": 1350, "2022-05": 1345, "2022-06": 1350,
    "2022-07": 1330, "2022-08": 1345, "2022-09": 1380,
    "2022-10": 1405, "2022-11": 1375, "2022-12": 1335,
    "2023-01": 1335, "2023-02": 1365, "2023-03": 1395,
    "2023-04": 1450, "2023-05": 1430, "2023-06": 1395,
    "2023-07": 1420, "2023-08": 1440, "2023-09": 1415,
    "2023-10": 1420, "2023-11": 1415, "2023-12": 1420,
    "2024-01": 1445, "2024-02": 1440, "2024-03": 1445,
    "2024-04": 1460, "2024-05": 1480, "2024-06": 1485,
    "2024-07": 1490, "2024-08": 1475, "2024-09": 1480,
    "2024-10": 1470, "2024-11": 1460, "2024-12": 1530,
    "2025-01": 1520, "2025-02": 1510, "2025-03": 1530,
    "2025-04": 1540, "2025-05": 1520, "2025-06": 1510,
    "2025-07": 1500, "2025-08": 1495, "2025-09": 1490,
    "2025-10": 1500, "2025-11": 1510, "2025-12": 1515,
    "2026-01": 1520, "2026-02": 1525,
}

# CNY/KRW: 1 CNY = ? KRW
CNY_KRW_ANCHORS = {
    "2021-01": 170, "2021-02": 172, "2021-03": 173,
    "2021-04": 172, "2021-05": 174, "2021-06": 173,
    "2021-07": 178, "2021-08": 180, "2021-09": 182,
    "2021-10": 184, "2021-11": 186, "2021-12": 186,
    "2022-01": 189, "2022-02": 190, "2022-03": 191,
    "2022-04": 193, "2022-05": 190, "2022-06": 193,
    "2022-07": 194, "2022-08": 193, "2022-09": 200,
    "2022-10": 197, "2022-11": 190, "2022-12": 183,
    "2023-01": 182, "2023-02": 185, "2023-03": 188,
    "2023-04": 191, "2023-05": 186, "2023-06": 177,
    "2023-07": 177, "2023-08": 182, "2023-09": 183,
    "2023-10": 185, "2023-11": 180, "2023-12": 181,
    "2024-01": 185, "2024-02": 185, "2024-03": 184,
    "2024-04": 189, "2024-05": 190, "2024-06": 190,
    "2024-07": 189, "2024-08": 189, "2024-09": 188,
    "2024-10": 193, "2024-11": 194, "2024-12": 201,
    "2025-01": 199, "2025-02": 197, "2025-03": 200,
    "2025-04": 198, "2025-05": 195, "2025-06": 193,
    "2025-07": 192, "2025-08": 191, "2025-09": 190,
    "2025-10": 192, "2025-11": 193, "2025-12": 194,
    "2026-01": 195, "2026-02": 196,
}


# ── 공통 함수 ──────────────────────────────────────────
def upsert_batch(table_name: str, rows: list, on_conflict: str = None) -> int:
    if not rows:
        return 0
    for attempt in range(MAX_RETRIES):
        try:
            if on_conflict:
                supabase.table(table_name).upsert(rows, on_conflict=on_conflict).execute()
            else:
                supabase.table(table_name).upsert(rows).execute()
            return len(rows)
        except Exception as e:
            err = str(e)
            if attempt < MAX_RETRIES - 1 and ("502" in err or "504" in err or "rate" in err.lower()):
                wait = (attempt + 1) * 5
                print(f"    >> 재시도 {attempt+2}/{MAX_RETRIES} ({wait}s 대기)")
                time.sleep(wait)
            else:
                raise
    return 0


def is_weekday(d: date) -> bool:
    """영업일 여부 (토/일 제외)"""
    return d.weekday() < 5


def generate_daily_rates(anchors: dict, noise_pct: float = 0.003) -> list[tuple[date, float]]:
    """
    월별 앵커 → 일별 환율 생성 (선형 보간 + 랜덤 노이즈)
    noise_pct: 일간 변동폭 비율 (기본 0.3%)
    """
    # 앵커를 날짜순 정렬
    sorted_months = sorted(anchors.keys())
    anchor_dates = []
    for ym in sorted_months:
        y, m = int(ym[:4]), int(ym[5:7])
        anchor_dates.append((date(y, m, 15), anchors[ym]))  # 월 중앙으로 배치

    # 일별 보간
    results = []
    random.seed(42)  # 재현성

    d = START_DATE
    while d <= END_DATE:
        if not is_weekday(d):
            d += timedelta(days=1)
            continue

        # 앵커 보간: d에 가장 가까운 양쪽 앵커 찾기
        val = _interpolate(d, anchor_dates)

        # 랜덤 노이즈 추가 (정규분포)
        noise = random.gauss(0, val * noise_pct)
        val = round(val + noise, 4)

        results.append((d, val))
        d += timedelta(days=1)

    return results


def _interpolate(target: date, anchor_dates: list[tuple[date, float]]) -> float:
    """선형 보간"""
    if target <= anchor_dates[0][0]:
        return anchor_dates[0][1]
    if target >= anchor_dates[-1][0]:
        return anchor_dates[-1][1]

    for i in range(len(anchor_dates) - 1):
        d1, v1 = anchor_dates[i]
        d2, v2 = anchor_dates[i + 1]
        if d1 <= target <= d2:
            total_days = (d2 - d1).days
            elapsed = (target - d1).days
            if total_days == 0:
                return v1
            ratio = elapsed / total_days
            return v1 + (v2 - v1) * ratio

    return anchor_dates[-1][1]


# ── FRED API에서 실제 USD/KRW 수집 ───────────────────
def fetch_fred_usdkrw() -> list[tuple[date, float]] | None:
    """FRED DEXKOUS 시리즈에서 실제 USD/KRW 환율 수집"""
    if not FRED_API_KEY or not requests:
        return None

    print("  ▷ FRED API에서 USD/KRW(DEXKOUS) 수집 중...")
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": "DEXKOUS",
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "observation_start": START_DATE.isoformat(),
        "observation_end": END_DATE.isoformat(),
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"    [!] FRED 요청 실패: {e}")
        return None

    observations = data.get("observations", [])
    if not observations:
        return None

    results = []
    for obs in observations:
        val = obs.get("value", "").strip()
        if val == "." or val == "" or val is None:
            continue
        try:
            d = date.fromisoformat(obs["date"])
            rate = float(val)
            results.append((d, rate))
        except (ValueError, KeyError):
            continue

    print(f"    ✓ FRED에서 {len(results):,}건 수집")
    return results if results else None


# ── 통화별 환율 생성 및 적재 ──────────────────────────
CURRENCIES = {
    "usd": {
        "base": "USD",
        "name": "미 달러",
        "anchors": USD_KRW_ANCHORS,
        "noise": 0.003,
        "fred_series": "DEXKOUS",
    },
    "jpy": {
        "base": "JPY",
        "name": "일본 엔 (1JPY=?KRW)",
        "anchors": JPY100_KRW_ANCHORS,
        "noise": 0.004,
        "scale": 0.01,  # 100엔 기준 → 1엔 기준으로 변환
    },
    "eur": {
        "base": "EUR",
        "name": "유로",
        "anchors": EUR_KRW_ANCHORS,
        "noise": 0.003,
    },
    "cny": {
        "base": "CNY",
        "name": "중국 위안",
        "anchors": CNY_KRW_ANCHORS,
        "noise": 0.002,
    },
}


def load_currency(key: str, info: dict, force_generate: bool = False) -> int:
    """단일 통화 환율 데이터 생성 및 적재"""
    base_cur = info["base"]
    name = info["name"]
    anchors = info["anchors"]
    noise = info["noise"]
    scale = info.get("scale", 1.0)

    print(f"\n  ▶ {base_cur}/KRW ({name})")

    # FRED에서 실제 데이터 시도 (USD만 해당)
    rates = None
    source = "GENERATED"
    if key == "usd" and not force_generate:
        rates = fetch_fred_usdkrw()
        if rates:
            source = "FRED"

    # 실제 데이터 없으면 생성
    if not rates:
        print(f"  ▷ 앵커 기반 데이터 생성 중... (noise={noise*100:.1f}%)")
        rates = generate_daily_rates(anchors, noise)
        if scale != 1.0:
            rates = [(d, round(v * scale, 4)) for d, v in rates]

    # Supabase 적재
    rows = []
    for d, rate in rates:
        rows.append({
            "base_currency": base_cur,
            "quote_currency": "KRW",
            "rate_date": d.isoformat(),
            "rate": rate,
            "source": source,
        })

    count = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i + BATCH_SIZE]
        count += upsert_batch("exchange_rate", batch, on_conflict="base_currency,quote_currency,rate_date")
        time.sleep(0.3)

    print(f"    ✓ {count:,}건 적재 ({source})")
    return count


# ── 메인 ───────────────────────────────────────────────
def main():
    only_currencies = None
    force_generate = False

    for arg in sys.argv[1:]:
        if arg.startswith("--only="):
            only_currencies = set(arg.split("=", 1)[1].lower().split(","))
        elif arg == "--generate":
            force_generate = True

    print("=" * 60)
    print("환율 데이터 생성 & Supabase 적재")
    print(f"기간: {START_DATE} ~ {END_DATE}")
    print(f"통화: {', '.join(c['base'] for c in CURRENCIES.values())}")
    if force_generate:
        print("모드: 강제 생성 (API 무시)")
    if only_currencies:
        print(f"대상: {', '.join(only_currencies)}")
    print("=" * 60)

    start_all = time.time()
    total = 0
    results = {}

    for key, info in CURRENCIES.items():
        if only_currencies and key not in only_currencies:
            continue
        try:
            count = load_currency(key, info, force_generate)
            results[info["base"]] = count
            total += count
        except Exception as e:
            print(f"    ✗ 오류: {e}")
            results[info["base"]] = 0

    # 결과 요약
    elapsed = time.time() - start_all
    print("\n" + "=" * 60)
    print("적재 결과 요약")
    print("=" * 60)
    print(f"{'통화':<12} {'건수':>8}")
    print("-" * 22)
    for cur, cnt in results.items():
        print(f"{cur + '/KRW':<12} {cnt:>8,}")
    print("-" * 22)
    print(f"{'합계':<12} {total:>8,}")
    print(f"소요시간: {elapsed:.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
