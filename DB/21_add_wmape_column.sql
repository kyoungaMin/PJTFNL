-- =============================================================
-- model_evaluation 테이블에 WMAPE 컬럼 추가
-- 실행: Supabase SQL Editor에서 실행 (파이프라인 실행 전 1회)
-- =============================================================

-- WMAPE (Weighted MAPE): 수량 가중 평균 절대 오차율
-- 소량 제품의 예측 오차 왜곡을 방지하는 지표
ALTER TABLE model_evaluation
    ADD COLUMN IF NOT EXISTS wmape NUMERIC(10,4);

COMMENT ON COLUMN model_evaluation.wmape
    IS 'WMAPE(수량 가중 MAPE) — 소량 제품 왜곡 방지용 오차율 (%)';
