import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), '..', 'DB', '07_pipeline', 'experiments', 'model_comparison.json')
    const raw = fs.readFileSync(filePath, 'utf-8')
    const data = JSON.parse(raw)
    return NextResponse.json({ source: 'file', ...data })
  } catch (err: any) {
    return NextResponse.json(
      { source: 'error', error: err.message ?? String(err) },
      { status: 500 }
    )
  }
}
