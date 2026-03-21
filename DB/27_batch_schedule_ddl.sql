-- ============================================================
-- 배치 스케줄 설정 테이블
-- 각 데이터 소스/파이프라인의 자동 실행 주기를 저장합니다.
-- Supabase SQL Editor에서 실행하세요.
-- ============================================================

CREATE TABLE IF NOT EXISTS batch_schedule_config (
  source_id        VARCHAR(50)  PRIMARY KEY,          -- 식별자 (예: erp-order, ml-s4)
  source_name      VARCHAR(100) NOT NULL,             -- 화면 표시 이름
  is_active        BOOLEAN      NOT NULL DEFAULT true, -- 활성화 여부
  freq             VARCHAR(20)  NOT NULL DEFAULT 'daily',
    -- 'daily'   : 매일 특정 시각
    -- 'weekly'  : 매주 특정 요일+시각
    -- 'monthly' : 매월 특정 날짜+시각
    -- 'hourly'  : N시간 간격
  hour             INT          NOT NULL DEFAULT 6,   -- 실행 시 (0~23)
  minute           INT          NOT NULL DEFAULT 0,   -- 실행 분 (0 또는 30)
  day_of_week      INT          NOT NULL DEFAULT 0,   -- 0=월요일 ~ 6=일요일 (weekly 전용)
  day_of_month     INT          NOT NULL DEFAULT 1,   -- 1~31 (monthly 전용)
  interval_hours   INT          NOT NULL DEFAULT 6,   -- N시간마다 (hourly 전용)
  updated_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_by       VARCHAR(100)                       -- 수정한 사용자 이메일
);

-- RLS 비활성화 (Admin만 접근하는 내부 설정 테이블)
ALTER TABLE batch_schedule_config DISABLE ROW LEVEL SECURITY;

-- 기본 데이터 삽입 (이미 있으면 무시)
INSERT INTO batch_schedule_config
  (source_id, source_name, is_active, freq, hour, minute, day_of_week, day_of_month, interval_hours)
VALUES
  -- ERP 연동
  ('erp-order',     '수주 데이터',        true,  'daily',   6,  0,  0, 1, 6),
  ('erp-inventory', '재고 데이터',        true,  'daily',   6,  30, 0, 1, 6),
  ('erp-purchase',  '구매발주 데이터',    true,  'daily',   7,  0,  0, 1, 6),
  ('erp-product',   '제품 마스터',        true,  'monthly', 3,  0,  0, 1, 6),
  -- 외부지표
  ('ext-fred',      'FRED 경제지표',      true,  'daily',   8,  0,  0, 1, 6),
  ('ext-eia',       'EIA 에너지 가격',    true,  'weekly',  9,  0,  2, 1, 6),
  ('ext-customs',   '관세청 무역통계',    true,  'monthly', 10, 0,  0, 15, 6),
  ('ext-ecos',      '한국은행 ECOS',      false, 'monthly', 11, 0,  0, 1, 6),
  -- AI 파이프라인
  ('ml-s0',         '데이터 집계 (S0)',   true,  'weekly',  2,  0,  0, 1, 6),
  ('ml-s3',         '피처 생성 (S3)',     true,  'weekly',  3,  0,  0, 1, 6),
  ('ml-s4',         'AI 수요예측 (S4)',   true,  'weekly',  4,  0,  0, 1, 6),
  ('ml-s5',         '리스크 분석 (S5)',   true,  'weekly',  5,  0,  0, 1, 6),
  ('ml-s6',         '생산·구매 권고 (S6)',true,  'weekly',  6,  0,  0, 1, 6),
  -- 기타
  ('news-collect',  '업계 동향 뉴스',     true,  'hourly',  0,  0,  0, 1, 6),
  ('ai-insights',   'AI 인사이트 요약',   true,  'hourly',  0,  0,  0, 1, 6)
ON CONFLICT (source_id) DO NOTHING;
