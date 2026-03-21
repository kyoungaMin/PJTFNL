import { createClient } from '@supabase/supabase-js'

// ─── 브라우저 전용 클라이언트 ─────────────────────────────────────────────────
// 로그인 등 클라이언트 컴포넌트에서만 import해서 사용.
// NEXT_PUBLIC_ 접두사가 있어야 브라우저에서 값을 읽을 수 있음.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const supabaseBrowser = createClient(url, anonKey)
