#!/usr/bin/env python
"""
LightGBM 월간 예측 — 실험 비교 프레임워크
===========================================
feature_store_monthly 기반, target_1m (1개월 후 수주량)

실험 목록:
  V1: 베이스라인 (월간 기본 설정)
  V2: Log 변환
  V3: 정규화 강화
  V4: Log + 정규화
  V5: 종합 개선 (V4 + 파생 피처 + 이상치 캡핑)

실행: python DB/07_pipeline/lgbm_experiments_monthly.py
출력: DB/07_pipeline/lgbm_monthly_comparison_report.html
      DB/07_pipeline/experiments/monthly_*.json
"""

import io, json, os, sys, warnings
from datetime import datetime
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
warnings.filterwarnings("ignore")

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")
from supabase import Client, create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

OUTPUT_DIR = Path(__file__).resolve().parent
EXPERIMENTS_DIR = OUTPUT_DIR / "experiments"
EXPERIMENTS_DIR.mkdir(exist_ok=True)

TARGET_COL = "target_1m"
TARGET_LABEL = "1개월 후 수주량"
TIME_COL = "year_month"
TRAIN_RATIO = 0.8
N_FOLDS = 5
EARLY_STOPPING = 50
HIGH_ERROR_PERCENTILE = 80

BASE_FEATURES = [
    "order_qty_lag1", "order_qty_lag2", "order_qty_lag3",
    "order_qty_lag6", "order_qty_lag12",
    "order_qty_ma3", "order_qty_ma6", "order_qty_ma12",
    "order_count_lag1", "order_amount_lag1",
    "order_qty_roc_3m", "order_qty_roc_6m",
    "order_qty_diff_1m", "order_qty_diff_3m",
    "order_qty_std3", "order_qty_std6", "order_qty_cv3",
    "order_qty_max3", "order_qty_min3",
    "order_qty_nonzero_3m", "order_qty_nonzero_6m",
    "revenue_qty_lag1", "revenue_qty_ma3",
    "produced_qty_lag1", "produced_qty_ma3",
    "inventory_qty", "inventory_months", "avg_lead_days", "book_to_bill_3m",
    "customer_count_lag1", "customer_count_ma3",
    "top1_customer_pct", "top3_customer_pct", "customer_hhi",
    "avg_unit_price", "order_avg_value",
    "sox_index", "sox_roc_3m", "dram_price", "dram_roc_3m",
    "nand_price", "silicon_wafer_price",
    "usd_krw", "usd_krw_roc_3m", "jpy_krw", "eur_krw", "cny_krw",
    "fed_funds_rate", "wti_price", "indpro_index", "ipman_index",
    "kr_base_rate", "kr_ipi_mfg", "kr_bsi_mfg", "cn_pmi_mfg",
    "semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc",
    "month", "quarter", "is_year_end",
]

FEATURE_NAME_KR = {
    "order_qty_lag1": "1개월전 수주량", "order_qty_lag2": "2개월전 수주량",
    "order_qty_lag3": "3개월전 수주량", "order_qty_lag6": "6개월전 수주량",
    "order_qty_lag12": "12개월전 수주량",
    "order_qty_ma3": "3개월 이동평균", "order_qty_ma6": "6개월 이동평균",
    "order_qty_ma12": "12개월 이동평균",
    "order_count_lag1": "1개월전 수주건수", "order_amount_lag1": "1개월전 수주금액",
    "order_qty_roc_3m": "3개월 변화율", "order_qty_roc_6m": "6개월 변화율",
    "order_qty_diff_1m": "1개월 차분", "order_qty_diff_3m": "3개월 차분",
    "order_qty_std3": "3개월 표준편차", "order_qty_std6": "6개월 표준편차",
    "order_qty_cv3": "3개월 변동계수",
    "order_qty_max3": "3개월 최대", "order_qty_min3": "3개월 최소",
    "order_qty_nonzero_3m": "3개월내 수주발생 횟수", "order_qty_nonzero_6m": "6개월내 수주발생 횟수",
    "revenue_qty_lag1": "1개월전 매출량", "revenue_qty_ma3": "3개월 매출 이동평균",
    "produced_qty_lag1": "1개월전 생산량", "produced_qty_ma3": "3개월 생산 이동평균",
    "inventory_qty": "재고량", "inventory_months": "재고 월수",
    "avg_lead_days": "평균 리드타임(일)", "book_to_bill_3m": "수주/출하 비율(3개월)",
    "customer_count_lag1": "1개월전 고객수", "customer_count_ma3": "3개월 고객수 이동평균",
    "top1_customer_pct": "상위1 고객 비중", "top3_customer_pct": "상위3 고객 비중",
    "customer_hhi": "고객 집중도(HHI)",
    "avg_unit_price": "평균 단가", "order_avg_value": "건당 수주금액",
    "sox_index": "SOX 반도체지수", "sox_roc_3m": "SOX 3개월 변화율",
    "dram_price": "DRAM 가격", "dram_roc_3m": "DRAM 3개월 변화율",
    "nand_price": "NAND 가격", "silicon_wafer_price": "실리콘웨이퍼 가격",
    "usd_krw": "USD/KRW 환율", "usd_krw_roc_3m": "환율 3개월 변화율",
    "jpy_krw": "JPY/KRW", "eur_krw": "EUR/KRW", "cny_krw": "CNY/KRW",
    "fed_funds_rate": "미 기준금리", "wti_price": "WTI 유가",
    "indpro_index": "미 산업생산지수", "ipman_index": "미 제조업지수",
    "kr_base_rate": "한국 기준금리", "kr_ipi_mfg": "한국 제조업생산지수",
    "kr_bsi_mfg": "한국 BSI", "cn_pmi_mfg": "중국 PMI",
    "semi_export_amt": "반도체 수출액", "semi_import_amt": "반도체 수입액",
    "semi_trade_balance": "반도체 무역수지", "semi_export_roc": "수출 변화율",
    "month": "월", "quarter": "분기", "is_year_end": "연말 여부",
    "lag1_div_ma3": "Lag1/MA3 비율", "std3_div_ma3": "변동성/평균 비율",
    "momentum_3x6": "모멘텀 교차", "log_lag1": "log(1개월전 수주량)",
    "lag1_x_cv3": "Lag1×변동계수", "inventory_ratio": "재고/수주 비율",
    "sin_month": "월 sin", "cos_month": "월 cos",
    "sin_quarter": "분기 sin", "cos_quarter": "분기 cos",
}

