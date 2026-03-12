"""
Step 4: 수요예측 모델 — LightGBM Quantile Regression (P10/P50/P90)
주간 피처 스토어 기반, 호라이즌별 별도 모델 학습

개선 사항 (v3):
  - Optuna 베이지안 최적화 (--tune 시 Grid Search 대체)
  - Early Stopping 전면 적용 (CV + 최종 학습)
  - WMAPE 메트릭 추가
  - Walk-Forward CV 5-fold로 강화
"""

import json
import random
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd

from config import (
    supabase, upsert_batch,
    WEEKLY_FEATURE_COLS, WEEKLY_PARAM_GRID,
    WEEKLY_CV_FOLDS, TUNING_METRIC,
    TUNE_SAMPLE_PRODUCTS, EARLY_STOPPING_ROUNDS, OPTUNA_N_TRIALS,
)
from ml_utils import (
    compute_metrics, walk_forward_cv,
    grid_search_horizon, optuna_search_horizon,
    _fit_lgb,
)

MODEL_ID    = "lgbm_q_v3"
# 3구간 동결 구조 기반 호라이즌
# Frozen Zone : 1W(7d) / 2W(14d) / 3W(21d) / 4W(28d)
# Slushy Zone : 8W(56d) — 발주 수량 조정 핵심, 리드타임 커버
# Liquid Zone : 13W(91d) — 원자재 선행구매, 중기 수요계획
HORIZONS    = {
    "target_1w":  7,
    "target_2w":  14,
    "target_3w":  21,
    "target_4w":  28,
    "target_8w":  56,
    "target_13w": 91,
}
MIN_SAMPLES = 26
TRAIN_RATIO = 0.8

