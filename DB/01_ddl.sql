-- =============================================================
-- Supabase DDL — 반도체 부품·소재 수요예측 AI SaaS
-- 실행: Supabase SQL Editor에서 실행
-- FK 제약조건: 미설정 (데이터 유연성 우선)
-- =============================================================

-- 1. 제품마스터 (Product Master)
CREATE TABLE IF NOT EXISTS product_master (
    product_code    VARCHAR(20) PRIMARY KEY,
    product_name    VARCHAR(200),
    product_specification VARCHAR(200),
    product_type    VARCHAR(50),
    product_category VARCHAR(100)
);

COMMENT ON TABLE product_master IS '제품마스터 — 제품 기본 정보';

-- 2. 거래처 (Supplier / Vendor)
CREATE TABLE IF NOT EXISTS supplier (
    customer_code   VARCHAR(10) PRIMARY KEY,
    customer_name   VARCHAR(200),
    country         VARCHAR(5)
);

COMMENT ON TABLE supplier IS '거래처 — 공급사/거래처 정보';

-- 3. 고객사 (Customer / Company)
CREATE TABLE IF NOT EXISTS customer (
    id              VARCHAR(10) PRIMARY KEY,
    company_name    VARCHAR(200),
    industry_type_uptae   VARCHAR(100),
    industry_type_upjong  VARCHAR(500),
    industry_type_jongmok VARCHAR(500),
    country         VARCHAR(5)
);

COMMENT ON TABLE customer IS '고객사 — 고객 회사 정보';

-- 4. BOM (Bill of Materials)
CREATE TABLE IF NOT EXISTS bom (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_product_id    VARCHAR(20),
    component_product_id VARCHAR(20),
    usage_qty            NUMERIC(18,6)
);

COMMENT ON TABLE bom IS 'BOM — 자재명세서 (부모-자식 제품 관계)';

-- 5. 구매발주 (Purchase Order)
CREATE TABLE IF NOT EXISTS purchase_order (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cd_partner           VARCHAR(10),
    supplier_name        VARCHAR(200),
    component_product_id VARCHAR(20),
    po_date              DATE,
    receipt_date         DATE,
    po_qty               NUMERIC(18,6),
    unit_price           NUMERIC(18,6),
    currency             VARCHAR(5),
    status               VARCHAR(5)
);

COMMENT ON TABLE purchase_order IS '구매발주 — 구매 발주 이력';

-- 6. 일별매출 (Daily Revenue)
CREATE TABLE IF NOT EXISTS daily_revenue (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    revenue_date    DATE,
    customer_id     VARCHAR(10),
    product_id      VARCHAR(20),
    quantity        NUMERIC(18,6),
    revenue_amount  NUMERIC(18,4),
    currency        VARCHAR(5),
    exchange_rate   NUMERIC(12,4),
    domestic_flag   BOOLEAN
);

COMMENT ON TABLE daily_revenue IS '일별매출 — 일별 매출 실적';

-- 7. 일별생산 (Daily Production)
CREATE TABLE IF NOT EXISTS daily_production (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    production_date DATE,
    work_start_date TIMESTAMP,
    work_end_date   TIMESTAMP,
    product_id      VARCHAR(20),
    produced_qty    NUMERIC(18,6),
    line_id         VARCHAR(10),
    mfg_order_serial VARCHAR(30)
);

COMMENT ON TABLE daily_production IS '일별생산 — 일별 생산 실적';

-- 8. 일별수주 (Daily Order)
CREATE TABLE IF NOT EXISTS daily_order (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_date             DATE,
    expected_delivery_date DATE,
    customer_id            VARCHAR(10),
    product_id             VARCHAR(20),
    order_qty              NUMERIC(18,6),
    order_amount           NUMERIC(18,4),
    status                 VARCHAR(5)
);

COMMENT ON TABLE daily_order IS '일별수주 — 일별 수주 데이터 (수요예측 핵심 입력)';

-- 9. 재고 (Inventory)
CREATE TABLE IF NOT EXISTS inventory (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshot_date   VARCHAR(6),
    product_id      VARCHAR(20),
    inventory_qty   NUMERIC(18,6),
    warehouse       VARCHAR(10)
);

COMMENT ON TABLE inventory IS '재고 — 월별 재고 스냅샷';

-- =============================================================
-- 인덱스 (쿼리 성능 최적화)
-- =============================================================

-- BOM
CREATE INDEX IF NOT EXISTS idx_bom_parent ON bom(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_bom_component ON bom(component_product_id);

-- 구매발주
CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_order(po_date);
CREATE INDEX IF NOT EXISTS idx_po_product ON purchase_order(component_product_id);
CREATE INDEX IF NOT EXISTS idx_po_partner ON purchase_order(cd_partner);

-- 일별매출
CREATE INDEX IF NOT EXISTS idx_revenue_date ON daily_revenue(revenue_date);
CREATE INDEX IF NOT EXISTS idx_revenue_product ON daily_revenue(product_id);
CREATE INDEX IF NOT EXISTS idx_revenue_customer ON daily_revenue(customer_id);

-- 일별생산
CREATE INDEX IF NOT EXISTS idx_production_date ON daily_production(production_date);
CREATE INDEX IF NOT EXISTS idx_production_product ON daily_production(product_id);

-- 일별수주
CREATE INDEX IF NOT EXISTS idx_order_date ON daily_order(order_date);
CREATE INDEX IF NOT EXISTS idx_order_product ON daily_order(product_id);
CREATE INDEX IF NOT EXISTS idx_order_customer ON daily_order(customer_id);

-- 재고
CREATE INDEX IF NOT EXISTS idx_inventory_snapshot ON inventory(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
