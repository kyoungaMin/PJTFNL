-- 데이터 파이프라인 실행 이력 테이블
-- Supabase SQL Editor에서 실행하세요.

CREATE TABLE IF NOT EXISTS pipeline_run (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pipeline_id   TEXT        NOT NULL,                      -- 예: 'forecast-weekly', 'risk-analysis'
  pipeline_name TEXT        NOT NULL,                      -- 예: '주간 수요예측'
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'running'     -- 'success' | 'failed' | 'running'
                CHECK (status IN ('success', 'failed', 'running')),
  duration_sec  INT,
  message       TEXT,                                      -- 실행 결과 메시지
  date_from     DATE,                                      -- 실행 대상 시작일
  date_to       DATE,                                      -- 실행 대상 종료일
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스: 파이프라인별 최신 실행 조회 최적화
CREATE INDEX IF NOT EXISTS idx_pipeline_run_pipeline_id
  ON pipeline_run (pipeline_id, started_at DESC);

-- RLS 비활성화 (서버 사이드 서비스 키로만 접근)
ALTER TABLE pipeline_run ENABLE ROW LEVEL SECURITY;

-- 서비스 키(service_role) 전용 정책
CREATE POLICY "service_role_all" ON pipeline_run
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE pipeline_run IS '데이터 파이프라인 실행 이력 — 수동/배치 실행 추적용';

-- ▼ 이미 테이블이 있는 경우 아래만 실행하세요 ▼
-- ALTER TABLE pipeline_run ADD COLUMN IF NOT EXISTS date_from DATE;
-- ALTER TABLE pipeline_run ADD COLUMN IF NOT EXISTS date_to   DATE;