FEATURE_CATEGORIES = {
    "수주 이력(Lag)": ["order_qty_lag1","order_qty_lag2","order_qty_lag3",
                       "order_qty_lag6","order_qty_lag12",
                       "order_qty_ma3","order_qty_ma6","order_qty_ma12",
                       "order_count_lag1","order_amount_lag1"],
    "모멘텀": ["order_qty_roc_3m","order_qty_roc_6m","order_qty_diff_1m","order_qty_diff_3m"],
    "변동성": ["order_qty_std3","order_qty_std6","order_qty_cv3",
               "order_qty_max3","order_qty_min3","order_qty_nonzero_3m","order_qty_nonzero_6m"],
    "공급측": ["revenue_qty_lag1","revenue_qty_ma3","produced_qty_lag1","produced_qty_ma3",
               "inventory_qty","inventory_months","avg_lead_days","book_to_bill_3m"],
    "고객 집중도": ["customer_count_lag1","customer_count_ma3",
                    "top1_customer_pct","top3_customer_pct","customer_hhi"],
    "가격": ["avg_unit_price","order_avg_value"],
    "반도체 시장": ["sox_index","sox_roc_3m","dram_price","dram_roc_3m","nand_price","silicon_wafer_price"],
    "환율": ["usd_krw","usd_krw_roc_3m","jpy_krw","eur_krw","cny_krw"],
    "거시경제": ["fed_funds_rate","wti_price","indpro_index","ipman_index",
                 "kr_base_rate","kr_ipi_mfg","kr_bsi_mfg","cn_pmi_mfg"],
    "무역": ["semi_export_amt","semi_import_amt","semi_trade_balance","semi_export_roc"],
    "시간": ["month","quarter","is_year_end"],
}

# ─── 실험 정의 ───
EXPERIMENTS = [
    {
        "id": "monthly_v1_baseline",
        "label": "V1: 베이스라인",
        "desc": "월간 LightGBM 기본 설정",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 1000, "max_depth": 6, "learning_rate": 0.05,
            "num_leaves": 31, "min_child_samples": 15,
            "colsample_bytree": 0.8, "subsample": 0.8, "subsample_freq": 1,
            "reg_alpha": 0.1, "reg_lambda": 1.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": False, "extra_features": False, "outlier_cap": None,
    },
    {
        "id": "monthly_v2_log_transform",
        "label": "V2: Log 변환",
        "desc": "target에 log1p 변환 적용",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 1000, "max_depth": 6, "learning_rate": 0.05,
            "num_leaves": 31, "min_child_samples": 15,
            "colsample_bytree": 0.8, "subsample": 0.8, "subsample_freq": 1,
            "reg_alpha": 0.1, "reg_lambda": 1.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": True, "extra_features": False, "outlier_cap": None,
    },
    {
        "id": "monthly_v3_strong_reg",
        "label": "V3: 정규화 강화",
        "desc": "과적합 방지: max_depth↓, reg↑, min_child↑, lr↓",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 2000, "max_depth": 4, "learning_rate": 0.03,
            "num_leaves": 15, "min_child_samples": 40,
            "colsample_bytree": 0.7, "subsample": 0.7, "subsample_freq": 1,
            "reg_alpha": 1.0, "reg_lambda": 5.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": False, "extra_features": False, "outlier_cap": None,
    },
    {
        "id": "monthly_v4_log_reg",
        "label": "V4: Log+정규화",
        "desc": "Log 변환 + 정규화 강화 결합",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 2000, "max_depth": 4, "learning_rate": 0.03,
            "num_leaves": 15, "min_child_samples": 40,
            "colsample_bytree": 0.7, "subsample": 0.7, "subsample_freq": 1,
            "reg_alpha": 1.0, "reg_lambda": 5.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": True, "extra_features": False, "outlier_cap": None,
    },
    {
        "id": "monthly_v5_full",
        "label": "V5: 종합 개선",
        "desc": "Log + 정규화 + 파생 피처 + 이상치 캡핑(P99)",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 2000, "max_depth": 5, "learning_rate": 0.03,
            "num_leaves": 20, "min_child_samples": 30,
            "colsample_bytree": 0.75, "subsample": 0.75, "subsample_freq": 1,
            "reg_alpha": 0.5, "reg_lambda": 3.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": True, "extra_features": True, "outlier_cap": 99,
    },
]


# ═══════════════════════════════════════════════════
# 데이터 로드
# ═══════════════════════════════════════════════════

def fetch_all(table, select="*"):
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


def load_data():
    print("[데이터] feature_store_monthly 로드 중...")
    rows = fetch_all("feature_store_monthly")
    if not rows:
        print("  ERROR: feature_store_monthly 비어있음")
        sys.exit(1)
    df = pd.DataFrame(rows)
    df = df.sort_values([TIME_COL, "product_id"]).reset_index(drop=True)
    available = [c for c in BASE_FEATURES if c in df.columns]
    for col in available + [TARGET_COL]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=[TARGET_COL])
    print(f"  {len(df):,}행 | 피처: {len(available)}개 | 제품: {df['product_id'].nunique():,}개")
    return df, available


def split_data(df, feature_cols):
    periods = sorted(df[TIME_COL].unique())
    split_idx = int(len(periods) * TRAIN_RATIO)
    train_periods = set(periods[:split_idx])
    test_periods = set(periods[split_idx:])
    train_df = df[df[TIME_COL].isin(train_periods)].copy()
    test_df = df[df[TIME_COL].isin(test_periods)].copy()
    meta = {
        "n_train": len(train_df), "n_test": len(test_df),
        "n_features": len(feature_cols),
        "train_period": f"{periods[0]} ~ {periods[split_idx-1]}",
        "test_period": f"{periods[split_idx]} ~ {periods[-1]}",
        "n_products": int(df["product_id"].nunique()),
        "n_train_months": len(train_periods), "n_test_months": len(test_periods),
    }
    return train_df, test_df, meta


