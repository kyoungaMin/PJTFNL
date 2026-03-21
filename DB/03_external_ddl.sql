-- =============================================================
-- 외부지표 테이블 DDL — 반도체 수요예측 AI SaaS
-- 실행: Supabase SQL Editor에서 실행
-- =============================================================

-- 1. 경제지표 (FRED, EIA, ECOS 등 시계열)
CREATE TABLE IF NOT EXISTS economic_indicator (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source          VARCHAR(20)  NOT NULL,     -- 'FRED', 'EIA', 'ECOS'
    indicator_code  VARCHAR(50)  NOT NULL,     -- 예: 'INDPRO', 'WTI'
    indicator_name  VARCHAR(200),
    date            DATE         NOT NULL,
    value           NUMERIC(18,6),
    unit            VARCHAR(50),
    fetched_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(source, indicator_code, date)
);

COMMENT ON TABLE economic_indicator IS '경제지표 — FRED/EIA/ECOS 시계열 데이터';

CREATE INDEX IF NOT EXISTS idx_econ_source_code ON economic_indicator(source, indicator_code);
CREATE INDEX IF NOT EXISTS idx_econ_date ON economic_indicator(date);

-- 2. 무역통계 (관세청 품목별 수출입)
CREATE TABLE IF NOT EXISTS trade_statistics (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hs_code         VARCHAR(20)  NOT NULL,
    hs_description  VARCHAR(200),
    year_month      VARCHAR(7)   NOT NULL,     -- '2024-01'
    export_amount   NUMERIC(18,2),             -- USD
    export_weight   NUMERIC(18,2),             -- kg
    import_amount   NUMERIC(18,2),             -- USD
    import_weight   NUMERIC(18,2),             -- kg
    balance         NUMERIC(18,2),             -- 수출-수입
    fetched_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE(hs_code, year_month)
);

COMMENT ON TABLE trade_statistics IS '무역통계 — 관세청 HS코드별 수출입 데이터';

CREATE INDEX IF NOT EXISTS idx_trade_hs ON trade_statistics(hs_code);
CREATE INDEX IF NOT EXISTS idx_trade_ym ON trade_statistics(year_month);
