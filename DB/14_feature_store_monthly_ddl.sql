-- =============================================================
-- 14. feature_store_monthly — 월간 피처 스토어 (LightGBM 학습용)
-- 입력: monthly_product_summary, monthly_customer_summary + 외부지표
-- 실행: Supabase SQL Editor에서 실행
-- =============================================================

CREATE TABLE IF NOT EXISTS feature_store_monthly (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id              VARCHAR(20)     NOT NULL,
    year_month              VARCHAR(7)      NOT NULL,       -- 'YYYY-MM'
    month_start             DATE            NOT NULL,

    -- A: 수주 이력 래그
    order_qty_lag1          NUMERIC(18,6),
    order_qty_lag2          NUMERIC(18,6),
    order_qty_lag3          NUMERIC(18,6),
    order_qty_lag6          NUMERIC(18,6),
    order_qty_lag12         NUMERIC(18,6),
    order_qty_ma3           NUMERIC(18,6),
    order_qty_ma6           NUMERIC(18,6),
    order_qty_ma12          NUMERIC(18,6),
    order_count_lag1        INT,
    order_amount_lag1       NUMERIC(18,4),

    -- B: 모멘텀
    order_qty_roc_3m        NUMERIC(12,6),
    order_qty_roc_6m        NUMERIC(12,6),
    order_qty_diff_1m       NUMERIC(18,6),
    order_qty_diff_3m       NUMERIC(18,6),

    -- C: 변동성
    order_qty_std3          NUMERIC(18,6),
    order_qty_std6          NUMERIC(18,6),
    order_qty_cv3           NUMERIC(12,6),
    order_qty_max3          NUMERIC(18,6),
    order_qty_min3          NUMERIC(18,6),
    order_qty_nonzero_3m    SMALLINT,
    order_qty_nonzero_6m    SMALLINT,

    -- D: 공급측
    revenue_qty_lag1        NUMERIC(18,6),
    revenue_qty_ma3         NUMERIC(18,6),
    produced_qty_lag1       NUMERIC(18,6),
    produced_qty_ma3        NUMERIC(18,6),
    inventory_qty           NUMERIC(18,6),
    inventory_months        NUMERIC(12,4),
    avg_lead_days           NUMERIC(8,2),
    book_to_bill_3m         NUMERIC(8,4),

    -- E: 고객 집중도
    customer_count_lag1     INT,
    customer_count_ma3      NUMERIC(8,2),
    top1_customer_pct       NUMERIC(5,2),
    top3_customer_pct       NUMERIC(5,2),
    customer_hhi            NUMERIC(8,4),

    -- F: 가격
    avg_unit_price          NUMERIC(18,6),
    order_avg_value         NUMERIC(18,6),

    -- G: 반도체 시장 지표
    sox_index               NUMERIC(12,4),
    sox_roc_3m              NUMERIC(12,6),
    dram_price              NUMERIC(12,4),
    dram_roc_3m             NUMERIC(12,6),
    nand_price              NUMERIC(12,4),
    silicon_wafer_price     NUMERIC(12,4),

    -- H: 환율
    usd_krw                 NUMERIC(12,4),
    usd_krw_roc_3m          NUMERIC(12,6),
    jpy_krw                 NUMERIC(12,4),
    eur_krw                 NUMERIC(12,4),
    cny_krw                 NUMERIC(12,4),

    -- I: 거시경제
    fed_funds_rate          NUMERIC(8,4),
    wti_price               NUMERIC(12,4),
    indpro_index            NUMERIC(12,4),
    ipman_index             NUMERIC(12,4),
    kr_base_rate            NUMERIC(8,4),
    kr_ipi_mfg              NUMERIC(12,4),
    kr_bsi_mfg              NUMERIC(12,4),
    cn_pmi_mfg              NUMERIC(12,4),

    -- J: 무역
    semi_export_amt         NUMERIC(18,2),
    semi_import_amt         NUMERIC(18,2),
    semi_trade_balance      NUMERIC(18,2),
    semi_export_roc         NUMERIC(12,6),

    -- K: 시간/캘린더
    month                   SMALLINT,
    quarter                 SMALLINT,
    is_year_end             BOOLEAN DEFAULT FALSE,

    -- 타겟 (forward-shifted, 학습 편의용)
    target_1m               NUMERIC(18,6),      -- T+1개월 수주량
    target_3m               NUMERIC(18,6),      -- T+1~T+3개월 수주량 합계
    target_6m               NUMERIC(18,6),      -- T+1~T+6개월 수주량 합계

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (product_id, year_month)
);

COMMENT ON TABLE feature_store_monthly
    IS '월간 피처 스토어 — LightGBM 중장기 수요예측 학습용 (제품×월 단위, ~55개 피처)';

CREATE INDEX IF NOT EXISTS idx_fsm_product    ON feature_store_monthly(product_id);
CREATE INDEX IF NOT EXISTS idx_fsm_yearmonth  ON feature_store_monthly(year_month);
CREATE INDEX IF NOT EXISTS idx_fsm_monthstart ON feature_store_monthly(month_start);
