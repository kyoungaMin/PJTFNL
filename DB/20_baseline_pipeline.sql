-- =============================================================
-- Baseline 데이터 생성 파이프라인 (Rule-based, ML 전 단계)
-- 실행: Supabase SQL Editor에서 순서대로 실행
-- 의존: 01_ddl.sql, 06_analytics_ddl.sql 선행 실행 필요
--
-- 실행 순서:
--   1. generate_risk_score()   → risk_score 테이블 적재
--   2. generate_action_queue() → action_queue 테이블 적재
--   3. generate_forecast_result() → forecast_result 테이블 적재
--
-- ML 모델 결과가 들어오면 model_id로 구분되어 자연스럽게 교체됨
-- =============================================================


-- =============================================================
-- 1. generate_risk_score()
--    daily_order + inventory + purchase_order 기반 룰로 리스크 점수 계산
--    → risk_score 테이블에 오늘 날짜 기준 데이터 적재
-- =============================================================
CREATE OR REPLACE FUNCTION generate_risk_score()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_latest_snapshot VARCHAR(6);
  v_inserted INT;
BEGIN
  -- 가장 최근 재고 스냅샷 날짜 조회 (예: '202503')
  SELECT MAX(snapshot_date) INTO v_latest_snapshot FROM inventory;

  IF v_latest_snapshot IS NULL THEN
    RETURN 'ERROR: inventory 테이블에 데이터 없음';
  END IF;

  -- 이미 오늘 날짜로 생성된 데이터는 삭제 후 재생성 (멱등성 보장)
  DELETE FROM risk_score WHERE eval_date = v_today;

  -- 제품별 리스크 계산 후 삽입
  INSERT INTO risk_score (
    product_id, eval_date,
    stockout_risk, excess_risk, delivery_risk, margin_risk,
    total_risk, risk_grade,
    inventory_days, demand_p90, safety_stock
  )
  WITH

  -- Step 1: 최근 재고 스냅샷에서 제품별 재고 합산
  inv AS (
    SELECT product_id, SUM(inventory_qty) AS inv_qty
    FROM inventory
    WHERE snapshot_date = v_latest_snapshot
    GROUP BY product_id
  ),

  -- Step 2: 최근 30일 수주량으로 일평균 수요 계산
  demand AS (
    SELECT
      product_id,
      SUM(order_qty)           AS total_30d,
      SUM(order_qty) / 30.0    AS daily_avg,
      -- p90 추정: 일평균의 1.3배 (단순 근사)
      SUM(order_qty) / 30.0 * 1.3 AS daily_p90
    FROM daily_order
    WHERE order_date >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY product_id
  ),

  -- Step 3: 미처리 발주 건수 (결품 위험 판단 보조 지표)
  pending_po AS (
    SELECT component_product_id AS product_id, COUNT(*) AS pending_cnt
    FROM purchase_order
    WHERE status IN ('R', 'P')
    GROUP BY component_product_id
  ),

  -- Step 4: 수주 변동성 계산 (최근 90일 표준편차 / 평균)
  volatility AS (
    SELECT
      product_id,
      CASE
        WHEN AVG(order_qty) > 0
        THEN STDDEV(order_qty) / AVG(order_qty)
        ELSE 0
      END AS cv  -- 변동계수 (Coefficient of Variation)
    FROM daily_order
    WHERE order_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY product_id
  ),

  -- Step 5: 핵심 지표 합산
  base AS (
    SELECT
      inv.product_id,
      inv.inv_qty,
      COALESCE(demand.daily_avg, 0)  AS daily_avg,
      COALESCE(demand.daily_p90, 0)  AS daily_p90,
      COALESCE(pending_po.pending_cnt, 0) AS pending_cnt,
      COALESCE(volatility.cv, 0)     AS cv,
      -- 재고일수 = 재고 ÷ 일평균수요 (수요 0이면 9999일로 처리)
      CASE
        WHEN COALESCE(demand.daily_avg, 0) > 0
        THEN inv.inv_qty / demand.daily_avg
        ELSE 9999
      END AS inv_days,
      -- 안전재고 = 일평균수요 × 14일 (기본 버퍼 2주)
      COALESCE(demand.daily_avg, 0) * 14 AS safety_stock_calc
    FROM inv
    LEFT JOIN demand        ON inv.product_id = demand.product_id
    LEFT JOIN pending_po    ON inv.product_id = pending_po.product_id
    LEFT JOIN volatility    ON inv.product_id = volatility.product_id
  ),

  -- Step 6: 리스크 점수 산출 (0~100)
  scored AS (
    SELECT
      product_id,
      inv_days,
      daily_p90,
      safety_stock_calc,

      -- 결품 리스크: 재고일수가 짧을수록 위험
      CASE
        WHEN inv_days < 7  THEN 90
        WHEN inv_days < 14 THEN 70
        WHEN inv_days < 21 THEN 50
        WHEN inv_days < 30 THEN 30
        ELSE 10
      END AS stockout_risk,

      -- 과잉 리스크: 재고일수가 너무 길면 위험
      CASE
        WHEN inv_days > 120 THEN 80
        WHEN inv_days > 90  THEN 60
        WHEN inv_days > 60  THEN 40
        WHEN inv_days > 45  THEN 20
        ELSE 5
      END AS excess_risk,

      -- 납기 리스크: 미처리 발주 + 수요 변동성 기반
      CASE
        WHEN pending_cnt >= 5 THEN 70
        WHEN pending_cnt >= 3 THEN 50
        WHEN pending_cnt >= 1 THEN 30
        ELSE 10
      END
      +
      CASE
        WHEN cv > 1.0 THEN 20  -- 변동성 매우 높음
        WHEN cv > 0.5 THEN 10
        ELSE 0
      END AS delivery_risk,

      -- 마진 리스크: (간략화) 변동성이 높으면 가격 불안정
      CASE
        WHEN cv > 1.0 THEN 50
        WHEN cv > 0.5 THEN 30
        WHEN cv > 0.2 THEN 15
        ELSE 5
      END AS margin_risk

    FROM base
  )

  -- Step 7: 종합 리스크 + 등급 부여 후 INSERT
  SELECT
    product_id,
    v_today,
    LEAST(stockout_risk, 100),
    LEAST(excess_risk, 100),
    LEAST(delivery_risk, 100),
    LEAST(margin_risk, 100),

    -- 종합 리스크: 결품40% + 납기30% + 과잉20% + 마진10%
    LEAST(
      ROUND(
        stockout_risk  * 0.40 +
        delivery_risk  * 0.30 +
        excess_risk    * 0.20 +
        margin_risk    * 0.10
      , 2),
    100) AS total_risk,

    -- 등급: A(0~20) B(20~40) C(40~60) D(60~80) E(80~90) F(90~100)
    CASE
      WHEN (stockout_risk*0.4 + delivery_risk*0.3 + excess_risk*0.2 + margin_risk*0.1) < 20 THEN 'A'
      WHEN (stockout_risk*0.4 + delivery_risk*0.3 + excess_risk*0.2 + margin_risk*0.1) < 40 THEN 'B'
      WHEN (stockout_risk*0.4 + delivery_risk*0.3 + excess_risk*0.2 + margin_risk*0.1) < 60 THEN 'C'
      WHEN (stockout_risk*0.4 + delivery_risk*0.3 + excess_risk*0.2 + margin_risk*0.1) < 80 THEN 'D'
      WHEN (stockout_risk*0.4 + delivery_risk*0.3 + excess_risk*0.2 + margin_risk*0.1) < 90 THEN 'E'
      ELSE 'F'
    END AS risk_grade,

    ROUND(inv_days::NUMERIC, 2),  -- 재고일수
    daily_p90,                     -- P90 수요 (단순 근사)
    safety_stock_calc              -- 안전재고

  FROM scored;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN FORMAT('OK: risk_score %s건 생성 (eval_date=%s)', v_inserted, v_today);