def add_derived_features(X):
    X = X.copy()
    X["lag1_div_ma3"] = X["order_qty_lag1"] / (X["order_qty_ma3"] + 1)
    X["std3_div_ma3"] = X["order_qty_std3"] / (X["order_qty_ma3"] + 1)
    X["momentum_3x6"] = X["order_qty_roc_3m"] * X["order_qty_roc_6m"]
    X["log_lag1"] = np.log1p(np.maximum(X["order_qty_lag1"], 0))
    X["lag1_x_cv3"] = X["order_qty_lag1"] * X["order_qty_cv3"]
    X["inventory_ratio"] = X["inventory_qty"] / (X["order_qty_lag1"] + 1)
    X["sin_month"] = np.sin(2 * np.pi * X["month"] / 12)
    X["cos_month"] = np.cos(2 * np.pi * X["month"] / 12)
    X["sin_quarter"] = np.sin(2 * np.pi * X["quarter"] / 4)
    X["cos_quarter"] = np.cos(2 * np.pi * X["quarter"] / 4)
    return X


# ═══════════════════════════════════════════════════
# 단일 실험 실행
# ═══════════════════════════════════════════════════

def run_single_experiment(exp, train_df, test_df, feature_cols, meta):
    exp_id = exp["id"]
    params = exp["params"]
    log_tf = exp["log_transform"]
    extra_feat = exp["extra_features"]
    outlier_cap = exp["outlier_cap"]

    print(f"\n{'='*50}")
    print(f"  [{exp['label']}] {exp['desc']}")
    print(f"{'='*50}")

    X_train = train_df[feature_cols].fillna(0)
    X_test = test_df[feature_cols].fillna(0)
    y_train = train_df[TARGET_COL].values.copy()
    y_test = test_df[TARGET_COL].values.copy()

    if extra_feat:
        X_train = add_derived_features(X_train)
        X_test = add_derived_features(X_test)
        print(f"  파생 피처 추가: {X_train.shape[1]}개")

    actual_features = list(X_train.columns)

    if outlier_cap is not None:
        cap_val = np.percentile(y_train[y_train > 0], outlier_cap)
        n_capped = (y_train > cap_val).sum()
        y_train = np.minimum(y_train, cap_val)
        print(f"  이상치 캡핑: P{outlier_cap} = {cap_val:.0f} ({n_capped}개)")

    if log_tf:
        y_train_model = np.log1p(np.maximum(y_train, 0))
        print(f"  Log1p 변환 적용")
    else:
        y_train_model = y_train

    # 5-Fold CV
    tscv = TimeSeriesSplit(n_splits=N_FOLDS)
    models, fold_metrics = [], []
    fi_gain_acc = np.zeros(X_train.shape[1])
    fi_split_acc = np.zeros(X_train.shape[1])

    for fold, (tr_idx, val_idx) in enumerate(tscv.split(X_train)):
        X_tr, X_val = X_train.iloc[tr_idx], X_train.iloc[val_idx]
        y_tr = y_train_model[tr_idx]
        y_val_model = y_train_model[val_idx]
        y_val_orig = y_train[val_idx]

        evals_result = {}
        model = lgb.LGBMRegressor(**params)
        model.fit(
            X_tr, y_tr,
            eval_set=[(X_tr, y_tr), (X_val, y_val_model)],
            eval_names=["train", "validation"],
            callbacks=[
                lgb.early_stopping(EARLY_STOPPING, verbose=False),
                lgb.record_evaluation(evals_result),
                lgb.log_evaluation(period=0),
            ],
        )

        pred_tr_raw, pred_val_raw = model.predict(X_tr), model.predict(X_val)
        if log_tf:
            pred_tr = np.maximum(np.expm1(pred_tr_raw), 0)
            pred_val = np.maximum(np.expm1(pred_val_raw), 0)
        else:
            pred_tr = np.maximum(pred_tr_raw, 0)
            pred_val = np.maximum(pred_val_raw, 0)

        y_tr_orig = y_train[tr_idx]
        fm = {
            "fold": fold + 1, "n_train": len(tr_idx), "n_val": len(val_idx),
            "best_iteration": model.best_iteration_,
            "train_mse": float(mean_squared_error(y_tr_orig, pred_tr)),
            "val_mse": float(mean_squared_error(y_val_orig, pred_val)),
            "train_mae": float(mean_absolute_error(y_tr_orig, pred_tr)),
            "val_mae": float(mean_absolute_error(y_val_orig, pred_val)),
            "train_r2": float(r2_score(y_tr_orig, pred_tr)),
            "val_r2": float(r2_score(y_val_orig, pred_val)),
        }
        fm["overfit_gap_r2"] = fm["train_r2"] - fm["val_r2"]

        tr_loss = evals_result["train"]["l2"]
        va_loss = evals_result["validation"]["l2"]
        step = max(1, len(tr_loss) // 100)
        fm["lc_train"] = tr_loss[::step]
        fm["lc_val"] = va_loss[::step]
        fm["lc_iters"] = list(range(0, len(tr_loss), step))

        fold_metrics.append(fm)
        models.append(model)
        fi_gain_acc += model.booster_.feature_importance(importance_type="gain")
        fi_split_acc += model.booster_.feature_importance(importance_type="split")

        print(f"  Fold {fold+1}: Val R²={fm['val_r2']:.4f} | Gap={fm['overfit_gap_r2']:.4f} | Stop={fm['best_iteration']}")

    # 앙상블
    individual_preds = []
    for model in models:
        pred_raw = model.predict(X_test)
        pred = np.maximum(np.expm1(pred_raw), 0) if log_tf else np.maximum(pred_raw, 0)
        individual_preds.append(pred)
    ensemble_pred = np.mean(individual_preds, axis=0)

    em = {
        "mse": float(mean_squared_error(y_test, ensemble_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_test, ensemble_pred))),
        "mae": float(mean_absolute_error(y_test, ensemble_pred)),
        "r2": float(r2_score(y_test, ensemble_pred)),
    }
    nz = y_test != 0
    em["mape"] = float(np.mean(np.abs((y_test[nz] - ensemble_pred[nz]) / y_test[nz])) * 100) if nz.sum() > 0 else None

    abs_errors = np.abs(y_test - ensemble_pred)
    em["error_p50"] = float(np.median(abs_errors))
    em["error_p90"] = float(np.percentile(abs_errors, 90))
    em["error_p99"] = float(np.percentile(abs_errors, 99))

    # Feature importance top 20
    avg_gain = fi_gain_acc / N_FOLDS
    top_idx = np.argsort(avg_gain)[::-1][:20]
    fi_top20 = [{"name": actual_features[i],
                 "name_kr": FEATURE_NAME_KR.get(actual_features[i], actual_features[i]),
                 "gain": round(float(avg_gain[i]), 2)} for i in top_idx]

    avg_val_r2 = np.mean([f["val_r2"] for f in fold_metrics])
    avg_gap = np.mean([f["overfit_gap_r2"] for f in fold_metrics])

    print(f"\n  [결과] R²={em['r2']:.4f} | MAE={em['mae']:.2f} | Avg Val R²={avg_val_r2:.4f} | Avg Gap={avg_gap:.4f}")

    # 에러 분석 (베이스라인만 상세)
    error_analysis = None
    if exp_id.endswith("v1_baseline"):
        error_threshold = np.percentile(abs_errors, HIGH_ERROR_PERCENTILE)
        high_mask = abs_errors >= error_threshold
        product_ids = test_df["product_id"].values
        year_months = test_df[TIME_COL].values

        # 피처별 Cohen's d
        X_test_arr = test_df[feature_cols].fillna(0).values
        feat_comp = []
        for i, col in enumerate(feature_cols):
            vals = X_test_arr[:, i]
            h_mean = float(np.mean(vals[high_mask])) if high_mask.sum() > 0 else 0
            l_mean = float(np.mean(vals[~high_mask])) if (~high_mask).sum() > 0 else 0
            h_std = float(np.std(vals[high_mask])) if high_mask.sum() > 0 else 0
            l_std = float(np.std(vals[~high_mask])) if (~high_mask).sum() > 0 else 0
            pooled = np.sqrt(((high_mask.sum()-1)*h_std**2 + ((~high_mask).sum()-1)*l_std**2)
                             / max(high_mask.sum() + (~high_mask).sum() - 2, 1))
            d = (h_mean - l_mean) / pooled if pooled > 0 else 0
            feat_comp.append({"feature": col, "feature_kr": FEATURE_NAME_KR.get(col, col),
                              "cohens_d": float(d), "abs_cohens_d": float(abs(d))})
        feat_comp.sort(key=lambda x: x["abs_cohens_d"], reverse=True)

        # Worst 20
        worst_idx = np.argsort(-abs_errors)[:20]
        worst = [{"rank": j+1, "product_id": str(product_ids[i]), "year_month": str(year_months[i]),
                  "actual": round(float(y_test[i]), 2), "predicted": round(float(ensemble_pred[i]), 2),
                  "abs_error": round(float(abs_errors[i]), 2)} for j, i in enumerate(worst_idx)]

        # 제품별 에러
        pe_df = pd.DataFrame({"product_id": product_ids, "abs_error": abs_errors})
        pe = pe_df.groupby("product_id").agg(mean_error=("abs_error","mean"),count=("abs_error","count"))\
                   .sort_values("mean_error",ascending=False).head(15).reset_index()
        pe_list = [{k: int(v) if isinstance(v,(np.integer,np.int64)) else float(v) if isinstance(v,(np.floating,np.float64)) else v
                    for k,v in r.items()} for r in pe.to_dict("records")]

        # 시간별 에러
        te_df = pd.DataFrame({"ym": year_months, "abs_error": abs_errors})
        te = te_df.groupby("ym").agg(mean_error=("abs_error","mean")).reset_index().sort_values("ym")
        te_list = [{"year_month": r["ym"], "mean_error": float(r["mean_error"])} for _, r in te.iterrows()]

        error_analysis = {
            "feature_comparison": feat_comp[:15], "worst_cases": worst,
            "product_errors": pe_list, "time_errors": te_list,
            "error_stats": {
                "mean": float(np.mean(abs_errors)), "median": float(np.median(abs_errors)),
                "p90": float(np.percentile(abs_errors, 90)), "p99": float(np.percentile(abs_errors, 99)),
                "threshold": float(error_threshold),
            },
        }

    result = {
        "id": exp_id, "label": exp["label"], "desc": exp["desc"],
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "meta": meta, "ensemble_metrics": em, "fold_metrics": fold_metrics,
        "feature_importance_top20": fi_top20,
        "params": {k: v for k, v in params.items() if k != "verbose"},
        "config": {"log_transform": log_tf, "extra_features": extra_feat, "outlier_cap": outlier_cap},
        "summary": {"avg_val_r2": round(float(avg_val_r2), 4), "avg_overfit_gap": round(float(avg_gap), 4)},
    }
    if error_analysis:
        result["error_analysis"] = error_analysis

    json_path = EXPERIMENTS_DIR / f"{exp_id}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)
    print(f"  저장: {json_path}")
    return result