# LightGBM 기본 하이퍼파라미터
LGB_PARAMS = {
    "objective":         "quantile",
    "metric":            "quantile",
    "n_estimators":      1000,   # Early Stopping이 최적값 결정
    "max_depth":         6,
    "learning_rate":     0.05,
    "num_leaves":        31,
    "min_child_samples": 20,
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


def run(tune: bool = False):
    print("[S4] 수요예측 모델 학습/추론 시작")

    try:
        import lightgbm as lgb
    except ImportError:
        print("  [!] lightgbm 미설치. pip install lightgbm 필요")
        lgb = None

    # ─── 1) feature_store_weekly 로드 ───────────────────────────────
    rows = fetch_all("feature_store_weekly", "*")
    if not rows:
        print("  [!] feature_store_weekly 비어있음. s3 먼저 실행 필요")
        return

    df = pd.DataFrame(rows)
    df = df.sort_values(["product_id", "year_week"])

    week_to_date = dict(zip(df["year_week"], df["week_start"])) if "week_start" in df.columns else {}

    feature_cols = [c for c in WEEKLY_FEATURE_COLS if c in df.columns]
    for col in feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    for t in HORIZONS:
        df[t] = pd.to_numeric(df[t], errors="coerce")

    products = df["product_id"].unique()
    print(f"  feature_store_weekly: {len(df):,}행, 제품: {len(products):,}개")
    print(f"  피처: {len(feature_cols)}개, 호라이즌: {list(HORIZONS.keys())}")
    print(f"  Early Stopping: {EARLY_STOPPING_ROUNDS}라운드, CV: {WEEKLY_CV_FOLDS}-fold")

    today = date.today()

    # ─── 2) 하이퍼파라미터 최적화 (tune=True 일 때만) ───────────────
    horizon_params = {}
    tuning_rows    = []

    if tune and lgb is not None:
        # Optuna 우선, 미설치 시 Grid Search fallback
        try:
            import optuna as _optuna
            USE_OPTUNA = True
        except ImportError:
            USE_OPTUNA = False
            print("  [!] optuna 미설치 — Grid Search 사용 (pip install optuna 권장)")

        search_label = "Optuna 베이지안 최적화" if USE_OPTUNA else "Grid Search"
        print(f"\n  ── {search_label} 시작 (주간) ──")

        for target_col, horizon_days in HORIZONS.items():
            print(f"\n  [{target_col}] horizon={horizon_days}일")

            eligible = [
                p for p in products
                if df[df["product_id"] == p].dropna(subset=[target_col]).shape[0] >= MIN_SAMPLES
            ]
            sampled = random.sample(eligible, min(TUNE_SAMPLE_PRODUCTS, len(eligible)))

            sample_data = []
            for pid in sampled:
                valid = df[df["product_id"] == pid].dropna(subset=[target_col])
                X     = valid[feature_cols].fillna(0)
                y_arr = valid[target_col].values
                sample_data.append((X, y_arr))

            if not sample_data:
                print(f"    [!] 적격 제품 없음, 기본 파라미터 사용")
                horizon_params[target_col] = LGB_PARAMS.copy()
                continue

            if USE_OPTUNA:
                best_params, search_results = optuna_search_horizon(
                    sample_data, LGB_PARAMS,
                    n_trials=OPTUNA_N_TRIALS,
                    n_folds=WEEKLY_CV_FOLDS,
                    metric_key=TUNING_METRIC,
                    early_stopping_rounds=EARLY_STOPPING_ROUNDS,
                )
            else:
                best_params, search_results = grid_search_horizon(
                    sample_data, WEEKLY_PARAM_GRID, LGB_PARAMS,
                    n_folds=WEEKLY_CV_FOLDS,
                    metric_key=TUNING_METRIC,
                    early_stopping_rounds=EARLY_STOPPING_ROUNDS,
                )

            horizon_params[target_col] = best_params

            best_metric = min(
                (r["metric_value"] for r in search_results if r["metric_value"] is not None),
                default=float("inf"),
            )
            for r in search_results:
                tuning_rows.append({
                    "model_id":     MODEL_ID,
                    "horizon_key":  target_col,
                    "eval_date":    today.isoformat(),
                    "params_json":  json.dumps(r["params"], sort_keys=True),
                    "metric_name":  r["metric_name"],
                    "metric_value": round(r["metric_value"], 6) if r["metric_value"] is not None else None,
                    "is_best":      r["metric_value"] == best_metric,
                    "n_folds":      WEEKLY_CV_FOLDS,
                })

        print(f"\n  ── 최적화 완료 ({len(tuning_rows)}건 이력 저장) ──\n")
    else:
        for target_col in HORIZONS:
            horizon_params[target_col] = LGB_PARAMS.copy()

    # ─── 3) 제품별 학습·평가·예측 ────────────────────────────────────
    results      = []
    eval_rows    = []
    fi_gain      = defaultdict(lambda: np.zeros(len(feature_cols)))
    fi_split     = defaultdict(lambda: np.zeros(len(feature_cols)))
    fi_count     = defaultdict(int)
    trained_count = 0
    skipped_count = 0

    for pid in products:
        pdf = df[df["product_id"] == pid].copy()

        for target_col, horizon_days in HORIZONS.items():
            valid = pdf.dropna(subset=[target_col])
            if len(valid) < MIN_SAMPLES:
                skipped_count += 1
                continue

            X     = valid[feature_cols].fillna(0)
            y     = valid[target_col].values
            weeks = valid["year_week"].values

            params = horizon_params[target_col]

            if lgb is not None:
                # a) Walk-Forward CV → 메트릭 + 피처 중요도
                cv = walk_forward_cv(X, y, params,
                                     n_folds=WEEKLY_CV_FOLDS,
                                     early_stopping_rounds=EARLY_STOPPING_ROUNDS)

                if cv:
                    eval_rows.append({
                        "model_id":        MODEL_ID,
                        "product_id":      pid,
                        "horizon_key":     target_col,
                        "horizon_days":    horizon_days,
                        "eval_date":       today.isoformat(),
                        "mape":            cv.get("mape"),
                        "wmape":           cv.get("wmape"),   # 21_add_wmape_column.sql 실행 후 활성화
                        "rmse":            cv.get("rmse"),
                        "mae":             cv.get("mae"),
                        "coverage_rate":   cv.get("coverage_rate"),
                        "pinball_p10":     cv.get("pinball_p10"),
                        "pinball_p50":     cv.get("pinball_p50"),
                        "pinball_p90":     cv.get("pinball_p90"),
                        "n_folds":         cv.get("n_folds"),
                        "n_samples_total": cv.get("n_samples_total"),
                        "params_json":     json.dumps(
                            {k: v for k, v in params.items()
                             if k not in ("objective", "metric", "verbose")},
                            sort_keys=True,
                        ),
                    })
                    if "importance_gain" in cv:
                        fi_gain[target_col]  += cv["importance_gain"]
                        fi_split[target_col] += cv["importance_split"]
                        fi_count[target_col] += 1

                # b) 최종 80/20 split → forecast_result
                split_idx = int(len(valid) * TRAIN_RATIO)
                if split_idx < 10 or (len(valid) - split_idx) < 3:
                    skipped_count += 1
                    continue

                X_train, X_val = X.iloc[:split_idx], X.iloc[split_idx:]
                y_train, y_val = y[:split_idx],       y[split_idx:]

                predictions = {}
                for alpha in [0.1, 0.5, 0.9]:
                    p     = {**params, "alpha": alpha}
                    model = lgb.LGBMRegressor(**p)
                    _fit_lgb(model, X_train, y_train, X_val, y_val, EARLY_STOPPING_ROUNDS)
                    predictions[alpha] = model.predict(X_val)

                for i, (p10, p50, p90) in enumerate(
                    zip(predictions[0.1], predictions[0.5], predictions[0.9])
                ):
                    results.append({
                        "model_id":      MODEL_ID,
                        "product_id":    pid,
                        "forecast_date": today.isoformat(),
                        "target_date":   week_to_date.get(weeks[split_idx + i], today.isoformat()),
                        "horizon_days":  horizon_days,
                        "p10":           round(max(float(p10), 0), 6),
                        "p50":           round(max(float(p50), 0), 6),
                        "p90":           round(max(float(p90), 0), 6),
                        "actual_qty":    round(float(y_val[i]), 6),
                    })
                trained_count += 1

            else:
                # Fallback: 이동평균 기반 단순 예측 (lightgbm 미설치 시)
                recent  = y[-30:] if len(y) >= 30 else y
                p50_val = float(np.median(recent))
                p10_val = float(np.percentile(recent, 10))
                p90_val = float(np.percentile(recent, 90))

                results.append({
                    "model_id":      "moving_avg_v1",
                    "product_id":    pid,
                    "forecast_date": today.isoformat(),
                    "target_date":   today.isoformat(),
                    "horizon_days":  horizon_days,
                    "p10":           round(max(p10_val, 0), 6),
                    "p50":           round(max(p50_val, 0), 6),
                    "p90":           round(max(p90_val, 0), 6),
                    "actual_qty":    None,
                })
                trained_count += 1

    print(f"  학습 완료: {trained_count:,}개 모델, 스킵: {skipped_count:,}개")

    # ─── 4) 피처 중요도 집계 ─────────────────────────────────────────
    fi_rows = []
    for target_col in HORIZONS:
        if fi_count[target_col] == 0:
            continue
        avg_gain  = fi_gain[target_col]  / fi_count[target_col]
        avg_split = fi_split[target_col] / fi_count[target_col]
        rank_order = np.argsort(-avg_gain)

        for rank, idx in enumerate(rank_order):
            fi_rows.append({
                "model_id":         MODEL_ID,
                "horizon_key":      target_col,
                "eval_date":        today.isoformat(),
                "feature_name":     feature_cols[idx],
                "importance_gain":  round(float(avg_gain[idx]),  6),
                "importance_split": round(float(avg_split[idx]), 6),
                "rank_gain":        rank + 1,
            })

    # ─── 5) DB 적재 ──────────────────────────────────────────────────
    if eval_rows:
        upsert_batch("model_evaluation", eval_rows,
                     on_conflict="model_id,product_id,horizon_key,eval_date")
        print(f"  model_evaluation: {len(eval_rows):,}건 적재")

    if fi_rows:
        upsert_batch("feature_importance", fi_rows,
                     on_conflict="model_id,horizon_key,eval_date,feature_name")
        print(f"  feature_importance: {len(fi_rows):,}건 적재")

    if tuning_rows:
        upsert_batch("tuning_result", tuning_rows,
                     on_conflict="model_id,horizon_key,eval_date,params_json")
        print(f"  tuning_result: {len(tuning_rows):,}건 적재")

    if results:
        for i in range(0, len(results), 500):
            supabase.table("forecast_result").insert(results[i:i + 500]).execute()
        print(f"  forecast_result: {len(results):,}건 적재")

    # ─── 6) 평가 메트릭 요약 ─────────────────────────────────────────
    if eval_rows:
        eval_df = pd.DataFrame(eval_rows)
        print(f"\n  ── 평가 메트릭 요약 (주간) ──")
        for hk in HORIZONS:
            sub = eval_df[eval_df["horizon_key"] == hk]
            if sub.empty:
                continue
            mape_avg  = sub["mape"].dropna().mean()
            wmape_avg = sub["wmape"].dropna().mean() if "wmape" in sub.columns else None
            cov_avg   = sub["coverage_rate"].dropna().mean()
            wmape_str = f" | WMAPE={wmape_avg:.1f}%" if wmape_avg is not None else ""
            print(f"  {hk}: MAPE={mape_avg:.1f}%{wmape_str} | Coverage={cov_avg:.1f}% | 제품수={len(sub)}")

    # ─── 7) 피처 중요도 TOP 10 ───────────────────────────────────────
    if fi_rows:
        fi_df = pd.DataFrame(fi_rows)
        print(f"\n  ── 피처 중요도 TOP 10 (주간) ──")
        for hk in HORIZONS:
            sub = fi_df[(fi_df["horizon_key"] == hk) & (fi_df["rank_gain"] <= 10)]
            if sub.empty:
                continue
            print(f"  [{hk}]")
            for _, row in sub.iterrows():
                print(f"    {row['rank_gain']:>2}. {row['feature_name']:<30} gain={row['importance_gain']:.2f}")

    count = supabase.table("forecast_result").select("id", count="exact").execute()
    print(f"\n[S4] 완료 — forecast_result: {count.count:,}행")


if __name__ == "__main__":
    import sys
    tune_flag = "--tune" in sys.argv
    run(tune=tune_flag)
