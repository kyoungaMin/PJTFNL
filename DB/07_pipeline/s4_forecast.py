"""
Step 4: 수요예측 모델 — LightGBM Quantile Regression (P10/P50/P90)

입력 테이블: feature_store
출력 테이블: forecast_result
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import supabase, upsert_batch

MODEL_ID = "lgbm_q_v1"
HORIZONS = [7, 14, 30]  # 예측 지평(일)
MIN_SAMPLES = 60  # 제품별 최소 학습 데이터 수
TRAIN_RATIO = 0.8  # 학습:검증 비율

# LightGBM 피처 컬럼
FEATURE_COLS = [
    "order_qty_7d", "order_qty_30d", "order_qty_90d",
    "shipped_qty_7d", "shipped_qty_30d",
    "produced_qty_7d", "produced_qty_30d",
    "inventory_qty", "avg_lead_days", "avg_unit_price",
    "usd_krw", "fed_funds_rate", "wti_price", "indpro_index",
    "semi_export_amt", "semi_import_amt",
    "dow", "month",
]


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


def run():
    print("[S4] 수요예측 모델 학습/추론 시작")

    try:
        import lightgbm as lgb
    except ImportError:
        print("  [!] lightgbm 미설치. pip install lightgbm 필요")
        print("  [!] lightgbm 없이 단순 이동평균 fallback 사용")
        lgb = None

    # 1) feature_store 로드
    rows = fetch_all("feature_store", "*")
    if not rows:
        print("  [!] feature_store 비어있음. s3 먼저 실행 필요")
        return

    df = pd.DataFrame(rows)
    df["target_date"] = pd.to_datetime(df["target_date"])
    df = df.sort_values(["product_id", "target_date"])

    # 타겟: 해당일 수주량 (order_qty_7d / 7로 일평균 근사 대신, 7d 합계 자체를 타겟)
    df["target_qty"] = df["order_qty_7d"]

    # 수치형 변환
    for col in FEATURE_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df["target_qty"] = pd.to_numeric(df["target_qty"], errors="coerce")

    products = df["product_id"].unique()
    print(f"  feature_store: {len(df):,}행, 제품: {len(products):,}개")

    today = date.today()
    results = []

    for pid in products:
        pdf = df[df["product_id"] == pid].dropna(subset=["target_qty"]).copy()
        if len(pdf) < MIN_SAMPLES:
            continue

        X = pdf[FEATURE_COLS].fillna(0).values
        y = pdf["target_qty"].values
        dates = pdf["target_date"].values

        # 시간순 분할 (미래 누수 방지)
        split_idx = int(len(pdf) * TRAIN_RATIO)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]

        if lgb is not None:
            # LightGBM Quantile Regression
            predictions = {}
            for alpha in [0.1, 0.5, 0.9]:
                params = {
                    "objective": "quantile",
                    "alpha": alpha,
                    "metric": "quantile",
                    "n_estimators": 100,
                    "max_depth": 6,
                    "learning_rate": 0.05,
                    "num_leaves": 31,
                    "verbose": -1,
                }
                model = lgb.LGBMRegressor(**params)
                model.fit(X_train, y_train)
                preds = model.predict(X_val)
                predictions[alpha] = preds

            # 검증 결과 → forecast_result
            for i, (p10, p50, p90) in enumerate(
                zip(predictions[0.1], predictions[0.5], predictions[0.9])
            ):
                target_dt = pd.Timestamp(dates[split_idx + i]).date()
                for horizon in HORIZONS:
                    results.append({
                        "model_id": MODEL_ID,
                        "product_id": pid,
                        "forecast_date": today.isoformat(),
                        "target_date": target_dt.isoformat(),
                        "horizon_days": horizon,
                        "p10": round(max(float(p10), 0), 6),
                        "p50": round(max(float(p50), 0), 6),
                        "p90": round(max(float(p90), 0), 6),
                        "actual_qty": round(float(y_val[i]), 6),
                    })
        else:
            # Fallback: 이동평균 기반 단순 예측
            recent = y[-30:] if len(y) >= 30 else y
            p50_val = float(np.median(recent))
            p10_val = float(np.percentile(recent, 10))
            p90_val = float(np.percentile(recent, 90))

            for horizon in HORIZONS:
                target_dt = today + timedelta(days=horizon)
                results.append({
                    "model_id": "moving_avg_v1",
                    "product_id": pid,
                    "forecast_date": today.isoformat(),
                    "target_date": target_dt.isoformat(),
                    "horizon_days": horizon,
                    "p10": round(max(p10_val, 0), 6),
                    "p50": round(max(p50_val, 0), 6),
                    "p90": round(max(p90_val, 0), 6),
                    "actual_qty": None,
                })

    print(f"  예측 결과: {len(results):,}건")

    if results:
        # 배치 적재
        for i in range(0, len(results), 500):
            batch = results[i:i + 500]
            supabase.table("forecast_result").insert(batch).execute()
        print(f"  적재 완료")

    count = supabase.table("forecast_result").select("id", count="exact").execute()
    print(f"[S4] 완료 — forecast_result: {count.count:,}행")


if __name__ == "__main__":
    run()