# ═══════════════════════════════════════════════════
# 비교 대시보드 HTML
# ═══════════════════════════════════════════════════

def generate_comparison_html(results):
    print(f"\n[대시보드] 월간 비교 리포트 생성 중...")
    baseline = results[0]
    bm = baseline["ensemble_metrics"]
    for r in results:
        m = r["ensemble_metrics"]
        r["improvement"] = {
            "mse_pct": round((bm["mse"]-m["mse"])/bm["mse"]*100, 1) if bm["mse"]>0 else 0,
            "mae_pct": round((bm["mae"]-m["mae"])/bm["mae"]*100, 1) if bm["mae"]>0 else 0,
            "r2_pct": round((m["r2"]-bm["r2"])/max(abs(bm["r2"]),0.001)*100, 1),
            "rmse_pct": round((bm["rmse"]-m["rmse"])/bm["rmse"]*100, 1) if bm["rmse"]>0 else 0,
        }
    best_idx = max(range(len(results)), key=lambda i: results[i]["ensemble_metrics"]["r2"])

    data = {"results": results, "best_idx": best_idx, "best_label": results[best_idx]["label"],
            "best_r2": results[best_idx]["ensemble_metrics"]["r2"],
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"), "n_experiments": len(results),
            "cat_importance": {}, "error_analysis": results[0].get("error_analysis")}

    # 카테고리별 중요도 (베이스라인 기준)
    fi_map = {f["name"]: f["gain"] for f in results[0]["feature_importance_top20"]}
    for cat, feats in FEATURE_CATEGORIES.items():
        data["cat_importance"][cat] = sum(fi_map.get(f, 0) for f in feats)

    dj = json.dumps(data, ensure_ascii=False, default=str).replace("NaN","null").replace("Infinity","null")
    html = _build_html(dj)
    path = OUTPUT_DIR / "lgbm_monthly_comparison_report.html"
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  저장: {path}")
    return str(path)


