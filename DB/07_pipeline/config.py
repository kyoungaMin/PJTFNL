"""
파이프라인 공통 설정 — Supabase 연결, 상수 정의
"""

import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# .env 로드 (프로젝트 루트)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요")
    sys.exit(1)

# supabase SDK 신규 키 형식 호환 패치
# 신규 Supabase 프로젝트는 sb_secret_/sb_publishable_ 형식 키를 사용하는데
# SDK 내부에서 JWT 형식(점 2개) 여부를 regex로 검사함 → 패치로 우회
import re as _re
try:
    from supabase._sync.client import SyncClient as _SyncClient
except ImportError:
    from supabase._sync.client import Client as _SyncClient
_orig_init = _SyncClient.__init__

def _patched_init(self, supabase_url, supabase_key, options=None):
    _orig = _re.match
    def _mock_match(pattern, string, *a, **kw):
        if (isinstance(string, str) and string.startswith("sb_")
                and r"[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]" in str(pattern)):
            return _re.match(r"^.+$", string)
        return _orig(pattern, string, *a, **kw)
    _re.match = _mock_match
    try:
        _orig_init(self, supabase_url, supabase_key, options)
    finally:
        _re.match = _orig

_SyncClient.__init__ = _patched_init

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 배치 설정
BATCH_SIZE = 500
BATCH_DELAY = 0.3
MAX_RETRIES = 3
EARLY_STOPPING_ROUNDS = 50      # LightGBM early stopping 라운드

# 주간 피처 스토어 — LightGBM 학습용 피처 컬럼 목록
WEEKLY_FEATURE_COLS = [
    # A: 수주 이력 래그
    "order_qty_lag1", "order_qty_lag2", "order_qty_lag4",
    "order_qty_lag8", "order_qty_lag13", "order_qty_lag26", "order_qty_lag52",
    "order_qty_ma4", "order_qty_ma13", "order_qty_ma26",
    "order_count_lag1", "order_count_ma4", "order_amount_lag1",
    # B: 모멘텀
    "order_qty_roc_4w", "order_qty_roc_13w",
    "order_qty_diff_1w", "order_qty_diff_4w",
    # C: 변동성
    "order_qty_std4", "order_qty_std13", "order_qty_cv4",
    "order_qty_max4", "order_qty_min4",
    "order_qty_nonzero_4w", "order_qty_nonzero_13w",
    # D: 공급측
    "revenue_qty_lag1", "revenue_qty_ma4",
    "produced_qty_lag1", "produced_qty_ma4",
    "inventory_qty", "inventory_weeks", "avg_lead_days", "book_to_bill_4w",
    # E: 고객 집중도
    "customer_count_lag1", "customer_count_ma4",
    "top1_customer_pct", "top3_customer_pct", "customer_hhi",
    # F: 가격
    "avg_unit_price", "order_avg_value",
    # G: 반도체 시장
    "sox_index", "sox_roc_4w", "dram_price", "dram_roc_4w",
    "nand_price", "silicon_wafer_price", "baltic_dry_index", "copper_lme",
    # H: 환율
    "usd_krw", "usd_krw_roc_4w", "jpy_krw", "eur_krw", "cny_krw",
    # I: 거시경제
    "fed_funds_rate", "wti_price", "indpro_index", "ipman_index",
    "kr_base_rate", "kr_ipi_mfg", "kr_bsi_mfg", "cn_pmi_mfg",
    # J: 무역
    "semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc",
    # K: 시간
    "week_num", "month", "quarter", "is_holiday_week", "is_year_end",
]

# 월간 피처 스토어 — LightGBM 학습용 피처 컬럼 목록
MONTHLY_FEATURE_COLS = [
    # A: 수주 이력 래그
    "order_qty_lag1", "order_qty_lag2", "order_qty_lag3",
    "order_qty_lag6", "order_qty_lag12",
    "order_qty_ma3", "order_qty_ma6", "order_qty_ma12",
    "order_count_lag1", "order_amount_lag1",
    # B: 모멘텀
    "order_qty_roc_3m", "order_qty_roc_6m",
    "order_qty_diff_1m", "order_qty_diff_3m",
    # C: 변동성
    "order_qty_std3", "order_qty_std6", "order_qty_cv3",
    "order_qty_max3", "order_qty_min3",
    "order_qty_nonzero_3m", "order_qty_nonzero_6m",
    # D: 공급측
    "revenue_qty_lag1", "revenue_qty_ma3",
    "produced_qty_lag1", "produced_qty_ma3",
    "inventory_qty", "inventory_months", "avg_lead_days", "book_to_bill_3m",
    # E: 고객 집중도
    "customer_count_lag1", "customer_count_ma3",
    "top1_customer_pct", "top3_customer_pct", "customer_hhi",
    # F: 가격
    "avg_unit_price", "order_avg_value",
    # G: 반도체 시장
    "sox_index", "sox_roc_3m", "dram_price", "dram_roc_3m",
    "nand_price", "silicon_wafer_price",
    # H: 환율
    "usd_krw", "usd_krw_roc_3m", "jpy_krw", "eur_krw", "cny_krw",
    # I: 거시경제
    "fed_funds_rate", "wti_price", "indpro_index", "ipman_index",
    "kr_base_rate", "kr_ipi_mfg", "kr_bsi_mfg", "cn_pmi_mfg",
    # J: 무역
    "semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc",
    # K: 시간
    "month", "quarter", "is_year_end",
]

