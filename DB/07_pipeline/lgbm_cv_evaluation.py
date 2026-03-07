#!/usr/bin/env python
"""
LightGBM 5-Fold Cross Validation & Ensemble 평가 리포트
==========================================================
Supabase feature_store_weekly 데이터 기반
- Train-Test Split (시간 기반 80/20)
- Train 내 5-Fold Time-Series Cross Validation
- 5개 모델 앙상블 → Test 평가
- MSE, MAE, R², RMSE, MAPE 지표
- Feature Importance 분석
- 에러 케이스 심층 분석
- Interactive HTML 대시보드 생성

실행: python DB/07_pipeline/lgbm_cv_evaluation.py
출력: DB/07_pipeline/lgbm_evaluation_report.html
"""

import io
import json
import os
import sys
import warnings
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
warnings.filterwarnings("ignore")

import numpy as np
import pandas as pd

# ─── 프로젝트 루트 & .env 로드 ───
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from supabase import Client, create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ─── 학습 설정 ───
TARGET_COL = "target_1w"          # 1주 후 수요예측
TARGET_LABEL = "1주 후 수주량"
N_FOLDS = 5
TRAIN_RATIO = 0.8
EARLY_STOPPING_ROUNDS = 50
HIGH_ERROR_PERCENTILE = 80        # 상위 20%를 고에러 그룹으로 분류

FEATURE_COLS = [
    "order_qty_lag1", "order_qty_lag2", "order_qty_lag4",
    "order_qty_lag8", "order_qty_lag13", "order_qty_lag26", "order_qty_lag52",
    "order_qty_ma4", "order_qty_ma13", "order_qty_ma26",
    "order_count_lag1", "order_count_ma4", "order_amount_lag1",
    "order_qty_roc_4w", "order_qty_roc_13w",
    "order_qty_diff_1w", "order_qty_diff_4w",
    "order_qty_std4", "order_qty_std13", "order_qty_cv4",
    "order_qty_max4", "order_qty_min4",
    "order_qty_nonzero_4w", "order_qty_nonzero_13w",
    "revenue_qty_lag1", "revenue_qty_ma4",
    "produced_qty_lag1", "produced_qty_ma4",
    "inventory_qty", "inventory_weeks", "avg_lead_days", "book_to_bill_4w",
    "customer_count_lag1", "customer_count_ma4",
    "top1_customer_pct", "top3_customer_pct", "customer_hhi",
    "avg_unit_price", "order_avg_value",
    "sox_index", "sox_roc_4w", "dram_price", "dram_roc_4w",
    "nand_price", "silicon_wafer_price", "baltic_dry_index", "copper_lme",
    "usd_krw", "usd_krw_roc_4w", "jpy_krw", "eur_krw", "cny_krw",
    "fed_funds_rate", "wti_price", "indpro_index", "ipman_index",
    "kr_base_rate", "kr_ipi_mfg", "kr_bsi_mfg", "cn_pmi_mfg",
    "semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc",
    "week_num", "month", "quarter", "is_holiday_week", "is_year_end",
]

# LightGBM 하이퍼파라미터 (과적합 방지용 정규화 포함)
LGB_PARAMS = {
    "objective": "regression",
    "metric": "mse",
    "n_estimators": 1000,       # 높게 설정, early stopping으로 자동 결정
    "max_depth": 6,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_child_samples": 20,
    "colsample_bytree": 0.8,    # 컬럼 랜덤 샘플링 (과적합 방지)
    "subsample": 0.8,           # 행 랜덤 샘플링 (과적합 방지)
    "subsample_freq": 1,
    "reg_alpha": 0.1,           # L1 정규화
    "reg_lambda": 1.0,          # L2 정규화
    "verbose": -1,
    "n_jobs": -1,
}

# 피처 카테고리 (한글 설명용)
FEATURE_CATEGORIES = {
    "수주 이력(Lag)": ["order_qty_lag1", "order_qty_lag2", "order_qty_lag4",
                       "order_qty_lag8", "order_qty_lag13", "order_qty_lag26", "order_qty_lag52",
                       "order_qty_ma4", "order_qty_ma13", "order_qty_ma26",
                       "order_count_lag1", "order_count_ma4", "order_amount_lag1"],
    "모멘텀": ["order_qty_roc_4w", "order_qty_roc_13w",
               "order_qty_diff_1w", "order_qty_diff_4w"],
    "변동성": ["order_qty_std4", "order_qty_std13", "order_qty_cv4",
               "order_qty_max4", "order_qty_min4",
               "order_qty_nonzero_4w", "order_qty_nonzero_13w"],
    "공급측": ["revenue_qty_lag1", "revenue_qty_ma4",
               "produced_qty_lag1", "produced_qty_ma4",
               "inventory_qty", "inventory_weeks", "avg_lead_days", "book_to_bill_4w"],
    "고객 집중도": ["customer_count_lag1", "customer_count_ma4",
                    "top1_customer_pct", "top3_customer_pct", "customer_hhi"],
    "가격": ["avg_unit_price", "order_avg_value"],
    "반도체 시장": ["sox_index", "sox_roc_4w", "dram_price", "dram_roc_4w",
                    "nand_price", "silicon_wafer_price", "baltic_dry_index", "copper_lme"],
    "환율": ["usd_krw", "usd_krw_roc_4w", "jpy_krw", "eur_krw", "cny_krw"],
    "거시경제": ["fed_funds_rate", "wti_price", "indpro_index", "ipman_index",
                 "kr_base_rate", "kr_ipi_mfg", "kr_bsi_mfg", "cn_pmi_mfg"],
    "무역": ["semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc"],
    "시간": ["week_num", "month", "quarter", "is_holiday_week", "is_year_end"],
}

FEATURE_NAME_KR = {
    "order_qty_lag1": "1주전 수주량", "order_qty_lag2": "2주전 수주량",
    "order_qty_lag4": "4주전 수주량", "order_qty_lag8": "8주전 수주량",
    "order_qty_lag13": "13주전 수주량", "order_qty_lag26": "26주전 수주량",
    "order_qty_lag52": "52주전 수주량",
    "order_qty_ma4": "4주 이동평균", "order_qty_ma13": "13주 이동평균",
    "order_qty_ma26": "26주 이동평균",
    "order_count_lag1": "1주전 수주건수", "order_count_ma4": "4주 수주건수 이동평균",
    "order_amount_lag1": "1주전 수주금액",
    "order_qty_roc_4w": "4주 변화율", "order_qty_roc_13w": "13주 변화율",
    "order_qty_diff_1w": "1주 차분", "order_qty_diff_4w": "4주 차분",
    "order_qty_std4": "4주 표준편차", "order_qty_std13": "13주 표준편차",
    "order_qty_cv4": "4주 변동계수",
    "order_qty_max4": "4주 최대", "order_qty_min4": "4주 최소",
    "order_qty_nonzero_4w": "4주내 수주발생 횟수", "order_qty_nonzero_13w": "13주내 수주발생 횟수",
    "revenue_qty_lag1": "1주전 매출량", "revenue_qty_ma4": "4주 매출 이동평균",
    "produced_qty_lag1": "1주전 생산량", "produced_qty_ma4": "4주 생산 이동평균",
    "inventory_qty": "재고량", "inventory_weeks": "재고 주수",
    "avg_lead_days": "평균 리드타임(일)", "book_to_bill_4w": "수주/출하 비율(4주)",
    "customer_count_lag1": "1주전 고객수", "customer_count_ma4": "4주 고객수 이동평균",
    "top1_customer_pct": "상위1 고객 비중", "top3_customer_pct": "상위3 고객 비중",
    "customer_hhi": "고객 집중도(HHI)",
    "avg_unit_price": "평균 단가", "order_avg_value": "건당 수주금액",
    "sox_index": "SOX 반도체지수", "sox_roc_4w": "SOX 4주 변화율",
    "dram_price": "DRAM 가격", "dram_roc_4w": "DRAM 4주 변화율",
    "nand_price": "NAND 가격", "silicon_wafer_price": "실리콘웨이퍼 가격",
    "baltic_dry_index": "발틱운임지수", "copper_lme": "구리 LME가격",
    "usd_krw": "USD/KRW 환율", "usd_krw_roc_4w": "환율 4주 변화율",
    "jpy_krw": "JPY/KRW", "eur_krw": "EUR/KRW", "cny_krw": "CNY/KRW",
    "fed_funds_rate": "미 기준금리", "wti_price": "WTI 유가",
    "indpro_index": "미 산업생산지수", "ipman_index": "미 제조업지수",
    "kr_base_rate": "한국 기준금리", "kr_ipi_mfg": "한국 제조업생산지수",
    "kr_bsi_mfg": "한국 BSI", "cn_pmi_mfg": "중국 PMI",
    "semi_export_amt": "반도체 수출액", "semi_import_amt": "반도체 수입액",
    "semi_trade_balance": "반도체 무역수지", "semi_export_roc": "수출 변화율",
    "week_num": "주차", "month": "월", "quarter": "분기",
    "is_holiday_week": "공휴일 주", "is_year_end": "연말 여부",
}


