-- =============================================================
-- 09. 환율(Exchange Rate) 테이블
-- 반도체 부품·소재 수요예측 AI SaaS
-- 일별 통화별 환율 데이터 (KRW 기준)
-- =============================================================

-- ── exchange_rate: 일별 환율 ────────────────────────────────
CREATE TABLE IF NOT EXISTS exchange_rate (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    base_currency   VARCHAR(3)      NOT NULL,                   -- 기준 통화 (USD, JPY, EUR, CNY)
    quote_currency  VARCHAR(3)      NOT NULL DEFAULT 'KRW',     -- 표시 통화 (KRW 고정)
    rate_date       DATE            NOT NULL,                   -- 환율 일자
    rate            NUMERIC(12,4)   NOT NULL,                   -- 환율 값 (1 base → quote)
    source          VARCHAR(20)     NOT NULL DEFAULT 'FRED',    -- 데이터 소스 (FRED, BOK, GENERATED)
    fetched_at      TIMESTAMPTZ     DEFAULT NOW(),              -- 수집 시각

    UNIQUE (base_currency, quote_currency, rate_date)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_exrate_date
    ON exchange_rate (rate_date);

CREATE INDEX IF NOT EXISTS idx_exrate_currency
    ON exchange_rate (base_currency, quote_currency);

CREATE INDEX IF NOT EXISTS idx_exrate_base_date
    ON exchange_rate (base_currency, rate_date);

-- 코멘트
COMMENT ON TABLE  exchange_rate IS '일별 환율 (KRW 기준)';
COMMENT ON COLUMN exchange_rate.base_currency  IS '기준 통화 코드 (USD, JPY, EUR, CNY)';
COMMENT ON COLUMN exchange_rate.quote_currency IS '표시 통화 코드 (기본: KRW)';
COMMENT ON COLUMN exchange_rate.rate_date      IS '환율 기준일';
COMMENT ON COLUMN exchange_rate.rate           IS '환율 값 (1 base_currency = rate quote_currency)';
COMMENT ON COLUMN exchange_rate.source         IS '데이터 출처 (FRED / BOK / GENERATED)';