# ─── Grid Search 파라미터 그리드 (주간) ───
WEEKLY_PARAM_GRID = {
    "n_estimators":     [200, 300, 500],
    "max_depth":        [4, 6, 8],
    "learning_rate":    [0.03, 0.05, 0.1],
    "num_leaves":       [15, 31, 63],
    "min_child_samples": [10, 20, 30],
}

# ─── Grid Search 파라미터 그리드 (월간) ───
MONTHLY_PARAM_GRID = {
    "n_estimators":     [100, 200, 300],
    "max_depth":        [4, 6, 8],
    "learning_rate":    [0.03, 0.05, 0.1],
    "num_leaves":       [15, 31],
    "min_child_samples": [5, 10, 15],
}

# ─── Walk-Forward CV 설정 ───
WEEKLY_CV_FOLDS = 5
MONTHLY_CV_FOLDS = 3
TUNING_METRIC = "pinball_p50"
TUNE_SAMPLE_PRODUCTS = 50
OPTUNA_N_TRIALS     = 100       # Optuna 탐색 횟수 (클수록 정확, 느림)

# 리스크 가중치
RISK_WEIGHTS = {
    "stockout": 0.35,
    "excess": 0.25,
    "delivery": 0.25,
    "margin": 0.15,
}

# 리스크 등급 상한 경계 (score <= 상한이면 해당 등급)
RISK_GRADE_BOUNDS = [
    ("A", 20),
    ("B", 40),
    ("C", 60),
    ("D", 75),
    ("E", 88),
    ("F", 100),
]


# ─── Phase 4: 생산·발주 최적화 상수 ───
PRODUCTION_PLAN_DAYS = 7            # 주간 생산계획 기간 (일)
PRODUCTION_CAPACITY_BUFFER = 1.2    # 캐파시티 버퍼 (20%)
PRODUCTION_LOOKBACK_DAYS = 90       # 캐파시티 산출 기준 기간 (일)

ORDERING_COST = 50000               # 1회 발주 비용 (원)
HOLDING_RATE = 0.20                 # 연간 재고 보관비율 (단가 대비)
SUPPLIER_WEIGHTS = {
    "lead_time": 0.40,              # 리드타임 짧을수록 우수
    "unit_price": 0.35,             # 단가 낮을수록 우수
    "reliability": 0.25,            # 납기 준수율 높을수록 우수
}

# ─── 구간별 모델 선택 (Segment-based Model Selection) ───
SEGMENT_MODEL_ID = "segment_best_v1"      # 선택 결과 model_id

# 수요 구간 경계 (일평균 수주량 기준)
SEGMENT_THRESHOLDS = {
    "low": 10,      # < 10 → 저수요
    "high": 100,    # >= 100 → 고수요  (10~99 → 중수요)
}

# 구간별 최적 모델 매핑
# 주간: 저수요=SVR (±5 정확도 62.6%), 중·고수요=LightGBM (R² 0.27)
# 월간: 저수요=SVR (MAE 최저), 중·고수요=Ridge (R² 0.69)
SEGMENT_MODEL_MAP = {
    "weekly": {
        "low":  "svr_linear_v1",         # ±5 정밀도 우수
        "mid":  "lgbm_q_v3",             # 트렌드 설명력
        "high": "lgbm_q_v3",             # 대규모 변동 추적
    },
    "monthly": {
        "low":  "svr_linear_monthly_v1", # MAE 최저
        "mid":  "ridge_monthly_v1",      # R² 최고 (0.69)
        "high": "ridge_monthly_v1",      # 안정적 예측
    },
}

SEGMENT_DEMAND_LOOKBACK_DAYS = 90         # 수요 구간 판정 기준 기간 (일)


def get_risk_grade(score: float) -> str:
    for grade, upper in RISK_GRADE_BOUNDS:
        if score <= upper:
            return grade
    return "F"


def upsert_batch(table: str, rows: list, batch_size: int = BATCH_SIZE,
                  on_conflict: str | None = None) -> int:
    """배치 UPSERT (ON CONFLICT 활용) — 재시도 포함"""
    import time

    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        for attempt in range(MAX_RETRIES):
            try:
                q = supabase.table(table)
                if on_conflict:
                    q.upsert(batch, on_conflict=on_conflict).execute()
                else:
                    q.upsert(batch).execute()
                total += len(batch)
                break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep((attempt + 1) * 3)
                else:
                    raise
        time.sleep(BATCH_DELAY)
    return total