END;
$$;

COMMENT ON FUNCTION generate_risk_score IS
'Rule-based 리스크 점수 생성 — daily_order + inventory + purchase_order 기반. ML 모델 전 baseline용.';


-- =============================================================
-- 2. generate_action_queue()
--    risk_score 결과를 보고 권고 조치(action_queue)를 생성
--    generate_risk_score() 실행 후에 호출해야 함
-- =============================================================
CREATE OR REPLACE FUNCTION generate_action_queue()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_inserted INT := 0;
BEGIN
  -- 오늘 날짜 기존 데이터 삭제 (재실행 안전)
  DELETE FROM action_queue WHERE eval_date = v_today AND status = 'pending';

  -- risk_score에서 오늘 평가 결과 기반으로 조치 생성
  INSERT INTO action_queue (
    product_id, eval_date, risk_type, severity, action_type, description, suggested_qty, status
  )

  WITH today_risk AS (
    SELECT
      rs.product_id,
      rs.eval_date,
      rs.stockout_risk,
      rs.excess_risk,
      rs.delivery_risk,
      rs.total_risk,
      rs.risk_grade,
      rs.inventory_days,
      rs.safety_stock,
      -- 최근 30일 일평균 수주량 (권고 수량 계산용)
      COALESCE(
        (SELECT SUM(order_qty) / 30.0
         FROM daily_order
         WHERE product_id = rs.product_id
           AND order_date >= CURRENT_DATE - INTERVAL '30 days'),
        0
      ) AS daily_avg_demand
    FROM risk_score rs
    WHERE rs.eval_date = v_today
      AND rs.risk_grade IN ('D', 'E', 'F')  -- 위험 이상 등급만 조치 생성
  )

  -- 결품 리스크 → 긴급 발주 또는 생산 증량 권고
  SELECT
    product_id,
    v_today,
    'stockout'  AS risk_type,
    CASE
      WHEN risk_grade = 'F' THEN 'critical'
      WHEN risk_grade = 'E' THEN 'high'
      ELSE 'medium'
    END AS severity,
    CASE
      WHEN inventory_days < 7 THEN 'expedite_po'
      ELSE 'increase_production'
    END AS action_type,
    FORMAT(
      '재고일수 %.0f일 — 안전재고(%s EA) 대비 부족. %s 필요.',
      inventory_days,
      ROUND(safety_stock),
      CASE WHEN inventory_days < 7 THEN '긴급 구매 발주' ELSE '생산 증량' END
    ) AS description,
    -- 권고 수량: 14일치 수요를 추가로 확보하도록
    ROUND(daily_avg_demand * 14) AS suggested_qty,
    'pending' AS status
  FROM today_risk
  WHERE stockout_risk >= 50  -- 결품 리스크 50점 이상

  UNION ALL

  -- 과잉 재고 리스크 → 발주 감소 또는 생산 감량 권고
  SELECT
    product_id,
    v_today,
    'excess' AS risk_type,
    CASE
      WHEN risk_grade = 'F' THEN 'high'
      ELSE 'medium'
    END AS severity,
    CASE
      WHEN inventory_days > 90 THEN 'reduce_order'
      ELSE 'reduce_production'
    END AS action_type,
    FORMAT(
      '재고일수 %.0f일 — 적정 수준(45일) 초과. 신규 발주 또는 생산 조정 검토 필요.',
      inventory_days
    ) AS description,
    NULL AS suggested_qty,
    'pending' AS status
  FROM today_risk
  WHERE excess_risk >= 60   -- 과잉 리스크 60점 이상
    AND stockout_risk < 50  -- 결품 조치와 중복 방지

  UNION ALL

  -- 납기 리스크 → 공급망 점검 권고
  SELECT
    product_id,
    v_today,
    'delivery' AS risk_type,
    CASE
      WHEN delivery_risk >= 70 THEN 'high'
      ELSE 'medium'
    END AS severity,
    'expedite_po' AS action_type,
    FORMAT(
      '미처리 발주 또는 수요 변동성 증가. 공급업체 납기 확인 및 대체 소싱 검토 권장.'
    ) AS description,
    NULL AS suggested_qty,
    'pending' AS status
  FROM today_risk
  WHERE delivery_risk >= 50
    AND stockout_risk < 50;  -- 결품 조치와 중복 방지

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN FORMAT('OK: action_queue %s건 생성 (eval_date=%s)', v_inserted, v_today);
END;
$$;

