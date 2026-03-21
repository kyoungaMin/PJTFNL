-- ─── 수주량 월별 집계 RPC ───────────────────────────────────────────────────
-- 배경: daily_order(259,684행)를 REST API로 전량 조회하면
--       Supabase 기본 limit=1000에 막혀 최초 1000행(2024-12월분)만 반환됨.
--       → 차트 실적선이 '24.12 이후 끊기는 버그 발생.
--       DB에서 월별 합산 후 소량(15~18행)만 반환하는 방식으로 해결.
--
-- 실행 위치: Supabase 대시보드 → SQL Editor에서 수동 실행

CREATE OR REPLACE FUNCTION get_order_monthly_summary(p_from_date DATE)
RETURNS TABLE(ym TEXT, total_qty BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    TO_CHAR(order_date, 'YYYY-MM') AS ym,
    SUM(order_qty)::BIGINT         AS total_qty
  FROM daily_order
  WHERE order_date >= p_from_date
  GROUP BY TO_CHAR(order_date, 'YYYY-MM')
  ORDER BY ym;
$$;
