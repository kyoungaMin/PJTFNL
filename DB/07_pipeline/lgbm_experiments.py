#!/usr/bin/env python
"""
LightGBM 실험 비교 프레임워크
===============================
5가지 모델 설정을 순차 실행하고 비교 대시보드를 생성합니다.

실험 목록:
  V1: 베이스라인 (현재 설정)
  V2: Log 변환 (target log1p/expm1)
  V3: 정규화 강화 (max_depth↓, reg↑)
  V4: Log + 정규화 결합
  V5: 종합 개선 (V4 + 파생 피처 + 이상치 캡핑)

실행: python DB/07_pipeline/lgbm_experiments.py
출력: DB/07_pipeline/lgbm_comparison_report.html
      DB/07_pipeline/experiments/*.json
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

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit

# ─── 프로젝트 루트 & .env 로드 ───
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

TARGET_COL = "target_1w"
TRAIN_RATIO = 0.8
N_FOLDS = 5
EARLY_STOPPING = 50

BASE_FEATURES = [
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

FEATURE_NAME_KR = {
    "order_qty_lag1": "1주전 수주량", "order_qty_lag2": "2주전 수주량",
    "order_qty_lag4": "4주전 수주량", "order_qty_ma4": "4주 이동평균",
    "order_qty_ma13": "13주 이동평균", "order_qty_ma26": "26주 이동평균",
    "order_qty_std4": "4주 표준편차", "order_qty_std13": "13주 표준편차",
    "order_qty_cv4": "4주 변동계수", "order_qty_max4": "4주 최대",
    "order_qty_min4": "4주 최소", "revenue_qty_lag1": "1주전 매출량",
    "revenue_qty_ma4": "4주 매출 이동평균", "produced_qty_lag1": "1주전 생산량",
    "produced_qty_ma4": "4주 생산 이동평균", "inventory_qty": "재고량",
    "avg_unit_price": "평균 단가", "order_avg_value": "건당 수주금액",
    "sox_index": "SOX 반도체지수", "dram_price": "DRAM 가격",
    "usd_krw": "USD/KRW 환율", "lag1_div_ma4": "Lag1/MA4 비율",
    "std4_div_ma4": "변동성/평균 비율", "momentum_4x13": "모멘텀 교차",
    "log_lag1": "log(1주전 수주량)", "lag1_x_cv4": "Lag1×변동계수",
    "inventory_ratio": "재고/수주 비율", "sin_week": "주차 sin",
    "cos_week": "주차 cos", "sin_month": "월 sin", "cos_month": "월 cos",
}


# ═══════════════════════════════════════════════════
# 실험 정의
# ═══════════════════════════════════════════════════

EXPERIMENTS = [
    {
        "id": "v1_baseline",
        "label": "V1: 베이스라인",
        "desc": "현재 LightGBM 기본 설정",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 1000, "max_depth": 6, "learning_rate": 0.05,
            "num_leaves": 31, "min_child_samples": 20,
            "colsample_bytree": 0.8, "subsample": 0.8, "subsample_freq": 1,
            "reg_alpha": 0.1, "reg_lambda": 1.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": False,
        "extra_features": False,
        "outlier_cap": None,
    },
    {
        "id": "v2_log_transform",
        "label": "V2: Log 변환",
        "desc": "target에 log1p 변환 → 대규모 수주 에러 감소",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 1000, "max_depth": 6, "learning_rate": 0.05,
            "num_leaves": 31, "min_child_samples": 20,
            "colsample_bytree": 0.8, "subsample": 0.8, "subsample_freq": 1,
            "reg_alpha": 0.1, "reg_lambda": 1.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": True,
        "extra_features": False,
        "outlier_cap": None,
    },
    {
        "id": "v3_strong_reg",
        "label": "V3: 정규화 강화",
        "desc": "과적합 방지: max_depth↓, reg↑, min_child↑, lr↓",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 2000, "max_depth": 4, "learning_rate": 0.03,
            "num_leaves": 15, "min_child_samples": 50,
            "colsample_bytree": 0.7, "subsample": 0.7, "subsample_freq": 1,
            "reg_alpha": 1.0, "reg_lambda": 5.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": False,
        "extra_features": False,
        "outlier_cap": None,
    },
    {
        "id": "v4_log_reg",
        "label": "V4: Log+정규화",
        "desc": "Log 변환 + 정규화 강화 결합",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 2000, "max_depth": 4, "learning_rate": 0.03,
            "num_leaves": 15, "min_child_samples": 50,
            "colsample_bytree": 0.7, "subsample": 0.7, "subsample_freq": 1,
            "reg_alpha": 1.0, "reg_lambda": 5.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": True,
        "extra_features": False,
        "outlier_cap": None,
    },
    {
        "id": "v5_full",
        "label": "V5: 종합 개선",
        "desc": "Log + 정규화 + 파생 피처 + 이상치 캡핑(P99)",
        "params": {
            "objective": "regression", "metric": "mse",
            "n_estimators": 2000, "max_depth": 5, "learning_rate": 0.03,
            "num_leaves": 20, "min_child_samples": 40,
            "colsample_bytree": 0.75, "subsample": 0.75, "subsample_freq": 1,
            "reg_alpha": 0.5, "reg_lambda": 3.0, "verbose": -1, "n_jobs": -1,
        },
        "log_transform": True,
        "extra_features": True,
        "outlier_cap": 99,
    },
]


# ═══════════════════════════════════════════════════
# 데이터 로드
# ═══════════════════════════════════════════════════

def fetch_all(table: str, select: str = "*") -> list:
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
    print("[데이터] feature_store_weekly 로드 중...")
    rows = fetch_all("feature_store_weekly")
    if not rows:
        print("  ERROR: feature_store_weekly 비어있음")
        sys.exit(1)

    df = pd.DataFrame(rows)
    df = df.sort_values(["year_week", "product_id"]).reset_index(drop=True)

    available = [c for c in BASE_FEATURES if c in df.columns]
    for col in available + [TARGET_COL]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df = df.dropna(subset=[TARGET_COL])
    print(f"  {len(df):,}행 | 피처: {len(available)}개")
    return df, available


def split_data(df, feature_cols):
    weeks = sorted(df["year_week"].unique())
    split_idx = int(len(weeks) * TRAIN_RATIO)
    train_weeks = set(weeks[:split_idx])
    test_weeks = set(weeks[split_idx:])

    train_df = df[df["year_week"].isin(train_weeks)].copy()
    test_df = df[df["year_week"].isin(test_weeks)].copy()

    meta = {
        "n_train": len(train_df), "n_test": len(test_df),
        "n_features": len(feature_cols),
        "train_period": f"{weeks[0]} ~ {weeks[split_idx-1]}",
        "test_period": f"{weeks[split_idx]} ~ {weeks[-1]}",
        "n_products": int(df["product_id"].nunique()),
    }
    return train_df, test_df, meta


# ═══════════════════════════════════════════════════
# 파생 피처 생성
# ═══════════════════════════════════════════════════

def add_derived_features(X: pd.DataFrame) -> pd.DataFrame:
    """에러 분석 결과 기반 파생 피처 추가"""
    X = X.copy()

    # Lag1 / MA4 비율 (급격한 수요 변동 감지)
    X["lag1_div_ma4"] = X["order_qty_lag1"] / (X["order_qty_ma4"] + 1)

    # 변동성 / 평균 비율 (수주 불안정성)
    X["std4_div_ma4"] = X["order_qty_std4"] / (X["order_qty_ma4"] + 1)

    # 모멘텀 교차 (단기 × 장기 추세 방향)
    X["momentum_4x13"] = X["order_qty_roc_4w"] * X["order_qty_roc_13w"]

    # 로그 수주량 (스케일 정규화)
    X["log_lag1"] = np.log1p(np.maximum(X["order_qty_lag1"], 0))

    # Lag1 × CV (변동성과 크기의 상호작용)
    X["lag1_x_cv4"] = X["order_qty_lag1"] * X["order_qty_cv4"]

    # 재고 / 수주 비율
    X["inventory_ratio"] = X["inventory_qty"] / (X["order_qty_lag1"] + 1)

    # 계절성 강화 (sin/cos 변환)
    X["sin_week"] = np.sin(2 * np.pi * X["week_num"] / 52)
    X["cos_week"] = np.cos(2 * np.pi * X["week_num"] / 52)
    X["sin_month"] = np.sin(2 * np.pi * X["month"] / 12)
    X["cos_month"] = np.cos(2 * np.pi * X["month"] / 12)

    return X


# ═══════════════════════════════════════════════════
# 단일 실험 실행
# ═══════════════════════════════════════════════════

def run_single_experiment(exp_config, train_df, test_df, feature_cols, meta):
    """단일 실험 실행: 5-Fold CV → 앙상블 → 메트릭"""
    exp_id = exp_config["id"]
    params = exp_config["params"]
    log_tf = exp_config["log_transform"]
    extra_feat = exp_config["extra_features"]
    outlier_cap = exp_config["outlier_cap"]

    print(f"\n{'='*50}")
    print(f"  [{exp_config['label']}] {exp_config['desc']}")
    print(f"{'='*50}")

    # 피처 준비
    X_train = train_df[feature_cols].fillna(0)
    X_test = test_df[feature_cols].fillna(0)
    y_train = train_df[TARGET_COL].values.copy()
    y_test = test_df[TARGET_COL].values.copy()

    # 파생 피처
    if extra_feat:
        X_train = add_derived_features(X_train)
        X_test = add_derived_features(X_test)
        print(f"  파생 피처 추가: {X_train.shape[1]}개 (기존 {len(feature_cols)}개)")

    actual_features = list(X_train.columns)

    # 이상치 캡핑
    if outlier_cap is not None:
        cap_val = np.percentile(y_train[y_train > 0], outlier_cap)
        n_capped = (y_train > cap_val).sum()
        y_train = np.minimum(y_train, cap_val)
        print(f"  이상치 캡핑: P{outlier_cap} = {cap_val:.0f} ({n_capped}개 클리핑)")

    # Log 변환
    if log_tf:
        y_train_model = np.log1p(np.maximum(y_train, 0))
        print(f"  Log1p 변환 적용 (target range: {y_train_model.min():.2f} ~ {y_train_model.max():.2f})")
    else:
        y_train_model = y_train

    # ── 5-Fold Time-Series CV ──
    tscv = TimeSeriesSplit(n_splits=N_FOLDS)
    models = []
    fold_metrics = []
    fi_gain_acc = np.zeros(X_train.shape[1])
    fi_split_acc = np.zeros(X_train.shape[1])

    for fold, (tr_idx, val_idx) in enumerate(tscv.split(X_train)):
        X_tr = X_train.iloc[tr_idx]
        X_val = X_train.iloc[val_idx]
        y_tr = y_train_model[tr_idx]
        y_val_model = y_train_model[val_idx]
        y_val_orig = y_train[val_idx]  # 원본 스케일 (메트릭용)

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

        # 예측 (원본 스케일로 변환)
        pred_tr_raw = model.predict(X_tr)
        pred_val_raw = model.predict(X_val)

        if log_tf:
            pred_tr = np.maximum(np.expm1(pred_tr_raw), 0)
            pred_val = np.maximum(np.expm1(pred_val_raw), 0)
            y_tr_orig = y_train[tr_idx]
        else:
            pred_tr = np.maximum(pred_tr_raw, 0)
            pred_val = np.maximum(pred_val_raw, 0)
            y_tr_orig = y_train[tr_idx]

        fm = {
            "fold": fold + 1,
            "n_train": len(tr_idx), "n_val": len(val_idx),
            "best_iteration": model.best_iteration_,
            "train_mse": float(mean_squared_error(y_tr_orig, pred_tr)),
            "val_mse": float(mean_squared_error(y_val_orig, pred_val)),
            "train_mae": float(mean_absolute_error(y_tr_orig, pred_tr)),
            "val_mae": float(mean_absolute_error(y_val_orig, pred_val)),
            "train_r2": float(r2_score(y_tr_orig, pred_tr)),
            "val_r2": float(r2_score(y_val_orig, pred_val)),
        }
        fm["overfit_gap_r2"] = fm["train_r2"] - fm["val_r2"]

        # 학습 곡선 저장 (샘플링)
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

    # ── 앙상블 평가 (Test) ──
    individual_preds = []
    for model in models:
        pred_raw = model.predict(X_test)
        if log_tf:
            pred = np.maximum(np.expm1(pred_raw), 0)
        else:
            pred = np.maximum(pred_raw, 0)
        individual_preds.append(pred)

    ensemble_pred = np.mean(individual_preds, axis=0)

    ensemble_metrics = {
        "mse": float(mean_squared_error(y_test, ensemble_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_test, ensemble_pred))),
        "mae": float(mean_absolute_error(y_test, ensemble_pred)),
        "r2": float(r2_score(y_test, ensemble_pred)),
    }

    # MAPE
    nz = y_test != 0
    if nz.sum() > 0:
        ensemble_metrics["mape"] = float(
            np.mean(np.abs((y_test[nz] - ensemble_pred[nz]) / y_test[nz])) * 100
        )
    else:
        ensemble_metrics["mape"] = None

    # 에러 분석 요약
    abs_errors = np.abs(y_test - ensemble_pred)
    ensemble_metrics["error_p50"] = float(np.median(abs_errors))
    ensemble_metrics["error_p90"] = float(np.percentile(abs_errors, 90))
    ensemble_metrics["error_p99"] = float(np.percentile(abs_errors, 99))

    # Feature importance top 20
    avg_gain = fi_gain_acc / N_FOLDS
    top_idx = np.argsort(avg_gain)[::-1][:20]
    fi_top20 = []
    for i in top_idx:
        fname = actual_features[i]
        fi_top20.append({
            "name": fname,
            "name_kr": FEATURE_NAME_KR.get(fname, fname),
            "gain": round(float(avg_gain[i]), 2),
        })

    # 과적합 요약
    avg_val_r2 = np.mean([f["val_r2"] for f in fold_metrics])
    avg_gap = np.mean([f["overfit_gap_r2"] for f in fold_metrics])

    print(f"\n  [결과] R²={ensemble_metrics['r2']:.4f} | MAE={ensemble_metrics['mae']:.2f} | "
          f"Avg Val R²={avg_val_r2:.4f} | Avg Gap={avg_gap:.4f}")

    # JSON 저장
    result = {
        "id": exp_id,
        "label": exp_config["label"],
        "desc": exp_config["desc"],
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "meta": meta,
        "ensemble_metrics": ensemble_metrics,
        "fold_metrics": fold_metrics,
        "feature_importance_top20": fi_top20,
        "params": {k: v for k, v in params.items() if k != "verbose"},
        "config": {
            "log_transform": log_tf,
            "extra_features": extra_feat,
            "outlier_cap": outlier_cap,
        },
        "summary": {
            "avg_val_r2": round(float(avg_val_r2), 4),
            "avg_overfit_gap": round(float(avg_gap), 4),
        },
    }

    json_path = EXPERIMENTS_DIR / f"{exp_id}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)
    print(f"  저장: {json_path}")

    return result


# ═══════════════════════════════════════════════════
# 비교 대시보드 HTML 생성
# ═══════════════════════════════════════════════════

def generate_comparison_html(results: list):
    """비교 대시보드 생성"""
    print(f"\n[대시보드] 비교 리포트 생성 중...")

    # 베이스라인 참조
    baseline = results[0]
    baseline_metrics = baseline["ensemble_metrics"]

    # 개선률 계산
    for r in results:
        m = r["ensemble_metrics"]
        r["improvement"] = {
            "mse_pct": round((baseline_metrics["mse"] - m["mse"]) / baseline_metrics["mse"] * 100, 1)
            if baseline_metrics["mse"] > 0 else 0,
            "mae_pct": round((baseline_metrics["mae"] - m["mae"]) / baseline_metrics["mae"] * 100, 1)
            if baseline_metrics["mae"] > 0 else 0,
            "r2_pct": round((m["r2"] - baseline_metrics["r2"]) / max(abs(baseline_metrics["r2"]), 0.001) * 100, 1),
            "rmse_pct": round((baseline_metrics["rmse"] - m["rmse"]) / baseline_metrics["rmse"] * 100, 1)
            if baseline_metrics["rmse"] > 0 else 0,
        }

    # 최고 R² 모델 찾기
    best_idx = max(range(len(results)), key=lambda i: results[i]["ensemble_metrics"]["r2"])
    best_model = results[best_idx]

    data = {
        "results": results,
        "best_idx": best_idx,
        "best_label": best_model["label"],
        "best_r2": best_model["ensemble_metrics"]["r2"],
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "n_experiments": len(results),
    }

    data_json = json.dumps(data, ensure_ascii=False, default=str)
    data_json = data_json.replace("NaN", "null").replace("Infinity", "null")

    html = _build_comparison_html(data_json)

    output_path = OUTPUT_DIR / "lgbm_comparison_report.html"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"  저장: {output_path}")
    return str(output_path)


def _build_comparison_html(data_json: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LightGBM 실험 비교 대시보드</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
:root {{
  --bg: #f0f4f8; --card: #fff; --primary: #2563eb; --primary-light: #dbeafe;
  --text: #1e293b; --text-light: #64748b; --border: #e2e8f0;
  --green: #10b981; --red: #ef4444; --orange: #f59e0b; --purple: #8b5cf6;
}}
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:'Segoe UI',-apple-system,sans-serif; background:var(--bg); color:var(--text); line-height:1.6; }}
.header {{ background:linear-gradient(135deg,#0f172a 0%,#1e40af 100%); color:#fff; padding:28px 32px; }}
.header h1 {{ font-size:24px; font-weight:700; margin-bottom:4px; }}
.header .sub {{ font-size:14px; opacity:.85; }}
.kpi-row {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; padding:20px 32px; margin-top:-24px; }}
.kpi {{ background:var(--card); border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,.08); text-align:center; }}
.kpi .label {{ font-size:13px; color:var(--text-light); }}
.kpi .value {{ font-size:28px; font-weight:700; margin:4px 0; }}
.kpi .desc {{ font-size:11px; color:var(--text-light); }}
.tabs {{ display:flex; gap:2px; padding:0 32px; background:var(--card); border-bottom:1px solid var(--border); overflow-x:auto; }}
.tab {{ padding:14px 20px; cursor:pointer; font-size:14px; font-weight:500; color:var(--text-light); border-bottom:3px solid transparent; white-space:nowrap; transition:all .2s; }}
.tab:hover {{ color:var(--primary); background:var(--primary-light); }}
.tab.active {{ color:var(--primary); border-bottom-color:var(--primary); font-weight:600; }}
.content {{ padding:24px 32px; max-width:1400px; margin:0 auto; }}
.sec {{ display:none; }} .sec.active {{ display:block; }}
.card {{ background:var(--card); border-radius:12px; padding:24px; margin-bottom:20px; box-shadow:0 1px 4px rgba(0,0,0,.06); }}
.card h3 {{ font-size:16px; font-weight:600; margin-bottom:12px; }}
.card .explain {{ background:#f0f9ff; border-left:4px solid var(--primary); padding:12px 16px; border-radius:0 8px 8px 0; margin-bottom:16px; font-size:13px; color:#1e40af; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th {{ background:#f8fafc; padding:10px 12px; text-align:left; font-weight:600; border-bottom:2px solid var(--border); }}
td {{ padding:10px 12px; border-bottom:1px solid var(--border); }}
tr:hover {{ background:#f8fafc; }}
.chart-box {{ width:100%; min-height:400px; }}
.two-col {{ display:grid; grid-template-columns:1fr 1fr; gap:20px; }}
.badge {{ display:inline-block; padding:3px 10px; border-radius:12px; font-size:12px; font-weight:600; }}
.badge-best {{ background:#dcfce7; color:#16a34a; }}
.badge-good {{ background:#dbeafe; color:#2563eb; }}
.badge-warn {{ background:#fef3c7; color:#d97706; }}
.badge-bad {{ background:#fee2e2; color:#dc2626; }}
.improve-up {{ color:var(--green); font-weight:600; }}
.improve-down {{ color:var(--red); font-weight:600; }}
.winner {{ border:2px solid var(--green); }}
@media(max-width:768px) {{ .two-col {{ grid-template-columns:1fr; }} .content {{ padding:16px; }} }}
</style>
</head>
<body>

<div class="header">
  <h1>LightGBM 실험 비교 대시보드</h1>
  <div class="sub" id="hdr-sub"></div>
</div>
<div class="kpi-row" id="kpi-row"></div>

<div class="tabs">
  <div class="tab active" data-t="summary">비교 요약</div>
  <div class="tab" data-t="overfit">과적합 비교</div>
  <div class="tab" data-t="improve">개선률 분석</div>
  <div class="tab" data-t="detail">실험 상세</div>
</div>

<div class="content">
  <!-- Tab 1 -->
  <div class="sec active" id="sec-summary">
    <div class="card">
      <h3>실험이란?</h3>
      <div class="explain">
        같은 데이터로 모델 설정만 바꿔가며 5번 학습(5-Fold CV)하고 성능을 비교합니다.<br>
        <strong>목표:</strong> R²를 높이고(1에 가깝게), MSE/MAE를 낮추면서, 과적합(Train-Val 격차)을 줄이는 것입니다.<br>
        각 실험에서 어떤 개선 기법을 적용했는지 아래에서 확인하세요.
      </div>
    </div>
    <div class="card">
      <h3>메트릭 비교 테이블</h3>
      <div class="explain">
        <strong>R²</strong>: 1에 가까울수록 좋음 (예측 설명력) |
        <strong>MSE/RMSE/MAE</strong>: 0에 가까울수록 좋음 (예측 오차) |
        <strong>개선률</strong>: V1 대비 얼마나 좋아졌는지 (+ = 개선)
      </div>
      <table>
        <thead>
          <tr><th>실험</th><th>설명</th><th>R²</th><th>MSE</th><th>RMSE</th><th>MAE</th>
          <th>R² 개선</th><th>MAE 개선</th><th>판정</th></tr>
        </thead>
        <tbody id="metric-table"></tbody>
      </table>
    </div>
    <div class="two-col">
      <div class="card"><h3>R² 비교 (높을수록 좋음)</h3><div class="chart-box" id="chart-r2"></div></div>
      <div class="card"><h3>MAE 비교 (낮을수록 좋음)</h3><div class="chart-box" id="chart-mae"></div></div>
    </div>
    <div class="card">
      <h3>MSE / RMSE 비교</h3>
      <div class="chart-box" id="chart-mse-rmse"></div>
    </div>
  </div>

  <!-- Tab 2 -->
  <div class="sec" id="sec-overfit">
    <div class="card">
      <h3>과적합 비교란?</h3>
      <div class="explain">
        Train R²와 Validation R²의 격차가 클수록 모델이 학습 데이터에만 잘 맞고 새 데이터에는 못 맞는 것입니다 (과적합).<br>
        <strong>격차 0.05 이하:</strong> 양호 | <strong>0.05~0.15:</strong> 경미 | <strong>0.15 이상:</strong> 과적합 주의
      </div>
    </div>
    <div class="card">
      <h3>실험별 평균 과적합 격차 (R² Gap)</h3>
      <div class="chart-box" id="chart-gap"></div>
    </div>
    <div class="card">
      <h3>Fold별 상세 비교</h3>
      <table>
        <thead>
          <tr><th>실험</th><th>Fold 1 Gap</th><th>Fold 2 Gap</th><th>Fold 3 Gap</th>
          <th>Fold 4 Gap</th><th>Fold 5 Gap</th><th>평균 Gap</th><th>판정</th></tr>
        </thead>
        <tbody id="gap-detail-table"></tbody>
      </table>
    </div>
    <div class="card">
      <h3>학습 곡선 비교 (최종 Fold)</h3>
      <div class="explain">
        각 실험의 마지막 Fold(가장 많은 데이터로 학습)의 학습 곡선을 겹쳐 보여줍니다.
        Validation Loss가 낮고 안정적일수록 좋습니다.
      </div>
      <div class="chart-box" id="chart-lc-compare"></div>
    </div>
  </div>

  <!-- Tab 3 -->
  <div class="sec" id="sec-improve">
    <div class="card">
      <h3>베이스라인(V1) 대비 개선률</h3>
      <div class="explain">
        V1 베이스라인과 비교하여 각 지표가 얼마나 개선되었는지 보여줍니다.
        <strong>양수(+):</strong> 개선됨 | <strong>음수(-):</strong> 악화됨
      </div>
      <div class="chart-box" id="chart-improve-bars"></div>
    </div>
    <div class="card">
      <h3>종합 레이더 차트</h3>
      <div class="explain">
        5개 지표를 정규화하여 한눈에 비교합니다. 면적이 넓을수록 종합적으로 좋은 모델입니다.
        (R²: 높을수록 좋음, 나머지: 반전하여 낮을수록 좋음)
      </div>
      <div class="chart-box" id="chart-radar"></div>
    </div>
    <div class="card">
      <h3>에러 분포 비교 (P50 / P90 / P99)</h3>
      <div class="explain">에러의 중앙값·상위 10%·상위 1% 경계를 실험별로 비교합니다. 낮을수록 좋습니다.</div>
      <div class="chart-box" id="chart-error-dist"></div>
    </div>
  </div>

  <!-- Tab 4 -->
  <div class="sec" id="sec-detail">
    <div class="card">
      <h3>실험 설정 비교</h3>
      <div class="explain">각 실험에서 변경한 파라미터와 기법을 비교합니다.</div>
      <table>
        <thead>
          <tr><th>파라미터</th><th>V1</th><th>V2</th><th>V3</th><th>V4</th><th>V5</th></tr>
        </thead>
        <tbody id="params-compare-table"></tbody>
      </table>
    </div>
    <div class="card">
      <h3>Feature Importance TOP 10 비교</h3>
      <div class="explain">각 실험에서 모델이 가장 중요하게 본 변수 상위 10개를 비교합니다.</div>
      <div id="fi-compare-area"></div>
    </div>
    <div class="card">
      <h3>최종 추천</h3>
      <div class="explain" id="recommendation-text" style="font-size:14px;"></div>
    </div>
  </div>
</div>

<script>
const D = {data_json};
const R = D.results;
const COLORS = ['#6366f1','#22c55e','#f59e0b','#3b82f6','#ef4444'];
const bestIdx = D.best_idx;

// Header
document.getElementById('hdr-sub').textContent =
  `${{D.n_experiments}}개 실험 비교 | 최고 모델: ${{D.best_label}} (R²=${{D.best_r2.toFixed(4)}}) | ${{D.timestamp}}`;

// KPI
const kpiRow = document.getElementById('kpi-row');
const bestM = R[bestIdx].ensemble_metrics;
const baseM = R[0].ensemble_metrics;
const r2Gain = ((bestM.r2 - baseM.r2) / Math.max(Math.abs(baseM.r2), 0.001) * 100).toFixed(1);
[
  {{l:'최고 모델',v:D.best_label,d:`R² = ${{bestM.r2.toFixed(4)}}`,c:''}},
  {{l:'R² 개선',v:`+${{r2Gain}}%`,d:`V1(${{baseM.r2.toFixed(4)}}) → ${{bestM.r2.toFixed(4)}}`,c:parseFloat(r2Gain)>0?'improve-up':'improve-down'}},
  {{l:'MAE 개선',v:`${{bestM.mae.toFixed(1)}}`,d:`V1(${{baseM.mae.toFixed(1)}}) → ${{bestM.mae.toFixed(1)}}`,c:bestM.mae<baseM.mae?'improve-up':''}},
  {{l:'실험 수',v:D.n_experiments,d:'5-Fold CV × 5 앙상블 각',c:''}},
].forEach(k => {{
  kpiRow.innerHTML += `<div class="kpi"><div class="label">${{k.l}}</div><div class="value ${{k.c}}">${{k.v}}</div><div class="desc">${{k.d}}</div></div>`;
}});

// Tabs
document.querySelectorAll('.tab').forEach(tab => {{
  tab.addEventListener('click', () => {{
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sec').forEach(s => s.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('sec-' + tab.dataset.t).classList.add('active');
  }});
}});

// ─── Tab1: Metric Table ───
const mt = document.getElementById('metric-table');
R.forEach((r, i) => {{
  const m = r.ensemble_metrics;
  const imp = r.improvement || {{r2_pct:0,mae_pct:0}};
  const isBest = i === bestIdx;
  const badge = isBest ? '<span class="badge badge-best">BEST</span>' :
    (imp.r2_pct > 0 ? '<span class="badge badge-good">개선</span>' :
     imp.r2_pct < -5 ? '<span class="badge badge-bad">악화</span>' : '<span class="badge badge-warn">유사</span>');
  mt.innerHTML += `<tr class="${{isBest?'winner':''}}">
    <td><strong style="color:${{COLORS[i]}}">${{r.label}}</strong></td>
    <td style="font-size:12px">${{r.desc}}</td>
    <td><strong>${{m.r2.toFixed(4)}}</strong></td>
    <td>${{m.mse.toFixed(0)}}</td><td>${{m.rmse.toFixed(1)}}</td><td>${{m.mae.toFixed(1)}}</td>
    <td class="${{imp.r2_pct>0?'improve-up':'improve-down'}}">${{i===0?'-':imp.r2_pct>0?'+'+imp.r2_pct+'%':imp.r2_pct+'%'}}</td>
    <td class="${{imp.mae_pct>0?'improve-up':'improve-down'}}">${{i===0?'-':imp.mae_pct>0?'+'+imp.mae_pct+'%':imp.mae_pct+'%'}}</td>
    <td>${{badge}}</td>
  </tr>`;
}});

// R² bar chart
Plotly.newPlot('chart-r2', [{{
  x: R.map(r=>r.label), y: R.map(r=>r.ensemble_metrics.r2),
  type:'bar', marker:{{color:COLORS}},
  text: R.map(r=>r.ensemble_metrics.r2.toFixed(4)), textposition:'outside'
}}], {{ height:380, yaxis:{{title:'R²',range:[0,Math.max(...R.map(r=>r.ensemble_metrics.r2))*1.3]}} }}, {{responsive:true}});

// MAE bar chart
Plotly.newPlot('chart-mae', [{{
  x: R.map(r=>r.label), y: R.map(r=>r.ensemble_metrics.mae),
  type:'bar', marker:{{color:COLORS}},
  text: R.map(r=>r.ensemble_metrics.mae.toFixed(1)), textposition:'outside'
}}], {{ height:380, yaxis:{{title:'MAE'}} }}, {{responsive:true}});

// MSE/RMSE grouped bar
Plotly.newPlot('chart-mse-rmse', [
  {{ x:R.map(r=>r.label), y:R.map(r=>r.ensemble_metrics.mse), name:'MSE', type:'bar', marker:{{color:'#6366f1'}} }},
  {{ x:R.map(r=>r.label), y:R.map(r=>r.ensemble_metrics.rmse), name:'RMSE', type:'bar', marker:{{color:'#f59e0b'}} }}
], {{ barmode:'group', height:400, yaxis:{{title:'값'}}, legend:{{orientation:'h',y:-0.12}} }}, {{responsive:true}});

// ─── Tab2: Overfit ───
const avgGaps = R.map(r => r.summary.avg_overfit_gap);
Plotly.newPlot('chart-gap', [{{
  x: R.map(r=>r.label), y: avgGaps, type:'bar',
  marker: {{ color: avgGaps.map(g => g <= 0.05 ? '#22c55e' : g <= 0.15 ? '#f59e0b' : '#ef4444') }},
  text: avgGaps.map(g=>g.toFixed(4)), textposition:'outside'
}}], {{
  height:380, yaxis:{{title:'평균 R² Gap (낮을수록 좋음)'}},
  shapes:[{{type:'line',x0:-0.5,x1:R.length-0.5,y0:0.05,y1:0.05,line:{{color:'#22c55e',dash:'dash'}}}},
          {{type:'line',x0:-0.5,x1:R.length-0.5,y0:0.15,y1:0.15,line:{{color:'#ef4444',dash:'dash'}}}}],
  annotations:[{{x:R.length-0.7,y:0.05,text:'양호 (0.05)',showarrow:false,font:{{color:'#22c55e',size:10}}}},
               {{x:R.length-0.7,y:0.15,text:'주의 (0.15)',showarrow:false,font:{{color:'#ef4444',size:10}}}}]
}}, {{responsive:true}});

// Gap detail table
const gdt = document.getElementById('gap-detail-table');
R.forEach((r,i) => {{
  const folds = r.fold_metrics;
  const avg = r.summary.avg_overfit_gap;
  const cls = avg<=0.05?'badge-best':avg<=0.15?'badge-warn':'badge-bad';
  const verdict = avg<=0.05?'양호':avg<=0.15?'경미한 과적합':'과적합 주의';
  gdt.innerHTML += `<tr>
    <td style="color:${{COLORS[i]}}"><strong>${{r.label}}</strong></td>
    ${{folds.map(f=>`<td>${{f.overfit_gap_r2.toFixed(4)}}</td>`).join('')}}
    <td><strong>${{avg.toFixed(4)}}</strong></td>
    <td><span class="badge ${{cls}}">${{verdict}}</span></td>
  </tr>`;
}});

// Learning curve comparison (last fold)
const lcTraces = R.map((r,i) => {{
  const lastFold = r.fold_metrics[r.fold_metrics.length-1];
  return {{
    x: lastFold.lc_iters, y: lastFold.lc_val, name: r.label + ' (Val)',
    line: {{ color: COLORS[i], width: 2 }}, mode: 'lines'
  }};
}});
Plotly.newPlot('chart-lc-compare', lcTraces, {{
  height:400, xaxis:{{title:'Iteration'}}, yaxis:{{title:'Validation MSE Loss'}},
  legend:{{orientation:'h',y:-0.15}}
}}, {{responsive:true}});

// ─── Tab3: Improvement ───
const impMetrics = ['R² 개선','MSE 개선','RMSE 개선','MAE 개선'];
const impTraces = R.slice(1).map((r,i) => ({{
  x: impMetrics,
  y: [r.improvement.r2_pct, r.improvement.mse_pct, r.improvement.rmse_pct, r.improvement.mae_pct],
  name: r.label, type:'bar',
  marker: {{ color: COLORS[i+1] }}
}}));
Plotly.newPlot('chart-improve-bars', impTraces, {{
  barmode:'group', height:400, yaxis:{{title:'개선률 (%, 양수=개선)'}},
  shapes:[{{type:'line',x0:-0.5,x1:3.5,y0:0,y1:0,line:{{color:'#94a3b8',dash:'dash'}}}}],
  legend:{{orientation:'h',y:-0.15}}
}}, {{responsive:true}});

// Radar chart
function normalize(vals, higher_is_better) {{
  const mn = Math.min(...vals), mx = Math.max(...vals);
  if (mx === mn) return vals.map(() => 0.5);
  return vals.map(v => higher_is_better ? (v-mn)/(mx-mn) : (mx-v)/(mx-mn));
}}
const r2Vals = normalize(R.map(r=>r.ensemble_metrics.r2), true);
const maeVals = normalize(R.map(r=>r.ensemble_metrics.mae), false);
const rmseVals = normalize(R.map(r=>r.ensemble_metrics.rmse), false);
const gapVals = normalize(R.map(r=>r.summary.avg_overfit_gap), false);
const e90Vals = normalize(R.map(r=>r.ensemble_metrics.error_p90), false);

const radarTraces = R.map((r,i) => ({{
  type:'scatterpolar', fill:'toself',
  r: [r2Vals[i], maeVals[i], rmseVals[i], gapVals[i], e90Vals[i], r2Vals[i]],
  theta: ['R²','MAE','RMSE','과적합(↓)','P90에러(↓)','R²'],
  name: r.label, line:{{color:COLORS[i]}}, opacity:0.6
}}));
Plotly.newPlot('chart-radar', radarTraces, {{
  height:500, polar:{{radialaxis:{{range:[0,1],showticklabels:false}}}},
  legend:{{orientation:'h',y:-0.1}}
}}, {{responsive:true}});

// Error distribution comparison
const edTraces = [];
['error_p50','error_p90','error_p99'].forEach((key,ki) => {{
  const names = ['P50 (중앙값)','P90 (상위10%)','P99 (상위1%)'];
  edTraces.push({{
    x: R.map(r=>r.label), y: R.map(r=>r.ensemble_metrics[key]),
    name: names[ki], type:'bar',
    marker: {{ color: ['#3b82f6','#f59e0b','#ef4444'][ki] }}
  }});
}});
Plotly.newPlot('chart-error-dist', edTraces, {{
  barmode:'group', height:400, yaxis:{{title:'절대 에러'}},
  legend:{{orientation:'h',y:-0.12}}
}}, {{responsive:true}});

// ─── Tab4: Detail ───
// Params comparison
const paramKeys = ['max_depth','learning_rate','num_leaves','min_child_samples',
  'reg_alpha','reg_lambda','colsample_bytree','subsample','n_estimators'];
const paramLabels = {{
  max_depth:'트리 깊이', learning_rate:'학습률', num_leaves:'리프 수',
  min_child_samples:'리프 최소 샘플', reg_alpha:'L1 정규화', reg_lambda:'L2 정규화',
  colsample_bytree:'피처 샘플링', subsample:'데이터 샘플링', n_estimators:'최대 트리 수'
}};
const pt = document.getElementById('params-compare-table');
paramKeys.forEach(k => {{
  let cells = R.map((r,i) => {{
    const v = r.params[k];
    const isChanged = i > 0 && v !== R[0].params[k];
    return `<td${{isChanged?' style="color:var(--primary);font-weight:600"':''}}>${{v}}</td>`;
  }}).join('');
  pt.innerHTML += `<tr><td><strong>${{paramLabels[k]||k}}</strong></td>${{cells}}</tr>`;
}});
// Config rows
['log_transform','extra_features','outlier_cap'].forEach(k => {{
  const labels = {{log_transform:'Log 변환',extra_features:'파생 피처',outlier_cap:'이상치 캡핑'}};
  let cells = R.map((r,i) => {{
    const v = r.config[k];
    const display = v === true ? 'O' : v === false ? '-' : v === null ? '-' : 'P'+v;
    const isActive = v === true || (v !== null && v !== false);
    return `<td${{isActive?' style="color:var(--green);font-weight:600"':''}}>${{display}}</td>`;
  }}).join('');
  pt.innerHTML += `<tr><td><strong>${{labels[k]}}</strong></td>${{cells}}</tr>`;
}});

// Feature importance comparison
const fiArea = document.getElementById('fi-compare-area');
const fiTable = document.createElement('table');
fiTable.innerHTML = '<thead><tr><th>#</th>' + R.map(r=>`<th style="color:${{COLORS[R.indexOf(r)]}}">${{r.label}}</th>`).join('') + '</tr></thead>';
let fiBody = '';
for (let rank = 0; rank < 10; rank++) {{
  fiBody += '<tr><td>' + (rank+1) + '</td>';
  R.forEach(r => {{
    const f = r.feature_importance_top20[rank];
    fiBody += `<td>${{f ? f.name_kr + ' <small>(' + f.gain.toFixed(0) + ')</small>' : '-'}}</td>`;
  }});
  fiBody += '</tr>';
}}
fiTable.innerHTML += '<tbody>' + fiBody + '</tbody>';
fiArea.appendChild(fiTable);

// Recommendation
const recText = document.getElementById('recommendation-text');
const best = R[bestIdx];
const baselineR2 = R[0].ensemble_metrics.r2;
const bestR2 = best.ensemble_metrics.r2;
const improvePct = ((bestR2 - baselineR2) / Math.max(Math.abs(baselineR2), 0.001) * 100).toFixed(1);
recText.innerHTML = `
  <strong>추천 모델: ${{best.label}}</strong><br><br>
  ${{best.desc}}<br><br>
  베이스라인 대비 R²가 <strong>${{improvePct}}%</strong> 개선되었습니다
  (${{baselineR2.toFixed(4)}} → ${{bestR2.toFixed(4)}}).<br>
  과적합 격차(Avg R² Gap)는 ${{best.summary.avg_overfit_gap.toFixed(4)}}입니다.<br><br>
  <strong>다음 단계 제안:</strong><br>
  1. 추천 모델의 설정을 기본 파이프라인(s4_forecast.py)에 반영<br>
  2. 2-Stage 모델 (수주 유무 분류 + 수량 회귀) 실험 추가<br>
  3. 제품 카테고리별 개별 모델 학습 시도<br>
  4. 외부 지표(반도체 가격, 환율) 시차 추가 실험
`;
</script>
</body>
</html>"""


