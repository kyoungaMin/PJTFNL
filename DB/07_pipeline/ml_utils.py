"""
ML 공용 유틸리티 — 메트릭 계산, Walk-Forward CV, Grid Search, Optuna Search
s4_forecast.py / s4m_forecast_monthly.py 에서 공유
"""

import json
from itertools import product as iterproduct

import numpy as np
import pandas as pd


# ──────────────────────────────────────────────
# 1. 메트릭 계산 (WMAPE 추가)
# ──────────────────────────────────────────────

def compute_metrics(y_true: np.ndarray, p10: np.ndarray,
                    p50: np.ndarray, p90: np.ndarray) -> dict:
    """제품-호라이즌 단위 평가 메트릭 계산 (WMAPE 포함)"""
    n = len(y_true)
    if n == 0:
        return {}

    mae  = float(np.mean(np.abs(y_true - p50)))
    rmse = float(np.sqrt(np.mean((y_true - p50) ** 2)))

    # MAPE + WMAPE (actual=0 제외)
    nonzero = y_true != 0
    if nonzero.sum() > 0:
        mape = float(np.mean(
            np.abs((y_true[nonzero] - p50[nonzero]) / y_true[nonzero])
        ) * 100)
        # WMAPE: 수량 가중 MAPE — 소량 제품 왜곡 방지 (분자/분모 전체 합산)
        wmape = float(
            np.sum(np.abs(y_true[nonzero] - p50[nonzero]))
            / np.sum(y_true[nonzero]) * 100
        )
    else:
        mape  = None
        wmape = None

    # Coverage: 실측치가 P10~P90 구간에 드는 비율 (목표 ~80%)
    within   = ((y_true >= p10) & (y_true <= p90)).sum()
    coverage = float(within / n * 100)

    def _pinball(y, pred, alpha):
        diff = y - pred
        return float(np.mean(np.where(diff >= 0, alpha * diff, (alpha - 1) * diff)))

    return {
        "mae":          round(mae, 6),
        "rmse":         round(rmse, 6),
        "mape":         round(mape,  4) if mape  is not None else None,
        "wmape":        round(wmape, 4) if wmape is not None else None,
        "coverage_rate": round(coverage, 2),
        "pinball_p10":  round(_pinball(y_true, p10, 0.1), 6),
        "pinball_p50":  round(_pinball(y_true, p50, 0.5), 6),
        "pinball_p90":  round(_pinball(y_true, p90, 0.9), 6),
    }


# ──────────────────────────────────────────────
# 2. LightGBM 버전 호환 Early Stopping 헬퍼
# ──────────────────────────────────────────────

def _fit_lgb(model, X_tr, y_tr, X_va, y_va, early_stopping_rounds: int):
    """LightGBM 신/구 버전 모두 호환하는 early stopping fit"""
    try:
        import lightgbm as lgb
        callbacks = [
            lgb.early_stopping(stopping_rounds=early_stopping_rounds, verbose=False),
            lgb.log_evaluation(period=0),
        ]
        model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)], callbacks=callbacks)
    except (AttributeError, TypeError):
        # LightGBM < 4.0 구버전 fallback
        model.fit(X_tr, y_tr, eval_set=[(X_va, y_va)],
                  early_stopping_rounds=early_stopping_rounds, verbose=False)


# ──────────────────────────────────────────────
# 3. Walk-Forward Cross-Validation
# ──────────────────────────────────────────────

