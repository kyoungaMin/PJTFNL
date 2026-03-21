-- =============================================================
-- 주별·월별 집계 테이블 DDL
-- 실행: Supabase SQL Editor에서 실행
-- 의존: 01_ddl.sql 선행 실행 필요
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. 주차 캘린더 (Week Calendar) — 차원 테이블
--    데이터 범위에 해당하는 모든 ISO 주차를 사전 등록
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_week (
    year_week    VARCHAR(8)  PRIMARY KEY,       -- ISO 주차 '2025-W08'
    year         INT         NOT NULL,          -- 연도 (ISO year)
    week_num     INT         NOT NULL,          -- 주차 번호 (1~53)
    week_start   DATE        NOT NULL,          -- 주 시작일 (월요일)
    week_end     DATE        NOT NULL,          -- 주 종료일 (일요일)
    year_month   VARCHAR(7)  NOT NULL,          -- 목요일 기준 소속 월 '2025-02'
    quarter      SMALLINT    NOT NULL,          -- 분기 (1~4)
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE calendar_week IS '주차 캘린더 — ISO 8601 기준 주차 차원 테이블';

CREATE INDEX IF NOT EXISTS idx_cw_year      ON calendar_week(year);
CREATE INDEX IF NOT EXISTS idx_cw_yearmonth ON calendar_week(year_month);


-- ─────────────────────────────────────────────────────────────
-- 1. 주별 × 제품별 집계 (Weekly Product Summary)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_product_summary (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id       VARCHAR(20)   NOT NULL,
    year_week        VARCHAR(8)    NOT NULL,      -- ISO 주차 '2025-W08'
    week_start       DATE          NOT NULL,      -- 주 시작일 (월요일)
    week_end         DATE          NOT NULL,      -- 주 종료일 (일요일)
    -- 수주 집계
    order_qty        NUMERIC(18,6) DEFAULT 0,
    order_amount     NUMERIC(18,4) DEFAULT 0,
    order_count      INT           DEFAULT 0,
    -- 매출(출하) 집계
    revenue_qty      NUMERIC(18,6) DEFAULT 0,
    revenue_amount   NUMERIC(18,4) DEFAULT 0,
    revenue_count    INT           DEFAULT 0,
    -- 생산 집계
    produced_qty     NUMERIC(18,6) DEFAULT 0,
    production_count INT           DEFAULT 0,
    -- 메타
    customer_count   INT           DEFAULT 0,     -- 해당 주 거래처 수
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (product_id, year_week)
);

COMMENT ON TABLE weekly_product_summary IS '주별 제품 집계 — 수주·매출·생산 통합';

CREATE INDEX IF NOT EXISTS idx_wps_product   ON weekly_product_summary(product_id);
CREATE INDEX IF NOT EXISTS idx_wps_yearweek  ON weekly_product_summary(year_week);


-- ─────────────────────────────────────────────────────────────
-- 2. 주별 × 거래처 × 제품별 집계 (Weekly Customer Summary)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_customer_summary (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id       VARCHAR(20)   NOT NULL,
    customer_id      VARCHAR(10)   NOT NULL,       -- supplier.customer_code 매핑
    customer_name    VARCHAR(200),                  -- supplier.customer_name 조인
    year_week        VARCHAR(8)    NOT NULL,
    week_start       DATE          NOT NULL,
    week_end         DATE          NOT NULL,
    -- 수주 집계
    order_qty        NUMERIC(18,6) DEFAULT 0,
    order_amount     NUMERIC(18,4) DEFAULT 0,
    order_count      INT           DEFAULT 0,
    -- 매출(출하) 집계
    revenue_qty      NUMERIC(18,6) DEFAULT 0,
    revenue_amount   NUMERIC(18,4) DEFAULT 0,
    revenue_count    INT           DEFAULT 0,
    -- 메타
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (product_id, customer_id, year_week)
);

COMMENT ON TABLE weekly_customer_summary IS '주별 거래처×제품 집계 — 수주·매출 (customer_id → supplier.customer_code)';

CREATE INDEX IF NOT EXISTS idx_wcs_product   ON weekly_customer_summary(product_id);
CREATE INDEX IF NOT EXISTS idx_wcs_customer  ON weekly_customer_summary(customer_id);
CREATE INDEX IF NOT EXISTS idx_wcs_yearweek  ON weekly_customer_summary(year_week);


-- ─────────────────────────────────────────────────────────────
-- 3. 월별 × 제품별 집계 (Monthly Product Summary)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_product_summary (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id       VARCHAR(20)   NOT NULL,
    year_month       VARCHAR(7)    NOT NULL,      -- '2025-02'
    -- 수주 집계
    order_qty        NUMERIC(18,6) DEFAULT 0,
    order_amount     NUMERIC(18,4) DEFAULT 0,
    order_count      INT           DEFAULT 0,
    -- 매출(출하) 집계
    revenue_qty      NUMERIC(18,6) DEFAULT 0,
    revenue_amount   NUMERIC(18,4) DEFAULT 0,
    revenue_count    INT           DEFAULT 0,
    -- 생산 집계
    produced_qty     NUMERIC(18,6) DEFAULT 0,
    production_count INT           DEFAULT 0,
    -- 메타
    customer_count   INT           DEFAULT 0,     -- 해당 월 거래처 수
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (product_id, year_month)
);

COMMENT ON TABLE monthly_product_summary IS '월별 제품 집계 — 수주·매출·생산 통합';

CREATE INDEX IF NOT EXISTS idx_mps_product    ON monthly_product_summary(product_id);
CREATE INDEX IF NOT EXISTS idx_mps_yearmonth  ON monthly_product_summary(year_month);


-- ─────────────────────────────────────────────────────────────
-- 4. 월별 × 거래처 × 제품별 집계 (Monthly Customer Summary)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_customer_summary (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id       VARCHAR(20)   NOT NULL,
    customer_id      VARCHAR(10)   NOT NULL,       -- supplier.customer_code 매핑
    customer_name    VARCHAR(200),                  -- supplier.customer_name 조인
    year_month       VARCHAR(7)    NOT NULL,
    -- 수주 집계
    order_qty        NUMERIC(18,6) DEFAULT 0,
    order_amount     NUMERIC(18,4) DEFAULT 0,
    order_count      INT           DEFAULT 0,
    -- 매출(출하) 집계
    revenue_qty      NUMERIC(18,6) DEFAULT 0,
    revenue_amount   NUMERIC(18,4) DEFAULT 0,
    revenue_count    INT           DEFAULT 0,
    -- 메타
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    UNIQUE (product_id, customer_id, year_month)
);

COMMENT ON TABLE monthly_customer_summary IS '월별 거래처×제품 집계 — 수주·매출 (customer_id → supplier.customer_code)';

CREATE INDEX IF NOT EXISTS idx_mcs_product    ON monthly_customer_summary(product_id);
CREATE INDEX IF NOT EXISTS idx_mcs_customer   ON monthly_customer_summary(customer_id);
CREATE INDEX IF NOT EXISTS idx_mcs_yearmonth  ON monthly_customer_summary(year_month);
