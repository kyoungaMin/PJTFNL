-- ═══════════════════════════════════════════════════════════════════
-- 모니터링/알림 시스템 테이블 생성
-- 실행: Supabase SQL Editor에서 실행
-- ═══════════════════════════════════════════════════════════════════

-- 1) system_alert — 시스템 알림 저장 (API 에러, 파이프라인 실패, 헬스체크 등)
CREATE TABLE IF NOT EXISTS system_alert (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type   TEXT NOT NULL CHECK (alert_type IN ('system','pipeline','api','health')),
  severity     TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  title        TEXT NOT NULL,
  message      TEXT,
  source       TEXT,                          -- 발생 원천: 'health_check', 'pipeline', 'api_logger' 등
  target_page  TEXT,                          -- 클릭 시 이동할 페이지 key
  metadata     JSONB DEFAULT '{}'::jsonb,     -- 추가 정보 (pipeline_id, route, status_code 등)
  is_read      BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_system_alert_created ON system_alert (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alert_active  ON system_alert (is_dismissed, created_at DESC);

-- 2) system_health_log — 헬스체크 기록
CREATE TABLE IF NOT EXISTS system_health_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at  TIMESTAMPTZ DEFAULT now(),
  service     TEXT NOT NULL,                  -- 'supabase', 'api', 'cron_daily' 등
  status      TEXT NOT NULL CHECK (status IN ('healthy','degraded','down')),
  latency_ms  INTEGER,
  message     TEXT,
  metadata    JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_health_log_checked ON system_health_log (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_log_service ON system_health_log (service, checked_at DESC);

-- 3) api_log — API 요청 로그 (에러율/응답시간 추적)
CREATE TABLE IF NOT EXISTS api_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  route       TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER NOT NULL,
  duration_ms INTEGER,
  error_message TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_log_created ON api_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_log_route   ON api_log (route, created_at DESC);

-- 4) 30일 이상 된 health_log, api_log 자동 정리 (선택사항 — pg_cron 사용 시)
-- SELECT cron.schedule('cleanup-monitoring-logs', '0 3 * * *',
--   $$DELETE FROM system_health_log WHERE checked_at < now() - interval '30 days';
--     DELETE FROM api_log WHERE created_at < now() - interval '30 days';$$
-- );
