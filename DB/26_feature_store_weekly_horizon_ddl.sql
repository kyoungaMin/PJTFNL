-- ─── feature_store_weekly 호라이즌 확장: 3구간 동결 구조 기반 ──────────────
-- 배경: 기존 target_1w / target_2w / target_4w (3개 호라이즌)만 있어
--       Frozen Zone(1~4주)만 커버됨 → 발주 의사결정에 실질적 도움 안 됨.
--
-- 3구간 동결 구조 기반 호라이즌 선택:
--   [Frozen Zone]  1W/2W/4W → 기존 컬럼 유지 (생산 투입·라인 배정)
--   [Slushy Zone]  3W/8W    → 신규 추가 (발주 수량 조정 핵심 구간)
--   [Liquid Zone]  13W      → 신규 추가 (원자재 선행구매·중기 수요계획)
--
-- 제외: target_5w/6w/7w → 실무 활용도 낮음 (Slushy Zone 내 중복)
--
-- 실행 위치: Supabase 대시보드 → SQL Editor에서 수동 실행
-- 실행 순서: 이 SQL 실행 → s3_feature_store.py 재실행 → s4_forecast.py 재실행

ALTER TABLE feature_store_weekly
  ADD COLUMN IF NOT EXISTS target_3w  NUMERIC(18,6),   -- [Frozen→Slushy 경계] T+1~T+3주 합계 (21일)
  ADD COLUMN IF NOT EXISTS target_8w  NUMERIC(18,6),   -- [Slushy Zone 핵심] T+1~T+8주 합계 (56일) — 리드타임 커버
  ADD COLUMN IF NOT EXISTS target_13w NUMERIC(18,6);   -- [Liquid Zone] T+1~T+13주 합계 (91일) — 원자재 선행구매
