"""
멀티 모델 비교 프레임워크
- LightGBM 4가지 하이퍼파라미터 세팅
- Random Forest / LinearSVR / Ridge Regression
- 5-Fold Time-Series CV + 앙상블
- ±5 허용 오차 분석
- 주간 + 월간 통합 비교 대시보드

실행: python DB/07_pipeline/model_comparison.py
"""

import json
import os
import time
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVR

from config import supabase, WEEKLY_FEATURE_COLS, MONTHLY_FEATURE_COLS

warnings.filterwarnings("ignore")

# ─── 상수 ───
TOLERANCE = 5  # ±5 허용 오차
N_FOLDS = 5
TRAIN_RATIO = 0.8
EARLY_STOP = 50

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
EXPERIMENT_DIR = os.path.join(SCRIPT_DIR, "experiments")
os.makedirs(EXPERIMENT_DIR, exist_ok=True)

# ─── 7개 모델 정의 ───
MODELS = [
    {
        "id": "lgbm_baseline",
        "label": "LightGBM 베이스라인",
        "type": "lgbm",
        "color": "#3b82f6",
        "params": {
            "objective": "regression", "metric": "mse", "verbosity": -1,
            "n_estimators": 1000, "max_depth": 6, "learning_rate": 0.05,
            "num_leaves": 31, "min_child_samples": 20,
            "reg_alpha": 0.1, "reg_lambda": 1.0,
            "colsample_bytree": 0.8, "subsample": 0.8, "subsample_freq": 1,
        },
    },
    {
        "id": "lgbm_strong_reg",
        "label": "LightGBM 정규화 강화",
        "type": "lgbm",
        "color": "#059669",
        "params": {
            "objective": "regression", "metric": "mse", "verbosity": -1,
            "n_estimators": 1000, "max_depth": 4, "learning_rate": 0.03,
            "num_leaves": 15, "min_child_samples": 50,
            "reg_alpha": 1.0, "reg_lambda": 5.0,
            "colsample_bytree": 0.7, "subsample": 0.7, "subsample_freq": 1,
        },
    },
    {
        "id": "lgbm_deep",
        "label": "LightGBM 깊은 트리",
        "type": "lgbm",
        "color": "#7c3aed",
        "params": {
            "objective": "regression", "metric": "mse", "verbosity": -1,
            "n_estimators": 1000, "max_depth": 8, "learning_rate": 0.05,
            "num_leaves": 63, "min_child_samples": 10,
            "reg_alpha": 0.05, "reg_lambda": 0.5,
            "colsample_bytree": 0.8, "subsample": 0.8, "subsample_freq": 1,
        },
    },
    {
        "id": "lgbm_conservative",
        "label": "LightGBM 보수적",
        "type": "lgbm",
        "color": "#0891b2",
        "params": {
            "objective": "regression", "metric": "mse", "verbosity": -1,
            "n_estimators": 1000, "max_depth": 3, "learning_rate": 0.01,
            "num_leaves": 8, "min_child_samples": 100,
            "reg_alpha": 5.0, "reg_lambda": 10.0,
            "colsample_bytree": 0.6, "subsample": 0.6, "subsample_freq": 1,
        },
    },
    {
        "id": "random_forest",
        "label": "Random Forest",
        "type": "sklearn",
        "color": "#d97706",
        "model_class": RandomForestRegressor,
        "params": {
            "n_estimators": 200, "max_depth": 8,
            "min_samples_leaf": 20, "max_features": 0.8,
            "n_jobs": -1, "random_state": 42,
        },
    },
    {
        "id": "svr_linear",
        "label": "Linear SVR",
        "type": "sklearn_scaled",
        "color": "#dc2626",
        "model_class": LinearSVR,
        "params": {
            "C": 1.0, "epsilon": 0.1, "max_iter": 20000,
            "dual": "auto", "random_state": 42,
        },
    },
    {
        "id": "ridge",
        "label": "Ridge Regression",
        "type": "sklearn_scaled",
        "color": "#64748b",
        "model_class": Ridge,
        "params": {"alpha": 1.0},
    },
]


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


def load_data(table, time_col, target_col, feature_cols_cfg):
    rows = fetch_all(table)
    df = pd.DataFrame(rows).sort_values(["product_id", time_col])
    feature_cols = [c for c in feature_cols_cfg if c in df.columns]
    for c in feature_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df[target_col] = pd.to_numeric(df[target_col], errors="coerce")
    df = df.dropna(subset=[target_col])

    periods = sorted(df[time_col].unique())
    split = int(len(periods) * TRAIN_RATIO)
    train_periods = set(periods[:split])
    test_periods = set(periods[split:])

    train_df = df[df[time_col].isin(train_periods)]
    test_df = df[df[time_col].isin(test_periods)]

    X_train = train_df[feature_cols].fillna(0).values
    y_train = train_df[target_col].values
    X_test = test_df[feature_cols].fillna(0).values
    y_test = test_df[target_col].values

    meta = {
        "table": table,
        "total_rows": len(df),
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "n_features": len(feature_cols),
        "n_products": df["product_id"].nunique(),
        "train_periods": len(train_periods),
        "test_periods": len(test_periods),
    }
    return X_train, y_train, X_test, y_test, feature_cols, meta


def train_model(model_cfg, X_tr, y_tr, X_val, y_val):
    """모델 학습 — LightGBM은 early stopping, sklearn은 일반 fit"""
    import lightgbm as lgb

    mtype = model_cfg["type"]

    if mtype == "lgbm":
        model = lgb.LGBMRegressor(**model_cfg["params"])
        model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)],
                  callbacks=[lgb.early_stopping(EARLY_STOP, verbose=False),
                             lgb.log_evaluation(0)])
        best_iter = model.best_iteration_
        fi = model.feature_importances_
        return model, best_iter, fi

    elif mtype == "sklearn":
        model = model_cfg["model_class"](**model_cfg["params"])
        model.fit(X_tr, y_tr)
        fi = getattr(model, "feature_importances_", None)
        return model, None, fi

    elif mtype == "sklearn_scaled":
        scaler = StandardScaler()
        X_tr_s = scaler.fit_transform(X_tr)
        model = model_cfg["model_class"](**model_cfg["params"])
        model.fit(X_tr_s, y_tr)
        coef = getattr(model, "coef_", None)
        fi = np.abs(coef) if coef is not None else None
        return (model, scaler), None, fi