COMMENT ON FUNCTION generate_action_queue IS
'Rule-based 조치 큐 생성 — risk_score D/E/F 등급 제품 대상. generate_risk_score() 먼저 실행 필요.';


-- =============================================================
-- 3. generate_forecast_result()
--    이동평균 기반 단순 예측으로 forecast_result 테이블 채우기
--    예측 지평: 30일 / 60일 / 90일
-- =============================================================
CREATE OR REPLACE FUNCTION generate_forecast_result()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_model_id VARCHAR(50) := 'rule_based_ma_v1';  -- ML 모델과 model_id로 구분됨
  v_inserted INT;
BEGIN
  -- 오늘 forecast_date로 생성된 데이터 삭제 (재실행 안전)
  DELETE FROM forecast_result
  WHERE forecast_date = v_today AND model_id = v_model_id;

  INSERT INTO forecast_result (
    model_id, product_id, forecast_date, target_date, horizon_days,
    p10, p50, p90
  )
  WITH

  -- 최근 90일 수주 데이터로 제품별 일평균 + 표준편차 계산
  stats AS (
    SELECT
      product_id,
      AVG(order_qty)    AS mean_qty,
      STDDEV(order_qty) AS std_qty,
      COUNT(*)          AS data_points
    FROM daily_order
    WHERE order_date >= CURRENT_DATE - INTERVAL '90 days'
    GROUP BY product_id
    HAVING COUNT(*) >= 5  -- 데이터 5건 이상인 제품만 예측
  ),

  -- 예측 지평 3가지 생성 (30/60/90일 뒤의 날짜)
  horizons AS (
    SELECT 30 AS horizon_days UNION ALL
    SELECT 60 UNION ALL
    SELECT 90
  )

  SELECT
    v_model_id,
    s.product_id,
    v_today                                       AS forecast_date,
    v_today + (h.horizon_days || ' days')::INTERVAL AS target_date,
    h.horizon_days,

    -- P10 (낙관): 평균 - 0.5 × 표준편차 (하한, 최소 0)
    GREATEST(
      ROUND((s.mean_qty - 0.5 * COALESCE(s.std_qty, 0)) * h.horizon_days, 0),
      0
    ) AS p10,

    -- P50 (중앙): 이동평균 그대로
    ROUND(s.mean_qty * h.horizon_days, 0) AS p50,

    -- P90 (비관): 평균 + 1.0 × 표준편차 (상한)
    ROUND((s.mean_qty + 1.0 * COALESCE(s.std_qty, 0)) * h.horizon_days, 0) AS p90

  FROM stats s
  CROSS JOIN horizons h;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN FORMAT('OK: forecast_result %s건 생성 (model_id=%s, forecast_date=%s)',
                v_inserted, v_model_id, v_today);
