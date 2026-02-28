"""
Step 4m: 월간 수요예측 모델 — LightGBM Quantile Regression (P10/P50/P90)
월간 피처 스토어 기반, 호라이즌별 별도 모델 학습

입력 테이블: feature_store_monthly
출력 테이블: forecast_result, model_evaluation, feature_importance, tuning_result
"""

import json
import random
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd

from config import (
    supabase, upsert_batch, MONTHLY_FEATURE_COLS,
    MONTHLY_PARAM_GRID, MONTHLY_CV_FOLDS, TUNING_METRIC, TUNE_SAMPLE_PRODUCTS,
)
from ml_utils import compute_metrics, walk_forward_cv, grid_search_horizon

MODEL_ID = "lgbm_q_monthly_v1"
HORIZONS = {"target_1m": 30, "target_3m": 90, "target_6m": 180}
MIN_SAMPLES = 6
TRAIN_RATIO = 0.8
MIN_TRAIN_SIZE = 4  # walk-forward CV 최소 학습 크기

# LightGBM 기본 하이퍼파라미터
LGB_PARAMS = {
    "objective": "quantile",
    "metric": "quantile",
    "n_estimators": 200,
    "max_depth": 6,
    "learning_rate": 0.05,
    "num_leaves": 31,
    "min_child_samples": 15,
    "colsample_bytree": 0.8,
    "subsample": 0.8,
    "subsample_freq": 1,
    "verbose": -1,
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
    print("[S4m] 월간 수요예측 모델 학습/추론 시작")

    try:
        import lightgbm as lgb
    except ImportError:
        print("  [!] lightgbm 미설치. pip install lightgbm 필요")
        print("  [!] lightgbm 없이 단순 이동평균 fallback 사용")
        lgb = None

    # 1) feature_store_monthly 로드
    rows = fetch_all("feature_store_monthly", "*")
    if not rows:
        print("  [!] feature_store_monthly 비어있음. s3m 먼저 실행 필요")
        return

    df = pd.DataFrame(rows)
    df = df.sort_values(["product_id", "year_month"])

    if "month_start" in df.columns:
        month_to_date = dict(zip(df["year_month"], df["month_start"]))
    else:
        month_to_date = {}

    # 수치형 변환
    feature_cols = [c for c in MONTHLY_FEATURE_COLS if c in df.columns]
    for col in feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    for t in HORIZONS:
        df[t] = pd.to_numeric(df[t], errors="coerce")

    products = df["product_id"].unique()
    print(f"  feature_store_monthly: {len(df):,}행, 제품: {len(products):,}개")
    print(f"  피처: {len(feature_cols)}개, 호라이즌: {list(HORIZONS.keys())}")

    today = date.today()

    # ─── 2) Grid Search (tune=True 일 때만) ───
    horizon_params = {}
    tuning_rows = []

    if tune and lgb is not None:
        print("\n  ── Grid Search 시작 (월간) ──")
        for target_col, horizon_days in HORIZONS.items():
            print(f"\n  [{target_col}] horizon={horizon_days}일")

            sample_data = []
            eligible = [p for p in products
                        if df[(df["product_id"] == p)].dropna(subset=[target_col]).shape[0] >= MIN_SAMPLES]

            sampled = random.sample(eligible, min(TUNE_SAMPLE_PRODUCTS, len(eligible)))
            for pid in sampled:
                pdf = df[df["product_id"] == pid]
                valid = pdf.dropna(subset=[target_col])
                X = valid[feature_cols].fillna(0)
                y_arr = valid[target_col].values
                sample_data.append((X, y_arr))

            if not sample_data:
                print(f"    [!] 적격 제품 없음, 기본 파라미터 사용")
                horizon_params[target_col] = LGB_PARAMS.copy()
                continue

            best_params, gs_results = grid_search_horizon(
                sample_data, MONTHLY_PARAM_GRID, LGB_PARAMS,
                n_folds=MONTHLY_CV_FOLDS, metric_key=TUNING_METRIC,
            )
            horizon_params[target_col] = best_params

            best_metric = min(gs_results, key=lambda r: r["metric_value"])["metric_value"]
            for r in gs_results:
                tuning_rows.append({
                    "model_id": MODEL_ID,
                    "horizon_key": target_col,
                    "eval_date": today.isoformat(),
                    "params_json": json.dumps(r["params"], sort_keys=True),
                    "metric_name": r["metric_name"],
                    "metric_value": round(r["metric_value"], 6) if r["metric_value"] != float("inf") else None,
                    "is_best": r["metric_value"] == best_metric,
                    "n_folds": MONTHLY_CV_FOLDS,
                })

        print(f"\n  ── Grid Search 완료 ({len(tuning_rows)}건) ──\n")
    else:
        for target_col in HORIZONS:
            horizon_params[target_col] = LGB_PARAMS.copy()

    # ─── 3) 제품별 학습·평가·예측 ───
    results = []
    eval_rows = []
    fi_gain = defaultdict(lambda: np.zeros(len(feature_cols)))
    fi_split = defaultdict(lambda: np.zeros(len(feature_cols)))
    fi_count = defaultdict(int)
    trained_count = 0
    skipped_count = 0

    for pid in products:
        pdf = df[df["product_id"] == pid].copy()

        for target_col, horizon_days in HORIZONS.items():
            valid = pdf.dropna(subset=[target_col])
            if len(valid) < MIN_SAMPLES:
                skipped_count += 1
                continue

            X = valid[feature_cols].fillna(0)
            y = valid[target_col].values
            months = valid["year_month"].values

            params = horizon_params[target_col]

            if lgb is not None:
                # a) Walk-Forward CV → 메트릭 + 피처 중요도
                cv = walk_forward_cv(X, y, params,
                                     n_folds=MONTHLY_CV_FOLDS,
                                     min_train_size=MIN_TRAIN_SIZE)

                if cv:
                    eval_rows.append({
                        "model_id": MODEL_ID,
                        "product_id": pid,
                        "horizon_key": target_col,
                        "horizon_days": horizon_days,
                        "eval_date": today.isoformat(),
                        "mape": cv.get("mape"),
                        "rmse": cv.get("rmse"),
                        "mae": cv.get("mae"),
                        "coverage_rate": cv.get("coverage_rate"),
                        "pinball_p10": cv.get("pinball_p10"),
                        "pinball_p50": cv.get("pinball_p50"),
                        "pinball_p90": cv.get("pinball_p90"),
                        "n_folds": cv.get("n_folds"),
                        "n_samples_total": cv.get("n_samples_total"),
                        "params_json": json.dumps(
                            {k: v for k, v in params.items()
                             if k not in ("objective", "metric", "verbose")},
                            sort_keys=True,
                        ),
                    })
                    if "importance_gain" in cv:
                        fi_gain[target_col] += cv["importance_gain"]
                        fi_split[target_col] += cv["importance_split"]
                        fi_count[target_col] += 1

                # b) 최종 80/20 split → forecast_result
                split_idx = int(len(valid) * TRAIN_RATIO)
                if split_idx < 3 or (len(valid) - split_idx) < 2:
                    skipped_count += 1
                    continue

                X_train, X_val = X.iloc[:split_idx], X.iloc[split_idx:]
                y_train, y_val = y[:split_idx], y[split_idx:]

                predictions = {}
                for alpha in [0.1, 0.5, 0.9]:
                    p = {**params, "alpha": alpha}
                    model = lgb.LGBMRegressor(**p)
                    model.fit(X_train, y_train, eval_set=[(X_val, y_val)])
                    predictions[alpha] = model.predict(X_val)

                for i, (p10, p50, p90) in enumerate(
                    zip(predictions[0.1], predictions[0.5], predictions[0.9])
                ):
                    results.append({
                        "model_id": MODEL_ID,
                        "product_id": pid,
                        "forecast_date": today.isoformat(),
                        "target_date": month_to_date.get(months[split_idx + i], today.isoformat()),
                        "horizon_days": horizon_days,
                        "p10": round(max(float(p10), 0), 6),
                        "p50": round(max(float(p50), 0), 6),
                        "p90": round(max(float(p90), 0), 6),
                        "actual_qty": round(float(y_val[i]), 6),
                    })
                trained_count += 1
            else:
                recent = y[-6:] if len(y) >= 6 else y
                p50_val = float(np.median(recent))
                p10_val = float(np.percentile(recent, 10))
                p90_val = float(np.percentile(recent, 90))

                results.append({
                    "model_id": "moving_avg_monthly_v1",
                    "product_id": pid,
                    "forecast_date": today.isoformat(),
                    "target_date": today.isoformat(),
                    "horizon_days": horizon_days,
                    "p10": round(max(p10_val, 0), 6),
                    "p50": round(max(p50_val, 0), 6),
                    "p90": round(max(p90_val, 0), 6),
                    "actual_qty": None,
                })
                trained_count += 1

    print(f"  학습 완료: {trained_count:,}개 모델, 스킵: {skipped_count:,}개")

    # ─── 4) 피처 중요도 집계 ───
    fi_rows = []
    for target_col in HORIZONS:
        if fi_count[target_col] == 0:
            continue
        avg_gain = fi_gain[target_col] / fi_count[target_col]
        avg_split = fi_split[target_col] / fi_count[target_col]
        rank_order = np.argsort(-avg_gain)

        for rank, idx in enumerate(rank_order):
            fi_rows.append({
                "model_id": MODEL_ID,
                "horizon_key": target_col,
                "eval_date": today.isoformat(),
                "feature_name": feature_cols[idx],
                "importance_gain": round(float(avg_gain[idx]), 6),
                "importance_split": round(float(avg_split[idx]), 6),
                "rank_gain": rank + 1,
            })

    # ─── 5) DB 적재 ───
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
            batch = results[i:i + 500]
            supabase.table("forecast_result").insert(batch).execute()
        print(f"  forecast_result: {len(results):,}건 적재")

    # 메트릭 요약 출력
    if eval_rows:
        eval_df = pd.DataFrame(eval_rows)
        print(f"\n  ── 평가 메트릭 요약 (월간) ──")
        for hk in HORIZONS:
            sub = eval_df[eval_df["horizon_key"] == hk]
            if sub.empty:
                continue
            mape_avg = sub["mape"].dropna().mean()
            cov_avg = sub["coverage_rate"].dropna().mean()
            print(f"  {hk}: MAPE={mape_avg:.1f}% | Coverage={cov_avg:.1f}% | 제품수={len(sub)}")

    if fi_rows:
        fi_df = pd.DataFrame(fi_rows)
        print(f"\n  ── 피처 중요도 TOP 10 (월간) ──")
        for hk in HORIZONS:
            sub = fi_df[(fi_df["horizon_key"] == hk) & (fi_df["rank_gain"] <= 10)]
            if sub.empty:
                continue
            print(f"  [{hk}]")
            for _, row in sub.iterrows():
                print(f"    {row['rank_gain']:>2}. {row['feature_name']:<30} gain={row['importance_gain']:.2f}")

    count = supabase.table("forecast_result").select("id", count="exact").execute()
    print(f"\n[S4m] 완료 — forecast_result: {count.count:,}행 (월간+주간 합산)")


if __name__ == "__main__":
    import sys
    tune_flag = "--tune" in sys.argv
    run(tune=tune_flag)
