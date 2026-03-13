"""
Step 4 v4: 주간 수요예측 — Global Two-Stage LightGBM

v3 대비 주요 개선:
  1. Global 모델 (전 제품 풀링) — 소표본 과적합 해소
  2. Log1p 타겟 변환 — 극단적 오른쪽 편향 완화
  3. Two-Stage: 이진분류(수요 유무) + 분위수회귀(비영 수요)
  4. 제품 수준 피처 추가 (demand_scale, zero_ratio, demand_segment, ratio)
"""

import json
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd

from config import (
    supabase, upsert_batch,
    WEEKLY_FEATURE_COLS, WEEKLY_CV_FOLDS,
    EARLY_STOPPING_ROUNDS,
)
from ml_utils import compute_metrics, _fit_lgb

MODEL_ID    = "lgbm_q_v4"
HORIZONS    = {
    "target_1w":  7,
    "target_2w":  14,
    "target_3w":  21,
    "target_4w":  28,
    "target_8w":  56,
    "target_13w": 91,
}
MIN_SAMPLES    = 26
TRAIN_RATIO    = 0.8
MIN_TRAIN_SIZE = 200

# 2단계 모델 — 수요 확률 임계값
ZERO_THRESHOLDS = {"p10": 0.5, "p50": 0.3, "p90": 0.1}

# LightGBM 파라미터 — 글로벌 모델용 (더 깊고 느리게)
LGB_PARAMS = {
    "objective":         "quantile",
    "metric":            "quantile",
    "n_estimators":      1000,
    "max_depth":         8,
    "learning_rate":     0.03,
    "num_leaves":        63,
    "min_child_samples": 50,
    "colsample_bytree":  0.7,
    "subsample":         0.7,
    "subsample_freq":    1,
    "reg_alpha":         0.1,
    "reg_lambda":        1.0,
    "verbose":           -1,
}

LGB_CLF_PARAMS = {
    "objective":         "binary",
    "metric":            "binary_logloss",
    "n_estimators":      500,
    "max_depth":         6,
    "learning_rate":     0.05,
    "num_leaves":        31,
    "min_child_samples": 50,
    "colsample_bytree":  0.8,
    "subsample":         0.8,
    "subsample_freq":    1,
    "verbose":           -1,
}


def fetch_all(table: str, select: str) -> list:
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


# ── 제품 수준 피처 추가 ──────────────────────────────────────

def add_product_features(df: pd.DataFrame, feature_cols: list) -> tuple:
    """기존 피처로부터 제품 수준 메타 피처 생성 (data leakage 없음)"""
    new_cols = []

    # 1) demand_scale: log1p(최근 13주 평균 수요) — 이미 lag 처리된 ma13 사용
    if "order_qty_ma13" in df.columns:
        df["product_demand_scale"] = np.log1p(df["order_qty_ma13"].fillna(0).clip(lower=0))
        new_cols.append("product_demand_scale")

    # 2) zero_ratio_13w: 최근 13주 중 수요 없는 주 비율
    if "order_qty_nonzero_13w" in df.columns:
        df["zero_ratio_13w"] = 1.0 - df["order_qty_nonzero_13w"].fillna(0) / 13.0
        new_cols.append("zero_ratio_13w")

    # 3) demand_segment: 수요 규모 구간 (0=소량, 1=중량, 2=대량)
    if "order_qty_ma13" in df.columns:
        ma13 = df["order_qty_ma13"].fillna(0)
        df["demand_segment"] = np.where(ma13 < 10, 0, np.where(ma13 < 100, 1, 2))
        new_cols.append("demand_segment")

    # 4) ratio: 현재 위치 대비 트렌드
    if "order_qty_lag1" in df.columns and "order_qty_ma4" in df.columns:
        df["lag1_over_ma4"] = df["order_qty_lag1"].fillna(0) / (df["order_qty_ma4"].fillna(0) + 1)
        new_cols.append("lag1_over_ma4")

    if "order_qty_lag1" in df.columns and "order_qty_ma13" in df.columns:
        df["lag1_over_ma13"] = df["order_qty_lag1"].fillna(0) / (df["order_qty_ma13"].fillna(0) + 1)
        new_cols.append("lag1_over_ma13")

    extended_cols = feature_cols + new_cols
    return df, extended_cols


# ── 2단계 모델 학습·예측 ──────────────────────────────────────

