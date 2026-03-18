-- =====================================================================
-- 28. Inventory Dashboard RPC 함수 3종
-- 목적: API 서버가 DB를 여러 번 호출하는 것을 DB 내부 연산으로 대체
--       → 응답 시간 1초 이내 목표
-- 실행: Supabase SQL Editor에서 실행
-- =====================================================================

-- ── 함수 1: 품목유형별 KPI 통계 ─────────────────────────────────────────
-- route.ts에서 inventory + product_master + risk_score 3개 테이블 순차 조회를
-- 단일 SQL로 합산. 동시에 카테고리 통계도 계산.
--
-- 반환: 품목유형별 (총재고량, SKU수, 위험수, 부족수)
--       + 전달 파라미터 유형의 카테고리별 재고 분포
-- =====================================================================
CREATE OR REPLACE FUNCTION get_inventory_kpi_stats(
  p_month VARCHAR,             -- 조회 월 (YYYYMM)
  p_type  VARCHAR DEFAULT '전체' -- 품목유형 필터 ('전체' = 전체 유형)
)
RETURNS TABLE (
  result_type  VARCHAR,   -- 'type' or 'category'
  name         VARCHAR,   -- 유형명 or 카테고리명
  total_qty    NUMERIC,
  sku_count    BIGINT,
  risk_count   BIGINT,
  short_count  BIGINT
)
LANGUAGE sql
STABLE
AS $$
  WITH
  -- 최신 monthly risk 평가일 결정
  latest_risk AS (
    SELECT eval_date
    FROM risk_score
    WHERE eval_type = 'monthly'
    ORDER BY eval_date DESC
    LIMIT 1
  ),
  -- 월별 재고 합산 (창고별 합계)
  inv AS (
    SELECT product_id, SUM(inventory_qty) AS qty
    FROM inventory
    WHERE snapshot_date = p_month
    GROUP BY product_id
  ),
  -- 해당 monthly 리스크 스냅샷
  rs AS (
    SELECT product_id, safety_stock, risk_grade
    FROM risk_score
    WHERE eval_date = (SELECT eval_date FROM latest_risk)
      AND eval_type = 'monthly'
  ),
  -- 재고 + 제품마스터 + 리스크 조인
  base AS (
    SELECT
      inv.product_id,
      inv.qty,
      COALESCE(pm.product_type, '기타')    AS product_type,
      COALESCE(pm.product_category, '기타') AS product_category,
      rs.safety_stock,
      rs.risk_grade,
      -- 상태 분류 (TypeScript classifyInventoryStatus 로직과 동일)
      CASE
        WHEN rs.risk_grade IN ('E','F') THEN 'risk'
        WHEN rs.risk_grade = 'D'        THEN 'short'
        WHEN rs.safety_stock > 0 AND inv.qty < rs.safety_stock * 0.5 THEN 'risk'
        WHEN rs.safety_stock > 0 AND inv.qty < rs.safety_stock       THEN 'short'
        WHEN rs.safety_stock IS NULL AND inv.qty <= 0                 THEN 'risk'
        WHEN rs.safety_stock IS NULL AND inv.qty <= 3                 THEN 'short'
        ELSE 'normal'
      END AS status
    FROM inv
    JOIN product_master pm ON pm.product_code = inv.product_id
    LEFT JOIN rs ON rs.product_id = inv.product_id
  )
  -- ① 품목유형별 통계
  SELECT
    'type'::VARCHAR            AS result_type,
    base.product_type          AS name,
    SUM(base.qty)              AS total_qty,
    COUNT(*)                   AS sku_count,
    COUNT(*) FILTER (WHERE base.status = 'risk')  AS risk_count,
    COUNT(*) FILTER (WHERE base.status = 'short') AS short_count
  FROM base
  GROUP BY base.product_type

  UNION ALL

  -- ② 선택된 유형의 카테고리별 재고 분포
  SELECT
    'category'::VARCHAR        AS result_type,
    base.product_category      AS name,
    SUM(base.qty)              AS total_qty,
    COUNT(*)                   AS sku_count,
    0::BIGINT                  AS risk_count,
    0::BIGINT                  AS short_count
  FROM base
  WHERE p_type = '전체' OR base.product_type = p_type
  GROUP BY base.product_category
$$;

