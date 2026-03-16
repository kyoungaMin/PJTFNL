"""
Step 4L: Ridge / SVR Linear 수요예측 모델
기존 LightGBM 파이프라인과 동일한 피처 스토어·DB 구조 사용

Ridge: 안정적 정규화 선형 회귀 (L2), 과적합 억제
SVR Linear: Support Vector Regression (linear kernel), 이상치 강건

P10/P50/P90 생성 방식:
  - P50 = 모델 예측값
  - P10/P90 = P50 ± 학습 잔차의 10%/90% 분위수 (Conformal Prediction)

입력 테이블: feature_store_weekly, feature_store_monthly
출력 테이블: forecast_result, model_evaluation
"""

import json
from collections import defaultdict
from datetime import date

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.svm import LinearSVR
from sklearn.preprocessing import StandardScaler

from config import (
    supabase, upsert_batch,
    WEEKLY_FEATURE_COLS, MONTHLY_FEATURE_COLS,
    WEEKLY_CV_FOLDS, MONTHLY_CV_FOLDS,
)
from ml_utils import compute_metrics

# ─── 모델 설정 ───
MODELS = {
    "ridge_v1": {
        "label": "Ridge Regression",
        "cls": Ridge,
        "params": {"alpha": 1.0},
    },
    "svr_linear_v1": {
        "label": "SVR Linear",
        "cls": LinearSVR,
        "params": {"C": 1.0, "epsilon": 0.1, "max_iter": 10000, "dual": "auto"},
    },
}

WEEKLY_HORIZONS = {"target_1w": 7, "target_2w": 14, "target_4w": 28}
MONTHLY_HORIZONS = {"target_1m": 30, "target_3m": 90, "target_6m": 180}

WEEKLY_MIN_SAMPLES = 26
MONTHLY_MIN_SAMPLES = 6
TRAIN_RATIO = 0.8


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


def walk_forward_cv_linear(X: pd.DataFrame, y: np.ndarray,
                           model_cls, model_params: dict,
                           n_folds: int = 3, min_train_size: int = 20) -> dict | None:
    """Walk-Forward CV for linear models (Ridge / SVR)"""
    n = len(X)
    fold_size = n // (n_folds + 1)
    if fold_size < 3:
        return None

    all_y, all_p10, all_p50, all_p90 = [], [], [], []

    for fold in range(n_folds):
        train_end = (fold + 1) * fold_size
        val_end = min(train_end + fold_size, n)
        if train_end < min_train_size or val_end <= train_end:
            continue

        X_tr, y_tr = X.iloc[:train_end].values, y[:train_end]
        X_va = X.iloc[train_end:val_end].values
        y_va = y[train_end:val_end]

        # 스케일링
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_tr)
        X_va_s = scaler.transform(X_va)

        # 학습
        model = model_cls(**model_params)
        model.fit(X_tr_s, y_tr)

        # P50 예측
        p50_train = model.predict(X_tr_s)
        p50_val = np.maximum(model.predict(X_va_s), 0)

        # 잔차 기반 P10/P90 (Conformal Prediction)
        residuals = y_tr - p50_train
        q10 = np.percentile(residuals, 10)
        q90 = np.percentile(residuals, 90)

        p10_val = np.maximum(p50_val + q10, 0)
        p90_val = np.maximum(p50_val + q90, 0)

        all_y.append(y_va)
        all_p10.append(p10_val)
        all_p50.append(p50_val)
        all_p90.append(p90_val)

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
    return metrics


