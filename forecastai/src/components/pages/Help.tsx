'use client'
import React, { useState } from 'react'
import { T, card } from '@/lib/data'

/* ────────────────────────────────────────────────────────────
   도움말 센터 — 사용자 매뉴얼 · API 문서 · 운영 매뉴얼
   대상: 비개발자, ML 이해도 낮은 일반 사용자
   ──────────────────────────────────────────────────────────── */

type TabId = 'user' | 'api' | 'ops'

const TABS: { id: TabId; label: string; icon: string; desc: string }[] = [
  { id: 'user', label: '사용자 매뉴얼',  icon: '📖', desc: '시스템 사용법을 처음부터 안내합니다' },
  { id: 'api',  label: 'API 안내',       icon: '🔌', desc: '외부 연동·데이터 요청 방법을 설명합니다' },
  { id: 'ops',  label: '운영 매뉴얼',    icon: '⚙️', desc: '관리자를 위한 시스템 관리 가이드입니다' },
]

/* ── 공통 스타일 ─────────────────────────────────────── */
const sectionBox: React.CSSProperties = { ...card, marginBottom: 20 }
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 800, color: T.text1, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: T.blue, marginTop: 18, marginBottom: 8 }
const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.85, color: T.text2, marginBottom: 8 }
const ul: React.CSSProperties = { paddingLeft: 20, marginBottom: 10 }
const li: React.CSSProperties = { fontSize: 13, lineHeight: 1.85, color: T.text2, marginBottom: 4 }
const tip: React.CSSProperties = { background: T.blueSoft, border: `1px solid ${T.blueMid}`, borderRadius: 8, padding: '12px 16px', fontSize: 12, color: T.blue, marginBottom: 12, lineHeight: 1.7 }
const warn: React.CSSProperties = { background: T.amberSoft, border: `1px solid ${T.amberMid}`, borderRadius: 8, padding: '12px 16px', fontSize: 12, color: T.amber, marginBottom: 12, lineHeight: 1.7 }
const codeBlock: React.CSSProperties = { background: '#1E293B', color: '#E2E8F0', borderRadius: 8, padding: '14px 18px', fontSize: 12, fontFamily: "'JetBrains Mono','Fira Code',monospace", overflowX: 'auto', marginBottom: 12, lineHeight: 1.7 }
const badge = (bg: string, color: string): React.CSSProperties => ({ display: 'inline-block', fontSize: 11, fontWeight: 700, background: bg, color, borderRadius: 6, padding: '2px 8px', marginRight: 6 })

/* ── 접이식 FAQ 항목 ──────────────────────────────────── */
function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: open ? T.blueSoft : T.surface2, transition: 'background 0.15s' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>{title}</span>
        <span style={{ fontSize: 11, color: T.text3 }}>{open ? '▲ 접기' : '▼ 펼치기'}</span>
      </div>
      {open && <div style={{ padding: '14px 16px', borderTop: `1px solid ${T.border}` }}>{children}</div>}
    </div>
  )
}

