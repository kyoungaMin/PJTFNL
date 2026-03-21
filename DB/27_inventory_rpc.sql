-- =============================================================
-- 27. Inventory API 성능 개선 RPC
-- 목적: getAvailableMonths() 의 24회 순차 쿼리 → 단일 RPC 호출로 대체
-- =============================================================

-- 재고 조회 가능 월 목록
-- snapshot_date (VARCHAR(6), YYYYMM) 를 중복 없이 최신순 최대 24개 반환
CREATE OR REPLACE FUNCTION get_inventory_available_months()
RETURNS TABLE(snapshot_date varchar)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT snapshot_date
  FROM inventory
  ORDER BY snapshot_date DESC
  LIMIT 24;
$$;

COMMENT ON FUNCTION get_inventory_available_months IS
  '재고 테이블의 DISTINCT snapshot_date를 최신순으로 최대 24개 반환. '
  'inventory/route.ts getAvailableMonths() 에서 사용.';
