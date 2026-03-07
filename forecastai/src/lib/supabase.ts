import { createClient } from '@supabase/supabase-js'

// ─── 서버 전용 클라이언트 ─────────────────────────────────────────────────────
// API routes (서버)에서만 사용. 브라우저에서 절대 import 금지.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const supabase = createClient(url, serviceKey)