# ═══════════════════════════════════════════════════
# 1. 데이터 로드
# ═══════════════════════════════════════════════════

def fetch_all(table: str, select: str = "*") -> list:
    """Supabase 테이블 전체 로드 (페이지네이션)"""
    all_rows, offset, ps = [], 0, 1000
    while True:
        resp = supabase.table(table).select(select).range(offset, offset + ps - 1).execute()
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < ps:
            break
        offset += ps
    return all_rows


def load_data() -> pd.DataFrame:
    """feature_store_weekly 로드 및 전처리"""
    print("[1/6] 데이터 로드 중...")
    rows = fetch_all("feature_store_weekly")
    if not rows:
        print("  ERROR: feature_store_weekly 비어있음. s3 먼저 실행 필요")
        sys.exit(1)

    df = pd.DataFrame(rows)
    df = df.sort_values(["year_week", "product_id"]).reset_index(drop=True)

    # 사용 가능한 피처만 필터
    available = [c for c in FEATURE_COLS if c in df.columns]
    print(f"  전체: {len(df):,}행 | 피처: {len(available)}/{len(FEATURE_COLS)}개")

    # 수치형 변환
    for col in available + [TARGET_COL]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # target이 있는 행만 사용
    before = len(df)
    df = df.dropna(subset=[TARGET_COL])
    print(f"  target({TARGET_COL}) 유효: {len(df):,}행 (제거: {before - len(df):,}행)")

    return df, available


# ═══════════════════════════════════════════════════
# 2. Train-Test 분할 (시간 기반)
# ═══════════════════════════════════════════════════

def split_train_test(df, feature_cols):
    """시간 기반 80/20 분할"""
    print("\n[2/6] Train-Test 분할 (시간 기반)...")

    weeks = sorted(df["year_week"].unique())
    split_idx = int(len(weeks) * TRAIN_RATIO)
    train_weeks = set(weeks[:split_idx])
    test_weeks = set(weeks[split_idx:])

    train_df = df[df["year_week"].isin(train_weeks)].copy()
    test_df = df[df["year_week"].isin(test_weeks)].copy()

    X_train = train_df[feature_cols].fillna(0)
    y_train = train_df[TARGET_COL].values
    X_test = test_df[feature_cols].fillna(0)
    y_test = test_df[TARGET_COL].values

    print(f"  Train: {len(train_df):,}행 | {weeks[0]} ~ {weeks[split_idx-1]}")
    print(f"  Test : {len(test_df):,}행 | {weeks[split_idx]} ~ {weeks[-1]}")
    print(f"  Train 기간: {len(train_weeks)}주 | Test 기간: {len(test_weeks)}주")

    meta = {
        "n_train": len(train_df), "n_test": len(test_df),
        "n_features": len(feature_cols),
        "train_period": f"{weeks[0]} ~ {weeks[split_idx-1]}",
        "test_period": f"{weeks[split_idx]} ~ {weeks[-1]}",
        "n_train_weeks": len(train_weeks), "n_test_weeks": len(test_weeks),
        "n_products": int(df["product_id"].nunique()),
    }

    return X_train, y_train, X_test, y_test, train_df, test_df, meta


# ═══════════════════════════════════════════════════
# 3. 5-Fold CV + 모델 학습
# ═══════════════════════════════════════════════════

def train_cv_models(X_train, y_train):
    """5-Fold Time-Series CV → 5개 모델 반환"""
    import lightgbm as lgb
    from sklearn.model_selection import TimeSeriesSplit

    print(f"\n[3/6] 5-Fold Time-Series CV 학습 (과적합 모니터링)...")

    tscv = TimeSeriesSplit(n_splits=N_FOLDS)
    models = []
    fold_metrics = []
    learning_curves = []
    importance_gain_acc = np.zeros(X_train.shape[1])
    importance_split_acc = np.zeros(X_train.shape[1])

    for fold, (tr_idx, val_idx) in enumerate(tscv.split(X_train)):
        X_tr = X_train.iloc[tr_idx]
        y_tr = y_train[tr_idx]
        X_val = X_train.iloc[val_idx]
        y_val = y_train[val_idx]

        print(f"\n  Fold {fold+1}/{N_FOLDS}: train={len(tr_idx):,} | val={len(val_idx):,}")

        evals_result = {}
        model = lgb.LGBMRegressor(**LGB_PARAMS)
        model.fit(
            X_tr, y_tr,
            eval_set=[(X_tr, y_tr), (X_val, y_val)],
            eval_names=["train", "validation"],
            callbacks=[
                lgb.early_stopping(EARLY_STOPPING_ROUNDS, verbose=False),
                lgb.record_evaluation(evals_result),
                lgb.log_evaluation(period=0),
            ],
        )

        # 학습 곡선 저장
        train_loss = evals_result["train"]["l2"]
        val_loss = evals_result["validation"]["l2"]
        learning_curves.append({
            "fold": fold + 1,
            "train_loss": train_loss,
            "val_loss": val_loss,
            "best_iteration": model.best_iteration_,
        })

        # Train/Val 메트릭 계산
        pred_tr = np.maximum(model.predict(X_tr), 0)
        pred_val = np.maximum(model.predict(X_val), 0)

        from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
        fm = {
            "fold": fold + 1,
            "n_train": len(tr_idx), "n_val": len(val_idx),
            "best_iteration": model.best_iteration_,
            "train_mse": mean_squared_error(y_tr, pred_tr),
            "val_mse": mean_squared_error(y_val, pred_val),
            "train_mae": mean_absolute_error(y_tr, pred_tr),
            "val_mae": mean_absolute_error(y_val, pred_val),
            "train_r2": r2_score(y_tr, pred_tr),
            "val_r2": r2_score(y_val, pred_val),
        }

        # MAPE (0 제외)
        nz_tr = y_tr != 0
        nz_val = y_val != 0
        fm["train_mape"] = float(np.mean(np.abs((y_tr[nz_tr] - pred_tr[nz_tr]) / y_tr[nz_tr])) * 100) if nz_tr.sum() > 0 else None
        fm["val_mape"] = float(np.mean(np.abs((y_val[nz_val] - pred_val[nz_val]) / y_val[nz_val])) * 100) if nz_val.sum() > 0 else None

        # 과적합 지표: train - val 갭
        fm["overfit_gap_mse"] = fm["train_mse"] - fm["val_mse"]
        fm["overfit_gap_r2"] = fm["train_r2"] - fm["val_r2"]

        fold_metrics.append(fm)
        models.append(model)

        # Feature importance 누적
        importance_gain_acc += model.booster_.feature_importance(importance_type="gain")
        importance_split_acc += model.booster_.feature_importance(importance_type="split")

        print(f"    Train MSE={fm['train_mse']:.2f} | Val MSE={fm['val_mse']:.2f}")
        print(f"    Train R²={fm['train_r2']:.4f} | Val R²={fm['val_r2']:.4f}")
        print(f"    Best iteration: {fm['best_iteration']} | R² gap: {fm['overfit_gap_r2']:.4f}")

    # 피처 중요도 평균
    avg_gain = importance_gain_acc / N_FOLDS
    avg_split = importance_split_acc / N_FOLDS

    feature_importance = {
        "names": list(X_train.columns),
        "gain": avg_gain.tolist(),
        "split": avg_split.tolist(),
    }

    return models, fold_metrics, learning_curves, feature_importance


# ═══════════════════════════════════════════════════
# 4. 앙상블 평가
# ═══════════════════════════════════════════════════

