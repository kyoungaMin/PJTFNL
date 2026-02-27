-- =============================================================
-- 사용자 인증/권한 관리 DDL — 반도체 수요예측 AI SaaS
-- Supabase Auth 기반 + RBAC (역할 기반 접근 제어)
-- 실행: Supabase SQL Editor에서 실행
-- =============================================================

-- 1. 사용자 프로필 (auth.users 확장)
CREATE TABLE IF NOT EXISTS user_profile (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           VARCHAR(255),
    display_name    VARCHAR(100),
    role            VARCHAR(20) NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'manager', 'analyst', 'viewer')),
    department      VARCHAR(100),
    phone           VARCHAR(20),
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_profile IS '사용자 프로필 — Supabase Auth 확장 (RBAC)';
COMMENT ON COLUMN user_profile.role IS '역할: admin(관리자), manager(매니저), analyst(분석가), viewer(뷰어)';

-- 2. 로그인 이력
CREATE TABLE IF NOT EXISTS login_history (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    login_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    status          VARCHAR(10) NOT NULL DEFAULT 'success'
                    CHECK (status IN ('success', 'failure'))
);

COMMENT ON TABLE login_history IS '로그인 이력 — 사용자 접속 감사 로그';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_at ON login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profile_role ON user_profile(role);

-- =============================================================
-- updated_at 자동 갱신 트리거
-- =============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_user_profile_updated_at
    BEFORE UPDATE ON user_profile
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- 회원가입 시 user_profile 자동 생성 트리거
-- auth.users INSERT → user_profile INSERT (role=viewer)
-- =============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profile (id, email, display_name, role, is_active)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        'viewer',
        TRUE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- =============================================================
-- RLS (Row Level Security) 정책
-- =============================================================

-- user_profile RLS
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

-- 본인 프로필 조회
CREATE POLICY "user_profile_select_own"
    ON user_profile FOR SELECT
    USING (auth.uid() = id);

-- admin은 전체 프로필 조회
CREATE POLICY "user_profile_select_admin"
    ON user_profile FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profile up
            WHERE up.id = auth.uid() AND up.role = 'admin'
        )
    );

-- 본인 프로필 수정 (role, is_active 제외 — admin만 변경 가능)
CREATE POLICY "user_profile_update_own"
    ON user_profile FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND role = (SELECT role FROM user_profile WHERE id = auth.uid())
        AND is_active = (SELECT is_active FROM user_profile WHERE id = auth.uid())
    );

-- admin은 모든 프로필 수정 가능
CREATE POLICY "user_profile_update_admin"
    ON user_profile FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM user_profile up
            WHERE up.id = auth.uid() AND up.role = 'admin'
        )
    );

-- login_history RLS
ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;

-- 본인 로그인 이력 조회
CREATE POLICY "login_history_select_own"
    ON login_history FOR SELECT
    USING (auth.uid() = user_id);

-- admin은 전체 로그인 이력 조회
CREATE POLICY "login_history_select_admin"
    ON login_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profile up
            WHERE up.id = auth.uid() AND up.role = 'admin'
        )
    );

-- 로그인 이력 INSERT (서버 측에서만)
CREATE POLICY "login_history_insert_service"
    ON login_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);
