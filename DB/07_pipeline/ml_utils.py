"""
ML 공용 유틸리티 — 메트릭 계산, Walk-Forward CV, Grid Search
s4_forecast.py / s4m_forecast_monthly.py 에서 공유
"""

import json
from itertools import product as iterproduct

import numpy as np
import pandas as pd


# ──────────────────────────────────────────────
# 1. 메트릭 계산
# ──────────────────────────────────────────────

def compute_metrics(y_true: np.ndarray, p10: np.ndarray,
                    p50: np.ndarray, p90: np.ndarray) -> dict:
    """제품-호라이즌 단위 평가 메트릭 계산"""
    n = len(y_true)
    if n == 0:
        return {}

    # P50 정확도
    mae = float(np.mean(np.abs(y_true - p50)))
    rmse = float(np.sqrt(np.mean((y_true - p50) ** 2)))

    # MAPE (actual=0 인 경우 제외)
    nonzero = y_true != 0
    if nonzero.sum() > 0:
        mape = float(np.mean(np.abs(
            (y_true[nonzero] - p50[nonzero]) / y_true[nonzero]
        )) * 100)
    else:
        mape = None

    # Coverage: 실측치가 P10~P90 밴드 안에 들어오는 비율 (목표 ~80%)
    within = ((y_true >= p10) & (y_true <= p90)).sum()
    coverage = float(within / n * 100)

    # Pinball loss
    def _pinball(y, pred, alpha):
        diff = y - pred
        return float(np.mean(np.where(diff >= 0, alpha * diff, (alpha - 1) * diff)))

    return {
        "mae": round(mae, 6),
        "rmse": round(rmse, 6),
        "mape": round(mape, 4) if mape is not None else None,
        "coverage_rate": round(coverage, 2),
        "pinball_p10": round(_pinball(y_true, p10, 0.1), 6),
        "pinball_p50": round(_pinball(y_true, p50, 0.5), 6),
        "pinball_p90": round(_pinball(y_true, p90, 0.9), 6),
    }


# ──────────────────────────────────────────────
# 2. Walk-Forward Cross-Validation
# ──────────────────────────────────────────────

def walk_forward_cv(X: pd.DataFrame, y: np.ndarray, params: dict,
                    n_folds: int = 3, min_train_size: int = 20) -> dict | None:
    """
    Expanding-window walk-forward CV.
    데이터를 (n_folds+1) 청크로 분할, fold k 에서:
      Train = 청크 0..k, Val = 청크 k+1
    Returns: 메트릭 dict + feature importance 누적값 (또는 None)
    """
    try:
        import lightgbm as lgb
    except ImportError:
        return None

    n = len(X)
    fold_size = n // (n_folds + 1)
    if fold_size < 3:
        return None

    all_y, all_p10, all_p50, all_p90 = [], [], [], []
    gain_accum = np.zeros(X.shape[1])
    split_accum = np.zeros(X.shape[1])
    n_models = 0

    for fold in range(n_folds):
        train_end = (fold + 1) * fold_size
        val_end = min(train_end + fold_size, n)
        if train_end < min_train_size or val_end <= train_end:
            continue

        X_tr, y_tr = X.iloc[:train_end], y[:train_end]
        X_va, y_va = X.iloc[train_end:val_end], y[train_end:val_end]

        preds = {}
        for alpha in [0.1, 0.5, 0.9]:
            p = {**params, "alpha": alpha, "verbose": -1}
            model = lgb.LGBMRegressor(**p)
            model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)])
            preds[alpha] = np.maximum(model.predict(X_va), 0)

            # P50 모델에서 feature importance 추출
            if alpha == 0.5:
                gain_accum += model.booster_.feature_importance(importance_type="gain")
                split_accum += model.booster_.feature_importance(importance_type="split")
                n_models += 1

        all_y.append(y_va)
        all_p10.append(preds[0.1])
        all_p50.append(preds[0.5])
        all_p90.append(preds[0.9])

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
        metrics["importance_gain"] = gain_accum / n_models
        metrics["importance_split"] = split_accum / n_models

    return metrics


# ──────────────────────────────────────────────
# 3. Grid Search
# ──────────────────────────────────────────────

def grid_search_horizon(product_data: list, param_grid: dict,
                        base_params: dict, n_folds: int,
                        metric_key: str = "pinball_p50") -> tuple:
    """
    Grid Search — 샘플 제품들에 대해 파라미터 조합 탐색.
    Args:
        product_data: list of (X, y) 튜플
        param_grid: {"param_name": [val1, val2, ...], ...}
        base_params: 기본 LGB_PARAMS (objective, metric 등)
        n_folds: CV 폴드 수
        metric_key: 최적화 대상 메트릭 (lower is better)
    Returns:
        (best_params_dict, all_results_list)
    """
    keys = list(param_grid.keys())
    values = list(param_grid.values())
    combos = [dict(zip(keys, v)) for v in iterproduct(*values)]

    print(f"    Grid Search: {len(combos)} 조합 × {len(product_data)}개 샘플 제품")

    results = []
    for idx, combo in enumerate(combos):
        test_params = {**base_params, **combo}
        combo_scores = []

        for X, y_arr in product_data:
            cv = walk_forward_cv(X, y_arr, test_params, n_folds=n_folds)
            if cv and metric_key in cv and cv[metric_key] is not None:
                combo_scores.append(cv[metric_key])

        avg = float(np.mean(combo_scores)) if combo_scores else float("inf")
        results.append({
            "params": combo,
            "metric_name": metric_key,
            "metric_value": avg,
            "n_products": len(combo_scores),
        })

        if (idx + 1) % 20 == 0:
            print(f"      ... {idx + 1}/{len(combos)} 완료")

    best = min(results, key=lambda r: r["metric_value"])
    best_params = {**base_params, **best["params"]}

    print(f"    Best {metric_key}: {best['metric_value']:.6f}")
    print(f"    Best params: {json.dumps(best['params'], indent=2)}")

    return best_params, results
