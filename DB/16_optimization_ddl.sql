-- =============================================================
-- Phase 4: 생산·발주 최적화 테이블 DDL
-- 실행: Supabase SQL Editor에서 실행
-- 의존: 06_analytics_ddl.sql 선행 실행 필요
--       (update_updated_at 함수: 05_auth_ddl.sql에서 정의)
-- =============================================================

-- 1. 생산 계획 (Production Plan)
--    수요예측 + 재고 + 캐파 기반 제품별 최적 생산량 산출
CREATE TABLE IF NOT EXISTS production_plan (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id        VARCHAR(20)    NOT NULL,
    plan_date         DATE           NOT NULL,         -- 계획 생성일
    plan_horizon      VARCHAR(10)    NOT NULL,         -- 'weekly' / 'monthly'
    target_start      DATE           NOT NULL,         -- 계획 대상 시작일
    target_end        DATE           NOT NULL,         -- 계획 대상 종료일
    -- 수요 산출 근거
    demand_p50        NUMERIC(18,6)  DEFAULT 0,        -- P50 예측 수요
    demand_p90        NUMERIC(18,6)  DEFAULT 0,        -- P90 예측 수요 (안전 기준)
    -- 재고·안전재고
    current_inventory NUMERIC(18,6)  DEFAULT 0,        -- 현재 재고
    safety_stock      NUMERIC(18,6)  DEFAULT 0,        -- 안전재고 수준
    -- 생산 캐파시티
    daily_capacity    NUMERIC(18,6),                    -- 일평균 생산 가능량
    max_capacity      NUMERIC(18,6),                    -- 기간 내 최대 생산 가능량
    -- 산출 결과
    planned_qty       NUMERIC(18,6)  NOT NULL,          -- 최적 생산량 (핵심 출력)
    min_qty           NUMERIC(18,6),                    -- 최소 생산량 (P50 기반)
    max_qty           NUMERIC(18,6),                    -- 최대 생산량 (P90 기반)
    -- 분류·상태
    priority          VARCHAR(10)    NOT NULL
                      CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    plan_type         VARCHAR(20)    NOT NULL
                      CHECK (plan_type IN ('increase', 'decrease', 'maintain', 'new')),
    risk_grade        VARCHAR(1),                       -- 연동된 리스크 등급
    description       TEXT,                             -- 계획 사유 설명
    status            VARCHAR(15)    DEFAULT 'draft'
                      CHECK (status IN ('draft', 'approved', 'in_progress', 'completed', 'cancelled')),
    created_at        TIMESTAMPTZ    DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (product_id, plan_date, plan_horizon)
);

COMMENT ON TABLE production_plan IS '생산 계획 — 수요예측+재고+캐파 기반 최적 생산량 산출';

CREATE INDEX IF NOT EXISTS idx_pp_product  ON production_plan(product_id);
CREATE INDEX IF NOT EXISTS idx_pp_date     ON production_plan(plan_date);
CREATE INDEX IF NOT EXISTS idx_pp_priority ON production_plan(priority);
CREATE INDEX IF NOT EXISTS idx_pp_status   ON production_plan(status);

CREATE TRIGGER tr_production_plan_updated_at
    BEFORE UPDATE ON production_plan
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();


-- 2. 발주 추천 (Purchase Recommendation)
--    BOM 전개 + 리드타임 + 단가 기반 최적 발주 추천
CREATE TABLE IF NOT EXISTS purchase_recommendation (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    component_product_id  VARCHAR(20)    NOT NULL,        -- 자재(부품) 코드
    plan_date             DATE           NOT NULL,         -- 추천 생성일
    -- 소요량 산출 근거
    parent_product_ids    TEXT,                             -- BOM 전개 소스 제품 목록 (JSON 배열)
    gross_requirement     NUMERIC(18,6)  DEFAULT 0,        -- 총소요량 (BOM 전개)
    current_inventory     NUMERIC(18,6)  DEFAULT 0,        -- 현재 재고
    pending_po_qty        NUMERIC(18,6)  DEFAULT 0,        -- 미입고 발주 잔량
    net_requirement       NUMERIC(18,6)  DEFAULT 0,        -- 순소요량
    -- 안전재고·재주문점
    safety_stock          NUMERIC(18,6)  DEFAULT 0,        -- 안전재고
    reorder_point         NUMERIC(18,6)  DEFAULT 0,        -- 재주문점 (ROP)
    -- 최적 발주
    recommended_qty       NUMERIC(18,6)  NOT NULL,          -- 추천 발주량 (핵심 출력)
    order_method          VARCHAR(20)    NOT NULL
                          CHECK (order_method IN ('eoq', 'lot_for_lot', 'fixed_period')),
    -- 공급사 추천
    recommended_supplier  VARCHAR(10),                      -- 추천 공급사 코드
    supplier_name         VARCHAR(200),                     -- 공급사명
    supplier_lead_days    NUMERIC(8,2),                     -- 해당 공급사 평균 리드타임
    supplier_unit_price   NUMERIC(18,6),                    -- 해당 공급사 평균 단가
    alt_supplier          VARCHAR(10),                      -- 대체 공급사 코드
    alt_supplier_name     VARCHAR(200),                     -- 대체 공급사명
    -- 일정
    latest_order_date     DATE,                             -- 최늦 발주일
    expected_receipt_date DATE,                              -- 예상 입고일
    need_date             DATE,                              -- 자재 필요일
    -- 분류·상태
    urgency               VARCHAR(10)    NOT NULL
                          CHECK (urgency IN ('critical', 'high', 'medium', 'low')),
    description           TEXT,                              -- 추천 사유 설명
    status                VARCHAR(15)    DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'ordered', 'received', 'cancelled')),
    created_at            TIMESTAMPTZ    DEFAULT NOW(),
    updated_at            TIMESTAMPTZ    DEFAULT NOW(),
    UNIQUE (component_product_id, plan_date)
);

COMMENT ON TABLE purchase_recommendation IS '발주 추천 — BOM+리드타임+단가 기반 최적 발주 추천';

CREATE INDEX IF NOT EXISTS idx_pr_component ON purchase_recommendation(component_product_id);
CREATE INDEX IF NOT EXISTS idx_pr_date      ON purchase_recommendation(plan_date);
CREATE INDEX IF NOT EXISTS idx_pr_urgency   ON purchase_recommendation(urgency);
CREATE INDEX IF NOT EXISTS idx_pr_status    ON purchase_recommendation(status);
CREATE INDEX IF NOT EXISTS idx_pr_supplier  ON purchase_recommendation(recommended_supplier);

CREATE TRIGGER tr_purchase_recommendation_updated_at
    BEFORE UPDATE ON purchase_recommendation
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
