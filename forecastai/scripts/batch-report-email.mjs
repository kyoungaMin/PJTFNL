/**
 * 주간 이메일 보고서 배치
 * 실행: node scripts/batch-report-email.mjs
 * 환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY, SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, OPENAI_API_KEY
 */

import { createClient } from '@supabase/supabase-js'
import sgMail from '@sendgrid/mail'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ─── 날짜 유틸 ─────────────────────────────────────────────────────────────────
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function toISOWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + 3)
  const year = thursday.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${year}-W${String(weekNo).padStart(2, '0')}`
}

// ─── GPT 요약 ──────────────────────────────────────────────────────────────────
async function callGPT(data) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const riskText = Object.entries(data.riskSummary)
    .filter(([, c]) => c > 0).map(([g, c]) => `${g}등급 ${c}건`).join(', ') || '데이터 없음'
  const actionsText = data.topActions.length > 0
    ? data.topActions.map(a => `${a.product_id}: ${a.action_type} (${a.priority}급) — ${a.reason}`).join('\n')
    : '없음'
  const topProductsText = data.topProducts.length > 0
    ? data.topProducts.map(p => `${p.product_id} ${p.product_name}(${p.product_spec}) ${p.order_qty.toLocaleString()}EA`).join(', ')
    : '데이터 없음'
  const changeText = data.changeRate != null
    ? ` (전주 대비 ${Number(data.changeRate) >= 0 ? '+' : ''}${data.changeRate}%)`
    : ''

  const prompt = `당신은 반도체 부품·소재 제조업체의 임원 보고서 작성 AI 어시스턴트입니다.
아래 실제 운영 데이터를 바탕으로 임원(C레벨)에게 보고하는 주간 보고서를 작성해주세요.

[보고 기간]: ${data.targetWeek} (${data.weekStart} ~ ${data.weekEnd})

[주간 실적 데이터]
- 주간 수주량: ${data.weekOrderQty.toLocaleString()} EA${changeText}
- 재고 커버리지: ${data.coverageDays}일 (목표 21일)
- 미처리 구매 발주: ${data.pendingPO}건
- 예측 정확도: ${data.forecastAccuracy != null ? `${data.forecastAccuracy}%` : '데이터 없음'}
- 리스크 현황: ${riskText}
- 주요 수주 품목 Top5: ${topProductsText}
- AI 권고 액션 (critical/high 우선순위):
${actionsText}

[출력 규칙]
- 반드시 아래 JSON 형식으로만 답변 (다른 텍스트 절대 금지)
- 한국어, 임원 보고서 톤 (간결하고 명확하게)
- summary: 이번 주 전체 흐름 요약 2~3문장 (핵심 수치 포함)
- changes: 주요 변화 3~5개 (각 항목 "- "로 시작, 구체적 수치 포함)
- risks: 리스크 항목 2~4개 (각 항목 "- "로 시작)
- actions: 추천 액션 2~4개 (각 항목 "- "로 시작, 구체적 조치 명시)