def train_two_stage(lgb, X_tr, y_tr, X_va, y_va,
                    q_params: dict, es_rounds: int):
    """
    Stage 1: 이진분류 (수요 유무)
    Stage 2: Log1p 분위수 회귀 (비영 수요만)
    """
    # Stage 1 — 이진 분류
    y_bin_tr = (y_tr > 0).astype(int)
    y_bin_va = (y_va > 0).astype(int)

    clf = lgb.LGBMClassifier(**LGB_CLF_PARAMS)
    _fit_lgb(clf, X_tr, y_bin_tr, X_va, y_bin_va, es_rounds)
    prob_nonzero = clf.predict_proba(X_va)[:, 1]

    # Stage 2 — 분위수 회귀 (비영 행만, log1p 변환)
    nz_mask_tr = y_tr > 0
    nz_mask_va = y_va > 0

    if nz_mask_tr.sum() < 20:
        # 비영 데이터 부족 시 전체 데이터로 fallback
        X_tr_s2, y_tr_s2 = X_tr, np.log1p(y_tr)
        X_va_s2, y_va_s2 = X_va, np.log1p(y_va)
    else:
        X_tr_s2 = X_tr[nz_mask_tr]
        y_tr_s2 = np.log1p(y_tr[nz_mask_tr])
        X_va_s2 = X_va if nz_mask_va.sum() == 0 else X_va
        y_va_s2 = np.log1p(y_va) if nz_mask_va.sum() == 0 else np.log1p(np.maximum(y_va, 0.1))

    predictions = {}
    models = {}
    for alpha in [0.1, 0.5, 0.9]:
        p = {**q_params, "alpha": alpha}
        model = lgb.LGBMRegressor(**p)
        _fit_lgb(model, X_tr_s2, y_tr_s2, X_va_s2, y_va_s2, es_rounds)
        raw_pred = np.expm1(model.predict(X_va))
        predictions[alpha] = np.maximum(raw_pred, 0)
        models[alpha] = model

    # 조합: 확률 임계값 기반 영수요 결정
    p10 = np.where(prob_nonzero >= ZERO_THRESHOLDS["p10"], predictions[0.1], 0.0)
    p50 = np.where(prob_nonzero >= ZERO_THRESHOLDS["p50"], predictions[0.5], 0.0)
    p90 = np.where(prob_nonzero >= ZERO_THRESHOLDS["p90"], predictions[0.9], 0.0)

    return p10, p50, p90, clf, models, prob_nonzero


# ── Walk-Forward CV (글로벌) ──────────────────────────────────

def walk_forward_cv_global(lgb, X: pd.DataFrame, y: np.ndarray,
                           weeks: np.ndarray, q_params: dict,
                           n_folds: int, es_rounds: int) -> dict | None:
    """시간 기반 expanding-window CV (전 제품 풀링 데이터)"""
    unique_weeks = sorted(set(weeks))
    n_weeks = len(unique_weeks)
    fold_weeks = n_weeks // (n_folds + 1)
    if fold_weeks < 2:
        return None

    all_y, all_p10, all_p50, all_p90 = [], [], [], []
    gain_accum  = np.zeros(X.shape[1])
    split_accum = np.zeros(X.shape[1])
    n_models = 0

    for fold in range(n_folds):
        train_week_end = unique_weeks[(fold + 1) * fold_weeks - 1]
        val_week_start_idx = (fold + 1) * fold_weeks
        val_week_end_idx = min(val_week_start_idx + fold_weeks, n_weeks) - 1
        val_week_end = unique_weeks[val_week_end_idx]
        val_week_start = unique_weeks[val_week_start_idx]

        train_mask = weeks <= train_week_end
        val_mask = (weeks >= val_week_start) & (weeks <= val_week_end)

        if train_mask.sum() < MIN_TRAIN_SIZE or val_mask.sum() < 10:
            continue

        X_tr, y_tr = X[train_mask].values, y[train_mask]
        X_va, y_va = X[val_mask].values, y[val_mask]

        p10, p50, p90, clf, models, _ = train_two_stage(
            lgb, X_tr, y_tr, X_va, y_va, q_params, es_rounds
        )

        # P50 모델의 피처 중요도
        if 0.5 in models:
            m = models[0.5]
            gain_accum  += m.booster_.feature_importance(importance_type="gain")
            split_accum += m.booster_.feature_importance(importance_type="split")
            n_models += 1

        all_y.append(y_va)
        all_p10.append(p10)
        all_p50.append(p50)
        all_p90.append(p90)

    if not all_y:
        return None

    metrics = compute_metrics(
        np.concatenate(all_y),
        np.concatenate(all_p10),
        np.concatenate(all_p50),
        np.concatenate(all_p90),
    )
    metrics["n_folds"] = len(all_y)
    metrics["n_samples_total"] = sum(len(a) for a in all_y)

    if n_models > 0:
        metrics["importance_gain"]  = gain_accum  / n_models
        metrics["importance_split"] = split_accum / n_models

    return metrics