def ensemble_evaluate(models, X_test, y_test):
    """5개 모델 앙상블(평균) → Test 평가"""
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

    print(f"\n[4/6] 앙상블 평가 (Test set: {len(y_test):,}행)...")

    # 각 모델의 예측값
    individual_preds = []
    for i, model in enumerate(models):
        pred = np.maximum(model.predict(X_test), 0)
        individual_preds.append(pred)

    # 앙상블: 5개 모델 평균
    ensemble_pred = np.mean(individual_preds, axis=0)

    # 앙상블 메트릭
    ensemble_metrics = {
        "mse": float(mean_squared_error(y_test, ensemble_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_test, ensemble_pred))),
        "mae": float(mean_absolute_error(y_test, ensemble_pred)),
        "r2": float(r2_score(y_test, ensemble_pred)),
    }

    # MAPE (0 제외)
    nz = y_test != 0
    if nz.sum() > 0:
        ensemble_metrics["mape"] = float(
            np.mean(np.abs((y_test[nz] - ensemble_pred[nz]) / y_test[nz])) * 100
        )
    else:
        ensemble_metrics["mape"] = None

    # 개별 모델 vs 앙상블 비교
    individual_metrics = []
    for i, pred in enumerate(individual_preds):
        m = {
            "model": f"Fold {i+1}",
            "mse": float(mean_squared_error(y_test, pred)),
            "mae": float(mean_absolute_error(y_test, pred)),
            "r2": float(r2_score(y_test, pred)),
        }
        individual_metrics.append(m)

    print(f"  앙상블 MSE:  {ensemble_metrics['mse']:.2f}")
    print(f"  앙상블 RMSE: {ensemble_metrics['rmse']:.2f}")
    print(f"  앙상블 MAE:  {ensemble_metrics['mae']:.2f}")
    print(f"  앙상블 R²:   {ensemble_metrics['r2']:.4f}")
    if ensemble_metrics["mape"] is not None:
        print(f"  앙상블 MAPE: {ensemble_metrics['mape']:.1f}%")

    return ensemble_pred, ensemble_metrics, individual_preds, individual_metrics


# ═══════════════════════════════════════════════════
# 5. 에러 케이스 심층 분석
# ═══════════════════════════════════════════════════

def analyze_errors(test_df, y_test, ensemble_pred, feature_cols):
    """에러가 높은 케이스 특성 분석"""
    print(f"\n[5/6] 에러 케이스 심층 분석...")

    abs_errors = np.abs(y_test - ensemble_pred)
    pct_errors = np.where(y_test != 0, np.abs((y_test - ensemble_pred) / y_test) * 100, 0)
    residuals = y_test - ensemble_pred

    # 고에러 경계값
    error_threshold = np.percentile(abs_errors, HIGH_ERROR_PERCENTILE)
    high_error_mask = abs_errors >= error_threshold
    low_error_mask = ~high_error_mask

    print(f"  고에러 경계 (상위 {100-HIGH_ERROR_PERCENTILE}%): abs_error >= {error_threshold:.2f}")
    print(f"  고에러 샘플: {high_error_mask.sum():,}개 | 저에러: {low_error_mask.sum():,}개")

    # ── 5-1. 에러 통계 ──
    error_stats = {
        "mean": float(np.mean(abs_errors)),
        "median": float(np.median(abs_errors)),
        "std": float(np.std(abs_errors)),
        "p25": float(np.percentile(abs_errors, 25)),
        "p50": float(np.percentile(abs_errors, 50)),
        "p75": float(np.percentile(abs_errors, 75)),
        "p90": float(np.percentile(abs_errors, 90)),
        "p95": float(np.percentile(abs_errors, 95)),
        "p99": float(np.percentile(abs_errors, 99)),
        "threshold": float(error_threshold),
    }

    # ── 5-2. 피처별 고에러 vs 저에러 비교 ──
    X_test_arr = test_df[feature_cols].fillna(0).values
    feature_comparison = []
    for i, col in enumerate(feature_cols):
        vals = X_test_arr[:, i]
        high_vals = vals[high_error_mask]
        low_vals = vals[low_error_mask]

        high_mean = float(np.mean(high_vals)) if len(high_vals) > 0 else 0
        low_mean = float(np.mean(low_vals)) if len(low_vals) > 0 else 0
        high_std = float(np.std(high_vals)) if len(high_vals) > 0 else 0
        low_std = float(np.std(low_vals)) if len(low_vals) > 0 else 0

        # Cohen's d (효과 크기)
        pooled_std = np.sqrt(
            ((len(high_vals)-1)*high_std**2 + (len(low_vals)-1)*low_std**2)
            / max(len(high_vals) + len(low_vals) - 2, 1)
        )
        cohens_d = (high_mean - low_mean) / pooled_std if pooled_std > 0 else 0

        feature_comparison.append({
            "feature": col,
            "feature_kr": FEATURE_NAME_KR.get(col, col),
            "high_error_mean": high_mean,
            "low_error_mean": low_mean,
            "diff_pct": ((high_mean - low_mean) / abs(low_mean) * 100) if abs(low_mean) > 1e-6 else 0,
            "cohens_d": float(cohens_d),
            "abs_cohens_d": float(abs(cohens_d)),
        })

    feature_comparison.sort(key=lambda x: x["abs_cohens_d"], reverse=True)

    # ── 5-3. 제품별 에러 분석 ──
    product_ids = test_df["product_id"].values
    product_error_df = pd.DataFrame({
        "product_id": product_ids,
        "abs_error": abs_errors,
        "actual": y_test,
        "predicted": ensemble_pred,
    })
    product_errors = (
        product_error_df.groupby("product_id")
        .agg(
            mean_error=("abs_error", "mean"),
            max_error=("abs_error", "max"),
            count=("abs_error", "count"),
            mean_actual=("actual", "mean"),
        )
        .sort_values("mean_error", ascending=False)
        .head(20)
        .reset_index()
    )
    product_errors_list = product_errors.to_dict("records")
    for r in product_errors_list:
        for k, v in r.items():
            if isinstance(v, (np.integer, np.int64)):
                r[k] = int(v)
            elif isinstance(v, (np.floating, np.float64)):
                r[k] = float(v)

    # ── 5-4. 시간대별 에러 ──
    year_weeks = test_df["year_week"].values
    time_error_df = pd.DataFrame({
        "year_week": year_weeks,
        "abs_error": abs_errors,
    })
    time_errors = (
        time_error_df.groupby("year_week")
        .agg(mean_error=("abs_error", "mean"), count=("abs_error", "count"))
        .reset_index()
        .sort_values("year_week")
    )
    time_errors_list = time_errors.to_dict("records")
    for r in time_errors_list:
        for k, v in r.items():
            if isinstance(v, (np.integer, np.int64)):
                r[k] = int(v)
            elif isinstance(v, (np.floating, np.float64)):
                r[k] = float(v)

    # ── 5-5. Worst 20 케이스 ──
    worst_idx = np.argsort(-abs_errors)[:20]
    worst_cases = []
    for idx in worst_idx:
        case = {
            "rank": len(worst_cases) + 1,
            "product_id": str(product_ids[idx]),
            "year_week": str(year_weeks[idx]),
            "actual": round(float(y_test[idx]), 2),
            "predicted": round(float(ensemble_pred[idx]), 2),
            "abs_error": round(float(abs_errors[idx]), 2),
            "pct_error": round(float(pct_errors[idx]), 1) if y_test[idx] != 0 else None,
        }
        worst_cases.append(case)

    # ── 5-6. 에러 패턴 분석 → 개선 제안 생성 ──
    recommendations = generate_recommendations(
        ensemble_pred, y_test, abs_errors, feature_comparison,
        product_errors, fold_metrics=None
    )

    print(f"  피처별 효과크기 TOP 5:")
    for fc in feature_comparison[:5]:
        print(f"    {fc['feature_kr']:20s} Cohen's d={fc['cohens_d']:+.3f}")

    return {
        "error_stats": error_stats,
        "feature_comparison": feature_comparison[:30],  # 상위 30개
        "product_errors": product_errors_list,
        "time_errors": time_errors_list,
        "worst_cases": worst_cases,
        "abs_errors": abs_errors.tolist(),
        "residuals": residuals.tolist(),
        "pct_errors": pct_errors.tolist(),
        "recommendations": recommendations,
        "high_error_count": int(high_error_mask.sum()),
        "low_error_count": int(low_error_mask.sum()),
    }


