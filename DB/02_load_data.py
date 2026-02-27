"""
Supabase CSV 데이터 적재 스크립트
- Supabase REST API (service role key) 사용
- DB 비밀번호 불필요
- 실행: python DB/02_load_data.py
"""

import csv
import io
import os
import sys

# Windows cp949 인코딩 문제 방지
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
import time
from pathlib import Path

try:
    from supabase import create_client, Client
except ImportError:
    print("supabase-py 패키지가 필요합니다.")
    print("설치: pip install supabase")
    sys.exit(1)

from dotenv import load_dotenv

# ── 설정 ──────────────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # service role key 사용

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요")
    sys.exit(1)

DATA_DIR = Path(__file__).resolve().parent.parent / "DATA"
BATCH_SIZE = 500  # 기본 배치 크기
BATCH_SIZE_LARGE = 200  # 대용량 테이블용 배치 크기 (10만+ 행)
BATCH_DELAY = 0.5  # 배치 간 딜레이(초) — Supabase rate limit 방지
MAX_RETRIES = 3  # 배치 실패 시 재시도 횟수

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


# ── CSV → 테이블 매핑 정의 ─────────────────────────────
TABLE_CONFIG = {
    "제품마스터.csv": {
        "table": "product_master",
        "upsert_key": "product_code",
        "columns": {
            "product_code": str,
            "product_name": str,
            "product_specification": str,
            "product_type": str,
            "product_category": str,
        },
    },
    "거래처.csv": {
        "table": "supplier",
        "columns": {
            "customer_code": str,
            "customer_name": str,
            "country": str,
        },
    },
    "고객사.csv": {
        "table": "customer",
        "columns": {
            "id": str,
            "company_name": str,
            "industry_type_uptae": str,
            "industry_type_upjong": str,
            "industry_type_jongmok": str,
            "country": str,
        },
    },
    "BOM.csv": {
        "table": "bom",
        "columns": {
            "parent_product_id": str,
            "component_product_id": str,
            "usage_qty": float,
        },
    },
    "구매발주.csv": {
        "table": "purchase_order",
        "columns": {
            "CD_PARTNER": ("cd_partner", str),
            "supplier_name": str,
            "component_product_id": str,
            "po_date": "date_yyyymmdd",
            "receipt_date": "date_yyyymmdd",
            "po_qty": float,
            "unit_price": float,
            "currency": str,
            "status": str,
        },
    },
    "일별매출.csv": {
        "table": "daily_revenue",
        "columns": {
            "revenue_date": "date_yyyymmdd",
            "customer_id": str,
            "product_id": str,
            "quantity": float,
            "revenue_amount": float,
            "currency": str,
            "exchange_rate": float,
            "domestic_flag": "bool",
        },
    },
    "일별생산.csv": {
        "table": "daily_production",
        "columns": {
            "production_date": "date_yyyymmdd",
            "work_start_date": "timestamp",
            "work_end_date": "timestamp",
            "product_id": str,
            "produced_qty": float,
            "line_id": str,
            "NO_MFG_ORDER_SERIAL": ("mfg_order_serial", str),
        },
    },
    "일별수주.csv": {
        "table": "daily_order",
        "columns": {
            "order_date": "date_yyyymmdd",
            "expected_delivery_date": "date_yyyymmdd",
            "customer_id": str,
            "product_id": str,
            "order_qty": float,
            "order_amount": float,
            "status": str,
        },
    },
    "재고.csv": {
        "table": "inventory",
        "columns": {
            "snapshot_date": str,
            "product_id": str,
            "inventory_qty": float,
            "warehouse": str,
        },
    },
}

# 적재 순서: 마스터 → 트랜잭션
LOAD_ORDER = [
    "제품마스터.csv",
    "거래처.csv",
    "고객사.csv",
    "BOM.csv",
    "구매발주.csv",
    "일별매출.csv",
    "일별생산.csv",
    "일별수주.csv",
    "재고.csv",
]


# ── 데이터 변환 함수 ──────────────────────────────────
def convert_date_yyyymmdd(val: str) -> str | None:
    """YYYYMMDD → YYYY-MM-DD"""
    val = val.strip()
    if not val or len(val) < 8:
        return None
    return f"{val[:4]}-{val[4:6]}-{val[6:8]}"


def convert_timestamp(val: str) -> str | None:
    """타임스탬프 문자열 그대로 전달 (이미 ISO 형식)"""
    val = val.strip()
    if not val or val.upper() == "NULL":
        return None
    return val


def convert_bool(val: str) -> bool | None:
    val = val.strip().upper()
    if val == "TRUE":
        return True
    elif val == "FALSE":
        return False
    return None


def convert_float(val: str) -> float | None:
    val = val.strip()
    if not val:
        return None
    return float(val)


def convert_str(val: str) -> str | None:
    val = val.strip()
    return val if val else None