# ── 메인 ──────────────────────────────────────────────────────

def run(tune: bool = False):
    print("[S4v4] 글로벌 2단계 수요예측 모델 학습 시작")

    try:
        import lightgbm as lgb
    except ImportError:
        print("  [!] lightgbm 미설치. pip install lightgbm 필요")
        return

    # ─── 1) feature_store_weekly 로드 ───────────────────────────
    rows = fetch_all("feature_store_weekly", "*")
    if not rows:
        print("  [!] feature_store_weekly 비어있음")
        return

    df = pd.DataFrame(rows)
    df = df.sort_values(["year_week", "product_id"]).reset_index(drop=True)

    week_to_date = dict(zip(df["year_week"], df["week_start"])) if "week_start" in df.columns else {}

    base_feature_cols = [c for c in WEEKLY_FEATURE_COLS if c in df.columns]
    for col in base_feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    for t in HORIZONS:
        if t in df.columns:
            df[t] = pd.to_numeric(df[t], errors="coerce")

    # 제품 수준 피처 추가
    df, feature_cols = add_product_features(df, base_feature_cols)

    products = df["product_id"].unique()
    print(f"  feature_store_weekly: {len(df):,}행, 제품: {len(products):,}개")
    print(f"  피처: {len(feature_cols)}개 (기존 {len(base_feature_cols)} + 신규 {len(feature_cols)-len(base_feature_cols)})")

    today = date.today()

    # ─── 2) 호라이즌별 글로벌 학습·평가·예측 ─────────────────────
    results      = []
    eval_rows    = []
    fi_rows      = []

    for target_col, horizon_days in HORIZONS.items():
        print(f"\n  ── [{target_col}] horizon={horizon_days}일 ──")

        # 유효 데이터 필터
        valid = df.dropna(subset=[target_col]).copy()
        valid = valid[valid[target_col].notna()]

        # 제품별 최소 샘플 필터
        prod_counts = valid.groupby("product_id").size()
        valid_pids = prod_counts[prod_counts >= MIN_SAMPLES].index
        valid = valid[valid["product_id"].isin(valid_pids)]

        if len(valid) < MIN_TRAIN_SIZE:
            print(f"    [!] 유효 데이터 부족 ({len(valid)}행), 스킵")
            continue

        X = valid[feature_cols].fillna(0)
        y = valid[target_col].values.astype(float)
        weeks = valid["year_week"].values
        pids = valid["product_id"].values

        zero_pct = (y == 0).sum() / len(y) * 100
        print(f"    데이터: {len(valid):,}행, 제품: {len(valid_pids):,}개, 영수요: {zero_pct:.1f}%")

        # a) Walk-Forward CV
        cv = walk_forward_cv_global(
            lgb, X, y, weeks, LGB_PARAMS,
            n_folds=WEEKLY_CV_FOLDS,
            es_rounds=EARLY_STOPPING_ROUNDS,
        )

        if cv:
            # 제품별 평가가 아닌 글로벌 평가
            eval_rows.append({
                "model_id":        MODEL_ID,
                "product_id":      "__global__",
                "horizon_key":     target_col,
                "horizon_days":    horizon_days,
                "eval_date":       today.isoformat(),
                "mape":            cv.get("mape"),
                "wmape":           cv.get("wmape"),
                "rmse":            cv.get("rmse"),
                "mae":             cv.get("mae"),
                "coverage_rate":   cv.get("coverage_rate"),
                "pinball_p10":     cv.get("pinball_p10"),
                "pinball_p50":     cv.get("pinball_p50"),
                "pinball_p90":     cv.get("pinball_p90"),
                "n_folds":         cv.get("n_folds"),
                "n_samples_total": cv.get("n_samples_total"),
                "params_json":     json.dumps(
                    {k: v for k, v in LGB_PARAMS.items()
                     if k not in ("objective", "metric", "verbose")},
                    sort_keys=True,
                ),
            })

            wmape_str = f"WMAPE={cv.get('wmape', 0):.1f}%" if cv.get("wmape") else ""
            cov_str = f"Coverage={cv.get('coverage_rate', 0):.1f}%"
            print(f"    CV: {wmape_str} | {cov_str} | n={cv.get('n_samples_total', 0):,}")

            # 피처 중요도
            if "importance_gain" in cv:
                avg_gain  = cv["importance_gain"]
                avg_split = cv["importance_split"]
                rank_order = np.argsort(-avg_gain)
                for rank, idx in enumerate(rank_order[:30]):
                    fi_rows.append({
                        "model_id":         MODEL_ID,
                        "horizon_key":      target_col,
                        "eval_date":        today.isoformat(),
                        "feature_name":     feature_cols[idx],
                        "importance_gain":  round(float(avg_gain[idx]), 6),
                        "importance_split": round(float(avg_split[idx]), 6),
                        "rank_gain":        rank + 1,
                    })

        # b) 최종 시간 기반 분할 → forecast_result
        unique_weeks = sorted(valid["year_week"].unique())
        split_week_idx = int(len(unique_weeks) * TRAIN_RATIO)
        if split_week_idx < 10 or split_week_idx >= len(unique_weeks) - 2:
            print(f"    [!] 분할 불가, 스킵")
            continue

        split_week = unique_weeks[split_week_idx]
        train_mask = weeks <= split_week
        val_mask = weeks > split_week

        if train_mask.sum() < MIN_TRAIN_SIZE or val_mask.sum() < 10:
            print(f"    [!] 학습/검증 데이터 부족, 스킵")
            continue

        X_train = X[train_mask].values
        y_train = y[train_mask]
        X_val = X[val_mask].values
        y_val = y[val_mask]
        pids_val = pids[val_mask]
        weeks_val = weeks[val_mask]

        p10, p50, p90, _, _, _ = train_two_stage(
            lgb, X_train, y_train, X_val, y_val,
            LGB_PARAMS, EARLY_STOPPING_ROUNDS,
        )

        for i in range(len(y_val)):
            results.append({
                "model_id":      MODEL_ID,
                "product_id":    pids_val[i],
                "forecast_date": today.isoformat(),
                "target_date":   week_to_date.get(weeks_val[i], today.isoformat()),
                "horizon_days":  horizon_days,
                "p10":           round(max(float(p10[i]), 0), 6),
                "p50":           round(max(float(p50[i]), 0), 6),
                "p90":           round(max(float(p90[i]), 0), 6),
                "actual_qty":    round(float(y_val[i]), 6),
            })

        print(f"    예측: {val_mask.sum():,}행 생성")

    print(f"\n  전체 forecast_result: {len(results):,}건")

    # ─── 3) DB 적재 ────────────────────────────────────────────
    if eval_rows:
        upsert_batch("model_evaluation", eval_rows,
                     on_conflict="model_id,product_id,horizon_key,eval_date")
        print(f"  model_evaluation: {len(eval_rows):,}건 적재")

    if fi_rows:
        upsert_batch("feature_importance", fi_rows,
                     on_conflict="model_id,horizon_key,eval_date,feature_name")
        print(f"  feature_importance: {len(fi_rows):,}건 적재")

    if results:
        for i in range(0, len(results), 500):
            supabase.table("forecast_result").insert(results[i:i + 500]).execute()
        print(f"  forecast_result: {len(results):,}건 적재")

    # ─── 4) 평가 요약 ──────────────────────────────────────────
    if eval_rows:
        print(f"\n  ── 평가 메트릭 요약 (v4 글로벌) ──")
        for e in eval_rows:
            wmape = e.get("wmape")
            cov   = e.get("coverage_rate")
            mape  = e.get("mape")
            wmape_s = f"WMAPE={wmape:.1f}%" if wmape else "WMAPE=N/A"
            cov_s   = f"Coverage={cov:.1f}%" if cov else "Coverage=N/A"
            mape_s  = f"MAPE={mape:.1f}%" if mape else "MAPE=N/A"
            print(f"  {e['horizon_key']}: {mape_s} | {wmape_s} | {cov_s} | n={e.get('n_samples_total', 0):,}")

    if fi_rows:
        fi_df = pd.DataFrame(fi_rows)
        print(f"\n  ── 피처 중요도 TOP 10 (v4) ──")
        for hk in HORIZONS:
            sub = fi_df[(fi_df["horizon_key"] == hk) & (fi_df["rank_gain"] <= 10)]
            if sub.empty:
                continue
            print(f"  [{hk}]")
            for _, row in sub.iterrows():
                print(f"    {row['rank_gain']:>2}. {row['feature_name']:<30} gain={row['importance_gain']:.4f}")

    count = supabase.table("forecast_result").select("id", count="exact").execute()
    print(f"\n[S4v4] 완료 — forecast_result 전체: {count.count:,}행")


if __name__ == "__main__":
    import sys
    tune_flag = "--tune" in sys.argv
    run(tune=tune_flag)
