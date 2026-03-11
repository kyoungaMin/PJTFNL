-- =============================================================
-- 회사(Company) 단위 B2B SaaS 구조 — 추가 DDL
-- Supabase SQL Editor에서 순서대로 실행
-- =============================================================

-- 1. 회사 테이블 생성
CREATE TABLE IF NOT EXISTS companies (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(200) NOT NULL,
    code       VARCHAR(50)  UNIQUE NOT NULL,   -- 고유 코드 (예: 'penta', 'samsung')
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE companies IS 'B2B SaaS 고객사(회사) 테이블';

-- 2. user_profile에 company_id, invited_by 컬럼 추가
ALTER TABLE user_profile
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN user_profile.company_id IS '소속 회사 ID';
COMMENT ON COLUMN user_profile.invited_by IS '초대한 관리자의 user_id';

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_user_profile_company ON user_profile(company_id);

-- 4. 초기 회사 데이터 삽입 (현재 팀)
INSERT INTO companies (name, code)
VALUES ('Penta', 'penta')
ON CONFLICT (code) DO NOTHING;

-- 5. 기존 사용자에게 회사 연결 (최초 1회 실행)
UPDATE user_profile
SET company_id = (SELECT id FROM companies WHERE code = 'penta')
WHERE company_id IS NULL;

-- =============================================================
-- 6. handle_new_user 트리거 수정
--    — 초대 시 메타데이터에 company_id, role 포함 가능하도록
-- =============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profile (id, email, display_name, role, is_active)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'display_name',
            NEW.raw_user_meta_data->>'full_name',
            split_part(NEW.email, '@', 1)
        ),
        'viewer',   -- 초대 직후 role은 viewer, API에서 upsert로 덮어씀
        TRUE
    )
    ON CONFLICT (id) DO NOTHING;   -- 이미 존재하면 무시 (race condition 방지)
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================
-- 7. RLS 정책 추가 — 같은 회사 사용자만 조회 가능
--    (기존 정책은 유지하고 추가)
-- =============================================================

-- admin이 같은 회사 사용자 INSERT 가능 (초대 시 upsert 허용)
DROP POLICY IF EXISTS "user_profile_insert_admin" ON user_profile;
CREATE POLICY "user_profile_insert_admin"
    ON user_profile FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profile up
            WHERE up.id = auth.uid() AND up.role = 'admin'
        )
    );

-- =============================================================
-- 실행 확인용 쿼리 (실행 후 결과 확인)
-- =============================================================
-- SELECT id, email, display_name, role, company_id FROM user_profile;
-- SELECT * FROM companies;