def generate_recommendations(pred, actual, abs_errors, feature_comp, product_errs, fold_metrics):
    """에러 분석 기반 개선 제안 생성"""
    recs = []

    # 1. 대규모 수주 예측 실패 체크
    large_actual = actual > np.percentile(actual[actual > 0], 90) if (actual > 0).sum() > 10 else np.zeros(len(actual), dtype=bool)
    if large_actual.sum() > 0:
        large_err = np.mean(abs_errors[large_actual])
        small_err = np.mean(abs_errors[~large_actual])
        if large_err > small_err * 2:
            recs.append({
                "category": "데이터",
                "priority": "높음",
                "title": "대규모 수주 예측 정확도 개선 필요",
                "detail": f"상위 10% 대량 수주의 평균 에러({large_err:.0f})가 일반 수주({small_err:.0f})의 {large_err/small_err:.1f}배입니다. "
                          f"대량 수주 이벤트를 별도로 학습하거나, 로그 변환(log transform)을 적용하면 개선됩니다.",
                "action": "target 변수에 log1p 변환 적용 → 예측 후 expm1로 역변환"
            })

    # 2. 제로 수주 예측 체크
    zero_mask = actual == 0
    if zero_mask.sum() > 0:
        zero_pct = zero_mask.sum() / len(actual) * 100
        zero_pred_mean = np.mean(pred[zero_mask])
        if zero_pred_mean > 1:
            recs.append({
                "category": "모델",
                "priority": "중간",
                "title": "제로 수주 구간 오예측 패턴",
                "detail": f"실제 수주가 0인 데이터({zero_pct:.1f}%)에서 평균 {zero_pred_mean:.1f}로 예측합니다. "
                          f"분류 모델(수주 유무)을 먼저 적용 후 회귀 예측하는 2-Stage 방식을 고려하세요.",
                "action": "2-Stage 모델: 1단계 분류(수주 유무) → 2단계 회귀(수주량)"
            })

    # 3. 피처 기반 제안
    if feature_comp:
        top_feat = feature_comp[0]
        if abs(top_feat["cohens_d"]) > 0.5:
            direction = "높을" if top_feat["cohens_d"] > 0 else "낮을"
            recs.append({
                "category": "피처",
                "priority": "높음",
                "title": f"'{top_feat['feature_kr']}' 값이 {direction} 때 에러 집중",
                "detail": f"이 피처의 Cohen's d = {top_feat['cohens_d']:+.3f}으로 고에러 그룹과 저에러 그룹 간 "
                          f"가장 큰 차이를 보입니다. 이 변수의 극단값 처리나 추가 파생 피처가 필요합니다.",
                "action": f"'{top_feat['feature']}' 기반 구간별 피처 엔지니어링 (binning, 상호작용 피처)"
            })

    # 4. 제품 집중도 체크
    if len(product_errs) > 0:
        worst_product_err = product_errs.iloc[0]["mean_error"] if hasattr(product_errs, 'iloc') else product_errs[0]["mean_error"]
        median_err = float(np.median(abs_errors))
        if worst_product_err > median_err * 5:
            recs.append({
                "category": "데이터",
                "priority": "중간",
                "title": "특정 제품에서 에러가 극단적으로 높음",
                "detail": f"최악의 제품 평균 에러({worst_product_err:.0f})가 전체 중앙값({median_err:.0f})의 "
                          f"{worst_product_err/median_err:.0f}배입니다. 해당 제품을 별도 모델로 분리하거나 이상치 처리가 필요합니다.",
                "action": "고에러 상위 제품 별도 모델 학습 또는 이상치 필터링"
            })

    # 5. 과적합 체크 (fold_metrics가 있을 경우)
    recs.append({
        "category": "모델",
        "priority": "낮음",
        "title": "교차검증 Fold별 성능 편차 모니터링",
        "detail": "각 Fold의 Train-Val 성능 격차가 클수록 과적합 위험이 높습니다. "
                  "R² 격차가 0.1 이상이면 정규화를 강화하세요.",
        "action": "reg_alpha, reg_lambda 증가 또는 max_depth 감소"
    })

    # 6. 변동성 피처 제안
    recs.append({
        "category": "피처",
        "priority": "중간",
        "title": "추가 피처 엔지니어링 제안",
        "detail": "현재 70개 피처 중 수주 이력 Lag 피처가 가장 중요합니다. "
                  "추가로 제품 카테고리 인코딩, 계절성 강화 피처(sin/cos 변환), "
                  "고객별 수주 패턴 피처를 추가하면 성능이 향상될 수 있습니다.",
        "action": "제품 카테고리 Label Encoding, 월/주 sin/cos 변환 피처 추가"
    })

    return recs


# ═══════════════════════════════════════════════════
# 6. Interactive HTML 대시보드 생성
# ═══════════════════════════════════════════════════