END;
$$;

COMMENT ON FUNCTION generate_forecast_result IS
'이동평균 기반 예측 생성 — 최근 90일 수주 평균/표준편차로 P10/P50/P90 산출. model_id=rule_based_ma_v1';


-- =============================================================
-- 4. run_baseline_pipeline()
--    위 3개 함수를 순서대로 한 번에 실행하는 마스터 함수
--    Supabase Cron에 이 함수 하나만 등록하면 됨
-- =============================================================
CREATE OR REPLACE FUNCTION run_baseline_pipeline()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  r1 TEXT;
  r2 TEXT;
  r3 TEXT;
BEGIN
  r1 := generate_risk_score();
  r2 := generate_action_queue();
  r3 := generate_forecast_result();

  RETURN FORMAT(E'Pipeline 완료\n1. %s\n2. %s\n3. %s', r1, r2, r3);
END;
$$;

COMMENT ON FUNCTION run_baseline_pipeline IS
'Baseline 파이프라인 마스터 함수 — risk_score → action_queue → forecast_result 순 실행';


-- =============================================================
-- 5. 즉시 실행 (처음 한 번 데이터 채우기)
--    함수 생성 후 아래 줄을 실행하면 바로 데이터가 들어감
-- =============================================================
SELECT run_baseline_pipeline();
