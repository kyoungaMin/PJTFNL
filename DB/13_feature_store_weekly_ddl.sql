-- =============================================================
-- 13. feature_store_weekly — 주간 피처 스토어 (LightGBM 학습용)
-- 입력: weekly_product_summary, weekly_customer_summary + 외부지표
-- 실행: Supabase SQL Editor에서 실행
-- =============================================================

CREATE TABLE IF NOT EXISTS feature_store_weekly (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id              VARCHAR(20)     NOT NULL,
    year_week               VARCHAR(8)      NOT NULL,       -- ISO week '2025-W08'
    week_start              DATE            NOT NULL,

    -- A: 수주 이력 래그
    order_qty_lag1          NUMERIC(18,6),
    order_qty_lag2          NUMERIC(18,6),
    order_qty_lag4          NUMERIC(18,6),
    order_qty_lag8          NUMERIC(18,6),
    order_qty_lag13         NUMERIC(18,6),
    order_qty_lag26         NUMERIC(18,6),
    order_qty_lag52         NUMERIC(18,6),
    order_qty_ma4           NUMERIC(18,6),
    order_qty_ma13          NUMERIC(18,6),
    order_qty_ma26          NUMERIC(18,6),
    order_count_lag1        INT,
    order_count_ma4         NUMERIC(8,2),
    order_amount_lag1       NUMERIC(18,4),

    -- B: 모멘텀
    order_qty_roc_4w        NUMERIC(12,6),
    order_qty_roc_13w       NUMERIC(12,6),
    order_qty_diff_1w       NUMERIC(18,6),
    order_qty_diff_4w       NUMERIC(18,6),

    -- C: 변동성
    order_qty_std4          NUMERIC(18,6),
    order_qty_std13         NUMERIC(18,6),
    order_qty_cv4           NUMERIC(12,6),
    order_qty_max4          NUMERIC(18,6),
    order_qty_min4          NUMERIC(18,6),
    order_qty_nonzero_4w    SMALLINT,
    order_qty_nonzero_13w   SMALLINT,

    -- D: 공급측
    revenue_qty_lag1        NUMERIC(18,6),
    revenue_qty_ma4         NUMERIC(18,6),
    produced_qty_lag1       NUMERIC(18,6),
    produced_qty_ma4        NUMERIC(18,6),
    inventory_qty           NUMERIC(18,6),
    inventory_weeks         NUMERIC(12,4),
    avg_lead_days           NUMERIC(8,2),
    book_to_bill_4w         NUMERIC(8,4),

    -- E: 고객 집중도
    customer_count_lag1     INT,
    customer_count_ma4      NUMERIC(8,2),
    top1_customer_pct       NUMERIC(5,2),
    top3_customer_pct       NUMERIC(5,2),
    customer_hhi            NUMERIC(8,4),

    -- F: 가격
    avg_unit_price          NUMERIC(18,6),
    order_avg_value         NUMERIC(18,6),

    -- G: 반도체 시장 지표
    sox_index               NUMERIC(12,4),
    sox_roc_4w              NUMERIC(12,6),
    dram_price              NUMERIC(12,4),
    dram_roc_4w             NUMERIC(12,6),
    nand_price              NUMERIC(12,4),
    silicon_wafer_price     NUMERIC(12,4),
    baltic_dry_index        NUMERIC(12,4),
    copper_lme              NUMERIC(12,4),

    -- H: 환율
    usd_krw                 NUMERIC(12,4),
    usd_krw_roc_4w          NUMERIC(12,6),
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
    week_num                SMALLINT,
    month                   SMALLINT,
    quarter                 SMALLINT,
    is_holiday_week         BOOLEAN DEFAULT FALSE,
    is_year_end             BOOLEAN DEFAULT FALSE,

    -- 타겟 (forward-shifted, 학습 편의용)
    target_1w               NUMERIC(18,6),      -- T+1주 수주량
    target_2w               NUMERIC(18,6),      -- T+1~T+2주 수주량 합계
    target_4w               NUMERIC(18,6),      -- T+1~T+4주 수주량 합계

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (product_id, year_week)
);

COMMENT ON TABLE feature_store_weekly
    IS '주간 피처 스토어 — LightGBM 수요예측 학습용 (제품×주 단위, ~70개 피처)';

CREATE INDEX IF NOT EXISTS idx_fsw_product   ON feature_store_weekly(product_id);
CREATE INDEX IF NOT EXISTS idx_fsw_yearweek  ON feature_store_weekly(year_week);
CREATE INDEX IF NOT EXISTS idx_fsw_weekstart ON feature_store_weekly(week_start);