COMMENT ON FUNCTION get_inventory_kpi_stats IS
  '재고 대시보드 KPI: 품목유형별 재고통계 + 카테고리별 분포. '
  'inventory/route.ts 대시보드 모드에서 사용. '
  '내부적으로 최신 monthly risk_score eval_date 자동 조회.';


-- ── 함수 2: 재고 추이 (월별 트렌드) ──────────────────────────────────────
-- 현재: route.ts에서 최대 12개 월 × 2500행 = 최대 30,000행을 서버로 가져와
--       TypeScript에서 집계. → 단일 SQL 집계로 대체.
--
-- 반환: 각 월 × 품목유형별 총재고량
-- =====================================================================
CREATE OR REPLACE FUNCTION get_inventory_trend(
  p_month VARCHAR,         -- 기준 월 (이 월 포함 과거 p_limit개월)
  p_limit INT DEFAULT 12   -- 최대 월 수
)
RETURNS TABLE (
  month        VARCHAR,
  product_type VARCHAR,
  total_qty    NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH months AS (
    SELECT DISTINCT snapshot_date
    FROM inventory
    WHERE snapshot_date <= p_month
    ORDER BY snapshot_date DESC
    LIMIT p_limit
  )
  SELECT
    i.snapshot_date                             AS month,
    COALESCE(pm.product_type, '기타')::VARCHAR  AS product_type,
    SUM(i.inventory_qty)                        AS total_qty
  FROM inventory i
  JOIN months m ON m.snapshot_date = i.snapshot_date
  LEFT JOIN product_master pm ON pm.product_code = i.product_id
  GROUP BY i.snapshot_date, COALESCE(pm.product_type, '기타')
  ORDER BY i.snapshot_date ASC
$$;

COMMENT ON FUNCTION get_inventory_trend IS
  '재고 월별 트렌드: 최근 N개월간 품목유형별 재고 합계. '
  'inventory/route.ts 대시보드 트렌드 차트에서 사용.';


-- ── 함수 3: 평균 커버리지(재고 소진 예상일수) ──────────────────────────────
-- 현재: weekly_product_summary를 수천 행 서버로 가져와 TypeScript 집계.
--       → SQL 단일 집계로 대체.
--
-- 반환: 해당 유형의 평균 커버리지(일수) 단일 정수값
-- =====================================================================
CREATE OR REPLACE FUNCTION get_inventory_avg_coverage(
  p_month VARCHAR,
  p_type  VARCHAR DEFAULT '전체'
)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  WITH
  ref AS (
    -- YYYYMM → 해당 월 말일 계산
    SELECT
      (TO_DATE(LEFT(p_month,4) || '-' || RIGHT(p_month,2) || '-01', 'YYYY-MM-DD')
        + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS ref_date
  ),
  inv AS (
    SELECT product_id, SUM(inventory_qty) AS qty
    FROM inventory
    WHERE snapshot_date = p_month
    GROUP BY product_id
  ),
  demand AS (
    -- 기준월 말일 기준 최근 8주(56일) 평균 주간 수요
    SELECT
      wps.product_id,
      SUM(wps.order_qty)  AS total_qty,
      COUNT(*)            AS week_cnt
    FROM weekly_product_summary wps
    CROSS JOIN ref r
    WHERE wps.week_start >= (r.ref_date - INTERVAL '56 days')::DATE
      AND wps.week_start <= r.ref_date
    GROUP BY wps.product_id
  )
  SELECT
    CASE
      WHEN SUM(d.total_qty::NUMERIC / NULLIF(d.week_cnt, 0)) > 0
        THEN ROUND(
          SUM(i.qty) / SUM(d.total_qty::NUMERIC / NULLIF(d.week_cnt, 0)) * 7
        )::INT
      ELSE 0
    END
  FROM demand d
  JOIN inv i ON i.product_id = d.product_id
  JOIN product_master pm ON pm.product_code = d.product_id
  WHERE p_type = '전체' OR pm.product_type = p_type
$$;

COMMENT ON FUNCTION get_inventory_avg_coverage IS
  '선택된 품목유형의 평균 커버리지(재고일수) 반환. '
  '기준월 말일 기준 최근 8주 평균 주간수요로 산출. '
  'inventory/route.ts 대시보드 KPI avgCoverageDays에서 사용.';
