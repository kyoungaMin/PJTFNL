-- =============================================================
-- 월별 집계 쿼리 — 품목별 / 거래처별 매출 분석
-- 실행: Supabase SQL Editor에서 실행
-- 참고: daily_revenue.customer_id → supplier.customer_code 매핑
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. 월별 × 거래처별 매출 집계
-- ─────────────────────────────────────────────────────────────
SELECT
    TO_CHAR(r.revenue_date, 'YYYY-MM')  AS year_month,
    r.customer_id,
    s.customer_name,
    COUNT(*)                            AS txn_count,
    COUNT(DISTINCT r.product_id)        AS product_count,
    SUM(r.quantity)                     AS total_qty,
    SUM(r.revenue_amount)              AS total_amount
FROM daily_revenue r
LEFT JOIN supplier s ON s.customer_code = r.customer_id
GROUP BY year_month, r.customer_id, s.customer_name
ORDER BY year_month DESC, total_amount DESC;


-- ─────────────────────────────────────────────────────────────
-- 2. 월별 × 품목별 매출 집계
-- ─────────────────────────────────────────────────────────────
SELECT
    TO_CHAR(r.revenue_date, 'YYYY-MM')  AS year_month,
    r.product_id,
    p.product_name,
    COUNT(*)                            AS txn_count,
    SUM(r.quantity)                     AS total_qty,
    SUM(r.revenue_amount)              AS total_amount
FROM daily_revenue r
LEFT JOIN product_master p ON p.product_code = r.product_id
GROUP BY year_month, r.product_id, p.product_name
ORDER BY year_month DESC, total_amount DESC;


-- ─────────────────────────────────────────────────────────────
-- 3. 월별 전체 요약
-- ─────────────────────────────────────────────────────────────
SELECT
    TO_CHAR(r.revenue_date, 'YYYY-MM')  AS year_month,
    COUNT(*)                            AS txn_count,
    COUNT(DISTINCT r.product_id)        AS product_count,
    COUNT(DISTINCT r.customer_id)       AS customer_count,
    SUM(r.quantity)                     AS total_qty,
    SUM(r.revenue_amount)              AS total_amount
FROM daily_revenue r
GROUP BY year_month
ORDER BY year_month;


-- ─────────────────────────────────────────────────────────────
-- 4. 월별 거래처 TOP 10 (최근 3개월)
-- ─────────────────────────────────────────────────────────────
WITH monthly_customer AS (
    SELECT
        TO_CHAR(r.revenue_date, 'YYYY-MM')  AS year_month,
        r.customer_id,
        s.customer_name,
        COUNT(*)                            AS txn_count,
        COUNT(DISTINCT r.product_id)        AS product_count,
        SUM(r.quantity)                     AS total_qty,
        SUM(r.revenue_amount)              AS total_amount,
        ROW_NUMBER() OVER (
            PARTITION BY TO_CHAR(r.revenue_date, 'YYYY-MM')
            ORDER BY SUM(r.revenue_amount) DESC
        ) AS rank
    FROM daily_revenue r
    LEFT JOIN supplier s ON s.customer_code = r.customer_id
    GROUP BY year_month, r.customer_id, s.customer_name
)
SELECT *
FROM monthly_customer
WHERE rank <= 10
  AND year_month >= TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM')
ORDER BY year_month DESC, rank;


-- ─────────────────────────────────────────────────────────────
-- 5. 월별 품목 TOP 10 (최근 3개월)
-- ─────────────────────────────────────────────────────────────
WITH monthly_product AS (
    SELECT
        TO_CHAR(r.revenue_date, 'YYYY-MM')  AS year_month,
        r.product_id,
        p.product_name,
        COUNT(*)                            AS txn_count,
        SUM(r.quantity)                     AS total_qty,
        SUM(r.revenue_amount)              AS total_amount,
        ROW_NUMBER() OVER (
            PARTITION BY TO_CHAR(r.revenue_date, 'YYYY-MM')
            ORDER BY SUM(r.revenue_amount) DESC
        ) AS rank
    FROM daily_revenue r
    LEFT JOIN product_master p ON p.product_code = r.product_id
    GROUP BY year_month, r.product_id, p.product_name
)
SELECT *
FROM monthly_product
WHERE rank <= 10
  AND year_month >= TO_CHAR(CURRENT_DATE - INTERVAL '3 months', 'YYYY-MM')
ORDER BY year_month DESC, rank;


-- ─────────────────────────────────────────────────────────────
-- 6. 거래처별 매출 점유율 (전체 기간)
-- ─────────────────────────────────────────────────────────────
WITH customer_total AS (
    SELECT
        r.customer_id,
        s.customer_name,
        COUNT(*)                            AS txn_count,
        COUNT(DISTINCT r.product_id)        AS product_count,
        SUM(r.quantity)                     AS total_qty,
        SUM(r.revenue_amount)              AS total_amount
    FROM daily_revenue r
    LEFT JOIN supplier s ON s.customer_code = r.customer_id
    GROUP BY r.customer_id, s.customer_name
),
grand_total AS (
    SELECT SUM(revenue_amount) AS grand_amount FROM daily_revenue
)
SELECT
    ct.customer_id,
    ct.customer_name,
    ct.txn_count,
    ct.product_count,
    ct.total_qty,
    ct.total_amount,
    ROUND(ct.total_amount / gt.grand_amount * 100, 2) AS share_pct,
    SUM(ROUND(ct.total_amount / gt.grand_amount * 100, 2))
        OVER (ORDER BY ct.total_amount DESC) AS cumul_share_pct
FROM customer_total ct
CROSS JOIN grand_total gt
ORDER BY ct.total_amount DESC;


-- ─────────────────────────────────────────────────────────────
-- 7. 월별 × 거래처 × 품목 상세 (피벗 기초)
-- ─────────────────────────────────────────────────────────────
SELECT
    TO_CHAR(r.revenue_date, 'YYYY-MM')  AS year_month,
    r.customer_id,
    s.customer_name,
    r.product_id,
    p.product_name,
    COUNT(*)                            AS txn_count,
    SUM(r.quantity)                     AS total_qty,
    SUM(r.revenue_amount)              AS total_amount
FROM daily_revenue r
LEFT JOIN supplier s ON s.customer_code = r.customer_id
LEFT JOIN product_master p ON p.product_code = r.product_id
GROUP BY year_month, r.customer_id, s.customer_name, r.product_id, p.product_name
ORDER BY year_month DESC, total_amount DESC;
