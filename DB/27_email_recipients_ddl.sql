-- ============================================================
-- 임원 보고서 이메일 수신자 테이블
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

CREATE TABLE IF NOT EXISTS email_report_recipients (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_email_recipients_active ON email_report_recipients (is_active);

-- 샘플 데이터 (필요 시 수정 후 실행)
-- INSERT INTO email_report_recipients (email, name) VALUES
--   ('ceo@company.com', '대표이사'),
--   ('cfo@company.com', 'CFO');
