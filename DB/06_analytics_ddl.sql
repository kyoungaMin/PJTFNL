-- =============================================================
-- 분석용 테이블 DDL — 예측형 관제(Control Tower) 시스템
-- 실행: Supabase SQL Editor에서 실행
-- 의존: 01_ddl.sql, 03_external_ddl.sql 선행 실행 필요
-- =============================================================

-- 1. 일간 추정 재고 (Daily Inventory Estimated)
--    산출식: 월초 스냅샷 + 누적생산 - 누적출하(=매출)
CREATE TABLE IF NOT EXISTS daily_inventory_estimated (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id      VARCHAR(20)    NOT NULL,
    target_date     DATE           NOT NULL,
    snapshot_base   NUMERIC(18,6)  DEFAULT 0,     -- 월초 스냅샷 기준값
    cumul_produced  NUMERIC(18,6)  DEFAULT 0,     -- 월초~해당일 누적 생산
    cumul_shipped   NUMERIC(18,6)  DEFAULT 0,     -- 월초~해당일 누적 출하(=매출)
    estimated_qty   NUMERIC(18,6)  NOT NULL,       -- snapshot_base + cumul_produced - cumul_shipped
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (product_id, target_date)
);

COMMENT ON TABLE daily_inventory_estimated IS '일간 추정 재고 — 월간 스냅샷 기반 일간 보간';
COMMENT ON COLUMN daily_inventory_estimated.cumul_shipped IS '누적 출하량 (daily_revenue.quantity 대체 사용)';

CREATE INDEX IF NOT EXISTS idx_die_product ON daily_inventory_estimated(product_id);
CREATE INDEX IF NOT EXISTS idx_die_date    ON daily_inventory_estimated(target_date);

-- 2. 제품별 리드타임 통계 (Product Lead Time)
CREATE TABLE IF NOT EXISTS product_lead_time (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id      VARCHAR(20)    NOT NULL,
    supplier_code   VARCHAR(10),
    calc_date       DATE           NOT NULL,       -- 산출 기준일
    avg_lead_days   NUMERIC(8,2),                  -- 평균 리드타임(일)
    med_lead_days   NUMERIC(8,2),                  -- 중앙값
    p90_lead_days   NUMERIC(8,2),                  -- 90분위 리드타임
    min_lead_days   NUMERIC(8,2),
    max_lead_days   NUMERIC(8,2),
    sample_count    INT,                           -- 산출 근거 건수
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (product_id, supplier_code, calc_date)
);

COMMENT ON TABLE product_lead_time IS '제품별 리드타임 통계 — purchase_order 기반 산출';

CREATE INDEX IF NOT EXISTS idx_plt_product ON product_lead_time(product_id);
CREATE INDEX IF NOT EXISTS idx_plt_date    ON product_lead_time(calc_date);

-- 3. 피처 스토어 (Feature Store — ML 입력용)
CREATE TABLE IF NOT EXISTS feature_store (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id      VARCHAR(20)    NOT NULL,
    target_date     DATE           NOT NULL,
    -- 내부 피처: 롤링 윈도우 집계
    order_qty_7d    NUMERIC(18,6),                 -- 최근 7일 수주량
    order_qty_30d   NUMERIC(18,6),                 -- 최근 30일 수주량
    order_qty_90d   NUMERIC(18,6),                 -- 최근 90일 수주량
    shipped_qty_7d  NUMERIC(18,6),                 -- 최근 7일 출하량
    shipped_qty_30d NUMERIC(18,6),                 -- 최근 30일 출하량
    produced_qty_7d NUMERIC(18,6),                 -- 최근 7일 생산량
    produced_qty_30d NUMERIC(18,6),                -- 최근 30일 생산량
    inventory_qty   NUMERIC(18,6),                 -- 해당일 추정 재고
    avg_lead_days   NUMERIC(8,2),                  -- 평균 리드타임
    avg_unit_price  NUMERIC(18,6),                 -- 최근 평균 단가
    -- 외부 피처
    usd_krw         NUMERIC(12,4),                 -- USD/KRW 환율
    fed_funds_rate  NUMERIC(8,4),                  -- 미국 기준금리
    wti_price       NUMERIC(12,4),                 -- WTI 유가
    indpro_index    NUMERIC(12,4),                 -- 산업생산지수
    semi_export_amt NUMERIC(18,2),                 -- 반도체 수출액 (HS 8541+8542)
    semi_import_amt NUMERIC(18,2),                 -- 반도체 수입액
    -- 시계열 피처
    dow             SMALLINT,                      -- 요일 (0=월~6=일)
    month           SMALLINT,                      -- 월 (1~12)
    is_holiday      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (product_id, target_date)
);

