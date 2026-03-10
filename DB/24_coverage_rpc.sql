-- ─── 재고 커버리지 계산 RPC ───────────────────────────────────────────────────
-- 배경: inventory(617,720행) + daily_order(259,684행) 를 REST API로 직접 조회하면
--       Supabase 기본 limit=1000에 막혀 오계산 발생.
--         inventory  → 최신 스냅샷 재고 합계가 1000행분만 집계됨
--         daily_order → 30일 수주량 분모가 실제보다 훨씬 작게 계산됨
--         → 커버리지가 1,081일처럼 비정상적으로 크게 나오는 버그
--       DB에서 집계 후 단일 행만 반환하는 방식으로 해결.
--
-- 파라미터:
--   p_from_date  최근 30일 시작일 (YYYY-MM-DD)
--   p_to_date    오늘 날짜       (YYYY-MM-DD)
--
-- 반환:
--   snapshot_date   inventory 최신 스냅샷 날짜 (VARCHAR 그대로 반환)
--   total_inv_qty   최신 스냅샷 재고 합계 (음수 행 0으로 처리)
--   total_order_qty p_from_date ~ p_to_date 기간 수주량 합계
--
-- 실행 위치: Supabase 대시보드 → SQL Editor에서 수동 실행

CREATE OR REPLACE FUNCTION get_inventory_coverage(p_from_date DATE, p_to_date DATE)
RETURNS TABLE(snapshot_date TEXT, total_inv_qty NUMERIC, total_order_qty BIGINT)
LANGUAGE sql STABLE AS $$
  WITH latest_snap AS (
    SELECT MAX(snapshot_date) AS snap_date FROM inventory
  )
  SELECT
    ls.snap_date::TEXT                                                         AS snapshot_date,
    COALESCE(SUM(GREATEST(COALESCE(i.inventory_qty, 0), 0)), 0)::NUMERIC       AS total_inv_qty,
    (SELECT COALESCE(SUM(order_qty), 0)
       FROM daily_order
      WHERE order_date >= p_from_date
        AND order_date <= p_to_date
    )::BIGINT                                                                  AS total_order_qty
  FROM latest_snap ls
  LEFT JOIN inventory i ON i.snapshot_date = ls.snap_date
  GROUP BY ls.snap_date;
$$;