def generate_html(meta, fold_metrics, learning_curves, ensemble_metrics,
                  individual_metrics, feature_importance, error_analysis,
                  y_test, ensemble_pred, test_df):
    """Interactive HTML 대시보드 생성"""
    print(f"\n[6/6] HTML 대시보드 생성 중...")

    # 데이터 샘플링 (시각화 성능을 위해 최대 5000개)
    n_total = len(y_test)
    if n_total > 5000:
        sample_idx = np.random.choice(n_total, 5000, replace=False)
        sample_idx.sort()
    else:
        sample_idx = np.arange(n_total)

    actual_sample = y_test[sample_idx].tolist()
    pred_sample = ensemble_pred[sample_idx].tolist()
    residual_sample = (y_test[sample_idx] - ensemble_pred[sample_idx]).tolist()

    # Learning curves 데이터 (매 5 iteration 샘플링)
    lc_data = []
    for lc in learning_curves:
        step = max(1, len(lc["train_loss"]) // 200)
        lc_data.append({
            "fold": lc["fold"],
            "train_loss": lc["train_loss"][::step],
            "val_loss": lc["val_loss"][::step],
            "best_iteration": lc["best_iteration"],
            "iterations": list(range(0, len(lc["train_loss"]), step)),
        })

    # Feature importance 정렬 (gain 기준 top 25)
    fi_sorted_idx = np.argsort(feature_importance["gain"])[::-1][:25]
    fi_names = [feature_importance["names"][i] for i in fi_sorted_idx]
    fi_names_kr = [FEATURE_NAME_KR.get(n, n) for n in fi_names]
    fi_gain = [feature_importance["gain"][i] for i in fi_sorted_idx]
    fi_split = [feature_importance["split"][i] for i in fi_sorted_idx]

    # 카테고리별 중요도 합산
    cat_importance = {}
    for cat_name, cat_features in FEATURE_CATEGORIES.items():
        total_gain = 0
        for feat in cat_features:
            if feat in feature_importance["names"]:
                idx = feature_importance["names"].index(feat)
                total_gain += feature_importance["gain"][idx]
        cat_importance[cat_name] = total_gain
    cat_sorted = sorted(cat_importance.items(), key=lambda x: x[1], reverse=True)

    # JSON 직렬화 준비
    dashboard_data = {
        "meta": meta,
        "ensemble": ensemble_metrics,
        "folds": fold_metrics,
        "individual": individual_metrics,
        "lc": lc_data,
        "fi_names": fi_names,
        "fi_names_kr": fi_names_kr,
        "fi_gain": fi_gain,
        "fi_split": fi_split,
        "cat_names": [c[0] for c in cat_sorted],
        "cat_values": [round(c[1], 1) for c in cat_sorted],
        "actual": actual_sample,
        "predicted": pred_sample,
        "residuals": residual_sample,
        "error_analysis": error_analysis,
        "params": {k: v for k, v in LGB_PARAMS.items() if k != "verbose"},
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }

    # nan/inf를 None으로 변환
    data_json = json.dumps(dashboard_data, ensure_ascii=False, default=str)
    data_json = data_json.replace("NaN", "null").replace("Infinity", "null")

    html = _build_html(data_json)

    output_path = Path(__file__).parent / "lgbm_evaluation_report.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"  대시보드 저장: {output_path}")
    return str(output_path)


def _build_html(data_json: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LightGBM 수요예측 모델 평가 대시보드</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
:root {{
  --bg: #f0f4f8; --card: #ffffff; --primary: #2563eb; --primary-light: #dbeafe;
  --text: #1e293b; --text-light: #64748b; --border: #e2e8f0;
  --green: #10b981; --red: #ef4444; --orange: #f59e0b; --purple: #8b5cf6;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Segoe UI', -apple-system, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }}
.header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 28px 32px; }}
.header h1 {{ font-size: 24px; font-weight: 700; margin-bottom: 4px; }}
.header .subtitle {{ font-size: 14px; opacity: 0.85; }}
.kpi-row {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; padding: 20px 32px; margin-top: -24px; }}
.kpi-card {{ background: var(--card); border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); text-align: center; }}
.kpi-card .label {{ font-size: 13px; color: var(--text-light); margin-bottom: 6px; }}
.kpi-card .value {{ font-size: 28px; font-weight: 700; }}
.kpi-card .desc {{ font-size: 11px; color: var(--text-light); margin-top: 4px; }}
.kpi-good {{ color: var(--green); }}
.kpi-warn {{ color: var(--orange); }}
.kpi-bad {{ color: var(--red); }}
.tabs {{ display: flex; gap: 2px; padding: 0 32px; background: var(--card); border-bottom: 1px solid var(--border); overflow-x: auto; }}
.tab {{ padding: 14px 20px; cursor: pointer; font-size: 14px; font-weight: 500; color: var(--text-light); border-bottom: 3px solid transparent; white-space: nowrap; transition: all 0.2s; }}
.tab:hover {{ color: var(--primary); background: var(--primary-light); }}
.tab.active {{ color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }}
.content {{ padding: 24px 32px; max-width: 1400px; margin: 0 auto; }}
.section {{ display: none; }}
.section.active {{ display: block; }}
.card {{ background: var(--card); border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }}
.card h3 {{ font-size: 16px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }}
.card .explain {{ background: #f0f9ff; border-left: 4px solid var(--primary); padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 16px; font-size: 13px; color: #1e40af; }}
table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
th {{ background: #f8fafc; padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border); }}
td {{ padding: 10px 12px; border-bottom: 1px solid var(--border); }}
tr:hover {{ background: #f8fafc; }}
.chart-container {{ width: 100%; min-height: 400px; }}
.two-col {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
.badge {{ display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }}
.badge-high {{ background: #fee2e2; color: #dc2626; }}
.badge-mid {{ background: #fef3c7; color: #d97706; }}
.badge-low {{ background: #dcfce7; color: #16a34a; }}
.rec-card {{ border-left: 4px solid var(--primary); padding: 16px; margin-bottom: 12px; background: #fafbfc; border-radius: 0 8px 8px 0; }}
.rec-card h4 {{ font-size: 14px; margin-bottom: 6px; }}
.rec-card .action {{ background: #ecfdf5; padding: 8px 12px; border-radius: 6px; margin-top: 8px; font-size: 12px; font-family: 'Consolas', monospace; }}
.metric-good {{ color: var(--green); font-weight: 600; }}
.metric-bad {{ color: var(--red); font-weight: 600; }}
@media (max-width: 768px) {{
  .kpi-row {{ grid-template-columns: repeat(2, 1fr); padding: 16px; }}
  .two-col {{ grid-template-columns: 1fr; }}
  .content {{ padding: 16px; }}
  .tabs {{ padding: 0 16px; }}
}}
</style>
</head>
<body>

<div class="header">
  <h1>LightGBM 수요예측 모델 평가 대시보드</h1>
  <div class="subtitle" id="header-subtitle">로딩 중...</div>
</div>

<div class="kpi-row" id="kpi-row"></div>

<div class="tabs" id="tabs">
  <div class="tab active" data-tab="overview">종합 성능</div>
  <div class="tab" data-tab="overfit">과적합 모니터링</div>
  <div class="tab" data-tab="predict">예측 분석</div>
  <div class="tab" data-tab="feature">변수 중요도</div>
  <div class="tab" data-tab="error">에러 케이스 분석</div>
  <div class="tab" data-tab="recommend">개선 제안</div>
</div>

<div class="content">
  <!-- ═══ Tab 1: 종합 성능 ═══ -->
  <div class="section active" id="sec-overview">
    <div class="card">
      <h3>무엇을 했나요?</h3>
      <div class="explain">
        <strong>쉽게 설명하면:</strong> AI 모델(LightGBM)에게 과거 수주 데이터를 보여주고
        "다음 주에 얼마나 주문이 들어올지 맞춰봐" 하고 시험을 봤습니다.<br><br>
        <strong>Train-Test Split:</strong> 데이터의 앞쪽 80%로 학습하고, 뒤쪽 20%로 시험을 봤습니다.
        미래 데이터로 과거를 맞추는 치트를 방지합니다.<br><br>
        <strong>5-Fold Cross Validation:</strong> 학습 데이터를 5번 나눠서 반복 학습하여
        모델이 안정적인지 확인합니다. 시험을 5번 봐서 평균 성적을 내는 것과 같습니다.<br><br>
        <strong>앙상블:</strong> 5번 학습한 모델 5개의 예측값을 평균내서 최종 답을 냅니다.
        여러 전문가의 의견을 종합하는 것과 같습니다.
      </div>
    </div>

    <div class="card">
      <h3>앙상블 모델 vs 개별 Fold 모델 성능 비교</h3>
      <div class="explain">
        앙상블(5개 모델 평균)이 개별 모델보다 일반적으로 더 안정적이고 좋은 성능을 보입니다.
        R²는 1에 가까울수록, MSE/MAE는 0에 가까울수록 좋습니다.
      </div>
      <div class="chart-container" id="chart-ensemble-compare"></div>
    </div>

    <div class="card">
      <h3>Fold별 학습(Train) vs 검증(Validation) 성능</h3>
      <div class="explain">
        각 Fold에서 학습 데이터로 얼마나 잘 맞추는지(Train)와 새로운 데이터로 얼마나 잘 맞추는지(Val)를
        비교합니다. <strong>둘의 격차가 작을수록 과적합이 적어 좋습니다.</strong>
      </div>
      <table>
        <thead>
          <tr>
            <th>Fold</th><th>학습 데이터 수</th><th>검증 데이터 수</th>
            <th>Train MSE</th><th>Val MSE</th>
            <th>Train R²</th><th>Val R²</th>
            <th>R² 격차</th><th>Early Stop</th>
          </tr>
        </thead>
        <tbody id="fold-table-body"></tbody>
      </table>
    </div>
  </div>

  <!-- ═══ Tab 2: 과적합 모니터링 ═══ -->
  <div class="section" id="sec-overfit">
    <div class="card">
      <h3>과적합(Overfitting)이란?</h3>
      <div class="explain">
        <strong>비유:</strong> 시험 전날 기출문제 답을 외우면 기출은 100점이지만, 새 문제는 못 풀죠.
        AI도 마찬가지입니다.<br><br>
        <strong>학습 곡선(아래 그래프) 읽는 법:</strong><br>
        - <span style="color:#3b82f6">파란색(Train)</span>: 학습 데이터에 대한 에러 (낮을수록 좋음)<br>
        - <span style="color:#ef4444">빨간색(Validation)</span>: 새로운 데이터에 대한 에러 (핵심!)<br>
        - 두 선이 <strong>가까이 붙어서 같이 내려가면</strong> → 건강한 학습<br>
        - 파란선만 계속 내려가고 빨간선이 올라가면 → <strong>과적합!</strong> (Early Stopping으로 방지)<br>
        - 점선은 Early Stopping이 작동한 지점입니다.
      </div>
    </div>
    <div id="lc-charts"></div>

    <div class="card">
      <h3>과적합 요약 판정</h3>
      <div class="explain">
        각 Fold에서 Train과 Validation의 R² 격차를 분석합니다.
        격차가 <strong>0.05 이하</strong>면 양호, <strong>0.05~0.15</strong>면 경미한 과적합,
        <strong>0.15 이상</strong>이면 과적합 주의입니다.
      </div>
      <div id="overfit-summary"></div>
    </div>
  </div>

  <!-- ═══ Tab 3: 예측 분석 ═══ -->
  <div class="section" id="sec-predict">
    <div class="two-col">
      <div class="card">
        <h3>실제 vs 예측 산점도</h3>
        <div class="explain">
          점들이 대각선(빨간 점선) 위에 모이면 예측이 정확합니다.
          대각선에서 멀리 떨어진 점들이 에러가 큰 케이스입니다.
        </div>
        <div class="chart-container" id="chart-scatter"></div>
      </div>
      <div class="card">
        <h3>잔차(에러) 분포</h3>
        <div class="explain">
          잔차 = 실제값 - 예측값. 0을 중심으로 좌우 대칭이면 편향 없이 예측합니다.
          한쪽으로 치우치면 체계적으로 과대/과소 예측하는 것입니다.
        </div>
        <div class="chart-container" id="chart-residual-hist"></div>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <h3>예측값 크기별 잔차</h3>
        <div class="explain">
          예측값이 클 때와 작을 때 에러 패턴이 다른지 확인합니다.
          이상적으로는 예측값 크기에 관계없이 에러가 균등해야 합니다.
        </div>
        <div class="chart-container" id="chart-residual-scatter"></div>
      </div>
      <div class="card">
        <h3>에러 크기 분포 (누적)</h3>
        <div class="explain">
          절대 에러의 분포를 보여줍니다. 빨간 점선은 상위 20% 경계선입니다.
          대부분의 예측이 작은 에러를 가지면 좋은 모델입니다.
        </div>
        <div class="chart-container" id="chart-error-cdf"></div>
      </div>
    </div>
  </div>

  <!-- ═══ Tab 4: 변수 중요도 ═══ -->
  <div class="section" id="sec-feature">
    <div class="card">
      <h3>변수 중요도(Feature Importance)란?</h3>
      <div class="explain">
        AI 모델이 예측할 때 <strong>어떤 정보를 가장 많이 참고했는지</strong> 보여줍니다.<br><br>
        <strong>Gain (정보 이득):</strong> 이 변수로 예측이 얼마나 개선되었는가 (높을수록 핵심 변수)<br>
        <strong>Split (분할 횟수):</strong> 이 변수를 몇 번이나 사용했는가 (높을수록 자주 참조)
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <h3>TOP 25 변수 (Gain 기준)</h3>
        <div class="chart-container" id="chart-fi-gain"></div>
      </div>
      <div class="card">
        <h3>TOP 25 변수 (Split 기준)</h3>
        <div class="chart-container" id="chart-fi-split"></div>
      </div>
    </div>
    <div class="card">
      <h3>카테고리별 중요도 비중</h3>
      <div class="explain">
        70개 변수를 11개 카테고리로 묶어서 어떤 종류의 정보가 가장 중요한지 보여줍니다.
      </div>
      <div class="chart-container" id="chart-fi-category"></div>
    </div>
  </div>

  <!-- ═══ Tab 5: 에러 케이스 분석 ═══ -->
  <div class="section" id="sec-error">
    <div class="card">
      <h3>에러 통계 요약</h3>
      <div class="explain">
        Test 데이터에서 예측 에러의 전반적인 분포를 보여줍니다.
        P50(중앙값)이 평균보다 작으면, 소수의 큰 에러가 평균을 끌어올린 것입니다.
      </div>
      <table>
        <thead><tr><th>지표</th><th>값</th><th>설명</th></tr></thead>
        <tbody id="error-stats-table"></tbody>
      </table>
    </div>

    <div class="card">
      <h3>에러가 가장 큰 20개 케이스</h3>
      <div class="explain">
        예측을 가장 크게 빗나간 케이스들입니다. 어떤 제품의 어떤 시점에서 에러가 컸는지 확인하세요.
      </div>
      <table>
        <thead>
          <tr><th>#</th><th>제품ID</th><th>주차</th><th>실제</th><th>예측</th><th>절대에러</th><th>%에러</th></tr>
        </thead>
        <tbody id="worst-cases-table"></tbody>
      </table>
    </div>

    <div class="card">
      <h3>고에러 그룹 vs 저에러 그룹 — 핵심 차이 변수</h3>
      <div class="explain">
        <strong>에러가 큰 데이터는 어떤 특징이 있나요?</strong><br>
        상위 20% 고에러 샘플과 나머지 80% 저에러 샘플의 변수 평균을 비교합니다.
        <strong>Cohen's d</strong>가 클수록 두 그룹 간 차이가 뚜렷합니다
        (|d| > 0.8: 큰 차이, 0.5~0.8: 중간, 0.2~0.5: 작은 차이).
      </div>
      <div class="chart-container" id="chart-feature-diff"></div>
    </div>

    <div class="two-col">
      <div class="card">
        <h3>제품별 평균 에러 TOP 20</h3>
        <div class="explain">어떤 제품이 예측하기 가장 어려운지 보여줍니다.</div>
        <div class="chart-container" id="chart-product-error"></div>
      </div>
      <div class="card">
        <h3>시간대별 평균 에러 추이</h3>
        <div class="explain">특정 시점에 에러가 급증했다면 외부 이벤트(시장 변동 등)를 확인하세요.</div>
        <div class="chart-container" id="chart-time-error"></div>
      </div>
    </div>
  </div>

  <!-- ═══ Tab 6: 개선 제안 ═══ -->
  <div class="section" id="sec-recommend">
    <div class="card">
      <h3>다음 학습을 위한 개선 제안</h3>
      <div class="explain">
        에러 분석 결과를 바탕으로 모델 성능을 향상시킬 수 있는 구체적인 방법을 제안합니다.
        우선순위가 높은 항목부터 적용해 보세요.
      </div>
      <div id="recommendations"></div>
    </div>

    <div class="card">
      <h3>현재 모델 하이퍼파라미터</h3>
      <div class="explain">
        현재 LightGBM 모델의 설정값입니다. 과적합 정도에 따라 조정이 필요할 수 있습니다.
      </div>
      <table>
        <thead><tr><th>파라미터</th><th>값</th><th>설명</th></tr></thead>
        <tbody id="params-table"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
const D = {data_json};

// ─── 헤더 ───
document.getElementById('header-subtitle').textContent =
  `${{D.meta.train_period}} (학습) → ${{D.meta.test_period}} (테스트) | 피처 ${{D.meta.n_features}}개 | 제품 ${{D.meta.n_products.toLocaleString()}}개 | 생성: ${{D.timestamp}}`;

// ─── KPI 카드 ───
function kpiClass(metric, val) {{
  if (metric === 'r2') return val > 0.7 ? 'kpi-good' : val > 0.4 ? 'kpi-warn' : 'kpi-bad';
  return '';
}}
const kpis = [
  {{ label: 'MSE (평균제곱오차)', value: D.ensemble.mse.toFixed(2), desc: '0에 가까울수록 좋음', cls: '' }},
  {{ label: 'RMSE (제곱근MSE)', value: D.ensemble.rmse.toFixed(2), desc: '실제 단위와 같은 스케일', cls: '' }},
  {{ label: 'MAE (평균절대오차)', value: D.ensemble.mae.toFixed(2), desc: '평균적으로 이만큼 빗나감', cls: '' }},
  {{ label: 'R² (설명력)', value: D.ensemble.r2.toFixed(4), desc: '1.0 = 완벽 예측', cls: kpiClass('r2', D.ensemble.r2) }},
  {{ label: 'MAPE (%오차)', value: D.ensemble.mape ? D.ensemble.mape.toFixed(1)+'%' : 'N/A', desc: '낮을수록 좋음', cls: '' }},
];
const kpiRow = document.getElementById('kpi-row');
kpis.forEach(k => {{
  kpiRow.innerHTML += `<div class="kpi-card"><div class="label">${{k.label}}</div><div class="value ${{k.cls}}">${{k.value}}</div><div class="desc">${{k.desc}}</div></div>`;
}});

// ─── 탭 전환 ───
document.querySelectorAll('.tab').forEach(tab => {{
  tab.addEventListener('click', () => {{
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('sec-' + tab.dataset.tab).classList.add('active');
  }});
}});

// ─── Fold 테이블 ───
const ftb = document.getElementById('fold-table-body');
D.folds.forEach(f => {{
  const gap = f.overfit_gap_r2;
  const gapCls = Math.abs(gap) > 0.15 ? 'metric-bad' : Math.abs(gap) > 0.05 ? 'kpi-warn' : 'metric-good';
  ftb.innerHTML += `<tr>
    <td><strong>Fold ${{f.fold}}</strong></td>
    <td>${{f.n_train.toLocaleString()}}</td><td>${{f.n_val.toLocaleString()}}</td>
    <td>${{f.train_mse.toFixed(2)}}</td><td>${{f.val_mse.toFixed(2)}}</td>
    <td>${{f.train_r2.toFixed(4)}}</td><td>${{f.val_r2.toFixed(4)}}</td>
    <td class="${{gapCls}}">${{gap.toFixed(4)}}</td>
    <td>${{f.best_iteration}}회</td>
  </tr>`;
}});

// ─── 앙상블 vs 개별 비교 차트 ───
const ensembleTrace = {{
  x: ['MSE', 'MAE', 'R²'],
  y: [D.ensemble.mse, D.ensemble.mae, D.ensemble.r2],
  name: '앙상블 (5모델 평균)',
  type: 'bar',
  marker: {{ color: '#2563eb' }}
}};
const indivTraces = D.individual.map((m, i) => ({{
  x: ['MSE', 'MAE', 'R²'],
  y: [m.mse, m.mae, m.r2],
  name: m.model,
  type: 'bar',
  marker: {{ opacity: 0.5 }}
}}));
Plotly.newPlot('chart-ensemble-compare', [ensembleTrace, ...indivTraces], {{
  barmode: 'group', height: 400,
  title: {{ text: 'Test Set: 앙상블 vs 개별 Fold 모델' }},
  yaxis: {{ title: '메트릭 값' }},
  legend: {{ orientation: 'h', y: -0.15 }}
}}, {{responsive: true}});

// ─── 학습 곡선 ───
const lcDiv = document.getElementById('lc-charts');
D.lc.forEach(lc => {{
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<h3>Fold ${{lc.fold}} 학습 곡선</h3><div class="chart-container" id="lc-fold-${{lc.fold}}"></div>`;
  lcDiv.appendChild(div);

  const trainTrace = {{
    x: lc.iterations, y: lc.train_loss, name: 'Train Loss',
    line: {{ color: '#3b82f6', width: 2 }}, mode: 'lines'
  }};
  const valTrace = {{
    x: lc.iterations, y: lc.val_loss, name: 'Validation Loss',
    line: {{ color: '#ef4444', width: 2 }}, mode: 'lines'
  }};
  const shapes = [{{
    type: 'line', x0: lc.best_iteration, x1: lc.best_iteration,
    y0: 0, y1: 1, yref: 'paper',
    line: {{ color: '#10b981', width: 2, dash: 'dash' }}
  }}];
  const annotations = [{{
    x: lc.best_iteration, y: 1.05, yref: 'paper',
    text: `Early Stop (${{lc.best_iteration}})`, showarrow: false,
    font: {{ color: '#10b981', size: 11 }}
  }}];

  Plotly.newPlot(`lc-fold-${{lc.fold}}`, [trainTrace, valTrace], {{
    height: 300, shapes, annotations,
    xaxis: {{ title: '학습 반복 횟수 (Iteration)' }},
    yaxis: {{ title: 'MSE Loss (낮을수록 좋음)' }},
    legend: {{ orientation: 'h', y: -0.2 }}
  }}, {{responsive: true}});
}});

// ─── 과적합 요약 ───
const ofDiv = document.getElementById('overfit-summary');
D.folds.forEach(f => {{
  const gap = Math.abs(f.overfit_gap_r2);
  let verdict, cls;
  if (gap <= 0.05) {{ verdict = '양호 — 과적합 없음'; cls = 'badge-low'; }}
  else if (gap <= 0.15) {{ verdict = '경미한 과적합 — 모니터링 필요'; cls = 'badge-mid'; }}
  else {{ verdict = '과적합 주의! — 정규화 강화 권장'; cls = 'badge-high'; }}
  ofDiv.innerHTML += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
    <strong>Fold ${{f.fold}}</strong>
    <span>R² 격차: ${{f.overfit_gap_r2.toFixed(4)}}</span>
    <span class="badge ${{cls}}">${{verdict}}</span></div>`;
}});

// ─── 산점도 ───
Plotly.newPlot('chart-scatter', [
  {{
    x: D.actual, y: D.predicted, mode: 'markers', type: 'scattergl',
    marker: {{ color: '#3b82f6', opacity: 0.3, size: 4 }},
    name: '예측 포인트'
  }},
  {{
    x: [0, Math.max(...D.actual)], y: [0, Math.max(...D.actual)],
    mode: 'lines', line: {{ color: '#ef4444', dash: 'dash', width: 2 }},
    name: '완벽 예측선'
  }}
], {{
  height: 450,
  xaxis: {{ title: '실제 수주량' }},
  yaxis: {{ title: '예측 수주량' }},
  legend: {{ orientation: 'h', y: -0.15 }}
}}, {{responsive: true}});

// ─── 잔차 히스토그램 ───
Plotly.newPlot('chart-residual-hist', [{{
  x: D.residuals, type: 'histogram', nbinsx: 80,
  marker: {{ color: '#8b5cf6', line: {{ color: '#6d28d9', width: 1 }} }},
  name: '잔차 분포'
}}], {{
  height: 450, shapes: [{{
    type: 'line', x0: 0, x1: 0, y0: 0, y1: 1, yref: 'paper',
    line: {{ color: '#ef4444', width: 2, dash: 'dash' }}
  }}],
  xaxis: {{ title: '잔차 (실제 - 예측)' }},
  yaxis: {{ title: '빈도' }},
  annotations: [{{ x: 0, y: 1.05, yref: 'paper', text: '← 과소예측 | 과대예측 →', showarrow: false }}]
}}, {{responsive: true}});

// ─── 잔차 vs 예측값 ───
Plotly.newPlot('chart-residual-scatter', [{{
  x: D.predicted, y: D.residuals, mode: 'markers', type: 'scattergl',
  marker: {{ color: '#f59e0b', opacity: 0.3, size: 4 }},
  name: '잔차'
}}, {{
  x: [0, Math.max(...D.predicted)], y: [0, 0],
  mode: 'lines', line: {{ color: '#ef4444', dash: 'dash' }},
  name: '기준선 (0)'
}}], {{
  height: 450,
  xaxis: {{ title: '예측값' }},
  yaxis: {{ title: '잔차 (실제 - 예측)' }}
}}, {{responsive: true}});

// ─── 에러 CDF ───
const sortedErr = [...D.error_analysis.abs_errors].sort((a,b) => a-b);
const cdfY = sortedErr.map((_, i) => (i+1)/sortedErr.length * 100);
Plotly.newPlot('chart-error-cdf', [{{
  x: sortedErr, y: cdfY, mode: 'lines', fill: 'tozeroy',
  line: {{ color: '#3b82f6' }}, fillcolor: 'rgba(37,99,235,0.1)',
  name: '누적 분포'
}}], {{
  height: 450,
  shapes: [{{
    type: 'line',
    x0: D.error_analysis.error_stats.threshold,
    x1: D.error_analysis.error_stats.threshold,
    y0: 0, y1: 100,
    line: {{ color: '#ef4444', width: 2, dash: 'dash' }}
  }}],
  annotations: [{{
    x: D.error_analysis.error_stats.threshold, y: 85,
    text: `상위 20% 경계 (${{D.error_analysis.error_stats.threshold.toFixed(1)}})`,
    showarrow: true, arrowhead: 2, font: {{ color: '#ef4444' }}
  }}],
  xaxis: {{ title: '절대 에러' }},
  yaxis: {{ title: '누적 비율 (%)' }}
}}, {{responsive: true}});

// ─── Feature Importance (Gain) ───
Plotly.newPlot('chart-fi-gain', [{{
  y: [...D.fi_names_kr].reverse(),
  x: [...D.fi_gain].reverse(),
  type: 'bar', orientation: 'h',
  marker: {{ color: '#2563eb', line: {{ width: 0 }} }}
}}], {{
  height: Math.max(500, D.fi_names.length * 22),
  margin: {{ l: 200 }},
  xaxis: {{ title: 'Gain (정보 이득)' }}
}}, {{responsive: true}});

// ─── Feature Importance (Split) ───
Plotly.newPlot('chart-fi-split', [{{
  y: [...D.fi_names_kr].reverse(),
  x: [...D.fi_split].reverse(),
  type: 'bar', orientation: 'h',
  marker: {{ color: '#10b981', line: {{ width: 0 }} }}
}}], {{
  height: Math.max(500, D.fi_names.length * 22),
  margin: {{ l: 200 }},
  xaxis: {{ title: 'Split (사용 횟수)' }}
}}, {{responsive: true}});

// ─── 카테고리별 중요도 파이 ───
Plotly.newPlot('chart-fi-category', [{{
  labels: D.cat_names, values: D.cat_values,
  type: 'pie', hole: 0.4,
  textinfo: 'label+percent',
  textposition: 'outside',
  marker: {{ colors: ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6'] }}
}}], {{
  height: 500,
  title: {{ text: '카테고리별 Gain 비중' }}
}}, {{responsive: true}});

// ─── 에러 통계 테이블 ───
const es = D.error_analysis.error_stats;
const esTable = document.getElementById('error-stats-table');
[
  ['평균 절대에러', es.mean.toFixed(2), '모든 에러의 산술 평균'],
  ['중앙값 (P50)', es.p50.toFixed(2), '에러의 정 가운데 값 (절반은 이보다 작음)'],
  ['표준편차', es.std.toFixed(2), '에러가 평균에서 얼마나 퍼져있는지'],
  ['P75', es.p75.toFixed(2), '75%의 예측이 이 에러 이하'],
  ['P90', es.p90.toFixed(2), '90%의 예측이 이 에러 이하'],
  ['P95', es.p95.toFixed(2), '95%의 예측이 이 에러 이하'],
  ['P99', es.p99.toFixed(2), '상위 1%의 극단 에러 경계'],
  ['고에러 경계 (상위 20%)', es.threshold.toFixed(2), '이 값 이상이면 고에러 그룹'],
].forEach(([k,v,d]) => {{ esTable.innerHTML += `<tr><td><strong>${{k}}</strong></td><td>${{v}}</td><td>${{d}}</td></tr>`; }});

// ─── Worst 20 ───
const wcTable = document.getElementById('worst-cases-table');
D.error_analysis.worst_cases.forEach(c => {{
  wcTable.innerHTML += `<tr>
    <td>${{c.rank}}</td><td>${{c.product_id}}</td><td>${{c.year_week}}</td>
    <td>${{c.actual.toLocaleString()}}</td><td>${{c.predicted.toLocaleString()}}</td>
    <td class="metric-bad">${{c.abs_error.toLocaleString()}}</td>
    <td>${{c.pct_error !== null ? c.pct_error+'%' : '-'}}</td>
  </tr>`;
}});

// ─── 피처 차이 차트 ───
const fc = D.error_analysis.feature_comparison.slice(0, 15);
Plotly.newPlot('chart-feature-diff', [{{
  y: fc.map(f => f.feature_kr).reverse(),
  x: fc.map(f => f.cohens_d).reverse(),
  type: 'bar', orientation: 'h',
  marker: {{
    color: fc.map(f => f.cohens_d > 0 ? '#ef4444' : '#3b82f6').reverse(),
    line: {{ width: 0 }}
  }},
  text: fc.map(f => `d=${{f.cohens_d.toFixed(2)}}`).reverse(),
  textposition: 'outside'
}}], {{
  height: Math.max(400, fc.length * 30),
  margin: {{ l: 200 }},
  xaxis: {{ title: "Cohen's d (양수: 고에러 그룹에서 더 큼, 음수: 더 작음)", zeroline: true }},
  shapes: [{{ type: 'line', x0: 0, x1: 0, y0: -0.5, y1: fc.length-0.5, line: {{ color: '#94a3b8', dash: 'dash' }} }}]
}}, {{responsive: true}});

// ─── 제품별 에러 ───
const pe = D.error_analysis.product_errors;
Plotly.newPlot('chart-product-error', [{{
  y: pe.map(p => 'P:'+p.product_id.toString().slice(-6)).reverse(),
  x: pe.map(p => p.mean_error).reverse(),
  type: 'bar', orientation: 'h',
  marker: {{ color: '#ef4444' }},
  text: pe.map(p => `n=${{p.count}}`).reverse(),
  textposition: 'outside'
}}], {{
  height: Math.max(400, pe.length * 25),
  margin: {{ l: 120 }},
  xaxis: {{ title: '평균 절대 에러' }}
}}, {{responsive: true}});

// ─── 시간별 에러 ───
const te = D.error_analysis.time_errors;
Plotly.newPlot('chart-time-error', [{{
  x: te.map(t => t.year_week),
  y: te.map(t => t.mean_error),
  type: 'scatter', mode: 'lines+markers',
  line: {{ color: '#f59e0b', width: 2 }},
  marker: {{ size: 6 }}
}}], {{
  height: 400,
  xaxis: {{ title: '주차', tickangle: -45 }},
  yaxis: {{ title: '평균 절대 에러' }}
}}, {{responsive: true}});

// ─── 개선 제안 ───
const recDiv = document.getElementById('recommendations');
D.error_analysis.recommendations.forEach(r => {{
  const badgeCls = r.priority === '높음' ? 'badge-high' : r.priority === '중간' ? 'badge-mid' : 'badge-low';
  recDiv.innerHTML += `
    <div class="rec-card">
      <h4><span class="badge ${{badgeCls}}">${{r.priority}}</span> [${{r.category}}] ${{r.title}}</h4>
      <p style="font-size:13px;color:#475569;margin-top:4px;">${{r.detail}}</p>
      <div class="action">실행 방법: ${{r.action}}</div>
    </div>`;
}});

// ─── 파라미터 테이블 ───
const paramDesc = {{
  'objective': '목적함수 — 무엇을 최적화할지',
  'metric': '평가 지표',
  'n_estimators': '최대 트리 수 (Early Stopping으로 자동 조절)',
  'max_depth': '트리 최대 깊이 (깊을수록 복잡, 과적합 위험↑)',
  'learning_rate': '학습률 (작을수록 천천히, 안정적 학습)',
  'num_leaves': '리프 노드 수 (클수록 복잡)',
  'min_child_samples': '리프 최소 샘플 수 (클수록 과적합 방지)',
  'colsample_bytree': '트리당 피처 샘플링 비율 (0.8 = 80% 사용)',
  'subsample': '데이터 샘플링 비율 (과적합 방지)',
  'subsample_freq': '샘플링 빈도',
  'reg_alpha': 'L1 정규화 (불필요한 피처 제거 효과)',
  'reg_lambda': 'L2 정규화 (가중치 크기 제한)',
  'n_jobs': '병렬 처리 (-1 = 모든 CPU 사용)',
}};
const ptb = document.getElementById('params-table');
Object.entries(D.params).forEach(([k, v]) => {{
  ptb.innerHTML += `<tr><td><code>${{k}}</code></td><td><strong>${{v}}</strong></td><td>${{paramDesc[k] || ''}}</td></tr>`;
}});
</script>
</body>
</html>"""


# ═══════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  LightGBM 5-Fold CV & Ensemble 평가 리포트")
    print("=" * 60)

    # 1. 데이터 로드
    df, feature_cols = load_data()

    # 2. Train-Test 분할
    X_train, y_train, X_test, y_test, train_df, test_df, meta = split_train_test(df, feature_cols)

    # 3. 5-Fold CV 학습
    models, fold_metrics, learning_curves_data, feature_importance = train_cv_models(X_train, y_train)

    # 4. 앙상블 평가
    ensemble_pred, ensemble_metrics, individual_preds, individual_metrics = ensemble_evaluate(
        models, X_test, y_test
    )

    # 5. 에러 분석
    error_analysis = analyze_errors(test_df, y_test, ensemble_pred, feature_cols)

    # 6. HTML 대시보드 생성
    output_path = generate_html(
        meta, fold_metrics, learning_curves_data, ensemble_metrics,
        individual_metrics, feature_importance, error_analysis,
        y_test, ensemble_pred, test_df,
    )

    # 7. 실험 결과 JSON 저장 (비교 프레임워크용)
    exp_dir = Path(__file__).parent / "experiments"
    exp_dir.mkdir(exist_ok=True)
    exp_result = {
        "id": "v1_baseline",
        "label": "V1: 베이스라인",
        "desc": "기본 LightGBM 설정 (regression, max_depth=6, lr=0.05)",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "meta": meta,
        "ensemble_metrics": ensemble_metrics,
        "fold_metrics": [{k: v for k, v in fm.items()} for fm in fold_metrics],
        "feature_importance_top20": [
            {"name": feature_importance["names"][i],
             "name_kr": FEATURE_NAME_KR.get(feature_importance["names"][i], feature_importance["names"][i]),
             "gain": feature_importance["gain"][i]}
            for i in np.argsort(feature_importance["gain"])[::-1][:20]
        ],
        "params": {k: v for k, v in LGB_PARAMS.items() if k != "verbose"},
    }
    exp_path = exp_dir / "v1_baseline.json"
    with open(exp_path, "w", encoding="utf-8") as f:
        json.dump(exp_result, f, ensure_ascii=False, indent=2, default=str)
    print(f"  실험 결과 저장: {exp_path}")

    print("\n" + "=" * 60)
    print(f"  리포트 생성 완료: {output_path}")
    print("  브라우저에서 열어서 확인하세요!")
    print("=" * 60)

    return output_path


if __name__ == "__main__":
    main()
