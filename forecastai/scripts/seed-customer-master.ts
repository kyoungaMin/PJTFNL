/**
 * 거래처(고객사) 마스터 시드 스크립트
 * DATA/거래처.csv → Supabase customer_master 테이블
 *
 * 실행: npx tsx scripts/seed-customer-master.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n')
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // Handle quoted fields with commas
    const vals: string[] = []
    let inQuote = false, cur = ''
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue }
      if (ch === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    vals.push(cur.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? '' })
    rows.push(row)
  }
  return rows
}

async function seed() {
  console.log('=== 거래처 마스터 시드 시작 ===\n')

  // 1) 테이블 생성 (없으면)
  const { error: sqlErr } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS customer_master (
        id SERIAL PRIMARY KEY,
        customer_code TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        country TEXT DEFAULT 'KR'
      );
      CREATE INDEX IF NOT EXISTS idx_customer_master_code ON customer_master(customer_code);
    `
  })
  if (sqlErr) {
    console.log('RPC exec_sql 미지원 — 직접 테이블 생성 시도')
    // 테이블이 이미 존재하면 insert에서 처리됨
  }

  // 2) CSV 읽기
  const csvPath = join(__dirname, '..', '..', 'DATA', '거래처.csv')
  const content = readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)
  console.log(`CSV 로드: ${rows.length}건`)

  // 3) 배치 upsert (500건씩)
  const records = rows
    .filter(r => r.customer_code && r.customer_name)
    .map(r => ({
      customer_code: r.customer_code,
      customer_name: r.customer_name,
      country: r.country || 'KR',
    }))

  console.log(`유효 레코드: ${records.length}건`)

  let inserted = 0
  const batchSize = 500
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { data, error } = await supabase
      .from('customer_master')
      .upsert(batch, { onConflict: 'customer_code' })
      .select('customer_code')

    if (error) {
      console.error(`배치 ${i}~${i + batch.length} 실패:`, error.message)
      continue
    }
    inserted += data?.length ?? 0
    process.stdout.write(`\r  진행: ${inserted}/${records.length}`)
  }

  console.log(`\n\n✓ ${inserted}건 upsert 완료!`)

  // 확인
  const { data: check, error: checkErr } = await supabase
    .from('customer_master')
    .select('customer_code,customer_name')
    .limit(5)

  if (checkErr) {
    console.error('확인 쿼리 실패:', checkErr.message)
  } else {
    console.log('\n--- 샘플 데이터 ---')
    for (const c of (check ?? [])) {
      console.log(`  ${c.customer_code} → ${c.customer_name}`)
    }
  }

  console.log('\n=== 시드 완료 ===')
}

seed().catch(console.error)