/* ── 키워드 검색 ─────────────────────────────────────── */
function useSearch() {
  const [q, setQ] = useState('')
  return { q, setQ }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   탭 1: 사용자 매뉴얼
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function UserManual() {
  return (
    <div>
      {/* 시작하기 */}
      <div style={sectionBox}>
        <div style={h2}>🚀 시작하기</div>
        <div style={h3}>로그인</div>
        <p style={p}>
          이메일 주소와 비밀번호를 입력하면 로그인할 수 있습니다.<br />
          비밀번호를 잊으셨다면, 로그인 화면 아래 <b>"비밀번호 찾기"</b> 링크를 클릭하세요.
          등록된 이메일로 재설정 안내가 발송됩니다.
        </p>
        <div style={tip}>
          <b>💡 팁:</b> 브라우저 탭을 닫으면 자동 로그아웃됩니다. 보안을 위한 설정이니 다시 로그인해 주세요.
        </div>

        <div style={h3}>화면 구성</div>
        <p style={p}>화면은 크게 세 부분으로 나뉩니다.</p>
        <ul style={ul}>
          <li style={li}><b>왼쪽 메뉴(사이드바)</b> — 대시보드, 수요예측, 재고, 최적화 등 원하는 페이지로 이동</li>
          <li style={li}><b>상단 바(헤더)</b> — 알림 확인, 프로필 설정, 비밀번호 변경</li>
          <li style={li}><b>중앙 영역</b> — 선택한 페이지의 내용이 표시되는 곳</li>
        </ul>

        <div style={h3}>사용자 역할</div>
        <p style={p}>역할에 따라 볼 수 있는 페이지와 기능이 달라집니다.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 8 }}>
          {[
            { role: '관리자 (Admin)', desc: '모든 기능 사용 가능. 사용자 관리, 데이터 관리 포함', color: '#7C3AED', bg: T.purpleSoft },
            { role: '팀장 (Manager)', desc: '예측 조회, 생산·구매 권고 승인, 데이터 입력 가능', color: T.blue, bg: T.blueSoft },
            { role: '분석가 (Analyst)', desc: '예측·지표 조회, 데이터 입력 가능', color: T.green, bg: T.greenSoft },
            { role: '뷰어 (Viewer)', desc: '대시보드 조회만 가능 (읽기 전용)', color: T.text3, bg: T.surface2 },
          ].map(r => (
            <div key={r.role} style={{ ...card, padding: '14px 16px', borderLeft: `3px solid ${r.color}`, background: r.bg }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: r.color, marginBottom: 4 }}>{r.role}</div>
              <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 대시보드 */}
      <div style={sectionBox}>
        <div style={h2}>📊 대시보드</div>
        <p style={p}>
          로그인하면 가장 먼저 보이는 화면입니다. 오늘의 핵심 현황을 한눈에 파악할 수 있습니다.
        </p>
        <div style={h3}>KPI 카드</div>
        <ul style={ul}>
          <li style={li}><b>구매 발주 필요</b> — 재고가 부족해 지금 주문해야 하는 품목 수</li>
          <li style={li}><b>재고 커버리지</b> — 현재 재고로 몇 일간 버틸 수 있는지 (목표: 21일)</li>
          <li style={li}><b>AI 생산 권고</b> — AI가 "생산량을 조정하세요"라고 제안한 건수</li>
          <li style={li}><b>긴급 대응 SKU</b> — 위험 등급이 높아 즉시 조치가 필요한 품목 수</li>
        </ul>
        <div style={tip}>
          <b>💡 팁:</b> KPI 카드를 클릭하면 해당 상세 페이지로 바로 이동합니다.
        </div>

        <div style={h3}>알림 시스템</div>
        <p style={p}>
          상단 바 오른쪽의 <b>종 모양 아이콘</b>을 누르면 최근 알림 목록을 확인할 수 있습니다.
          새 알림이 있으면 숫자 배지가 표시되고, 긴급 알림은 화면 오른쪽 상단에 토스트 메시지로도 나타납니다.
        </p>
        <ul style={ul}>
          <li style={li}><span style={badge(T.redSoft, T.red)}>긴급</span> 즉시 확인이 필요한 위험 알림</li>
          <li style={li}><span style={badge(T.amberSoft, T.amber)}>주의</span> 수치가 기준에 근접한 경고 알림</li>
          <li style={li}><span style={badge(T.blueSoft, T.blue)}>정보</span> 일반 안내 사항</li>
        </ul>
      </div>

      {/* 수요예측 */}
      <div style={sectionBox}>
        <div style={h2}>📈 수요예측</div>
        <p style={p}>
          AI가 과거 판매·수주 데이터를 학습하여 앞으로의 수요량을 미리 예측해 줍니다.
        </p>

        <div style={h3}>주간 예측</div>
        <p style={p}>
          제품(SKU)별로 향후 4~12주간 예상되는 수주량을 보여줍니다.
          예측값은 <b>범위(밴드)</b>로 표시되며, 실제 수치가 이 범위 안에 들 가능성이 높습니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>중간값 (P50)</b> — 가장 가능성 높은 예측치. "대략 이 정도"</li>
          <li style={li}><b>하한 (P10)</b> — 최소한 이 정도는 나올 것. 보수적 관점</li>
          <li style={li}><b>상한 (P90)</b> — 최대 이 정도까지 가능. 낙관적 관점</li>
        </ul>
        <div style={tip}>
          <b>💡 쉽게 이해하기:</b> "이번 주 예측 500~800개(중간 650개)"라면,
          실제 수주가 500~800개 사이에 들 확률이 80%이고, 650개에 가장 가까울 가능성이 높다는 뜻입니다.
        </div>

        <div style={h3}>월간 예측</div>
        <p style={p}>
          고객사별로 월 단위 수요를 예측합니다. 장기적인 생산 계획이나 원자재 구매 전략을 세울 때 유용합니다.
        </p>

        <div style={h3}>모델 평가</div>
        <p style={p}>
          현재 사용 중인 7개 예측 모델의 정확도를 비교합니다.
          <b>MAPE(평균 오차율)</b>가 낮을수록 예측이 정확합니다. 숫자가 작을수록 좋다고 보시면 됩니다.
        </p>
      </div>

      {/* 재고 관리 */}
      <div style={sectionBox}>
        <div style={h2}>📦 재고 관리</div>
        <div style={h3}>재고 현황</div>
        <p style={p}>
          모든 품목의 현재 재고 수량, 안전재고(최소 보유량), 그리고 재고가 며칠분인지 한눈에 볼 수 있습니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>안전재고</b> — "최소한 이만큼은 보유해야 한다"는 기준 수량. 이보다 떨어지면 위험</li>
          <li style={li}><b>커버리지 일수</b> — 현재 재고로 며칠간 납품 가능한지 (예: 15일 = 15일치 재고 보유)</li>
        </ul>

        <div style={h3}>리스크 관리</div>
        <p style={p}>
          AI가 각 품목의 위험도를 <b>A~F 등급</b>으로 자동 분류합니다.
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { g: 'A', label: '매우 안전', c: '#10B981' }, { g: 'B', label: '안전', c: '#84CC16' },
            { g: 'C', label: '보통', c: '#F59E0B' }, { g: 'D', label: '주의', c: '#F97316' },
            { g: 'E', label: '위험', c: '#EF4444' }, { g: 'F', label: '긴급', c: '#7C3AED' },
          ].map(item => (
            <div key={item.g} style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.surface2, borderRadius: 6, padding: '4px 10px' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: item.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{item.g}</div>
              <span style={{ fontSize: 12, color: T.text2 }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={warn}>
          <b>⚠️ 참고:</b> E·F 등급 품목은 결품(재고 부족으로 납품 불가)이 발생할 수 있으므로 즉시 대응이 필요합니다.
        </div>
      </div>

      {/* 최적화 */}
      <div style={sectionBox}>
        <div style={h2}>🎯 최적화</div>
        <div style={h3}>생산 권고</div>
        <p style={p}>
          AI가 수요예측 결과와 현재 재고를 분석하여 "어떤 제품을 얼마나 생산해야 하는지" 제안합니다.
          승인하면 생산 계획에 반영됩니다.
        </p>

        <div style={h3}>구매 권고</div>
        <p style={p}>
          원자재나 부품을 언제, 얼마나 주문해야 하는지 AI가 추천합니다.
          납기일(물건이 도착하는 데 걸리는 시간)까지 고려하여 주문 시점을 알려줍니다.
        </p>

        <div style={h3}>시나리오 분석</div>
        <p style={p}>
          "만약 수요가 20% 늘어난다면?", "환율이 10% 오른다면?" 같은 가정을 설정하고,
          그 결과가 재고와 비용에 어떤 영향을 미치는지 미리 시뮬레이션합니다.
        </p>

        <div style={h3}>AI 시나리오</div>
        <p style={p}>
          반도체 업계에서 실제 발생할 수 있는 상황(예: 공급 부족, 수출 규제 등)을
          미리 정의해 둔 시나리오를 선택하면, AI가 영향 분석 결과를 자동으로 보여줍니다.
        </p>
      </div>

      {/* 외부 지표 */}
      <div style={sectionBox}>
        <div style={h2}>🌍 외부 지표</div>
        <p style={p}>
          수요에 영향을 주는 외부 환경 데이터를 모아 보여줍니다. AI 예측의 근거가 되는 참고 자료입니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>업계 동향</b> — 반도체 관련 최신 뉴스와 시장 흐름</li>
          <li style={li}><b>산업 지표</b> — SOX(반도체 지수), DRAM·NAND 가격 등</li>
          <li style={li}><b>글로벌 수요</b> — 주요국 산업생산지수(IPI), 구매관리자지수(PMI) 등</li>
          <li style={li}><b>환율 / 금리</b> — 원/달러 환율, 한국은행 기준금리 변화</li>
          <li style={li}><b>물류</b> — 해상 운임(BDI), 컨테이너 운송비 추이</li>
          <li style={li}><b>원자재</b> — 구리·금·원유(WTI) 가격 동향</li>
        </ul>
      </div>

      {/* 임원 보고서 */}
      <div style={sectionBox}>
        <div style={h2}>📋 임원 보고서</div>
        <p style={p}>
          경영진을 위한 요약 보고서입니다. 주간/월간 핵심 지표, 이슈, AI 분석 결과를
          한 페이지로 정리하여 빠르게 의사결정할 수 있도록 도와줍니다.
        </p>
      </div>

      {/* 자주 묻는 질문 */}
      <div style={sectionBox}>
        <div style={h2}>❓ 자주 묻는 질문</div>
        <Accordion title="예측 정확도가 100%가 아닌 이유는 무엇인가요?">
          <p style={p}>
            수요예측은 과거 데이터의 패턴을 기반으로 미래를 추정하는 것이므로, 100% 정확한 예측은 불가능합니다.
            하지만 AI가 여러 모델을 비교하여 가장 정확한 결과를 선택하므로, 사람이 직접 추정하는 것보다
            일관성 있고 신뢰할 수 있는 결과를 제공합니다.
          </p>
        </Accordion>
        <Accordion title="P10, P50, P90이 무슨 뜻인가요?">
          <p style={p}>
            예측 범위를 나타내는 숫자입니다.<br />
            <b>P50</b>은 "가장 가능성 높은 값", <b>P10</b>은 "최솟값(보수적)", <b>P90</b>은 "최댓값(낙관적)"입니다.<br />
            예를 들어, P10=400, P50=600, P90=800이면 "최소 400, 보통 600, 최대 800개 정도 예상"이라는 의미입니다.
          </p>
        </Accordion>
        <Accordion title="안전재고 기준은 어떻게 정해지나요?">
          <p style={p}>
            과거 주문 변동성과 납품에 걸리는 시간(리드타임)을 분석하여 자동 계산됩니다.
            주문 변동이 크거나 납품이 오래 걸리는 품목일수록 안전재고가 높게 설정됩니다.
          </p>
        </Accordion>
        <Accordion title="AI 생산 권고를 꼭 따라야 하나요?">
          <p style={p}>
            AI 권고는 <b>참고 정보</b>입니다. 최종 의사결정은 담당자가 하며,
            현장 상황에 따라 권고안을 수정하거나 무시할 수 있습니다.
            다만, 권고를 승인하면 시스템에 자동 반영되어 업무 효율이 높아집니다.
          </p>
        </Accordion>
        <Accordion title="데이터는 얼마나 자주 업데이트되나요?">
          <p style={p}>
            기본적으로 <b>매일 자동 갱신</b>됩니다. ERP에서 매일 수주·재고·생산 데이터를 가져오고,
            외부 지표는 각 데이터 제공처의 갱신 주기(일간/주간/월간)에 따라 업데이트됩니다.
          </p>
        </Accordion>
        <Accordion title="차트나 표의 데이터를 파일로 내보낼 수 있나요?">
          <p style={p}>
            네, 대부분의 표에서 <b>CSV 내보내기</b> 버튼을 제공합니다.
            버튼을 클릭하면 엑셀에서 열 수 있는 CSV 파일이 다운로드됩니다.
          </p>
        </Accordion>
      </div>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   탭 2: API 안내
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ApiGuide() {
  const endpoints: { method: string; path: string; desc: string; category: string }[] = [
    // 인증
    { method: 'POST', path: '/api/me', desc: '로그인한 사용자 정보 조회', category: '인증' },
    // 대시보드
    { method: 'GET', path: '/api/dashboard', desc: '대시보드 KPI 현황 데이터', category: '대시보드' },
    { method: 'GET', path: '/api/alerts', desc: '알림 목록 조회', category: '대시보드' },
    { method: 'GET', path: '/api/alerts/stream', desc: '실시간 알림 스트림 (SSE)', category: '대시보드' },
    // 수요예측
    { method: 'GET', path: '/api/forecast-weekly', desc: '주간 예측 결과 조회', category: '수요예측' },
    { method: 'GET', path: '/api/forecast-monthly', desc: '월간 예측 결과 조회', category: '수요예측' },
    { method: 'GET', path: '/api/model-evaluation', desc: '모델별 정확도 비교', category: '수요예측' },
    // 재고
    { method: 'GET', path: '/api/inventory', desc: '재고 현황 전체 조회', category: '재고' },
    { method: 'GET', path: '/api/risk', desc: '품목별 위험 등급 목록', category: '재고' },
    // 최적화
    { method: 'GET', path: '/api/production-plan', desc: '생산 권고 목록', category: '최적화' },
    { method: 'GET', path: '/api/purchase-recommendation', desc: '구매 권고 목록', category: '최적화' },
    { method: 'POST', path: '/api/ai-scenario', desc: 'AI 시나리오 분석 실행', category: '최적화' },
    // 외부 지표
    { method: 'GET', path: '/api/ext-semi', desc: '반도체 산업 지표 (SOX, DRAM 등)', category: '외부지표' },
    { method: 'GET', path: '/api/ext-global', desc: '글로벌 수요 지표 (IPI, PMI 등)', category: '외부지표' },
    { method: 'GET', path: '/api/ext-fx', desc: '환율·금리 데이터', category: '외부지표' },
    { method: 'GET', path: '/api/ext-supply', desc: '물류 지표 (BDI, 해상운임 등)', category: '외부지표' },
    { method: 'GET', path: '/api/ext-raw', desc: '원자재 가격 (구리, 금, WTI 등)', category: '외부지표' },
    // 관리자
    { method: 'GET', path: '/api/admin/users', desc: '사용자 목록 조회 (관리자)', category: '관리' },
    { method: 'POST', path: '/api/admin/invite', desc: '새 사용자 초대 (관리자)', category: '관리' },
    { method: 'GET', path: '/api/monitoring/health', desc: '시스템 상태 확인', category: '관리' },
    { method: 'GET', path: '/api/monitoring/logs', desc: '시스템 로그 조회', category: '관리' },
  ]

  const categories = Array.from(new Set(endpoints.map(e => e.category)))
  const methodColor: Record<string, { bg: string; c: string }> = {
    GET: { bg: T.greenSoft, c: T.green },
    POST: { bg: T.blueSoft, c: T.blue },
    PUT: { bg: T.amberSoft, c: T.amber },
    DELETE: { bg: T.redSoft, c: T.red },
  }

  return (
    <div>
      {/* 개요 */}
      <div style={sectionBox}>
        <div style={h2}>🔌 API 개요</div>
        <p style={p}>
          ForecastAI의 데이터를 외부 시스템(예: 엑셀 매크로, ERP 연동)에서 직접 가져올 때 사용하는 주소(API) 목록입니다.
          개발팀이나 IT 담당자에게 이 문서를 전달하면 연동 작업에 활용할 수 있습니다.
        </p>
        <div style={tip}>
          <b>💡 비개발자 안내:</b> API는 "시스템끼리 데이터를 주고받는 통로"입니다.
          직접 사용하지 않아도 되며, IT 담당자가 연동할 때 참고하는 문서입니다.
        </div>

        <div style={h3}>기본 사용법</div>
        <p style={p}>모든 API 요청 시 로그인 정보(인증 토큰)가 필요합니다.</p>
        <div style={codeBlock}>
          {`# 예시: 대시보드 데이터 요청
GET /api/dashboard
Authorization: Bearer {로그인_토큰}

# 응답 형식: JSON
{
  "kpi": { "order": 4, "coverage": 18, ... },
  "alerts": [ ... ]
}`}
        </div>

        <div style={h3}>응답 형식</div>
        <ul style={ul}>
          <li style={li}>모든 응답은 <b>JSON 형식</b>으로 반환됩니다 (구조화된 데이터)</li>
          <li style={li}>성공 시 <b>200 OK</b>, 권한 부족 시 <b>403 Forbidden</b>, 오류 시 <b>500 Error</b></li>
          <li style={li}>날짜는 <b>YYYY-MM-DD</b> 형식 (예: 2026-03-18)</li>
        </ul>
      </div>

      {/* API 목록 */}
      {categories.map(cat => (
        <div key={cat} style={sectionBox}>
          <div style={h2}>{cat === '인증' ? '🔑' : cat === '대시보드' ? '📊' : cat === '수요예측' ? '📈' : cat === '재고' ? '📦' : cat === '최적화' ? '🎯' : cat === '외부지표' ? '🌍' : '⚙️'} {cat}</div>
          <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.surface2 }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}`, width: 70 }}>방식</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}` }}>주소 (경로)</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}` }}>설명</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.filter(e => e.category === cat).map((ep, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ ...badge(methodColor[ep.method]?.bg || T.surface2, methodColor[ep.method]?.c || T.text2), fontFamily: 'monospace' }}>{ep.method}</span>
                    </td>
                    <td style={{ padding: '8px 14px', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, color: T.text1 }}>{ep.path}</td>
                    <td style={{ padding: '8px 14px', color: T.text2 }}>{ep.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* 실시간 알림 */}
      <div style={sectionBox}>
        <div style={h2}>📡 실시간 알림 (SSE)</div>
        <p style={p}>
          <b>SSE(Server-Sent Events)</b>는 서버에서 브라우저로 알림을 실시간으로 보내는 기술입니다.
          별도 새로고침 없이도 새 알림이 자동으로 화면에 나타납니다.
        </p>
        <div style={codeBlock}>
          {`# 실시간 알림 연결
GET /api/alerts/stream
Accept: text/event-stream

# 수신 데이터 예시
data: {"type":"risk","severity":"high","message":"SKU-0421 안전재고 도달","target_page":"risk"}`}
        </div>
        <p style={p}>
          알림 유형: <span style={badge(T.redSoft, T.red)}>risk</span> 위험,
          <span style={badge(T.amberSoft, T.amber)}>warn</span> 경고,
          <span style={badge(T.blueSoft, T.blue)}>info</span> 정보
        </p>
      </div>

      {/* 오류 코드 */}
      <div style={sectionBox}>
        <div style={h2}>🚨 오류 코드 안내</div>
        <p style={p}>API 사용 시 발생할 수 있는 오류 코드와 해결 방법입니다.</p>
        <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}`, width: 80 }}>코드</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}` }}>의미</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}` }}>해결 방법</th>
              </tr>
            </thead>
            <tbody>
              {[
                { code: '200', meaning: '성공', fix: '정상 처리되었습니다', color: T.green },
                { code: '400', meaning: '잘못된 요청', fix: '요청 내용(파라미터)을 확인해 주세요', color: T.amber },
                { code: '401', meaning: '인증 필요', fix: '로그인이 만료되었습니다. 다시 로그인해 주세요', color: T.amber },
                { code: '403', meaning: '권한 부족', fix: '해당 기능에 접근 권한이 없습니다. 관리자에게 문의하세요', color: T.red },
                { code: '404', meaning: '찾을 수 없음', fix: '요청한 주소가 올바른지 확인해 주세요', color: T.amber },
                { code: '500', meaning: '서버 오류', fix: '시스템 오류입니다. 잠시 후 재시도하거나 관리자에게 문의하세요', color: T.red },
              ].map((err, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '8px 14px' }}><span style={badge(T.surface2, err.color)}>{err.code}</span></td>
                  <td style={{ padding: '8px 14px', fontWeight: 600, color: T.text1 }}>{err.meaning}</td>
                  <td style={{ padding: '8px 14px', color: T.text2 }}>{err.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   탭 3: 운영 매뉴얼
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function OpsManual() {
  return (
    <div>
      {/* 관리자 전용 안내 */}
      <div style={warn}>
        <b>⚠️ 이 매뉴얼은 관리자(Admin) 역할의 담당자를 위한 안내입니다.</b><br />
        일반 사용자 분은 "사용자 매뉴얼" 탭을 참고해 주세요.
      </div>

      {/* 사용자 관리 */}
      <div style={sectionBox}>
        <div style={h2}>👥 사용자 관리</div>

        <div style={h3}>새 사용자 초대하기</div>
        <p style={p}>관리자 &gt; 사용자 관리 메뉴에서 새 사용자를 초대할 수 있습니다.</p>
        <ol style={{ ...ul, listStyleType: 'decimal' }}>
          <li style={li}>왼쪽 메뉴 하단의 <b>"관리자"</b>를 클릭합니다</li>
          <li style={li}><b>"사용자 초대"</b> 버튼을 클릭합니다</li>
          <li style={li}>이메일 주소, 이름, 역할(Admin/Manager/Analyst/Viewer)을 입력합니다</li>
          <li style={li}>초대를 발송하면, 상대방 이메일로 비밀번호 설정 링크가 전달됩니다</li>
        </ol>

        <div style={h3}>역할 변경하기</div>
        <p style={p}>
          사용자 목록에서 해당 사용자의 역할을 변경할 수 있습니다.
          역할을 변경하면 즉시 접근 가능한 페이지와 기능이 바뀝니다.
        </p>

        <div style={h3}>사용자 비활성화</div>
        <p style={p}>
          퇴사 등의 이유로 계정을 차단해야 할 때 사용합니다.
          삭제가 아닌 비활성화이므로, 필요시 다시 활성화할 수 있습니다.
        </p>
      </div>

      {/* 데이터 관리 */}
      <div style={sectionBox}>
        <div style={h2}>🗄️ 데이터 관리</div>

        <div style={h3}>데이터 파이프라인이란?</div>
        <p style={p}>
          ERP 등 외부 시스템에서 데이터를 가져와 AI 예측에 사용할 수 있도록 정리·저장하는 자동화 과정입니다.
          쉽게 말해 <b>"데이터 자동 수집·정리 시스템"</b>입니다.
        </p>

        <div style={h3}>수동 데이터 동기화</div>
        <ol style={{ ...ul, listStyleType: 'decimal' }}>
          <li style={li}>왼쪽 메뉴에서 <b>"데이터 관리"</b>를 클릭합니다</li>
          <li style={li}>동기화하고 싶은 데이터 유형을 선택합니다 (수주, 재고, 생산 등)</li>
          <li style={li}><b>"지금 동기화"</b> 버튼을 클릭하면 최신 데이터를 즉시 가져옵니다</li>
        </ol>
        <div style={tip}>
          <b>💡 팁:</b> 일반적으로 데이터는 매일 자동 동기화되므로, 수동 동기화는 급히 최신 데이터가 필요할 때만 사용하세요.
        </div>

        <div style={h3}>데이터 품질 확인</div>
        <p style={p}>
          데이터 관리 화면에서 각 데이터의 <b>최근 갱신 시각</b>과 <b>건수</b>를 확인할 수 있습니다.
          갱신 시각이 너무 오래된 경우, 데이터 수집에 문제가 있을 수 있으니 IT 팀에 문의하세요.
        </p>
      </div>

      {/* 시스템 모니터링 */}
      <div style={sectionBox}>
        <div style={h2}>📡 시스템 모니터링</div>

        <div style={h3}>시스템 상태 확인</div>
        <p style={p}>
          모니터링 페이지에서 시스템의 전반적인 상태를 실시간으로 확인할 수 있습니다.
        </p>
        <ul style={ul}>
          <li style={li}><span style={badge(T.greenSoft, T.green)}>정상</span> 모든 서비스가 원활하게 작동 중</li>
          <li style={li}><span style={badge(T.amberSoft, T.amber)}>주의</span> 일부 지연 또는 경미한 이상 감지</li>
          <li style={li}><span style={badge(T.redSoft, T.red)}>장애</span> 서비스 중단 또는 심각한 오류 발생</li>
        </ul>

        <div style={h3}>확인할 수 있는 항목</div>
        <ul style={ul}>
          <li style={li}><b>API 응답 시간</b> — 시스템이 요청에 얼마나 빨리 응답하는지</li>
          <li style={li}><b>데이터베이스 상태</b> — 데이터 저장소가 정상 작동 중인지</li>
          <li style={li}><b>AI 모델 상태</b> — 예측 모델이 정상적으로 동작하는지</li>
          <li style={li}><b>최근 오류 로그</b> — 시스템에서 발생한 오류 기록</li>
        </ul>
      </div>

      {/* 정기 배치 작업 */}
      <div style={sectionBox}>
        <div style={h2}>⏰ 자동화 작업 (배치)</div>
        <p style={p}>
          시스템이 정기적으로 자동 실행하는 작업 목록입니다. 별도 조작 없이 자동으로 진행됩니다.
        </p>
        <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}` }}>작업</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}` }}>실행 주기</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: T.text1, borderBottom: `1px solid ${T.border}` }}>설명</th>
              </tr>
            </thead>
            <tbody>
              {[
                { task: '데이터 동기화', cycle: '매일 06:00', desc: 'ERP에서 수주·재고·생산 데이터 가져오기' },
                { task: '주간 예측 실행', cycle: '매주 월요일 07:00', desc: 'AI 모델로 주간 수요 예측 생성' },
                { task: '외부 지표 수집', cycle: '매일 08:00', desc: '환율, 원자재, 산업 지표 등 외부 데이터 수집' },
                { task: '리스크 등급 갱신', cycle: '매일 09:00', desc: '품목별 A~F 위험 등급 재계산' },
                { task: '알림 생성', cycle: '매일 09:30', desc: '위험 품목·재고 부족 등 알림 자동 발송' },
                { task: '보고서 생성', cycle: '매주 금요일 17:00', desc: '주간 임원 보고서 자동 생성' },
              ].map((job, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '8px 14px', fontWeight: 600, color: T.text1 }}>{job.task}</td>
                  <td style={{ padding: '8px 14px' }}><span style={badge(T.blueSoft, T.blue)}>{job.cycle}</span></td>
                  <td style={{ padding: '8px 14px', color: T.text2 }}>{job.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 장애 대응 */}
      <div style={sectionBox}>
        <div style={h2}>🛠️ 장애 대응 가이드</div>

        <Accordion title="로그인이 되지 않아요">
          <ol style={{ ...ul, listStyleType: 'decimal' }}>
            <li style={li}>이메일 주소와 비밀번호를 정확히 입력했는지 확인합니다</li>
            <li style={li}>비밀번호를 잊었다면 "비밀번호 찾기"로 재설정합니다</li>
            <li style={li}>계정이 비활성화되었을 수 있으니 관리자에게 문의합니다</li>
          </ol>
        </Accordion>

        <Accordion title="데이터가 갱신되지 않아요">
          <ol style={{ ...ul, listStyleType: 'decimal' }}>
            <li style={li}>모니터링 페이지에서 데이터 파이프라인 상태를 확인합니다</li>
            <li style={li}>데이터 관리 &gt; 수동 동기화를 시도합니다</li>
            <li style={li}>ERP 시스템 연결 상태를 IT 팀에 확인합니다</li>
            <li style={li}>그래도 해결되지 않으면 시스템 로그를 확인합니다</li>
          </ol>
        </Accordion>

        <Accordion title="알림이 오지 않아요">
          <ol style={{ ...ul, listStyleType: 'decimal' }}>
            <li style={li}>상단 바의 연결 상태 점이 <span style={{ color: T.green, fontWeight: 700 }}>초록색</span>인지 확인합니다</li>
            <li style={li}>회색이면 실시간 연결이 끊어진 상태입니다. 페이지를 새로고침(F5)합니다</li>
            <li style={li}>계속 연결되지 않으면 네트워크 환경을 확인하거나 IT 팀에 문의합니다</li>
          </ol>
        </Accordion>

        <Accordion title="페이지 로딩이 느려요">
          <ol style={{ ...ul, listStyleType: 'decimal' }}>
            <li style={li}>인터넷 연결 상태를 확인합니다</li>
            <li style={li}>브라우저 캐시를 지우고 다시 시도합니다 (Ctrl + Shift + Delete)</li>
            <li style={li}>다른 브라우저(Chrome, Edge 권장)에서 시도합니다</li>
            <li style={li}>모니터링에서 서버 응답 시간이 정상인지 확인합니다</li>
          </ol>
        </Accordion>

        <Accordion title="예측 결과가 이상해 보여요">
          <ol style={{ ...ul, listStyleType: 'decimal' }}>
            <li style={li}>모델 평가 페이지에서 최근 오차율(MAPE)을 확인합니다</li>
            <li style={li}>갑작스런 수주 변동이나 이벤트(프로모션, 대량 주문 등)가 있었는지 확인합니다</li>
            <li style={li}>외부 지표에 급격한 변화가 있었는지 확인합니다</li>
            <li style={li}>데이터 입력에 오류가 없었는지 데이터 관리에서 확인합니다</li>
          </ol>
        </Accordion>
      </div>

      {/* 보안 안내 */}
      <div style={sectionBox}>
        <div style={h2}>🔐 보안 안내</div>
        <ul style={ul}>
          <li style={li}>비밀번호는 <b>6자 이상</b>으로 설정하며, 정기적으로 변경하는 것을 권장합니다</li>
          <li style={li}>탭을 닫으면 자동 로그아웃됩니다 (세션 보안)</li>
          <li style={li}>다른 사람과 계정을 공유하지 마세요</li>
          <li style={li}>공용 PC에서는 사용 후 반드시 로그아웃해 주세요</li>
          <li style={li}>비밀번호 변경: 상단 바 &gt; 프로필 클릭 &gt; "비밀번호 변경"</li>
        </ul>
      </div>

      {/* 연락처 */}
      <div style={sectionBox}>
        <div style={h2}>📞 도움이 필요하시면</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { title: '시스템 오류·장애', contact: 'IT 운영팀', icon: '🖥️', color: T.red },
            { title: '계정·권한 문의', contact: '시스템 관리자', icon: '👤', color: T.blue },
            { title: '데이터·예측 관련', contact: '데이터 분석팀', icon: '📊', color: T.green },
            { title: '사용법 문의', contact: '이 도움말을 먼저 확인해 주세요', icon: '📖', color: T.purple },
          ].map(c => (
            <div key={c.title} style={{ ...card, padding: '14px 16px', borderLeft: `3px solid ${c.color}` }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text1, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: T.text2 }}>{c.contact}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   메인 컴포넌트
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function PageHelp() {
  const [tab, setTab] = useState<TabId>('user')
  const { q, setQ } = useSearch()

  const TAB_CONTENT: Record<TabId, React.ReactNode> = {
    user: <UserManual />,
    api:  <ApiGuide />,
    ops:  <OpsManual />,
  }

  return (
    <div>
      {/* 페이지 헤더 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#3B82F6,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>?</div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text1, margin: 0 }}>도움말 센터</h1>
            <p style={{ fontSize: 13, color: T.text3, margin: 0, marginTop: 2 }}>ForecastAI 사용 안내 · API 문서 · 운영 가이드</p>
          </div>
        </div>
      </div>

      {/* 탭 선택 + 검색 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 18px', borderRadius: 8, border: `1px solid ${tab === t.id ? T.blue : T.border}`,
              background: tab === t.id ? T.blueSoft : T.surface, color: tab === t.id ? T.blue : T.text2,
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="키워드로 검색..."
            style={{ padding: '8px 14px 8px 34px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, width: 220, background: T.surface, color: T.text1, outline: 'none' }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: T.text3 }}>🔍</span>
        </div>
      </div>

      {/* 선택된 탭 설명 */}
      <div style={{ background: T.surface2, borderRadius: 8, padding: '12px 18px', marginBottom: 20, fontSize: 13, color: T.text2, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 18 }}>{TABS.find(t => t.id === tab)?.icon}</span>
        {TABS.find(t => t.id === tab)?.desc}
      </div>

      {/* 탭 콘텐츠 */}
      {TAB_CONTENT[tab]}
    </div>
  )
}