def walk_forward_cv(X: pd.DataFrame, y: np.ndarray, params: dict,
                    n_folds: int = 3, min_train_size: int = 20,
                    early_stopping_rounds: int = 50) -> dict | None:
    """
    Expanding-window walk-forward CV.
    데이터를 (n_folds+1) 청크로 분할, fold k에서:
      Train = 청크 0..k,  Val = 청크 k+1
    Early Stopping으로 과적합 방지.
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
    gain_accum  = np.zeros(X.shape[1])
    split_accum = np.zeros(X.shape[1])
    n_models = 0

    for fold in range(n_folds):
        train_end = (fold + 1) * fold_size
        val_end   = min(train_end + fold_size, n)
        if train_end < min_train_size or val_end <= train_end:
            continue

        X_tr, y_tr = X.iloc[:train_end],  y[:train_end]
        X_va, y_va = X.iloc[train_end:val_end], y[train_end:val_end]

        preds = {}
        for alpha in [0.1, 0.5, 0.9]:
            p     = {**params, "alpha": alpha, "verbose": -1}
            model = lgb.LGBMRegressor(**p)
            _fit_lgb(model, X_tr, y_tr, X_va, y_va, early_stopping_rounds)
            preds[alpha] = np.maximum(model.predict(X_va), 0)

            if alpha == 0.5:
                gain_accum  += model.booster_.feature_importance(importance_type="gain")
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
    metrics["n_folds"]         = len(all_y)
    metrics["n_samples_total"] = sum(len(a) for a in all_y)

    if n_models > 0:
        metrics["importance_gain"]  = gain_accum  / n_models
        metrics["importance_split"] = split_accum / n_models

    return metrics


# ──────────────────────────────────────────────
# 4. Grid Search (Optuna 미설치 시 fallback)
# ──────────────────────────────────────────────

def grid_search_horizon(product_data: list, param_grid: dict,
                        base_params: dict, n_folds: int,
                        metric_key: str = "pinball_p50",
                        early_stopping_rounds: int = 50) -> tuple:
    """
    Grid Search — Optuna 미설치 시 fallback.
    Args:
        product_data: list of (X, y) 튜플
        param_grid:   {"param_name": [val1, val2, ...], ...}
        base_params:  기본 LGB_PARAMS
        n_folds:      CV 폴드 수
        metric_key:   최적화 대상 메트릭 (lower is better)
    Returns:
        (best_params_dict, all_results_list)
    """
    keys   = list(param_grid.keys())
    values = list(param_grid.values())
    combos = [dict(zip(keys, v)) for v in iterproduct(*values)]

    print(f"    Grid Search: {len(combos)} 조합 × {len(product_data)}개 샘플 제품")

    results = []
    for idx, combo in enumerate(combos):
        test_params  = {**base_params, **combo}
        combo_scores = []

        for X, y_arr in product_data:
            cv = walk_forward_cv(X, y_arr, test_params, n_folds=n_folds,
                                 early_stopping_rounds=early_stopping_rounds)
            if cv and metric_key in cv and cv[metric_key] is not None:
                combo_scores.append(cv[metric_key])

        avg = float(np.mean(combo_scores)) if combo_scores else float("inf")
        results.append({
            "params":       combo,
            "metric_name":  metric_key,
            "metric_value": avg,
            "n_products":   len(combo_scores),
        })

        if (idx + 1) % 20 == 0:
            print(f"      ... {idx + 1}/{len(combos)} 완료")

    best        = min(results, key=lambda r: r["metric_value"])
    best_params = {**base_params, **best["params"]}

    print(f"    Best {metric_key}: {best['metric_value']:.6f}")
    print(f"    Best params: {json.dumps(best['params'], indent=2)}")

    return best_params, results


# ──────────────────────────────────────────────
# 5. Optuna 베이지안 최적화 (메인 튜닝 방법)
# ──────────────────────────────────────────────

def optuna_search_horizon(product_data: list, base_params: dict,
                          n_trials: int, n_folds: int,
                          metric_key: str = "pinball_p50",
                          early_stopping_rounds: int = 50) -> tuple:
    """
    Optuna TPE 베이지안 최적화.
    Grid Search 대비 동일 시간에 더 넓은 파라미터 공간을 탐색.

    n_estimators를 1000으로 고정하고 Early Stopping이 최적 트리 수를 자동 결정.

    탐색 파라미터:
      max_depth, learning_rate, num_leaves, min_child_samples,
      reg_alpha (L1 정규화), reg_lambda (L2 정규화),
      colsample_bytree, subsample, min_split_gain
    """
    import optuna
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def objective(trial):
        params = {
            **base_params,
            "n_estimators":      1000,   # Early Stopping이 최적값 결정
            "max_depth":         trial.suggest_int("max_depth",         3,    10),
            "learning_rate":     trial.suggest_float("learning_rate",   0.005, 0.2,  log=True),
            "num_leaves":        trial.suggest_int("num_leaves",        8,    256),
            "min_child_samples": trial.suggest_int("min_child_samples", 5,    100),
            "reg_alpha":         trial.suggest_float("reg_alpha",       1e-8, 10.0, log=True),
            "reg_lambda":        trial.suggest_float("reg_lambda",      1e-8, 10.0, log=True),
            "colsample_bytree":  trial.suggest_float("colsample_bytree", 0.4, 1.0),
            "subsample":         trial.suggest_float("subsample",        0.4, 1.0),
            "min_split_gain":    trial.suggest_float("min_split_gain",   0.0, 1.0),
        }
        scores = []
        for X, y_arr in product_data:
            cv = walk_forward_cv(X, y_arr, params, n_folds=n_folds,
                                 early_stopping_rounds=early_stopping_rounds)
            if cv and metric_key in cv and cv[metric_key] is not None:
                scores.append(cv[metric_key])
        return float(np.mean(scores)) if scores else float("inf")

    study = optuna.create_study(
        direction="minimize",
        sampler=optuna.samplers.TPESampler(seed=42),
    )
    study.optimize(objective, n_trials=n_trials, show_progress_bar=True)

    best_params = {**base_params, **study.best_params, "n_estimators": 1000}
    print(f"    Best {metric_key}: {study.best_value:.6f}")
    print(f"    Best params: {json.dumps(study.best_params, indent=2)}")

    # grid_search_horizon 호환 형식 변환 (tuning_result 적재용)
    results = [
        {
            "params":       t.params,
            "metric_name":  metric_key,
            "metric_value": t.value if (t.value is not None and t.value != float("inf")) else None,
            "n_products":   len(product_data),
        }
        for t in study.trials if t.value is not None
    ]

    return best_params, results