def _build_html(dj):
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>LightGBM 월간 예측 — 실험 비교</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
:root{{--bg:#f0f4f8;--card:#fff;--primary:#7c3aed;--primary-light:#ede9fe;--text:#1e293b;--text-light:#64748b;--border:#e2e8f0;--green:#10b981;--red:#ef4444;--orange:#f59e0b;}}
*{{margin:0;padding:0;box-sizing:border-box;}}
body{{font-family:'Segoe UI',-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;}}
.header{{background:linear-gradient(135deg,#1e1b4b 0%,#7c3aed 100%);color:#fff;padding:28px 32px;}}
.header h1{{font-size:24px;font-weight:700;margin-bottom:4px;}}
.header .sub{{font-size:14px;opacity:.85;}}
.kpi-row{{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;padding:20px 32px;margin-top:-24px;}}
.kpi{{background:var(--card);border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08);text-align:center;}}
.kpi .label{{font-size:13px;color:var(--text-light);}} .kpi .value{{font-size:28px;font-weight:700;margin:4px 0;}}
.kpi .desc{{font-size:11px;color:var(--text-light);}}
.tabs{{display:flex;gap:2px;padding:0 32px;background:var(--card);border-bottom:1px solid var(--border);overflow-x:auto;}}
.tab{{padding:14px 20px;cursor:pointer;font-size:14px;font-weight:500;color:var(--text-light);border-bottom:3px solid transparent;white-space:nowrap;transition:all .2s;}}
.tab:hover{{color:var(--primary);background:var(--primary-light);}}
.tab.active{{color:var(--primary);border-bottom-color:var(--primary);font-weight:600;}}
.content{{padding:24px 32px;max-width:1400px;margin:0 auto;}}
.sec{{display:none;}}.sec.active{{display:block;}}
.card{{background:var(--card);border-radius:12px;padding:24px;margin-bottom:20px;box-shadow:0 1px 4px rgba(0,0,0,.06);}}
.card h3{{font-size:16px;font-weight:600;margin-bottom:12px;}}
.card .explain{{background:#f5f3ff;border-left:4px solid var(--primary);padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;font-size:13px;color:#5b21b6;}}
table{{width:100%;border-collapse:collapse;font-size:13px;}}
th{{background:#f8fafc;padding:10px 12px;text-align:left;font-weight:600;border-bottom:2px solid var(--border);}}
td{{padding:10px 12px;border-bottom:1px solid var(--border);}}
tr:hover{{background:#f8fafc;}}
.chart-box{{width:100%;min-height:400px;}}
.two-col{{display:grid;grid-template-columns:1fr 1fr;gap:20px;}}
.badge{{display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;}}
.badge-best{{background:#dcfce7;color:#16a34a;}} .badge-good{{background:#dbeafe;color:#2563eb;}}
.badge-warn{{background:#fef3c7;color:#d97706;}} .badge-bad{{background:#fee2e2;color:#dc2626;}}
.improve-up{{color:var(--green);font-weight:600;}} .improve-down{{color:var(--red);font-weight:600;}}
.winner{{border:2px solid var(--green);}}
@media(max-width:768px){{.two-col{{grid-template-columns:1fr;}}.content{{padding:16px;}}}}
</style>
</head>
<body>
<div class="header"><h1>LightGBM 월간 예측 — 실험 비교 대시보드</h1><div class="sub" id="hdr"></div></div>
<div class="kpi-row" id="kpis"></div>
<div class="tabs">
  <div class="tab active" data-t="summary">비교 요약</div>
  <div class="tab" data-t="overfit">과적합 비교</div>
  <div class="tab" data-t="improve">개선률 분석</div>
  <div class="tab" data-t="error">에러 분석 (V1)</div>
  <div class="tab" data-t="detail">실험 상세</div>
</div>
<div class="content">
  <div class="sec active" id="sec-summary">
    <div class="card"><h3>월간 예측 실험 설명</h3><div class="explain">
      월간 수요예측 모델(target_1m: 다음 달 수주량)에 대해 5가지 개선 기법을 적용하여 비교합니다.<br>
      주간 예측과 동일한 5-Fold Time-Series CV + 앙상블 방식을 사용합니다.
    </div></div>
    <div class="card"><h3>메트릭 비교</h3><table>
      <thead><tr><th>실험</th><th>설명</th><th>R²</th><th>MSE</th><th>RMSE</th><th>MAE</th><th>R² 개선</th><th>MAE 개선</th><th>판정</th></tr></thead>
      <tbody id="mt"></tbody></table></div>
    <div class="two-col">
      <div class="card"><h3>R² 비교</h3><div class="chart-box" id="c-r2"></div></div>
      <div class="card"><h3>MAE 비교</h3><div class="chart-box" id="c-mae"></div></div>
    </div>
  </div>
  <div class="sec" id="sec-overfit">
    <div class="card"><h3>과적합 비교</h3><div class="explain">
      Train-Val R² 격차가 작을수록 일반화 성능이 좋습니다. 0.05 이하: 양호 | 0.05~0.15: 경미 | 0.15+: 주의
    </div><div class="chart-box" id="c-gap"></div></div>
    <div class="card"><h3>학습 곡선 비교 (최종 Fold)</h3><div class="chart-box" id="c-lc"></div></div>
  </div>
  <div class="sec" id="sec-improve">
    <div class="card"><h3>베이스라인 대비 개선률</h3><div class="chart-box" id="c-imp"></div></div>
    <div class="card"><h3>레이더 차트</h3><div class="chart-box" id="c-radar"></div></div>
    <div class="card"><h3>에러 분포 (P50/P90/P99)</h3><div class="chart-box" id="c-edist"></div></div>
  </div>
  <div class="sec" id="sec-error">
    <div class="card"><h3>에러 통계 (V1 베이스라인)</h3><table>
      <thead><tr><th>지표</th><th>값</th></tr></thead><tbody id="es-tbl"></tbody></table></div>
    <div class="card"><h3>고에러 vs 저에러 — 핵심 차이 변수 (Cohen's d)</h3>
      <div class="explain">|d|>0.8: 큰 차이 | 0.5~0.8: 중간 | 0.2~0.5: 작은 차이</div>
      <div class="chart-box" id="c-cohend"></div></div>
    <div class="two-col">
      <div class="card"><h3>제품별 에러 TOP 15</h3><div class="chart-box" id="c-pe"></div></div>
      <div class="card"><h3>시간대별 에러 추이</h3><div class="chart-box" id="c-te"></div></div>
    </div>
    <div class="card"><h3>Worst 20 케이스</h3><table>
      <thead><tr><th>#</th><th>제품ID</th><th>월</th><th>실제</th><th>예측</th><th>절대에러</th></tr></thead>
      <tbody id="wc-tbl"></tbody></table></div>
  </div>
  <div class="sec" id="sec-detail">
    <div class="card"><h3>파라미터 비교</h3><table>
      <thead><tr><th>파라미터</th><th>V1</th><th>V2</th><th>V3</th><th>V4</th><th>V5</th></tr></thead>
      <tbody id="pt"></tbody></table></div>
    <div class="card"><h3>Feature Importance TOP 10 비교</h3><table id="fi-tbl"></table></div>
    <div class="card"><h3>카테고리별 중요도</h3><div class="chart-box" id="c-cat"></div></div>
    <div class="card"><h3>최종 추천</h3><div class="explain" id="rec" style="font-size:14px"></div></div>
  </div>
</div>
<script>
const D={dj};
const R=D.results, COLORS=['#7c3aed','#22c55e','#f59e0b','#3b82f6','#ef4444'], bi=D.best_idx;
document.getElementById('hdr').textContent=`${{D.n_experiments}}개 실험 | 최고: ${{D.best_label}} (R²=${{D.best_r2.toFixed(4)}}) | ${{D.timestamp}}`;

// KPIs
const bM=R[0].ensemble_metrics, bestM=R[bi].ensemble_metrics;
const r2g=((bestM.r2-bM.r2)/Math.max(Math.abs(bM.r2),.001)*100).toFixed(1);
[{{l:'최고 모델',v:D.best_label,d:`R²=${{bestM.r2.toFixed(4)}}`,c:''}},
 {{l:'R² 개선',v:`${{parseFloat(r2g)>=0?'+':''}}${{r2g}}%`,d:`${{bM.r2.toFixed(4)}}→${{bestM.r2.toFixed(4)}}`,c:parseFloat(r2g)>0?'improve-up':'improve-down'}},
 {{l:'MAE 개선',v:bestM.mae.toFixed(1),d:`V1(${{bM.mae.toFixed(1)}})→${{bestM.mae.toFixed(1)}}`,c:bestM.mae<bM.mae?'improve-up':''}},
 {{l:'실험 수',v:D.n_experiments,d:'5-Fold CV×5 앙상블',c:''}}
].forEach(k=>{{document.getElementById('kpis').innerHTML+=`<div class="kpi"><div class="label">${{k.l}}</div><div class="value ${{k.c}}">${{k.v}}</div><div class="desc">${{k.d}}</div></div>`;}});

// Tabs
document.querySelectorAll('.tab').forEach(t=>{{t.addEventListener('click',()=>{{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.sec').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');document.getElementById('sec-'+t.dataset.t).classList.add('active');
}});}});

// Metric table
const mt=document.getElementById('mt');
R.forEach((r,i)=>{{const m=r.ensemble_metrics,imp=r.improvement||{{r2_pct:0,mae_pct:0}};
  const badge=i===bi?'<span class="badge badge-best">BEST</span>':imp.r2_pct>0?'<span class="badge badge-good">개선</span>':imp.r2_pct<-5?'<span class="badge badge-bad">악화</span>':'<span class="badge badge-warn">유사</span>';
  mt.innerHTML+=`<tr class="${{i===bi?'winner':''}}"><td style="color:${{COLORS[i]}}"><strong>${{r.label}}</strong></td><td style="font-size:12px">${{r.desc}}</td>
    <td><strong>${{m.r2.toFixed(4)}}</strong></td><td>${{m.mse.toFixed(0)}}</td><td>${{m.rmse.toFixed(1)}}</td><td>${{m.mae.toFixed(1)}}</td>
    <td class="${{imp.r2_pct>0?'improve-up':'improve-down'}}">${{i===0?'-':imp.r2_pct>0?'+'+imp.r2_pct+'%':imp.r2_pct+'%'}}</td>
    <td class="${{imp.mae_pct>0?'improve-up':'improve-down'}}">${{i===0?'-':imp.mae_pct>0?'+'+imp.mae_pct+'%':imp.mae_pct+'%'}}</td>
    <td>${{badge}}</td></tr>`;
}});

Plotly.newPlot('c-r2',[{{x:R.map(r=>r.label),y:R.map(r=>r.ensemble_metrics.r2),type:'bar',marker:{{color:COLORS}},text:R.map(r=>r.ensemble_metrics.r2.toFixed(4)),textposition:'outside'}}],{{height:380,yaxis:{{title:'R²'}}}},{{responsive:true}});
Plotly.newPlot('c-mae',[{{x:R.map(r=>r.label),y:R.map(r=>r.ensemble_metrics.mae),type:'bar',marker:{{color:COLORS}},text:R.map(r=>r.ensemble_metrics.mae.toFixed(1)),textposition:'outside'}}],{{height:380,yaxis:{{title:'MAE'}}}},{{responsive:true}});

// Overfit
const gaps=R.map(r=>r.summary.avg_overfit_gap);
Plotly.newPlot('c-gap',[{{x:R.map(r=>r.label),y:gaps,type:'bar',marker:{{color:gaps.map(g=>g<=0.05?'#22c55e':g<=0.15?'#f59e0b':'#ef4444')}},text:gaps.map(g=>g.toFixed(4)),textposition:'outside'}}],{{height:380,yaxis:{{title:'Avg R² Gap'}},shapes:[{{type:'line',x0:-0.5,x1:R.length-0.5,y0:0.05,y1:0.05,line:{{color:'#22c55e',dash:'dash'}}}},{{type:'line',x0:-0.5,x1:R.length-0.5,y0:0.15,y1:0.15,line:{{color:'#ef4444',dash:'dash'}}}}]}},{{responsive:true}});

const lcT=R.map((r,i)=>{{const lf=r.fold_metrics[r.fold_metrics.length-1];return{{x:lf.lc_iters,y:lf.lc_val,name:r.label+' (Val)',line:{{color:COLORS[i],width:2}},mode:'lines'}};}});
Plotly.newPlot('c-lc',lcT,{{height:400,xaxis:{{title:'Iteration'}},yaxis:{{title:'Val MSE Loss'}},legend:{{orientation:'h',y:-0.15}}}},{{responsive:true}});

// Improvement
const impT=R.slice(1).map((r,i)=>({{x:['R²','MSE','RMSE','MAE'],y:[r.improvement.r2_pct,r.improvement.mse_pct,r.improvement.rmse_pct,r.improvement.mae_pct],name:r.label,type:'bar',marker:{{color:COLORS[i+1]}}}}));
Plotly.newPlot('c-imp',impT,{{barmode:'group',height:400,yaxis:{{title:'개선률 (%)'}},shapes:[{{type:'line',x0:-0.5,x1:3.5,y0:0,y1:0,line:{{color:'#94a3b8',dash:'dash'}}}}],legend:{{orientation:'h',y:-0.15}}}},{{responsive:true}});

function norm(v,hb){{const mn=Math.min(...v),mx=Math.max(...v);if(mx===mn)return v.map(()=>0.5);return v.map(x=>hb?(x-mn)/(mx-mn):(mx-x)/(mx-mn));}}
const rV=norm(R.map(r=>r.ensemble_metrics.r2),true),mV=norm(R.map(r=>r.ensemble_metrics.mae),false),rmV=norm(R.map(r=>r.ensemble_metrics.rmse),false),gV=norm(gaps,false),eV=norm(R.map(r=>r.ensemble_metrics.error_p90),false);
Plotly.newPlot('c-radar',R.map((r,i)=>({{type:'scatterpolar',fill:'toself',r:[rV[i],mV[i],rmV[i],gV[i],eV[i],rV[i]],theta:['R²','MAE','RMSE','과적합(↓)','P90(↓)','R²'],name:r.label,line:{{color:COLORS[i]}},opacity:0.6}})),{{height:500,polar:{{radialaxis:{{range:[0,1],showticklabels:false}}}},legend:{{orientation:'h',y:-0.1}}}},{{responsive:true}});

const edK=['error_p50','error_p90','error_p99'],edN=['P50','P90','P99'],edC=['#3b82f6','#f59e0b','#ef4444'];
Plotly.newPlot('c-edist',edK.map((k,ki)=>({{x:R.map(r=>r.label),y:R.map(r=>r.ensemble_metrics[k]),name:edN[ki],type:'bar',marker:{{color:edC[ki]}}}})),{{barmode:'group',height:400,yaxis:{{title:'절대에러'}},legend:{{orientation:'h',y:-0.12}}}},{{responsive:true}});

// Error analysis (V1)
if(D.error_analysis){{
  const ea=D.error_analysis;
  const est=document.getElementById('es-tbl');
  [['평균',ea.error_stats.mean.toFixed(2)],['중앙값(P50)',ea.error_stats.median.toFixed(2)],['P90',ea.error_stats.p90.toFixed(2)],['P99',ea.error_stats.p99.toFixed(2)],['고에러 경계(상위20%)',ea.error_stats.threshold.toFixed(2)]].forEach(([k,v])=>{{est.innerHTML+=`<tr><td><strong>${{k}}</strong></td><td>${{v}}</td></tr>`;}});

  const fc=ea.feature_comparison;
  Plotly.newPlot('c-cohend',[{{y:fc.map(f=>f.feature_kr).reverse(),x:fc.map(f=>f.cohens_d).reverse(),type:'bar',orientation:'h',marker:{{color:fc.map(f=>f.cohens_d>0?'#ef4444':'#3b82f6').reverse()}},text:fc.map(f=>'d='+f.cohens_d.toFixed(2)).reverse(),textposition:'outside'}}],{{height:Math.max(400,fc.length*30),margin:{{l:200}},xaxis:{{title:"Cohen's d",zeroline:true}}}},{{responsive:true}});

  const pe=ea.product_errors;
  Plotly.newPlot('c-pe',[{{y:pe.map(p=>'P:'+String(p.product_id).slice(-6)).reverse(),x:pe.map(p=>p.mean_error).reverse(),type:'bar',orientation:'h',marker:{{color:'#ef4444'}}}}],{{height:Math.max(350,pe.length*24),margin:{{l:120}},xaxis:{{title:'평균에러'}}}},{{responsive:true}});

  const te=ea.time_errors;
  Plotly.newPlot('c-te',[{{x:te.map(t=>t.year_month),y:te.map(t=>t.mean_error),type:'scatter',mode:'lines+markers',line:{{color:'#f59e0b',width:2}}}}],{{height:350,xaxis:{{title:'월',tickangle:-45}},yaxis:{{title:'평균에러'}}}},{{responsive:true}});

  const wt=document.getElementById('wc-tbl');
  ea.worst_cases.forEach(c=>{{wt.innerHTML+=`<tr><td>${{c.rank}}</td><td>${{c.product_id}}</td><td>${{c.year_month}}</td><td>${{c.actual.toLocaleString()}}</td><td>${{c.predicted.toLocaleString()}}</td><td style="color:var(--red);font-weight:600">${{c.abs_error.toLocaleString()}}</td></tr>`;}});
}}

// Detail
const pKeys=['max_depth','learning_rate','num_leaves','min_child_samples','reg_alpha','reg_lambda','colsample_bytree','subsample','n_estimators'];
const pL={{max_depth:'트리 깊이',learning_rate:'학습률',num_leaves:'리프 수',min_child_samples:'리프 최소 샘플',reg_alpha:'L1 정규화',reg_lambda:'L2 정규화',colsample_bytree:'피처 샘플링',subsample:'데이터 샘플링',n_estimators:'최대 트리 수'}};
const pt=document.getElementById('pt');
pKeys.forEach(k=>{{let cells=R.map((r,i)=>{{const v=r.params[k];const ch=i>0&&v!==R[0].params[k];return`<td${{ch?' style="color:var(--primary);font-weight:600"':''}}>${{v}}</td>`;}}).join('');pt.innerHTML+=`<tr><td><strong>${{pL[k]||k}}</strong></td>${{cells}}</tr>`;}});
['log_transform','extra_features','outlier_cap'].forEach(k=>{{const ls={{log_transform:'Log변환',extra_features:'파생피처',outlier_cap:'이상치캡핑'}};let cells=R.map(r=>{{const v=r.config[k];const d=v===true?'O':v===false?'-':v===null?'-':'P'+v;const a=v===true||(v!==null&&v!==false);return`<td${{a?' style="color:var(--green);font-weight:600"':''}}>${{d}}</td>`;}}).join('');pt.innerHTML+=`<tr><td><strong>${{ls[k]}}</strong></td>${{cells}}</tr>`;}});

const fiT=document.getElementById('fi-tbl');
fiT.innerHTML='<thead><tr><th>#</th>'+R.map((r,i)=>`<th style="color:${{COLORS[i]}}">${{r.label}}</th>`).join('')+'</tr></thead>';
let fb='';for(let i=0;i<10;i++){{fb+='<tr><td>'+(i+1)+'</td>';R.forEach(r=>{{const f=r.feature_importance_top20[i];fb+=`<td>${{f?f.name_kr+' <small>('+f.gain.toFixed(0)+')</small>':'-'}}</td>`;}});fb+='</tr>';}}
fiT.innerHTML+='<tbody>'+fb+'</tbody>';

// Category pie
const ci=D.cat_importance;const cNames=Object.keys(ci).sort((a,b)=>ci[b]-ci[a]);
Plotly.newPlot('c-cat',[{{labels:cNames,values:cNames.map(n=>Math.round(ci[n])),type:'pie',hole:0.4,textinfo:'label+percent',textposition:'outside',marker:{{colors:['#7c3aed','#22c55e','#f59e0b','#ef4444','#3b82f6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1','#14b8a6']}}}}],{{height:500}},{{responsive:true}});

// Recommendation
const rec=document.getElementById('rec');
const best=R[bi];
rec.innerHTML=`<strong>추천 모델: ${{best.label}}</strong><br><br>${{best.desc}}<br><br>
베이스라인 대비 R²: ${{bM.r2.toFixed(4)}} → ${{bestM.r2.toFixed(4)}}<br>
과적합 격차: ${{R[0].summary.avg_overfit_gap.toFixed(4)}} → ${{best.summary.avg_overfit_gap.toFixed(4)}}<br><br>
<strong>다음 단계:</strong><br>1. 추천 모델 설정을 s4m_forecast_monthly.py에 반영<br>
2. 제품 세그먼트별 개별 모델 학습 시도<br>3. 외부 지표 시차 피처 추가 실험`;
</script>
</body></html>"""


# ═══════════════════════════════════════════════════
def main():
    print("="*60)
    print("  LightGBM 월간 예측 — 실험 비교 프레임워크")
    print(f"  {len(EXPERIMENTS)}개 실험 실행 → 비교 대시보드 생성")
    print("="*60)

    df, feature_cols = load_data()
    train_df, test_df, meta = split_data(df, feature_cols)
    print(f"[분할] Train: {len(train_df):,}행 ({meta['n_train_months']}개월) | Test: {len(test_df):,}행 ({meta['n_test_months']}개월)")

    results = []
    for exp in EXPERIMENTS:
        result = run_single_experiment(exp, train_df, test_df, feature_cols, meta)
        results.append(result)

    output_path = generate_comparison_html(results)

    print("\n" + "="*60)
    print("  월간 실험 결과 요약")
    print("="*60)
    print(f"  {'실험':<20} {'R²':>8} {'MAE':>8} {'RMSE':>8} {'Avg Gap':>8}")
    print("  " + "-"*56)
    best_i = max(range(len(results)), key=lambda i: results[i]["ensemble_metrics"]["r2"])
    for i, r in enumerate(results):
        m = r["ensemble_metrics"]
        mark = " ★" if i == best_i else ""
        print(f"  {r['label']:<20} {m['r2']:>8.4f} {m['mae']:>8.1f} {m['rmse']:>8.1f} {r['summary']['avg_overfit_gap']:>8.4f}{mark}")

    print(f"\n  비교 대시보드: {output_path}")
    print("="*60)

if __name__ == "__main__":
    main()
