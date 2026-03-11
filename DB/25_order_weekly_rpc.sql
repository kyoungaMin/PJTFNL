-- ─── 수주량 주간 집계 RPC ────────────────────────────────────────────────────
-- 배경: daily_order(259,684행)를 REST API로 전량 조회하면 limit=1000에 막힘.
--       대시보드 수주량 차트를 주간 단위로 표시하기 위해 DB에서 주별 합산.
--
-- 파라미터:
--   p_from_date  조회 시작일 (YYYY-MM-DD, 보통 26주 전 월요일)
--
-- 반환:
--   week_start_date  해당 주 월요일 (ISO 주 기준)
--   total_qty        해당 주 수주량 합계
--
-- 실행 위치: Supabase 대시보드 → SQL Editor에서 수동 실행

CREATE OR REPLACE FUNCTION get_order_weekly_summary(p_from_date DATE)
RETURNS TABLE(week_start_date DATE, total_qty BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    date_trunc('week', order_date)::DATE AS week_start_date,
    SUM(order_qty)::BIGINT               AS total_qty
  FROM daily_order
  WHERE order_date >= p_from_date
  GROUP BY date_trunc('week', order_date)
  ORDER BY week_start_date;
$$;