COMMENT ON TABLE feature_store IS '피처 스토어 — 수요예측 모델 입력 피처';

CREATE INDEX IF NOT EXISTS idx_fs_product ON feature_store(product_id);
CREATE INDEX IF NOT EXISTS idx_fs_date    ON feature_store(target_date);

-- 4. 예측 결과 (Forecast Result)
CREATE TABLE IF NOT EXISTS forecast_result (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_id        VARCHAR(50)    NOT NULL,        -- 모델 식별자 (예: 'lgbm_q_v1')
    product_id      VARCHAR(20)    NOT NULL,
    forecast_date   DATE           NOT NULL,        -- 예측 실행일
    target_date     DATE           NOT NULL,        -- 예측 대상일
    horizon_days    INT            NOT NULL,         -- 예측 지평 (7,14,30)
    p10             NUMERIC(18,6),                   -- 10분위 (낙관)
    p50             NUMERIC(18,6),                   -- 50분위 (중앙)
    p90             NUMERIC(18,6),                   -- 90분위 (비관)
    actual_qty      NUMERIC(18,6),                   -- 실적 (사후 기입)
    created_at      TIMESTAMPTZ    DEFAULT NOW()
);

COMMENT ON TABLE forecast_result IS '예측 결과 — P10/P50/P90 분위 예측';

CREATE INDEX IF NOT EXISTS idx_fr_product  ON forecast_result(product_id);
CREATE INDEX IF NOT EXISTS idx_fr_target   ON forecast_result(target_date);
CREATE INDEX IF NOT EXISTS idx_fr_forecast ON forecast_result(forecast_date);

-- 5. 리스크 스코어 (Risk Score)
CREATE TABLE IF NOT EXISTS risk_score (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id      VARCHAR(20)    NOT NULL,
    eval_date       DATE           NOT NULL,        -- 평가일
    -- 리스크 점수 (0~100)
    stockout_risk   NUMERIC(5,2),                   -- 결품 리스크
    excess_risk     NUMERIC(5,2),                   -- 과잉 리스크
    delivery_risk   NUMERIC(5,2),                   -- 납기 리스크
    margin_risk     NUMERIC(5,2),                   -- 마진 리스크
    total_risk      NUMERIC(5,2),                   -- 종합 리스크 (가중합)
    risk_grade      VARCHAR(1),                     -- A/B/C/D/F
    -- 산출 근거
    inventory_days  NUMERIC(8,2),                   -- 재고일수 (재고÷일평균수요)
    demand_p90      NUMERIC(18,6),                  -- P90 예측 수요
    safety_stock    NUMERIC(18,6),                  -- 안전재고 수준
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (product_id, eval_date)
);

COMMENT ON TABLE risk_score IS '리스크 스코어 — 결품/과잉/납기/마진 복합 평가';

CREATE INDEX IF NOT EXISTS idx_rs_product ON risk_score(product_id);
CREATE INDEX IF NOT EXISTS idx_rs_date    ON risk_score(eval_date);
CREATE INDEX IF NOT EXISTS idx_rs_grade   ON risk_score(risk_grade);

-- 6. 조치 큐 (Action Queue)
CREATE TABLE IF NOT EXISTS action_queue (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id      VARCHAR(20)    NOT NULL,
    eval_date       DATE           NOT NULL,
    risk_type       VARCHAR(20)    NOT NULL,         -- stockout/excess/delivery/margin
    severity        VARCHAR(10)    NOT NULL,          -- critical/high/medium/low
    action_type     VARCHAR(30)    NOT NULL,          -- expedite_po/increase_production/reduce_order/adjust_price
    description     TEXT           NOT NULL,           -- 자연어 권장 조치 설명
    suggested_qty   NUMERIC(18,6),                    -- 권장 수량
    status          VARCHAR(15)    DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed', 'dismissed')),
    assigned_to     UUID,                             -- user_profile.id
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ    DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    DEFAULT NOW()
);

COMMENT ON TABLE action_queue IS '조치 큐 — 리스크 기반 권장 조치 및 추적';

CREATE INDEX IF NOT EXISTS idx_aq_product  ON action_queue(product_id);
CREATE INDEX IF NOT EXISTS idx_aq_status   ON action_queue(status);
CREATE INDEX IF NOT EXISTS idx_aq_severity ON action_queue(severity);
CREATE INDEX IF NOT EXISTS idx_aq_date     ON action_queue(eval_date);

-- action_queue.updated_at 자동 갱신 트리거 (05_auth_ddl.sql의 함수 재사용)
CREATE TRIGGER tr_action_queue_updated_at
    BEFORE UPDATE ON action_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