def train_and_predict(df: pd.DataFrame, products: np.ndarray,
                      feature_cols: list, horizons: dict,
                      min_samples: int, time_col: str,
                      time_to_date: dict, model_id: str,
                      model_cls, model_params: dict,
                      n_cv_folds: int):
    """단일 모델에 대해 전체 제품 학습·평가·예측"""
    today = date.today()
    results = []
    eval_rows = []
    trained_count = 0
    skipped_count = 0

    for pid in products:
        pdf = df[df["product_id"] == pid].copy()

        for target_col, horizon_days in horizons.items():
            valid = pdf.dropna(subset=[target_col])
            if len(valid) < min_samples:
                skipped_count += 1
                continue

            X = valid[feature_cols].fillna(0)
            y = valid[target_col].values
            times = valid[time_col].values

            # a) Walk-Forward CV → 평가 메트릭
            cv = walk_forward_cv_linear(
                X, y, model_cls, model_params,
                n_folds=n_cv_folds,
                min_train_size=max(min_samples // 2, 4),
            )
            if cv:
                eval_rows.append({
                    "model_id": model_id,
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
                    "params_json": json.dumps(model_params, sort_keys=True),
                })

            # b) 80/20 split → forecast_result
            split_idx = int(len(valid) * TRAIN_RATIO)
            min_train = 10 if min_samples >= 26 else 3
            min_val = 3 if min_samples >= 26 else 2
            if split_idx < min_train or (len(valid) - split_idx) < min_val:
                skipped_count += 1
                continue

            X_all = X.values
            scaler = StandardScaler()
            X_train_s = scaler.fit_transform(X_all[:split_idx])
            X_val_s = scaler.transform(X_all[split_idx:])
            y_train, y_val = y[:split_idx], y[split_idx:]

            model = model_cls(**model_params)
            model.fit(X_train_s, y_train)

            p50_train = model.predict(X_train_s)
            p50_val = np.maximum(model.predict(X_val_s), 0)

            # 잔차 기반 P10/P90
            residuals = y_train - p50_train
            q10 = np.percentile(residuals, 10)
            q90 = np.percentile(residuals, 90)
            p10_val = np.maximum(p50_val + q10, 0)
            p90_val = np.maximum(p50_val + q90, 0)

            for i in range(len(y_val)):
                results.append({
                    "model_id": model_id,
                    "product_id": pid,
                    "forecast_date": today.isoformat(),
                    "target_date": time_to_date.get(times[split_idx + i], today.isoformat()),
                    "horizon_days": horizon_days,
                    "p10": round(float(p10_val[i]), 6),
                    "p50": round(float(p50_val[i]), 6),
                    "p90": round(float(p90_val[i]), 6),
                    "actual_qty": round(float(y_val[i]), 6),
                })
            trained_count += 1

    return results, eval_rows, trained_count, skipped_count


def run_weekly():
    """주간 예측 — Ridge + SVR Linear"""
    print("\n" + "=" * 60)
    print("[S4L] Ridge / SVR Linear — 주간 예측 시작")
    print("=" * 60)

    rows = fetch_all("feature_store_weekly", "*")
    if not rows:
        print("  [!] feature_store_weekly 비어있음")
        return

    df = pd.DataFrame(rows).sort_values(["product_id", "year_week"])
    week_to_date = dict(zip(df["year_week"], df.get("week_start", pd.Series()))) if "week_start" in df.columns else {}

    feature_cols = [c for c in WEEKLY_FEATURE_COLS if c in df.columns]
    for col in feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    for t in WEEKLY_HORIZONS:
        df[t] = pd.to_numeric(df[t], errors="coerce")

    products = df["product_id"].unique()
    print(f"  데이터: {len(df):,}행, 제품: {len(products):,}개, 피처: {len(feature_cols)}개")

    for model_id, cfg in MODELS.items():
        print(f"\n  ── {cfg['label']} ({model_id}) ──")
        results, eval_rows, trained, skipped = train_and_predict(
            df, products, feature_cols, WEEKLY_HORIZONS,
            WEEKLY_MIN_SAMPLES, "year_week", week_to_date,
            model_id, cfg["cls"], cfg["params"],
            WEEKLY_CV_FOLDS,
        )
        print(f"    학습: {trained:,}개, 스킵: {skipped:,}개")
        _save_results(model_id, results, eval_rows)


def run_monthly():
    """월간 예측 — Ridge + SVR Linear"""
    print("\n" + "=" * 60)
    print("[S4L] Ridge / SVR Linear — 월간 예측 시작")
    print("=" * 60)

    rows = fetch_all("feature_store_monthly", "*")
    if not rows:
        print("  [!] feature_store_monthly 비어있음")
        return

    df = pd.DataFrame(rows).sort_values(["product_id", "year_month"])
    month_to_date = dict(zip(df["year_month"], df.get("month_start", pd.Series()))) if "month_start" in df.columns else {}

    feature_cols = [c for c in MONTHLY_FEATURE_COLS if c in df.columns]
    for col in feature_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    for t in MONTHLY_HORIZONS:
        df[t] = pd.to_numeric(df[t], errors="coerce")

    products = df["product_id"].unique()
    print(f"  데이터: {len(df):,}행, 제품: {len(products):,}개, 피처: {len(feature_cols)}개")

    # 월간 모델은 model_id에 _monthly 접미사 추가
    for model_id, cfg in MODELS.items():
        monthly_id = model_id.replace("_v1", "_monthly_v1")
        print(f"\n  ── {cfg['label']} ({monthly_id}) ──")
        results, eval_rows, trained, skipped = train_and_predict(
            df, products, feature_cols, MONTHLY_HORIZONS,
            MONTHLY_MIN_SAMPLES, "year_month", month_to_date,
            monthly_id, cfg["cls"], cfg["params"],
            MONTHLY_CV_FOLDS,
        )
        print(f"    학습: {trained:,}개, 스킵: {skipped:,}개")
        _save_results(monthly_id, results, eval_rows)


def _save_results(model_id: str, results: list, eval_rows: list):
    """결과를 DB에 저장"""
    if eval_rows:
        upsert_batch("model_evaluation", eval_rows,
                      on_conflict="model_id,product_id,horizon_key,eval_date")
        print(f"    model_evaluation: {len(eval_rows):,}건 적재")

        # 메트릭 요약
        eval_df = pd.DataFrame(eval_rows)
        for hk in eval_df["horizon_key"].unique():
            sub = eval_df[eval_df["horizon_key"] == hk]
            mape_avg = sub["mape"].dropna().mean()
            cov_avg = sub["coverage_rate"].dropna().mean()
            mae_avg = sub["mae"].dropna().mean()
            print(f"    {hk}: MAE={mae_avg:.1f} | MAPE={mape_avg:.1f}% | Coverage={cov_avg:.1f}% | 제품수={len(sub)}")

    if results:
        for i in range(0, len(results), 500):
            batch = results[i:i + 500]
            supabase.table("forecast_result").insert(batch).execute()
        print(f"    forecast_result: {len(results):,}건 적재")

    count = supabase.table("forecast_result").select("id", count="exact").execute()
    print(f"    DB 총 forecast_result: {count.count:,}행")


def run():
    """주간 + 월간 모두 실행"""
    run_weekly()
    run_monthly()

    print("\n" + "=" * 60)
    print("[S4L] 완료 — Ridge / SVR Linear 모델 적재 완료")
    count = supabase.table("forecast_result").select("id", count="exact").execute()
    print(f"  forecast_result 총 {count.count:,}행 (전 모델 합산)")
    print("=" * 60)


if __name__ == "__main__":
    import sys
    if "--weekly" in sys.argv:
        run_weekly()
    elif "--monthly" in sys.argv:
        run_monthly()
    else:
        run()
