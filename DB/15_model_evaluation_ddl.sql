-- =============================================================
-- 모델 평가·피처 중요도·튜닝 결과 DDL
-- 실행: Supabase SQL Editor에서 실행
-- 의존: 06_analytics_ddl.sql 선행 실행 필요
-- =============================================================

-- 1. 모델 평가 지표 (Model Evaluation)
--    제품×호라이즌별 MAPE/RMSE/MAE/Coverage/Pinball
CREATE TABLE IF NOT EXISTS model_evaluation (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_id            VARCHAR(50)    NOT NULL,
    product_id          VARCHAR(20)    NOT NULL,
    horizon_key         VARCHAR(20)    NOT NULL,
    horizon_days        INT            NOT NULL,
    eval_date           DATE           NOT NULL,
    -- P50 정확도 지표
    mape                NUMERIC(10,4),
    rmse                NUMERIC(18,6),
    mae                 NUMERIC(18,6),
    -- 분위 예측 품질
    coverage_rate       NUMERIC(5,2),
    pinball_p10         NUMERIC(18,6),
    pinball_p50         NUMERIC(18,6),
    pinball_p90         NUMERIC(18,6),
    -- Walk-Forward CV 메타
    n_folds             INT,
    n_samples_total     INT,
    params_json         TEXT,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (model_id, product_id, horizon_key, eval_date)
);

COMMENT ON TABLE model_evaluation IS '모델 평가 지표 — 제품×호라이즌별 MAPE/RMSE/Coverage/Pinball';

CREATE INDEX IF NOT EXISTS idx_me_model   ON model_evaluation(model_id);
CREATE INDEX IF NOT EXISTS idx_me_product ON model_evaluation(product_id);
CREATE INDEX IF NOT EXISTS idx_me_horizon ON model_evaluation(horizon_key);
CREATE INDEX IF NOT EXISTS idx_me_date    ON model_evaluation(eval_date);

-- 2. 피처 중요도 (Feature Importance)
--    LightGBM gain/split importance (제품 평균)
CREATE TABLE IF NOT EXISTS feature_importance (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_id            VARCHAR(50)    NOT NULL,
    horizon_key         VARCHAR(20)    NOT NULL,
    eval_date           DATE           NOT NULL,
    feature_name        VARCHAR(100)   NOT NULL,
    importance_gain     NUMERIC(12,6),
    importance_split    NUMERIC(12,6),
    rank_gain           INT,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (model_id, horizon_key, eval_date, feature_name)
);

COMMENT ON TABLE feature_importance IS '피처 중요도 — LightGBM gain/split importance 제품 평균';

CREATE INDEX IF NOT EXISTS idx_fi_model   ON feature_importance(model_id);
CREATE INDEX IF NOT EXISTS idx_fi_horizon ON feature_importance(horizon_key);
CREATE INDEX IF NOT EXISTS idx_fi_date    ON feature_importance(eval_date);

-- 3. 튜닝 결과 (Tuning Result)
--    Grid Search 조합별 결과 이력
CREATE TABLE IF NOT EXISTS tuning_result (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_id            VARCHAR(50)    NOT NULL,
    horizon_key         VARCHAR(20)    NOT NULL,
    eval_date           DATE           NOT NULL,
    params_json         TEXT           NOT NULL,
    metric_name         VARCHAR(30)    NOT NULL,
    metric_value        NUMERIC(18,6),
    is_best             BOOLEAN        DEFAULT FALSE,
    n_folds             INT,
    created_at          TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (model_id, horizon_key, eval_date, params_json)
);

COMMENT ON TABLE tuning_result IS '하이퍼파라미터 튜닝 결과 — Grid Search 이력';

CREATE INDEX IF NOT EXISTS idx_tr_model   ON tuning_result(model_id);
CREATE INDEX IF NOT EXISTS idx_tr_horizon ON tuning_result(horizon_key);
CREATE INDEX IF NOT EXISTS idx_tr_best    ON tuning_result(is_best) WHERE is_best = TRUE;