def predict_model(trained, model_cfg, X):
    mtype = model_cfg["type"]
    if mtype == "sklearn_scaled":
        model, scaler = trained
        return model.predict(scaler.transform(X))
    else:
        return trained.predict(X)


def tolerance_analysis(y_true, y_pred, tolerance=TOLERANCE):
    """±tolerance 허용 오차 분석"""
    errors = np.abs(y_true - y_pred)
    n = len(errors)
    bands = [1, 5, 10, 20, 50, 100]
    result = {"tolerance": tolerance, "n_total": n}

    for b in bands:
        cnt = int(np.sum(errors <= b))
        result[f"within_{b}"] = cnt
        result[f"rate_{b}"] = round(cnt / n * 100, 2) if n > 0 else 0

    # 성공/실패 분류 (기본 tolerance 기준)
    success = errors <= tolerance
    result["n_success"] = int(np.sum(success))
    result["n_fail"] = int(np.sum(~success))
    result["success_rate"] = round(np.sum(success) / n * 100, 2) if n > 0 else 0

    # 에러 분포
    result["error_mean"] = round(float(np.mean(errors)), 2)
    result["error_median"] = round(float(np.median(errors)), 2)
    result["error_p90"] = round(float(np.percentile(errors, 90)), 2)
    result["error_p99"] = round(float(np.percentile(errors, 99)), 2)

    # 누적 정확도 곡선 데이터 (0~200 범위)
    cum_x = list(range(0, 201))
    cum_y = [round(float(np.sum(errors <= x) / n * 100), 2) for x in cum_x]
    result["cumulative_x"] = cum_x
    result["cumulative_y"] = cum_y

    # 제로 vs 비제로 분석
    zero_mask = y_true == 0
    nonzero_mask = y_true > 0
    if np.sum(zero_mask) > 0:
        result["zero_success_rate"] = round(
            float(np.sum(errors[zero_mask] <= tolerance) / np.sum(zero_mask) * 100), 2)
        result["n_zero"] = int(np.sum(zero_mask))
    if np.sum(nonzero_mask) > 0:
        result["nonzero_success_rate"] = round(
            float(np.sum(errors[nonzero_mask] <= tolerance) / np.sum(nonzero_mask) * 100), 2)
        result["n_nonzero"] = int(np.sum(nonzero_mask))

    return result


def run_experiment(model_cfg, X_train, y_train, X_test, y_test, feature_cols):
    """단일 모델 실험: 5-Fold CV + 앙상블 + 허용 오차 분석"""
    mid = model_cfg["id"]
    t0 = time.time()

    tscv = TimeSeriesSplit(n_splits=N_FOLDS)
    fold_metrics = []
    test_preds = []

    for fold_i, (tr_idx, val_idx) in enumerate(tscv.split(X_train)):
        X_tr, X_val = X_train[tr_idx], X_train[val_idx]
        y_tr, y_val = y_train[tr_idx], y_train[val_idx]

        trained, best_iter, fi = train_model(model_cfg, X_tr, y_tr, X_val, y_val)

        val_pred = predict_model(trained, model_cfg, X_val)
        val_pred = np.maximum(val_pred, 0)

        val_r2 = r2_score(y_val, val_pred)
        val_mae = mean_absolute_error(y_val, val_pred)

        # Train R² (과적합 체크)
        train_pred = predict_model(trained, model_cfg, X_tr)
        train_r2 = r2_score(y_tr, np.maximum(train_pred, 0))
        gap = train_r2 - val_r2

        fold_metrics.append({
            "fold": fold_i + 1,
            "val_r2": round(val_r2, 4),
            "val_mae": round(val_mae, 2),
            "train_r2": round(train_r2, 4),
            "gap": round(gap, 4),
            "best_iter": best_iter,
            "n_train": len(tr_idx),
            "n_val": len(val_idx),
        })

        # Test set 예측 (앙상블용)
        test_pred = predict_model(trained, model_cfg, X_test)
        test_preds.append(np.maximum(test_pred, 0))

        print(f"    Fold {fold_i+1}: Val R²={val_r2:.4f} | MAE={val_mae:.1f} | Gap={gap:.4f}"
              + (f" | Stop={best_iter}" if best_iter else ""))

    # 앙상블 (5개 모델 평균)
    ensemble_pred = np.mean(test_preds, axis=0)

    # 메트릭 계산
    mse = float(mean_squared_error(y_test, ensemble_pred))
    rmse = float(np.sqrt(mse))
    mae = float(mean_absolute_error(y_test, ensemble_pred))
    r2 = float(r2_score(y_test, ensemble_pred))
    mape_vals = np.abs((y_test - ensemble_pred) / np.where(y_test == 0, 1, y_test))
    mape = float(np.mean(mape_vals) * 100)
    avg_gap = float(np.mean([f["gap"] for f in fold_metrics]))
    avg_val_r2 = float(np.mean([f["val_r2"] for f in fold_metrics]))

    elapsed = time.time() - t0

    # ±5 허용 오차 분석
    tol = tolerance_analysis(y_test, ensemble_pred, TOLERANCE)

    # Feature Importance (마지막 fold 기준)
    fi_top20 = []
    if fi is not None and len(fi) == len(feature_cols):
        order = np.argsort(-fi)[:20]
        for rank, idx in enumerate(order):
            fi_top20.append({
                "rank": rank + 1,
                "name": feature_cols[idx],
                "importance": round(float(fi[idx]), 2),
            })

    result = {
        "model_id": mid,
        "model_label": model_cfg["label"],
        "model_type": model_cfg["type"],
        "color": model_cfg["color"],
        "ensemble_metrics": {
            "mse": round(mse, 2),
            "rmse": round(rmse, 2),
            "mae": round(mae, 2),
            "r2": round(r2, 4),
            "mape": round(mape, 2),
        },
        "fold_metrics": fold_metrics,
        "avg_val_r2": round(avg_val_r2, 4),
        "avg_gap": round(avg_gap, 4),
        "tolerance_analysis": tol,
        "feature_importance_top20": fi_top20,
        "elapsed_sec": round(elapsed, 1),
        "params": {k: v for k, v in model_cfg.get("params", {}).items()
                   if k not in ("objective", "metric", "verbosity")},
    }

    print(f"\n  [{model_cfg['label']}] R²={r2:.4f} | MAE={mae:.1f} | "
          f"±{TOLERANCE} 성공률={tol['success_rate']:.1f}% | {elapsed:.1f}s")

    return result


