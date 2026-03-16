import { createClient } from '@supabase/supabase-js'

// ─── 서버 전용 클라이언트 ─────────────────────────────────────────────────────
// API routes (서버)에서만 사용. 브라우저에서 절대 import 금지.
// SUPABASE_SERVICE_ROLE_KEY 없으면 anon key로 fallback (읽기 전용)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''

export const supabase = createClient(url, serviceKey)