# ═══════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  LightGBM 실험 비교 프레임워크")
    print(f"  {len(EXPERIMENTS)}개 실험 실행 → 비교 대시보드 생성")
    print("=" * 60)

    # 데이터 로드 (1회)
    df, feature_cols = load_data()
    train_df, test_df, meta = split_data(df, feature_cols)
    print(f"[분할] Train: {len(train_df):,}행 | Test: {len(test_df):,}행")

    # 실험 순차 실행
    results = []
    for exp in EXPERIMENTS:
        result = run_single_experiment(exp, train_df, test_df, feature_cols, meta)
        results.append(result)

    # 비교 대시보드 생성
    output_path = generate_comparison_html(results)

    # 결과 요약
    print("\n" + "=" * 60)
    print("  실험 결과 요약")
    print("=" * 60)
    print(f"  {'실험':<20} {'R²':>8} {'MAE':>8} {'RMSE':>8} {'Avg Gap':>8}")
    print("  " + "-" * 56)
    for r in results:
        m = r["ensemble_metrics"]
        marker = " ★" if r["id"] == results[max(range(len(results)),
                     key=lambda i: results[i]["ensemble_metrics"]["r2"])]["id"] else ""
        print(f"  {r['label']:<20} {m['r2']:>8.4f} {m['mae']:>8.1f} "
              f"{m['rmse']:>8.1f} {r['summary']['avg_overfit_gap']:>8.4f}{marker}")

    print(f"\n  비교 대시보드: {output_path}")
    print(f"  개별 결과: {EXPERIMENTS_DIR}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