def generate_html(weekly_results, monthly_results, weekly_meta, monthly_meta):
    """종합 비교 대시보드 HTML 생성"""

    # JSON 직렬화
    def to_json(obj):
        return json.dumps(obj, ensure_ascii=False)

    # 최고 모델 찾기
    best_w = max(weekly_results, key=lambda r: r["ensemble_metrics"]["r2"])
    best_m = max(monthly_results, key=lambda r: r["ensemble_metrics"]["r2"])

    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>멀티 모델 비교 — 최종 성능 리포트</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<style>
:root {{
  --primary: #1e40af; --blue: #3b82f6; --green: #059669; --red: #dc2626;
  --orange: #d97706; --purple: #7c3aed; --cyan: #0891b2; --gray: #64748b;
  --bg: #f8fafc; --card: #ffffff; --border: #e2e8f0; --text: #1e293b; --muted: #64748b;
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif;
        background: var(--bg); color: var(--text); line-height: 1.6; }}

.header {{
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #1e40af 100%);
  color: white; padding: 36px 48px 28px;
}}
.header h1 {{ font-size: 26px; font-weight: 700; }}
.header .sub {{ font-size: 14px; opacity: 0.8; margin-top: 4px; }}
.header-stats {{
  display: flex; gap: 32px; margin-top: 20px;
  padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2);
}}
.header-stats .hs {{ text-align: center; }}
.header-stats .hs .v {{ font-size: 22px; font-weight: 700; }}
.header-stats .hs .l {{ font-size: 11px; opacity: 0.7; }}

.container {{ max-width: 1280px; margin: 0 auto; padding: 28px 24px; }}

.tabs {{ display: flex; gap: 0; border-bottom: 2px solid var(--border); margin-bottom: 24px; }}
.tab {{
  padding: 10px 24px; cursor: pointer; font-size: 14px; font-weight: 500;
  color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -2px;
  transition: all 0.15s;
}}
.tab:hover {{ color: var(--text); }}
.tab.active {{ color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }}
.tab-content {{ display: none; }}
.tab-content.active {{ display: block; }}

.card {{
  background: var(--card); border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 20px; overflow: hidden;
}}
.card-header {{
  padding: 16px 24px; border-bottom: 1px solid var(--border);
  font-size: 16px; font-weight: 600;
}}
.card-body {{ padding: 20px 24px; }}

.kpi-row {{ display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 20px; }}
.kpi {{ background: var(--card); border-radius: 10px; padding: 18px; text-align: center;
        border: 1px solid var(--border); }}