[JSON 형식]
{
  "summary": "...",
  "changes": ["- ...", "- ...", "- ..."],
  "risks": ["- ...", "- ..."],
  "actions": ["- ...", "- ..."]
}`.trim()

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) return null
    const json = await res.json()
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}')
    return {
      summary: String(parsed.summary ?? ''),
      changes: Array.isArray(parsed.changes) ? parsed.changes.map(String) : [],
      risks:   Array.isArray(parsed.risks)   ? parsed.risks.map(String)   : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
    }
  } catch { return null }
}

// ─── 보고서 데이터 조회 ─────────────────────────────────────────────────────────
async function fetchReportData() {
  const SYSTEM_BASE_DATE = '2026-02-28'
  const fromDate = addDays(SYSTEM_BASE_DATE, -7 * 8)

  const { data: rpcRows } = await supabase.rpc('get_order_weekly_summary', { p_from_date: fromDate })
  const weeks = (rpcRows ?? [])
    .filter(r => r.week_start_date)
    .map(r => ({
      start: String(r.week_start_date),
      end: addDays(String(r.week_start_date), 6),
      week: toISOWeek(String(r.week_start_date)),
      qty: Number(r.total_qty ?? 0),
    }))
    .reverse()

  if (!weeks.length) throw new Error('수주 데이터 없음')
  const latest = weeks[0]
  const prev   = weeks[1]

  const changeRate = prev && prev.qty > 0
    ? (((latest.qty - prev.qty) / prev.qty) * 100).toFixed(1)
    : null

  const { data: weeklyRows } = await supabase
    .from('weekly_product_summary')
    .select('product_id, order_qty, order_amount, produced_qty')
    .eq('year_week', latest.week)
    .order('order_qty', { ascending: false })
    .limit(200)

  const wRows = weeklyRows ?? []
  const weekProducedQty = wRows.reduce((s, r) => s + Number(r.produced_qty ?? 0), 0)
  const weekOrderAmt    = wRows.reduce((s, r) => s + Number(r.order_amount  ?? 0), 0)
  const top5Rows        = wRows.slice(0, 5)

  // product_master에서 품목명·규격 조회
  const top5Ids = top5Rows.map(r => String(r.product_id ?? ''))
  const { data: pmRows } = top5Ids.length > 0
    ? await supabase.from('product_master').select('product_code, product_name, product_specification').in('product_code', top5Ids)
    : { data: [] }
  const pmMap = {}
  for (const p of (pmRows ?? [])) {
    pmMap[p.product_code] = { name: p.product_name ?? '', spec: p.product_specification ?? '' }
  }

  const topProducts = top5Rows.map(r => {
    const pid = String(r.product_id ?? '')
    const pm  = pmMap[pid]
    return {
      product_id:   pid,
      product_name: pm?.name ?? '',
      product_spec: pm?.spec ?? '',
      order_qty:    Math.round(Number(r.order_qty ?? 0)),
    }
  })

  const thirtyAgo = addDays(latest.end, -30)
  const { data: covRows } = await supabase.rpc('get_inventory_coverage', {
    p_from_date: thirtyAgo, p_to_date: latest.end,
  })
  const cov = covRows?.[0]
  const totalInv     = Number(cov?.total_inv_qty   ?? 0)
  const demand30     = Number(cov?.total_order_qty ?? 0)
  const coverageDays = demand30 > 0 ? Math.round(totalInv / (demand30 / 30)) : 0

  const { count: pendingPO } = await supabase
    .from('purchase_order').select('*', { count: 'exact', head: true }).in('status', ['R', 'P'])

  const { data: riskRows } = await supabase.rpc('get_risk_grade_summary', { p_date: latest.end })
  const riskSummary = {}
  for (const r of (riskRows ?? [])) {
    if (r.grade) riskSummary[String(r.grade)] = Number(r.cnt ?? 0)
  }

  const { data: actionRows } = await supabase
    .from('action_queue')
    .select('product_id, action_type, severity, description')
    .in('severity', ['critical', 'high'])
    .eq('status', 'pending')
    .order('severity', { ascending: true })
    .limit(5)

  const topActions = (actionRows ?? []).map(r => ({
    product_id:  String(r.product_id  ?? ''),
    action_type: String(r.action_type ?? ''),
    priority:    String(r.severity    ?? ''),
    reason:      String(r.description ?? ''),
  }))

  const { data: mapeRows } = await supabase
    .from('model_evaluation').select('wmape').order('eval_date', { ascending: false }).limit(100)
  const mapeValues = (mapeRows ?? []).map(r => Number(r.wmape ?? 0)).filter(v => v > 0 && v < 100)
  const forecastAccuracy = mapeValues.length > 0
    ? Math.round(100 - mapeValues.reduce((s, v) => s + v, 0) / mapeValues.length)
    : null

  const gptReport = await callGPT({
    targetWeek: latest.week, weekStart: latest.start, weekEnd: latest.end,
    weekOrderQty: Math.round(latest.qty), changeRate,
    coverageDays, pendingPO: pendingPO ?? 0,
    riskSummary, topActions, forecastAccuracy, topProducts,
  })

  return {
    week: latest.week, weekStart: latest.start, weekEnd: latest.end,
    weekOrderQty: Math.round(latest.qty), weekProducedQty: Math.round(weekProducedQty),
    weekOrderAmt: Math.round(weekOrderAmt), changeRate, coverageDays,
    coverageStatus: coverageDays >= 21 ? '달성' : coverageDays >= 14 ? '관찰' : '위험',
    pendingPO: pendingPO ?? 0, riskSummary, topProducts, topActions, forecastAccuracy, gptReport,
  }
}

// ─── HTML 이메일 템플릿 ─────────────────────────────────────────────────────────
function buildHtml(d) {
  const coverageColor = d.coverageDays >= 21 ? '#10B981' : d.coverageDays >= 14 ? '#F59E0B' : '#EF4444'
  const changeArrow = d.changeRate == null ? '—'
    : Number(d.changeRate) >= 0
      ? `<span style="color:#10B981">&#9650; ${d.changeRate}%</span>`
      : `<span style="color:#EF4444">&#9660; ${Math.abs(Number(d.changeRate))}%</span>`
  const fmtNum = n => n > 0 ? n.toLocaleString() : '—'
  const fmtAmt = n => n > 0 ? `${(n / 100000000).toFixed(1)}억` : '—'

  const kpiCard = (label, value, unit, sub) =>
    `<td width="33%" valign="top" style="padding:4px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:8px;">
        <tr><td valign="top" style="padding:14px 16px;">
          <div style="font-size:10px;color:#94A3B8;margin-bottom:5px;">${label}</div>
          <div style="font-size:20px;font-weight:800;color:#1E293B;font-family:monospace;">${value}</div>
          <div style="font-size:10px;color:#94A3B8;margin-top:2px;">${unit}</div>
          <div style="font-size:11px;margin-top:6px;">${sub ?? '&nbsp;'}</div>
        </td></tr>
      </table>
    </td>`

  const riskGradeColors = { A:'#10B981', B:'#84CC16', C:'#F59E0B', D:'#F97316', E:'#EF4444', F:'#7C3AED' }
  const riskHtml = Object.entries(d.riskSummary)
    .filter(([, c]) => c > 0)
    .map(([g, c]) => `<span style="margin-right:12px;display:inline-block;">
      <span style="font-size:12px;font-weight:800;color:${riskGradeColors[g] ?? '#64748B'}">${g}등급</span>
      <span style="font-size:12px;color:#475569;"> ${c}건</span>
    </span>`).join('') || '<span style="font-size:12px;color:#94A3B8;">데이터 없음</span>'

  const actionsHtml = d.topActions.length > 0
    ? d.topActions.map(a => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;">${a.product_id}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:12px;">${a.action_type}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;">
          <span style="font-size:10px;font-weight:700;color:${a.priority === 'critical' ? '#EF4444' : '#F59E0B'}">${a.priority.toUpperCase()}</span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:11px;color:#64748B;">${a.reason}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="padding:14px;text-align:center;color:#94A3B8;font-size:12px;">조치 필요 항목 없음</td></tr>`

  const topProductsHtml = d.topProducts.length > 0
    ? d.topProducts.map((p, i) => `<tr>
        <td style="padding:6px 12px;font-size:12px;color:#94A3B8;">${i + 1}</td>
        <td style="padding:6px 12px;font-size:12px;font-weight:500;">${p.product_id}</td>
        <td style="padding:6px 12px;font-size:12px;">${p.product_name || '—'}</td>
        <td style="padding:6px 12px;font-size:11px;color:#64748B;">${p.product_spec || '—'}</td>
        <td style="padding:6px 12px;font-size:12px;text-align:right;">${p.order_qty.toLocaleString()} EA</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="padding:12px;text-align:center;color:#94A3B8;font-size:12px;">데이터 없음</td></tr>`

  const gptSection = d.gptReport ? `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #E2E8F0;background:#FAFBFF;">
    <tr><td style="padding:20px 32px;">
      <div style="font-size:11px;font-weight:700;color:#6366F1;margin-bottom:10px;">AI 경영 요약</div>
      <div style="font-size:13px;color:#1E293B;line-height:1.7;margin-bottom:12px;">${d.gptReport.summary}</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:10px;">
        <tr><td style="padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#94A3B8;margin-bottom:8px;">주요 변화</div>
          ${d.gptReport.changes.map(c => `<div style="font-size:12px;color:#475569;margin-bottom:6px;">${c}</div>`).join('')}
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;margin-bottom:10px;">
        <tr><td style="padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#EF4444;margin-bottom:8px;">리스크</div>
          ${d.gptReport.risks.map(r => `<div style="font-size:12px;color:#475569;margin-bottom:6px;">${r}</div>`).join('')}
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;">
        <tr><td style="padding:14px;">
          <div style="font-size:10px;font-weight:700;color:#10B981;margin-bottom:8px;">권고 액션</div>
          ${d.gptReport.actions.map(a => `<div style="font-size:12px;color:#475569;margin-bottom:6px;">${a}</div>`).join('')}
        </td></tr>
      </table>
    </td></tr>
  </table>` : ''

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>주간 임원 보고서</title></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Apple SD Gothic Neo',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;">
<tr><td align="center" style="padding:32px 16px;">
<table width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#1E293B;padding:28px 32px;">
    <div style="font-size:10px;font-weight:600;color:#94A3B8;margin-bottom:6px;">반도체 부품·소재 수요예측 AI</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">주간 임원 보고서</div>
    <div style="font-size:13px;color:#CBD5E1;">${d.week} &nbsp;&middot;&nbsp; ${d.weekStart} ~ ${d.weekEnd}</div>
  </td></tr>
  <tr><td style="padding:24px 32px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;">
    <div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:14px;">이번 주 핵심 지표</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        ${kpiCard('주간 수주량', fmtNum(d.weekOrderQty), 'EA', `전주 대비 ${changeArrow}`)}
        ${kpiCard('주간 생산량', fmtNum(d.weekProducedQty), 'EA')}
        ${kpiCard('주간 수주금액', fmtAmt(d.weekOrderAmt), '원')}
      </tr>
      <tr><td colspan="3" style="height:8px;"></td></tr>
      <tr>
        ${kpiCard('재고 커버리지', `<span style="color:${coverageColor}">${d.coverageDays}</span>`, `일 (목표 21일)`, `<span style="color:${coverageColor}">${d.coverageStatus}</span>`)}
        ${kpiCard('예측 정확도', `<span style="color:#6366F1">${d.forecastAccuracy != null ? d.forecastAccuracy + '%' : '—'}</span>`, 'AI 모델')}
        ${kpiCard('미처리 발주', `<span style="color:${d.pendingPO > 10 ? '#EF4444' : '#1E293B'}">${d.pendingPO}</span>`, '건 (검토·대기)')}
      </tr>
    </table>
  </td></tr>
  ${gptSection}
  <tr><td style="padding:20px 32px;border-bottom:1px solid #E2E8F0;">
    <div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:10px;">리스크 등급 현황</div>
    <div>${riskHtml}</div>
  </td></tr>
  <tr><td style="padding:20px 32px;border-bottom:1px solid #E2E8F0;">
    <div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:12px;">주요 수주 품목 Top 5</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <thead><tr style="background:#F8FAFC;">
        <th style="padding:6px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;width:36px;">#</th>
        <th style="padding:6px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">품목코드</th>
        <th style="padding:6px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">품목명</th>
        <th style="padding:6px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">규격</th>
        <th style="padding:6px 12px;text-align:right;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">수주량</th>
      </tr></thead>
      <tbody>${topProductsHtml}</tbody>
    </table>
  </td></tr>
  <tr><td style="padding:20px 32px;border-bottom:1px solid #E2E8F0;">
    <div style="font-size:11px;font-weight:700;color:#94A3B8;margin-bottom:12px;">긴급 조치 필요 항목 (Critical / High)</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #E2E8F0;">
      <thead><tr style="background:#F8FAFC;">
        <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">품목</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">조치 유형</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">우선순위</th>
        <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748B;border-bottom:1px solid #E2E8F0;">사유</th>
      </tr></thead>
      <tbody>${actionsHtml}</tbody>
    </table>
  </td></tr>
  <tr><td style="padding:20px 32px;background:#F8FAFC;text-align:center;">
    <div style="font-size:11px;color:#94A3B8;">본 메일은 매주 월요일 오전 9시에 자동 발송됩니다.</div>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// ─── 메인 ───────────────────────────────────────────────────────────────────────
console.log('=== 주간 이메일 보고서 발송 ===\n')

const sendgridKey = process.env.SENDGRID_API_KEY
if (!sendgridKey) { console.error('SENDGRID_API_KEY 환경변수 없음'); process.exit(1) }

sgMail.setApiKey(sendgridKey)
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@example.com'

try {
  const { data: recipients, error: rErr } = await supabase
    .from('email_report_recipients').select('email, name').eq('is_active', true)
  if (rErr) throw rErr
  if (!recipients || recipients.length === 0) {
    console.log('활성 수신자 없음 — 발송 건너뜀')
    process.exit(0)
  }

  console.log(`[1/2] 보고서 데이터 수집 중...`)
  const reportData = await fetchReportData()
  const html    = buildHtml(reportData)
  const subject = `[AI 보고서] ${reportData.week} 주간 임원 보고서`
  console.log(`  주차: ${reportData.week}, GPT 요약: ${reportData.gptReport ? '성공' : '실패/스킵'}`)

  console.log(`[2/2] 이메일 발송 중 (${recipients.length}명)...`)
  const results = await Promise.allSettled(
    recipients.map(r => sgMail.send({ from: FROM_EMAIL, to: r.email, subject, html }))
  )
  const succeeded = results.filter(r => r.status === 'fulfilled').length
  const failed    = results.filter(r => r.status === 'rejected').length
  console.log(`  성공: ${succeeded}건 / 실패: ${failed}건`)

  if (failed > 0) process.exit(1)
} catch (e) {
  console.error('오류:', e.message)
  process.exit(1)
}

console.log('\n=== 완료 ===')