def transform_row(row: dict, columns_config: dict) -> dict:
    """CSV 행을 DB 삽입용 딕셔너리로 변환"""
    result = {}
    for csv_col, type_spec in columns_config.items():
        # 컬럼명 리네이밍 처리
        if isinstance(type_spec, tuple):
            db_col, converter = type_spec
        else:
            db_col = csv_col.lower()
            converter = type_spec

        raw_val = row.get(csv_col, "").strip()

        if converter == str:
            result[db_col] = convert_str(raw_val)
        elif converter == float:
            result[db_col] = convert_float(raw_val)
        elif converter == "date_yyyymmdd":
            result[db_col] = convert_date_yyyymmdd(raw_val)
        elif converter == "timestamp":
            result[db_col] = convert_timestamp(raw_val)
        elif converter == "bool":
            result[db_col] = convert_bool(raw_val)

    return result


# ── 메인 적재 로직 ────────────────────────────────────
def insert_batch_with_retry(table_name: str, rows: list, upsert_key: str | None = None) -> None:
    """배치 INSERT (재시도 포함)"""
    for attempt in range(MAX_RETRIES):
        try:
            if upsert_key:
                supabase.table(table_name).upsert(rows, on_conflict=upsert_key).execute()
            else:
                supabase.table(table_name).insert(rows).execute()
            return
        except Exception as e:
            err_str = str(e)
            if attempt < MAX_RETRIES - 1 and ("502" in err_str or "504" in err_str or "rate" in err_str.lower()):
                wait = (attempt + 1) * 5
                print(f"    >> 재시도 {attempt+2}/{MAX_RETRIES} ({wait}s 대기)")
                time.sleep(wait)
            else:
                raise


def load_csv_to_supabase(csv_filename: str, config: dict) -> int:
    """단일 CSV 파일을 Supabase 테이블에 적재"""
    table_name = config["table"]
    columns_config = config["columns"]
    upsert_key = config.get("upsert_key")
    csv_path = DATA_DIR / csv_filename

    if not csv_path.exists():
        print(f"  [!] 파일 없음: {csv_path}")
        return 0

    # 행 수에 따라 배치 크기 결정
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        line_count = sum(1 for _ in f) - 1  # 헤더 제외
    batch_size = BATCH_SIZE_LARGE if line_count > 50000 else BATCH_SIZE
    print(f"  ({line_count:,}행, 배치={batch_size})")

    # CSV 읽기 (UTF-8 BOM 처리)
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = []
        total = 0

        for row in reader:
            transformed = transform_row(row, columns_config)
            rows.append(transformed)

            if len(rows) >= batch_size:
                insert_batch_with_retry(table_name, rows, upsert_key)
                total += len(rows)
                rows = []
                if total % 5000 == 0:
                    print(f"    {total:,}행 완료...")
                time.sleep(BATCH_DELAY)

        # 남은 행 처리
        if rows:
            insert_batch_with_retry(table_name, rows, upsert_key)
            total += len(rows)

    return total


def main():
    # --only 옵션: 특정 테이블만 적재 (예: --only 일별생산.csv,일별수주.csv,제품마스터.csv)
    only_files = None
    for arg in sys.argv[1:]:
        if arg.startswith("--only="):
            only_files = set(arg.split("=", 1)[1].split(","))

    load_targets = [f for f in LOAD_ORDER if only_files is None or f in only_files]

    print("=" * 60)
    print("Supabase CSV 데이터 적재 시작")
    print(f"데이터 경로: {DATA_DIR}")
    if only_files:
        print(f"대상: {', '.join(load_targets)}")
    print("=" * 60)

    results = {}
    start_all = time.time()

    for csv_file in load_targets:
        config = TABLE_CONFIG[csv_file]
        table_name = config["table"]
        print(f"\n▶ {csv_file} → {table_name}")

        start = time.time()
        try:
            count = load_csv_to_supabase(csv_file, config)
            elapsed = time.time() - start
            results[table_name] = {"count": count, "status": "OK", "time": elapsed}
            print(f"  ✓ {count:,}행 적재 완료 ({elapsed:.1f}s)")
        except Exception as e:
            elapsed = time.time() - start
            results[table_name] = {"count": 0, "status": f"ERROR: {e}", "time": elapsed}
            print(f"  ✗ 오류: {e}")

    # 결과 요약
    total_time = time.time() - start_all
    print("\n" + "=" * 60)
    print("적재 결과 요약")
    print("=" * 60)
    print(f"{'테이블':<22} {'행 수':>10} {'소요시간':>10} {'상태':<10}")
    print("-" * 60)
    total_rows = 0
    for table, info in results.items():
        total_rows += info["count"]
        print(f"{table:<22} {info['count']:>10,} {info['time']:>9.1f}s {info['status']}")
    print("-" * 60)
    print(f"{'합계':<22} {total_rows:>10,} {total_time:>9.1f}s")
    print("=" * 60)


if __name__ == "__main__":
    main()
