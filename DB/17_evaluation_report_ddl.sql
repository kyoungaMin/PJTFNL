-- =============================================================
-- 기간별 모델 평가 보고서 DDL
-- 실행: Supabase SQL Editor에서 실행
-- 의존: 06_analytics_ddl.sql (forecast_result) 선행 실행 필요
-- =============================================================

-- 기간별 모델 평가 보고서
--   주간/월간 예측 결과 + 자동 생성 해설 + 권고사항
CREATE TABLE IF NOT EXISTS evaluation_report (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_id              VARCHAR(50)    NOT NULL,        -- lgbm_q_v2 | lgbm_q_monthly_v1
    period_type           VARCHAR(10)    NOT NULL,        -- 'weekly' | 'monthly'
    period_key            VARCHAR(10)    NOT NULL,        -- '2025-W08' | '2025-02'
    date_start            DATE           NOT NULL,
    date_end              DATE           NOT NULL,
    -- 핵심 지표
    n_products            INT,
    n_records             INT,
    mae                   NUMERIC(12,4),
    rmse                  NUMERIC(12,4),
    r2                    NUMERIC(10,6),
    mape                  NUMERIC(10,4),
    tolerance_5_rate      NUMERIC(8,4),
    -- 분석 결과 (JSON)
    top_error_products    JSONB,          -- [{product_id, predicted, actual, error}]
    top_accurate_products JSONB,          -- [{product_id, predicted, actual, error}]
    -- 자동 생성 해설 + 인사이트 (JSON)
    insights              JSONB,          -- {summary, r2_explanation, mae_explanation, ...}
    recommendations       JSONB,          -- [{area, action, priority, reason}]
    -- 메타
    created_at            TIMESTAMPTZ    DEFAULT NOW(),
    updated_at            TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (model_id, period_type, period_key)
);

COMMENT ON TABLE evaluation_report IS '기간별 모델 평가 보고서 — 지표 + 해설 + 권고사항';

CREATE INDEX IF NOT EXISTS idx_er_model   ON evaluation_report(model_id);
CREATE INDEX IF NOT EXISTS idx_er_period  ON evaluation_report(period_type, period_key);
CREATE INDEX IF NOT EXISTS idx_er_date    ON evaluation_report(date_start, date_end);
