/**
 * FastAPI 백엔드 프록시 헬퍼
 *
 * BACKEND_URL 환경변수가 설정되어 있으면 FastAPI 백엔드로 요청을 프록시합니다.
 * 설정이 없으면 null 을 반환 → 각 API 라우트가 Supabase 직접 조회로 fallback.
 *
 * 사용법:
 *   const data = await proxyToBackend('/forecast/weekly?sku=P-001')
 *   if (data) return NextResponse.json(data)
 *   // fallback: Supabase 직접 조회
 */

const BACKEND_URL = process.env.BACKEND_URL ?? ''

export async function proxyToBackend(
  path: string,
  options?: RequestInit,
): Promise<Record<string, unknown> | null> {
  if (!BACKEND_URL) return null

  try {
    const url = `${BACKEND_URL.replace(/\/$/, '')}${path}`
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
      // 서버사이드 fetch 타임아웃 5초
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`Backend ${res.status}: ${res.statusText}`)
    return await res.json()
  } catch (err) {
    console.warn('[BackendProxy] 연결 실패, Supabase fallback:', err)
    return null
  }
}
