-- ─── 대시보드 성능 최적화: DB 집계 RPC 함수 ───────────────────────────────────
-- 배경: forecast_result(144K행), risk_score(13K행)을 REST API로 전량 가져오면 느림
--       DB에서 집계 후 소량만 반환하는 방식으로 전환
--
-- 실행 위치: Supabase 대시보드 → SQL Editor에서 수동 실행

-- ─── 1. 예측 밴드 집계 ────────────────────────────────────────────────────────
-- 특정 forecast_date + model_id의 horizon별 P10/P50/P90 합산
-- p_model_id 미지정(NULL) 시 해당 날짜 전체 집계 (하위 호환)
-- (product_id + horizon_days 중복 제거 후 합산)
CREATE OR REPLACE FUNCTION get_forecast_summary(p_date DATE, p_model_id TEXT DEFAULT NULL)
RETURNS TABLE(horizon_days INT, p10 NUMERIC, p50 NUMERIC, p90 NUMERIC)
LANGUAGE sql STABLE AS $$
  SELECT
    horizon_days,
    SUM(p10)::NUMERIC AS p10,
    SUM(p50)::NUMERIC AS p50,
    SUM(p90)::NUMERIC AS p90
  FROM (
    SELECT DISTINCT ON (product_id, horizon_days)
      horizon_days, p10, p50, p90
    FROM forecast_result
    WHERE forecast_date = p_date
      AND (p_model_id IS NULL OR model_id = p_model_id)
    ORDER BY product_id, horizon_days
  ) t
  GROUP BY horizon_days
  ORDER BY horizon_days;
$$;

-- ─── 2. 위험 등급 집계 ────────────────────────────────────────────────────────
-- 특정 eval_date의 등급별 SKU 수 카운트
CREATE OR REPLACE FUNCTION get_risk_grade_summary(p_date DATE)
RETURNS TABLE(risk_grade TEXT, cnt BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT
    risk_grade::TEXT,
    COUNT(*)::BIGINT AS cnt
  FROM risk_score
  WHERE eval_date = p_date
  GROUP BY risk_grade
  ORDER BY risk_grade;
$$;
