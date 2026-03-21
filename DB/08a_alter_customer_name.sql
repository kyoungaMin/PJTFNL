-- =============================================================
-- 08a. customer_name 컬럼 추가 (기존 테이블 ALTER)
-- 매핑: daily_revenue.customer_id → supplier.customer_code
-- 실행: Supabase SQL Editor에서 실행
-- =============================================================

-- weekly_customer_summary에 customer_name 추가
ALTER TABLE weekly_customer_summary
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200);

COMMENT ON COLUMN weekly_customer_summary.customer_name
    IS '거래처명 (supplier.customer_name 매핑)';

-- monthly_customer_summary에 customer_name 추가
ALTER TABLE monthly_customer_summary
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(200);

COMMENT ON COLUMN monthly_customer_summary.customer_name
    IS '거래처명 (supplier.customer_name 매핑)';

-- =============================================================
-- 기존 데이터 backfill: supplier.customer_name → customer_name
-- =============================================================

-- weekly_customer_summary backfill
UPDATE weekly_customer_summary wcs
SET customer_name = s.customer_name
FROM supplier s
WHERE wcs.customer_id = s.customer_code
  AND (wcs.customer_name IS NULL OR wcs.customer_name = '');

-- monthly_customer_summary backfill
UPDATE monthly_customer_summary mcs
SET customer_name = s.customer_name
FROM supplier s
WHERE mcs.customer_id = s.customer_code
  AND (mcs.customer_name IS NULL OR mcs.customer_name = '');
