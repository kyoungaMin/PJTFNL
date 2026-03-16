import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/cron/daily
 * Vercel Cron: 매일 실행
 * 담당: BALTIC_DRY (BDI)
 */

function formatStooq(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function fetchBdi() {
  const end = new Date()
  const start = new Date()
  start.setMonth(start.getMonth() - 2)
  start.setDate(1)

  const url = `https://stooq.com/q/d/l/?s=bdi.co&d1=${formatStooq(start)}&d2=${formatStooq(end)}&i=d`
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`Stooq 응답 오류: ${res.status}`)

  const text = await res.text()
  if (!text || text.includes('No data') || text.length < 30) throw new Error('BDI 데이터 없음')

  const rows: { date: string; indicator_code: string; indicator_name: string; source: string; unit: string; value: number }[] = []
  for (const line of text.trim().split('\n').slice(1)) {
    const cols = line.split(',')
    if (cols.length < 5) continue
    const date = cols[0].trim()
    const value = parseFloat(cols[4].trim())
    if (!date || isNaN(value) || value <= 0) continue
    rows.push({ date, indicator_code: 'BALTIC_DRY', indicator_name: 'Baltic Dry Index', source: 'Stooq', unit: 'Index', value: Math.round(value) })
  }
  return rows
}

async function upsert(rows: { date: string; indicator_code: string; indicator_name: string; source: string; unit: string; value: number }[], label: string) {
  if (!rows.length) return { label, count: 0 }
  const { error } = await supabase.from('economic_indicator').upsert(rows, { onConflict: 'source,indicator_code,date' })
  if (error) throw new Error(`${label} upsert 실패: ${error.message}`)
  return { label, count: rows.length }
}

export async function GET(req: Request) {
  // Vercel Cron 인증
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  try {
    const rows = await fetchBdi()
    results.bdi = await upsert(rows, 'BDI')
  } catch (e: any) {
    results.bdi = { error: e.message }
  }

  return NextResponse.json({ ok: true, results, at: new Date().toISOString() })
}