.kpi .kl {{ font-size: 11px; color: var(--muted); margin-bottom: 2px; }}
.kpi .kv {{ font-size: 26px; font-weight: 700; }}
.kpi .ks {{ font-size: 11px; color: var(--muted); margin-top: 2px; }}
.kpi.good {{ border-color: var(--green); background: #f0fdf4; }}
.kpi.good .kv {{ color: var(--green); }}
.kpi.warn {{ border-color: var(--orange); background: #fffbeb; }}
.kpi.warn .kv {{ color: var(--orange); }}

table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
th {{ background: #f1f5f9; padding: 10px 14px; text-align: left; font-weight: 600;
      border-bottom: 2px solid var(--border); font-size: 12px; color: var(--muted); }}
td {{ padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }}
tr:hover {{ background: #f8fafc; }}
.badge {{ display: inline-block; padding: 2px 10px; border-radius: 12px;
          font-size: 11px; font-weight: 600; }}
.badge-green {{ background: #dcfce7; color: var(--green); }}
.badge-orange {{ background: #fef3c7; color: var(--orange); }}
.badge-red {{ background: #fee2e2; color: var(--red); }}
.badge-blue {{ background: #dbeafe; color: var(--blue); }}
.best-star {{ color: #f59e0b; font-weight: 700; }}

.chart-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
.chart-box {{ min-height: 320px; }}

.note {{
  background: #f1f5f9; border-radius: 8px; padding: 14px 18px;
  font-size: 13px; color: var(--muted); margin-top: 16px;
}}
.note strong {{ color: var(--text); }}

.footer {{ text-align: center; padding: 24px; color: var(--muted); font-size: 11px; }}
</style>
</head>
<body>

<div class="header">
  <h1>멀티 모델 비교 — 최종 성능 리포트</h1>
  <div class="sub">LightGBM 4종 + Random Forest + Linear SVR + Ridge Regression | ±{TOLERANCE} 허용 오차 분석</div>
  <div class="header-stats">
    <div class="hs"><div class="v">7</div><div class="l">비교 모델 수</div></div>
    <div class="hs"><div class="v">{weekly_meta['n_products']:,}</div><div class="l">분석 제품</div></div>
    <div class="hs"><div class="v">{weekly_meta['total_rows']+monthly_meta['total_rows']:,}</div><div class="l">총 데이터 행</div></div>
    <div class="hs"><div class="v">±{TOLERANCE}</div><div class="l">허용 오차 (개)</div></div>
    <div class="hs"><div class="v">{best_m['tolerance_analysis']['success_rate']:.1f}%</div><div class="l">월간 최고 성공률</div></div>
  </div>
</div>

<div class="container">
<div class="tabs">
  <div class="tab active" onclick="switchTab(0)">종합 비교</div>
  <div class="tab" onclick="switchTab(1)">±{TOLERANCE} 허용 오차 분석</div>
  <div class="tab" onclick="switchTab(2)">주간 상세</div>
  <div class="tab" onclick="switchTab(3)">월간 상세</div>
  <div class="tab" onclick="switchTab(4)">모델별 파라미터</div>
</div>

<!-- ═══ TAB 0: 종합 비교 ═══ -->
<div class="tab-content active" id="tab0">

<div class="kpi-row">
  <div class="kpi good">
    <div class="kl">월간 최고 R²</div>
    <div class="kv">{best_m['ensemble_metrics']['r2']*100:.1f}%</div>
    <div class="ks">{best_m['model_label']}</div>
  </div>
  <div class="kpi {'good' if best_w['ensemble_metrics']['r2']>0.3 else 'warn'}">
    <div class="kl">주간 최고 R²</div>
    <div class="kv">{best_w['ensemble_metrics']['r2']*100:.1f}%</div>
    <div class="ks">{best_w['model_label']}</div>
  </div>
  <div class="kpi">
    <div class="kl">월간 최저 MAE</div>
    <div class="kv">{min(r['ensemble_metrics']['mae'] for r in monthly_results):.1f}</div>
    <div class="ks">개 단위</div>
  </div>
  <div class="kpi">
    <div class="kl">주간 최저 MAE</div>
    <div class="kv">{min(r['ensemble_metrics']['mae'] for r in weekly_results):.1f}</div>
    <div class="ks">개 단위</div>
  </div>
  <div class="kpi good">
    <div class="kl">월간 ±{TOLERANCE} 최고</div>
    <div class="kv">{max(r['tolerance_analysis']['success_rate'] for r in monthly_results):.1f}%</div>
    <div class="ks">성공률</div>
  </div>
</div>

<div class="card">
  <div class="card-header">주간 모델 비교</div>
  <div class="card-body">
    <table>
      <thead><tr>
        <th>모델</th><th>R²</th><th>MAE</th><th>RMSE</th>
        <th>±{TOLERANCE} 성공률</th><th>과적합 Gap</th><th>소요 시간</th><th>판정</th>
      </tr></thead>
      <tbody>"""

    for r in sorted(weekly_results, key=lambda x: -x["ensemble_metrics"]["r2"]):
        m = r["ensemble_metrics"]
        t = r["tolerance_analysis"]
        is_best = r["model_id"] == best_w["model_id"]
        star = ' <span class="best-star">★</span>' if is_best else ""
        badge = "badge-green" if m["r2"] > 0.25 else ("badge-orange" if m["r2"] > 0.1 else "badge-red")
        html += f"""
        <tr>
          <td><strong>{r['model_label']}</strong>{star}</td>
          <td><strong>{m['r2']:.4f}</strong></td>
          <td>{m['mae']:.1f}</td><td>{m['rmse']:.1f}</td>
          <td>{t['success_rate']:.1f}%</td>
          <td>{r['avg_gap']:.4f}</td>
          <td>{r['elapsed_sec']:.1f}s</td>
          <td><span class="badge {badge}">{'최적' if is_best else ('양호' if m['r2']>0.2 else '개선필요')}</span></td>
        </tr>"""

    html += """
      </tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="card-header">월간 모델 비교</div>
  <div class="card-body">
    <table>
      <thead><tr>
        <th>모델</th><th>R²</th><th>MAE</th><th>RMSE</th>
        <th>±""" + str(TOLERANCE) + """ 성공률</th><th>과적합 Gap</th><th>소요 시간</th><th>판정</th>
      </tr></thead>
      <tbody>"""

    for r in sorted(monthly_results, key=lambda x: -x["ensemble_metrics"]["r2"]):
        m = r["ensemble_metrics"]
        t = r["tolerance_analysis"]
        is_best = r["model_id"] == best_m["model_id"]
        star = ' <span class="best-star">★</span>' if is_best else ""
        badge = "badge-green" if m["r2"] > 0.5 else ("badge-orange" if m["r2"] > 0.3 else "badge-red")
        html += f"""
        <tr>
          <td><strong>{r['model_label']}</strong>{star}</td>
          <td><strong>{m['r2']:.4f}</strong></td>
          <td>{m['mae']:.1f}</td><td>{m['rmse']:.1f}</td>
          <td>{t['success_rate']:.1f}%</td>
          <td>{r['avg_gap']:.4f}</td>
          <td>{r['elapsed_sec']:.1f}s</td>
          <td><span class="badge {badge}">{'최적' if is_best else ('양호' if m['r2']>0.4 else '개선필요')}</span></td>
        </tr>"""

    html += """
      </tbody>
    </table>
  </div>
</div>

<div class="chart-row">
  <div class="card"><div class="card-body"><div id="chart_r2" class="chart-box"></div></div></div>
  <div class="card"><div class="card-body"><div id="chart_mae" class="chart-box"></div></div></div>
</div>
<div class="chart-row">
  <div class="card"><div class="card-body"><div id="chart_success" class="chart-box"></div></div></div>
  <div class="card"><div class="card-body"><div id="chart_gap" class="chart-box"></div></div></div>
</div>

</div>

<!-- ═══ TAB 1: ±5 허용 오차 분석 ═══ -->
<div class="tab-content" id="tab1">

<div class="card">
  <div class="card-header">±""" + str(TOLERANCE) + """ 허용 오차란?</div>
  <div class="card-body">
    <div class="note">
      <strong>정의:</strong> 예측값과 실제값의 차이가 ±""" + str(TOLERANCE) + """개 이내이면 "예측 성공", 초과하면 "예측 실패"로 분류합니다.<br>
      <strong>예시:</strong> 실제 수주 100개, 예측 103개 → 오차 3개 → ✅ 성공 (±5 이내)<br>
      <strong>예시:</strong> 실제 수주 100개, 예측 112개 → 오차 12개 → ❌ 실패 (±5 초과)<br><br>
      <strong>제로 수주 성공률:</strong> 실제 수주가 0인 경우의 성공률 (예측이 5 이하이면 성공)<br>
      <strong>비제로 수주 성공률:</strong> 실제 수주가 0보다 큰 경우의 성공률 (더 어려운 예측)
    </div>
  </div>
</div>

<div class="card">
  <div class="card-header">주간 ±""" + str(TOLERANCE) + """ 성공률 상세</div>
  <div class="card-body">
    <table>
      <thead><tr>
        <th>모델</th><th>±1</th><th>±5</th><th>±10</th><th>±20</th><th>±50</th><th>±100</th>
        <th>제로 수주</th><th>비제로 수주</th>
      </tr></thead>
      <tbody>"""

    for r in sorted(weekly_results, key=lambda x: -x["tolerance_analysis"]["success_rate"]):
        t = r["tolerance_analysis"]
        html += f"""
        <tr>
          <td><strong>{r['model_label']}</strong></td>
          <td>{t.get('rate_1',0):.1f}%</td>
          <td><strong>{t.get('rate_5',0):.1f}%</strong></td>
          <td>{t.get('rate_10',0):.1f}%</td>
          <td>{t.get('rate_20',0):.1f}%</td>
          <td>{t.get('rate_50',0):.1f}%</td>
          <td>{t.get('rate_100',0):.1f}%</td>
          <td>{t.get('zero_success_rate','N/A')}%</td>
          <td>{t.get('nonzero_success_rate','N/A')}%</td>
        </tr>"""

    html += """
      </tbody>
    </table>
  </div>
</div>

<div class="card">
  <div class="card-header">월간 ±""" + str(TOLERANCE) + """ 성공률 상세</div>
  <div class="card-body">
    <table>
      <thead><tr>
        <th>모델</th><th>±1</th><th>±5</th><th>±10</th><th>±20</th><th>±50</th><th>±100</th>
        <th>제로 수주</th><th>비제로 수주</th>
      </tr></thead>
      <tbody>"""

    for r in sorted(monthly_results, key=lambda x: -x["tolerance_analysis"]["success_rate"]):
        t = r["tolerance_analysis"]
        html += f"""
        <tr>
          <td><strong>{r['model_label']}</strong></td>
          <td>{t.get('rate_1',0):.1f}%</td>
          <td><strong>{t.get('rate_5',0):.1f}%</strong></td>
          <td>{t.get('rate_10',0):.1f}%</td>
          <td>{t.get('rate_20',0):.1f}%</td>
          <td>{t.get('rate_50',0):.1f}%</td>
          <td>{t.get('rate_100',0):.1f}%</td>
          <td>{t.get('zero_success_rate','N/A')}%</td>
          <td>{t.get('nonzero_success_rate','N/A')}%</td>
        </tr>"""

    html += """
      </tbody>
    </table>
  </div>
</div>

<div class="chart-row">
  <div class="card"><div class="card-body"><div id="chart_cum_w" class="chart-box"></div></div></div>
  <div class="card"><div class="card-body"><div id="chart_cum_m" class="chart-box"></div></div></div>
</div>

<div class="card">
  <div class="card-body">
    <div id="chart_band_compare" class="chart-box"></div>
  </div>
</div>

</div>

<!-- ═══ TAB 2: 주간 상세 ═══ -->
<div class="tab-content" id="tab2">
<div class="card">
  <div class="card-header">주간 모델별 Fold 성능</div>
  <div class="card-body">
    <table>
      <thead><tr><th>모델</th><th>Fold 1</th><th>Fold 2</th><th>Fold 3</th><th>Fold 4</th><th>Fold 5</th><th>평균 Val R²</th><th>Test R²</th></tr></thead>
      <tbody>"""

    for r in sorted(weekly_results, key=lambda x: -x["ensemble_metrics"]["r2"]):
        html += f"<tr><td><strong>{r['model_label']}</strong></td>"
        for f in r["fold_metrics"]:
            html += f"<td>{f['val_r2']:.4f}</td>"
        html += f"<td><strong>{r['avg_val_r2']:.4f}</strong></td>"
        html += f"<td><strong>{r['ensemble_metrics']['r2']:.4f}</strong></td></tr>"

    html += """
      </tbody>
    </table>
  </div>
</div>
<div class="card"><div class="card-body"><div id="chart_fi_w" class="chart-box" style="min-height:400px"></div></div></div>
</div>

<!-- ═══ TAB 3: 월간 상세 ═══ -->
<div class="tab-content" id="tab3">
<div class="card">
  <div class="card-header">월간 모델별 Fold 성능</div>
  <div class="card-body">
    <table>
      <thead><tr><th>모델</th><th>Fold 1</th><th>Fold 2</th><th>Fold 3</th><th>Fold 4</th><th>Fold 5</th><th>평균 Val R²</th><th>Test R²</th></tr></thead>
      <tbody>"""

    for r in sorted(monthly_results, key=lambda x: -x["ensemble_metrics"]["r2"]):
        html += f"<tr><td><strong>{r['model_label']}</strong></td>"
        for f in r["fold_metrics"]:
            html += f"<td>{f['val_r2']:.4f}</td>"
        html += f"<td><strong>{r['avg_val_r2']:.4f}</strong></td>"
        html += f"<td><strong>{r['ensemble_metrics']['r2']:.4f}</strong></td></tr>"

    html += """
      </tbody>
    </table>
  </div>
</div>
<div class="card"><div class="card-body"><div id="chart_fi_m" class="chart-box" style="min-height:400px"></div></div></div>
</div>

<!-- ═══ TAB 4: 모델별 파라미터 ═══ -->
<div class="tab-content" id="tab4">"""

    for mcfg in MODELS:
        mid = mcfg["id"]
        wr = next((r for r in weekly_results if r["model_id"] == mid), None)
        mr = next((r for r in monthly_results if r["model_id"] == mid), None)
        html += f"""
<div class="card">
  <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
    <span>{mcfg['label']}</span>
    <span style="font-size:12px;color:var(--muted)">{mcfg['type']}</span>
  </div>
  <div class="card-body">
    <table>
      <thead><tr><th>파라미터</th><th>값</th></tr></thead>
      <tbody>"""
        params = {k: v for k, v in mcfg.get("params", {}).items()
                  if k not in ("objective", "metric", "verbosity")}
        for k, v in params.items():
            html += f"<tr><td>{k}</td><td><strong>{v}</strong></td></tr>"
        html += "</tbody></table>"
        if wr and mr:
            html += f"""
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
      <div class="note"><strong>주간:</strong> R²={wr['ensemble_metrics']['r2']:.4f} | MAE={wr['ensemble_metrics']['mae']:.1f} | ±{TOLERANCE} {wr['tolerance_analysis']['success_rate']:.1f}%</div>
      <div class="note"><strong>월간:</strong> R²={mr['ensemble_metrics']['r2']:.4f} | MAE={mr['ensemble_metrics']['mae']:.1f} | ±{TOLERANCE} {mr['tolerance_analysis']['success_rate']:.1f}%</div>
    </div>"""
        html += "</div></div>"

    html += """
</div>

</div><!-- container -->

<div class="footer">
  멀티 모델 비교 최종 리포트 | 생성: """ + datetime.now().strftime("%Y-%m-%d %H:%M") + f""" | 허용 오차: ±{TOLERANCE}개
</div>

<script>
function switchTab(n) {{
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', i===n));
  document.querySelectorAll('.tab-content').forEach((t,i) => t.classList.toggle('active', i===n));
  setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
}}

const W = {to_json(weekly_results)};
const M = {to_json(monthly_results)};
const labels = W.map(r => r.model_label);
const colors = W.map(r => r.color);

// 종합 비교 차트
Plotly.newPlot('chart_r2', [
  {{ type:'bar', name:'주간 R²', x: labels, y: W.map(r=>r.ensemble_metrics.r2*100),
     marker:{{ color: colors.map(c=>c+'aa'), cornerradius:4 }},
     text: W.map(r=>(r.ensemble_metrics.r2*100).toFixed(1)+'%'), textposition:'outside' }},
  {{ type:'bar', name:'월간 R²', x: labels, y: M.map(r=>r.ensemble_metrics.r2*100),
     marker:{{ color: colors, cornerradius:4 }},
     text: M.map(r=>(r.ensemble_metrics.r2*100).toFixed(1)+'%'), textposition:'outside' }}
], {{
  title: '<b>모델별 R² 비교</b>', barmode:'group', height:380,
  margin:{{t:50,b:120,l:50,r:20}}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
  yaxis:{{ gridcolor:'#f1f5f9', title:'R² (%)' }}, xaxis:{{ tickangle:-25 }},
  legend:{{ orientation:'h', y:1.12 }}, font:{{ family:'Pretendard,sans-serif', size:12 }}
}}, {{responsive:true, displayModeBar:false}});

Plotly.newPlot('chart_mae', [
  {{ type:'bar', name:'주간 MAE', x: labels, y: W.map(r=>r.ensemble_metrics.mae),
     marker:{{ color: colors.map(c=>c+'aa'), cornerradius:4 }},
     text: W.map(r=>r.ensemble_metrics.mae.toFixed(1)), textposition:'outside' }},
  {{ type:'bar', name:'월간 MAE', x: labels, y: M.map(r=>r.ensemble_metrics.mae),
     marker:{{ color: colors, cornerradius:4 }},
     text: M.map(r=>r.ensemble_metrics.mae.toFixed(1)), textposition:'outside' }}
], {{
  title: '<b>모델별 MAE 비교</b> (낮을수록 좋음)', barmode:'group', height:380,
  margin:{{t:50,b:120,l:50,r:20}}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
  yaxis:{{ gridcolor:'#f1f5f9', title:'MAE (개)' }}, xaxis:{{ tickangle:-25 }},
  legend:{{ orientation:'h', y:1.12 }}, font:{{ family:'Pretendard,sans-serif', size:12 }}
}}, {{responsive:true, displayModeBar:false}});

Plotly.newPlot('chart_success', [
  {{ type:'bar', name:'주간', x: labels, y: W.map(r=>r.tolerance_analysis.success_rate),
     marker:{{ color: colors.map(c=>c+'aa'), cornerradius:4 }},
     text: W.map(r=>r.tolerance_analysis.success_rate.toFixed(1)+'%'), textposition:'outside' }},
  {{ type:'bar', name:'월간', x: labels, y: M.map(r=>r.tolerance_analysis.success_rate),
     marker:{{ color: colors, cornerradius:4 }},
     text: M.map(r=>r.tolerance_analysis.success_rate.toFixed(1)+'%'), textposition:'outside' }}
], {{
  title: '<b>±{TOLERANCE} 허용 오차 성공률</b>', barmode:'group', height:380,
  margin:{{t:50,b:120,l:50,r:20}}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
  yaxis:{{ gridcolor:'#f1f5f9', title:'성공률 (%)', range:[0,100] }}, xaxis:{{ tickangle:-25 }},
  legend:{{ orientation:'h', y:1.12 }}, font:{{ family:'Pretendard,sans-serif', size:12 }}
}}, {{responsive:true, displayModeBar:false}});

Plotly.newPlot('chart_gap', [
  {{ type:'bar', name:'주간 Gap', x: labels, y: W.map(r=>r.avg_gap),
     marker:{{ color: colors.map(c=>c+'aa'), cornerradius:4 }} }},
  {{ type:'bar', name:'월간 Gap', x: labels, y: M.map(r=>r.avg_gap),
     marker:{{ color: colors, cornerradius:4 }} }}
], {{
  title: '<b>과적합 Gap (Train-Val R² 차이)</b> (0에 가까울수록 좋음)', barmode:'group', height:380,
  margin:{{t:50,b:120,l:50,r:20}}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
  yaxis:{{ gridcolor:'#f1f5f9', title:'Avg Gap' }}, xaxis:{{ tickangle:-25 }},
  legend:{{ orientation:'h', y:1.12 }}, font:{{ family:'Pretendard,sans-serif', size:12 }}
}}, {{responsive:true, displayModeBar:false}});

// 누적 정확도 곡선
const cumTracesW = W.map(r => ({{
  type:'scatter', mode:'lines', name:r.model_label,
  x: r.tolerance_analysis.cumulative_x, y: r.tolerance_analysis.cumulative_y,
  line: {{ color: r.color, width: 2 }}
}}));
cumTracesW.push({{ type:'scatter', mode:'lines', name:'±{TOLERANCE} 기준선',
  x:[{TOLERANCE},{TOLERANCE}], y:[0,100], line:{{color:'#ef4444',dash:'dash',width:1}}, showlegend:true }});
Plotly.newPlot('chart_cum_w', cumTracesW, {{
  title:'<b>주간 — 누적 정확도 곡선</b><br><span style="font-size:11px;color:#64748b">X축: 허용 오차 범위, Y축: 해당 오차 이내 예측 비율</span>',
  height:380, margin:{{t:60,b:40,l:50,r:20}}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
  xaxis:{{ title:'허용 오차 (개)', gridcolor:'#f1f5f9', range:[0,100] }},
  yaxis:{{ title:'성공률 (%)', gridcolor:'#f1f5f9', range:[0,100] }},
  legend:{{ font:{{size:10}} }}, font:{{ family:'Pretendard,sans-serif', size:12 }}
}}, {{responsive:true, displayModeBar:false}});

const cumTracesM = M.map(r => ({{
  type:'scatter', mode:'lines', name:r.model_label,
  x: r.tolerance_analysis.cumulative_x, y: r.tolerance_analysis.cumulative_y,
  line: {{ color: r.color, width: 2 }}
}}));
cumTracesM.push({{ type:'scatter', mode:'lines', name:'±{TOLERANCE} 기준선',
  x:[{TOLERANCE},{TOLERANCE}], y:[0,100], line:{{color:'#ef4444',dash:'dash',width:1}}, showlegend:true }});
Plotly.newPlot('chart_cum_m', cumTracesM, {{
  title:'<b>월간 — 누적 정확도 곡선</b><br><span style="font-size:11px;color:#64748b">X축: 허용 오차 범위, Y축: 해당 오차 이내 예측 비율</span>',
  height:380, margin:{{t:60,b:40,l:50,r:20}}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
  xaxis:{{ title:'허용 오차 (개)', gridcolor:'#f1f5f9', range:[0,100] }},
  yaxis:{{ title:'성공률 (%)', gridcolor:'#f1f5f9', range:[0,100] }},
  legend:{{ font:{{size:10}} }}, font:{{ family:'Pretendard,sans-serif', size:12 }}
}}, {{responsive:true, displayModeBar:false}});

// 밴드별 성공률 비교 (최고 모델)
const bestW = W.reduce((a,b) => a.ensemble_metrics.r2>b.ensemble_metrics.r2?a:b);
const bestM = M.reduce((a,b) => a.ensemble_metrics.r2>b.ensemble_metrics.r2?a:b);
const bands = ['±1','±5','±10','±20','±50','±100'];
Plotly.newPlot('chart_band_compare', [
  {{ type:'bar', name:'주간 ('+bestW.model_label+')', x:bands,
     y:[bestW.tolerance_analysis.rate_1,bestW.tolerance_analysis.rate_5,bestW.tolerance_analysis.rate_10,
        bestW.tolerance_analysis.rate_20,bestW.tolerance_analysis.rate_50,bestW.tolerance_analysis.rate_100],
     marker:{{color:'#3b82f6aa',cornerradius:4}},
     text:[bestW.tolerance_analysis.rate_1,bestW.tolerance_analysis.rate_5,bestW.tolerance_analysis.rate_10,
           bestW.tolerance_analysis.rate_20,bestW.tolerance_analysis.rate_50,bestW.tolerance_analysis.rate_100].map(v=>v.toFixed(1)+'%'),
     textposition:'outside' }},
  {{ type:'bar', name:'월간 ('+bestM.model_label+')', x:bands,
     y:[bestM.tolerance_analysis.rate_1,bestM.tolerance_analysis.rate_5,bestM.tolerance_analysis.rate_10,
        bestM.tolerance_analysis.rate_20,bestM.tolerance_analysis.rate_50,bestM.tolerance_analysis.rate_100],
     marker:{{color:'#059669',cornerradius:4}},
     text:[bestM.tolerance_analysis.rate_1,bestM.tolerance_analysis.rate_5,bestM.tolerance_analysis.rate_10,
           bestM.tolerance_analysis.rate_20,bestM.tolerance_analysis.rate_50,bestM.tolerance_analysis.rate_100].map(v=>v.toFixed(1)+'%'),
     textposition:'outside' }}
], {{
  title:'<b>최적 모델 — 허용 오차 구간별 성공률</b>',
  barmode:'group', height:380,
  margin:{{t:50,b:50,l:50,r:20}}, paper_bgcolor:'transparent', plot_bgcolor:'transparent',
  yaxis:{{ title:'성공률 (%)', gridcolor:'#f1f5f9', range:[0,110] }},
  font:{{ family:'Pretendard,sans-serif', size:12 }}
}}, {{responsive:true, displayModeBar:false}});

// Feature Importance (주간 — 최고 모델)
if (bestW.feature_importance_top20 && bestW.feature_importance_top20.length > 0) {{
  const fi = bestW.feature_importance_top20.slice().reverse();
  Plotly.newPlot('chart_fi_w', [{{
    type:'bar', orientation:'h',
    y: fi.map(f=>f.name), x: fi.map(f=>f.importance),
    marker:{{ color:'#3b82f6', cornerradius:4 }},
    text: fi.map(f=>f.importance.toFixed(0)), textposition:'outside'
  }}], {{
    title:'<b>주간 Feature Importance TOP 20 ('+bestW.model_label+')</b>',
    height:500, margin:{{t:50,b:30,l:200,r:60}},
    paper_bgcolor:'transparent', plot_bgcolor:'transparent',
    xaxis:{{ gridcolor:'#f1f5f9' }}, font:{{ family:'Pretendard,sans-serif', size:11 }}
  }}, {{responsive:true, displayModeBar:false}});
}}

if (bestM.feature_importance_top20 && bestM.feature_importance_top20.length > 0) {{
  const fi = bestM.feature_importance_top20.slice().reverse();
  Plotly.newPlot('chart_fi_m', [{{
    type:'bar', orientation:'h',
    y: fi.map(f=>f.name), x: fi.map(f=>f.importance),
    marker:{{ color:'#059669', cornerradius:4 }},
    text: fi.map(f=>f.importance.toFixed(0)), textposition:'outside'
  }}], {{
    title:'<b>월간 Feature Importance TOP 20 ('+bestM.model_label+')</b>',
    height:500, margin:{{t:50,b:30,l:200,r:60}},
    paper_bgcolor:'transparent', plot_bgcolor:'transparent',
    xaxis:{{ gridcolor:'#f1f5f9' }}, font:{{ family:'Pretendard,sans-serif', size:11 }}
  }}, {{responsive:true, displayModeBar:false}});
}}

</script>
</body>
</html>"""

    return html


def main():
    print("=" * 60)
    print("  멀티 모델 비교 — 7개 모델 × 주간/월간")
    print(f"  허용 오차: ±{TOLERANCE}개")
    print("=" * 60)

    import lightgbm  # noqa: F401 — 임포트 확인

    # ─── 주간 데이터 로드 ───
    print("\n[주간] feature_store_weekly 로드 중...")
    X_tr_w, y_tr_w, X_te_w, y_te_w, fcols_w, meta_w = load_data(
        "feature_store_weekly", "year_week", "target_1w", WEEKLY_FEATURE_COLS)
    print(f"  {meta_w['total_rows']:,}행 | Train: {meta_w['train_rows']:,} | Test: {meta_w['test_rows']:,} | 피처: {meta_w['n_features']}")

    # ─── 월간 데이터 로드 ───
    print("\n[월간] feature_store_monthly 로드 중...")
    X_tr_m, y_tr_m, X_te_m, y_te_m, fcols_m, meta_m = load_data(
        "feature_store_monthly", "year_month", "target_1m", MONTHLY_FEATURE_COLS)
    print(f"  {meta_m['total_rows']:,}행 | Train: {meta_m['train_rows']:,} | Test: {meta_m['test_rows']:,} | 피처: {meta_m['n_features']}")

    # ─── 7개 모델 실험 ───
    weekly_results = []
    monthly_results = []

    for mcfg in MODELS:
        # 주간
        print(f"\n{'='*50}")
        print(f"  [주간] {mcfg['label']} ({mcfg['id']})")
        print(f"{'='*50}")
        wr = run_experiment(mcfg, X_tr_w, y_tr_w, X_te_w, y_te_w, fcols_w)
        weekly_results.append(wr)

        # 월간
        print(f"\n{'='*50}")
        print(f"  [월간] {mcfg['label']} ({mcfg['id']})")
        print(f"{'='*50}")
        mr = run_experiment(mcfg, X_tr_m, y_tr_m, X_te_m, y_te_m, fcols_m)
        monthly_results.append(mr)

    # ─── 결과 저장 ───
    all_results = {
        "timestamp": datetime.now().isoformat(),
        "tolerance": TOLERANCE,
        "weekly_meta": meta_w,
        "monthly_meta": meta_m,
        "weekly": weekly_results,
        "monthly": monthly_results,
    }
    json_path = os.path.join(EXPERIMENT_DIR, "model_comparison.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2,
                  default=lambda o: int(o) if isinstance(o, (np.integer,)) else float(o) if isinstance(o, (np.floating,)) else None)
    print(f"\n[저장] {json_path}")

    # ─── HTML 대시보드 생성 ───
    print("\n[대시보드] HTML 생성 중...")
    html = generate_html(weekly_results, monthly_results, meta_w, meta_m)
    html_path = os.path.join(SCRIPT_DIR, "model_comparison_report.html")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"  저장: {html_path}")

    # ─── 결과 요약 ───
    print("\n" + "=" * 70)
    print("  최종 결과 요약")
    print("=" * 70)

    print(f"\n  {'모델':<24} {'주간R²':>8} {'주간MAE':>8} {'주간±5':>8} {'월간R²':>8} {'월간MAE':>8} {'월간±5':>8}")
    print("  " + "-" * 68)
    for wr, mr in zip(weekly_results, monthly_results):
        wm = wr["ensemble_metrics"]
        mm = mr["ensemble_metrics"]
        wt = wr["tolerance_analysis"]
        mt = mr["tolerance_analysis"]

        best_w = " ★" if wm["r2"] == max(r["ensemble_metrics"]["r2"] for r in weekly_results) else ""
        best_m = " ★" if mm["r2"] == max(r["ensemble_metrics"]["r2"] for r in monthly_results) else ""

        print(f"  {wr['model_label']:<22} {wm['r2']:>7.4f}{best_w} {wm['mae']:>7.1f} "
              f"{wt['success_rate']:>6.1f}% {mm['r2']:>7.4f}{best_m} {mm['mae']:>7.1f} {mt['success_rate']:>6.1f}%")

    print(f"\n  대시보드: {html_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
