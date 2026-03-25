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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         대시보드
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>📊 대시보드</div>
        <p style={p}>
          로그인하면 가장 먼저 보이는 화면입니다. 자동차의 계기판처럼, <b>오늘 우리 회사의 핵심 상태를 한눈에</b> 보여줍니다.
          이 화면 하나만 봐도 "지금 급한 일이 뭔지", "전체적으로 괜찮은 상태인지"를 바로 알 수 있습니다.
        </p>

        <div style={h3}>① KPI 카드 (핵심 지표 4개)</div>
        <p style={p}>화면 맨 위에 4개의 숫자 카드가 보입니다. 각 카드의 뜻은 다음과 같습니다.</p>
        <ul style={ul}>
          <li style={li}><b>구매 발주 필요</b> — 재고가 부족해서 <b>지금 주문해야 하는 품목이 몇 개</b>인지 보여줍니다. 숫자가 크면 클수록 빨리 발주해야 합니다.</li>
          <li style={li}><b>재고 커버리지</b> — 현재 보유한 재고로 <b>몇 일간 버틸 수 있는지</b>를 뜻합니다. 목표는 21일(약 3주)이며, 이보다 낮으면 재고 보충이 필요합니다.</li>
          <li style={li}><b>AI 생산 권고</b> — AI가 분석한 결과, <b>"생산량을 조정하세요"라고 제안한 건수</b>입니다. 숫자가 있으면 생산 권고 페이지에서 상세 내용을 확인하세요.</li>
          <li style={li}><b>긴급 대응 SKU</b> — 위험 등급이 높아서 <b>즉시 조치가 필요한 품목 수</b>입니다. 0이 아니면 바로 리스크 관리 페이지를 확인하세요.</li>
        </ul>
        <div style={tip}>
          <b>💡 팁:</b> 각 KPI 카드를 <b>클릭하면 해당 상세 페이지로 바로 이동</b>합니다. 예를 들어 "구매 발주 필요"를 클릭하면 구매 권고 페이지로 이동합니다.
        </div>

        <div style={h3}>② 수주 실적 vs 예측 차트</div>
        <p style={p}>
          화면 중간에 있는 큰 차트입니다. <b>실제로 들어온 주문량</b>(막대그래프)과 <b>AI가 예측한 수량</b>(선 그래프)을 겹쳐서 보여줍니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>파란 막대</b> = 실제 수주량 (이미 확정된 주문)</li>
          <li style={li}><b>선 그래프(밴드)</b> = AI 예측값. 음영이 칠해진 범위는 "이 안에 들 가능성이 높다"는 뜻입니다</li>
          <li style={li}>실제값과 예측값이 비슷하게 움직이면 → AI 예측이 잘 맞고 있다는 의미입니다</li>
          <li style={li}>실제값이 예측 범위를 벗어나면 → 갑작스러운 수요 변화가 있었다는 신호이므로 원인을 확인해 보세요</li>
        </ul>

        <div style={h3}>③ 리스크 등급 분포 차트</div>
        <p style={p}>
          도넛(원형) 모양의 차트로, <b>전체 품목이 어떤 위험 등급에 얼마나 분포되어 있는지</b> 한눈에 보여줍니다.
        </p>
        <ul style={ul}>
          <li style={li}>초록색(A·B 등급) 비율이 높으면 → 대부분 안전한 상태</li>
          <li style={li}>빨간색·보라색(E·F 등급) 비율이 높으면 → 긴급 대응 품목이 많다는 의미</li>
        </ul>

        <div style={h3}>④ AI 조치 제안 목록</div>
        <p style={p}>
          AI가 분석 결과를 토대로 <b>"지금 이런 조치를 하면 좋겠습니다"</b>라고 추천하는 항목들입니다.
          예를 들어 "A 제품 긴급 발주 필요", "B 제품 생산량 증대 검토" 같은 내용이 표시됩니다.
        </p>

        <div style={h3}>⑤ 재고 커버리지 현황</div>
        <p style={p}>
          주요 품목별로 <b>현재 재고가 며칠분인지</b> 표 형태로 보여줍니다.
          커버리지가 짧은(재고가 적은) 품목이 위쪽에 표시되므로, 위에 있는 품목부터 우선 확인하시면 됩니다.
        </p>

        <div style={h3}>⑥ 주차 정보</div>
        <p style={p}>
          현재 몇 주차 데이터를 보고 있는지, 언제 기준으로 분석된 결과인지 표시됩니다.
          예: "2026년 W09 · 계획 기준일 2026-02-28" → 2월 28일 기준 9주차 분석 결과라는 뜻입니다.
        </p>

        <div style={h3}>⑦ 알림 시스템</div>
        <p style={p}>
          상단 바 오른쪽의 <b>종 모양 아이콘(🔔)</b>을 누르면 최근 알림 목록을 확인할 수 있습니다.
          새 알림이 있으면 아이콘 옆에 <b>숫자 배지</b>가 표시됩니다.
          특히 긴급한 알림은 화면 오른쪽 상단에 <b>토스트 메시지</b>(잠깐 나타났다 사라지는 알림)로도 표시됩니다.
        </p>
        <ul style={ul}>
          <li style={li}><span style={badge(T.redSoft, T.red)}>긴급</span> 즉시 확인이 필요한 위험 알림 — 결품 위험, 시스템 장애 등</li>
          <li style={li}><span style={badge(T.amberSoft, T.amber)}>주의</span> 수치가 기준에 근접한 경고 — 재고 감소 추세, 리드타임 초과 등</li>
          <li style={li}><span style={badge(T.blueSoft, T.blue)}>정보</span> 일반 안내 — 데이터 갱신 완료, 새 보고서 생성 등</li>
        </ul>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         수요예측 — 주간 예측
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>📈 수요예측 — 주간 예측</div>
        <p style={p}>
          AI가 과거 판매·수주 데이터의 패턴을 분석해서, <b>앞으로 몇 주간 각 품목이 얼마나 주문될지</b> 미리 알려주는 화면입니다.
          쉽게 말해, "이 제품은 다음 주에 대략 몇 개 정도 주문이 들어올 것 같다"를 AI가 계산해 주는 것입니다.
        </p>

        <div style={h3}>① 품목(SKU) 선택하기</div>
        <p style={p}>
          화면 상단의 <b>드롭다운 목록</b>에서 확인하고 싶은 품목을 선택합니다.
          품목코드나 품목명으로 검색할 수 있으며, 선택하면 해당 품목의 예측 결과가 바로 표시됩니다.
        </p>

        <div style={h3}>② 예측 기간 설정</div>
        <p style={p}>
          <b>1주(1W), 2주(2W), 4주(4W)</b> 중에서 얼마나 먼 미래까지 볼지 선택할 수 있습니다.
          짧은 기간(1주)은 정확도가 높고, 긴 기간(4주)은 먼 미래 계획을 세울 때 유용합니다.
        </p>

        <div style={h3}>③ 예측 차트 읽는 법</div>
        <p style={p}>
          차트에 색이 칠해진 범위(밴드)가 보입니다. 이것이 AI의 예측 결과입니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>중간값 (P50)</b> — <b>가장 가능성 높은 예측치</b>입니다. "아마 이 정도일 것"이라는 뜻</li>
          <li style={li}><b>하한 (P10)</b> — <b>보수적(최소) 예측</b>입니다. "최소한 이 정도는 나올 것"이라는 뜻</li>
          <li style={li}><b>상한 (P90)</b> — <b>낙관적(최대) 예측</b>입니다. "잘 되면 이 정도까지 가능"이라는 뜻</li>
        </ul>
        <div style={tip}>
          <b>💡 쉽게 이해하기:</b> "P10=500, P50=650, P90=800"이라면 → "최소 500개, 보통 650개, 최대 800개 정도 예상"이라는 뜻입니다.
          P50(중간값)을 기준으로 생산 계획을 세우되, P90(최대치)도 참고하면 더 안전합니다.
        </div>

        <div style={h3}>④ 주차별 예측 상세 표</div>
        <p style={p}>
          차트 아래에 주(week)별 수치를 표로 정리해 보여줍니다. 각 주마다 다음 정보가 표시됩니다:
        </p>
        <ul style={ul}>
          <li style={li}><b>P10 / P50 / P90</b> — 위에서 설명한 3가지 예측 수량</li>
          <li style={li}><b>MAPE (평균 오차율)</b> — 과거에 이 예측이 실제와 얼마나 차이가 났는지. <b>숫자가 작을수록 정확</b>합니다. 예: MAPE 12% = 평균적으로 12% 정도 차이가 났다</li>
          <li style={li}><b>커버리지율</b> — 실제 값이 예측 범위(P10~P90) 안에 들어간 비율. <b>80% 이상이면 양호</b></li>
        </ul>

        <div style={h3}>⑤ 고객사별 분석</div>
        <p style={p}>
          같은 품목이라도 <b>어떤 고객사에서 많이 주문하는지</b> 분석해서 보여줍니다.
          주요 고객별 수주 비중을 파악하면, 특정 고객의 주문 변동이 전체에 미치는 영향을 미리 예상할 수 있습니다.
        </p>

        <div style={h3}>⑥ 리스크 요약</div>
        <p style={p}>
          선택한 품목에 대해 <b>결품(재고 부족)·과잉(재고 넘침)·납기 지연·마진(수익) 악화</b> 4가지 위험이 있는지 자동으로 요약합니다.
          빨간색으로 표시된 항목이 있다면, 해당 위험에 대해 우선적으로 조치를 검토해야 합니다.
        </p>

        <div style={h3}>⑦ AI 인사이트</div>
        <p style={p}>
          AI가 분석한 내용을 <b>사람이 읽기 쉬운 문장으로</b> 요약해 줍니다.
          예: "이 품목은 최근 4주간 수요가 증가 추세이며, 현재 재고로 2주 후 결품이 예상됩니다."
        </p>

        <div style={h3}>⑧ CSV 내보내기</div>
        <p style={p}>
          화면 우측 상단의 <b>"CSV 내보내기" 버튼</b>을 클릭하면 현재 보고 있는 예측 데이터를
          <b>엑셀에서 열 수 있는 파일</b>로 다운로드할 수 있습니다.
          보고 자료에 붙이거나 추가 분석에 활용하세요.
        </p>

        <div style={h3}>⑨ 데이터 출처 표시</div>
        <p style={p}>
          화면 상단에 데이터가 어디에서 왔는지 표시됩니다.
        </p>
        <ul style={ul}>
          <li style={li}><span style={badge(T.greenSoft, T.green)}>DB</span> 실제 데이터베이스에서 가져온 정상 데이터</li>
          <li style={li}><span style={badge(T.amberSoft, T.amber)}>MOCK</span> 샘플 데이터 (실제 데이터 연동 전 테스트 화면)</li>
          <li style={li}><span style={badge(T.redSoft, T.red)}>ERROR</span> 데이터 로딩 중 문제 발생 — 잠시 후 새로고침하거나 관리자에게 문의하세요</li>
        </ul>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         수요예측 — 월간 예측
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>📈 수요예측 — 월간 예측</div>
        <p style={p}>
          주간 예측이 "이번 주·다음 주"에 집중한다면, 월간 예측은 <b>1~3개월 단위의 큰 흐름</b>을 보여줍니다.
          장기적인 생산 계획을 세우거나, 원자재를 미리 확보해야 할 때 참고하기 좋습니다.
        </p>

        <div style={h3}>① 고객사별 주문·매출 분석</div>
        <p style={p}>
          <b>어떤 고객사가 얼마나 주문하고, 매출이 얼마인지</b> 고객별로 나누어 보여줍니다.
          특정 고객의 주문이 줄어드는 추세라면, 영업 전략을 검토하는 데 활용할 수 있습니다.
        </p>

        <div style={h3}>② 외부 지표와의 관계</div>
        <p style={p}>
          환율(원/달러), 반도체 지수(SOX), 메모리 가격(DRAM) 같은 외부 환경이
          <b>이 품목의 수요와 얼마나 관련이 있는지</b> 함께 보여줍니다.
          예를 들어, "환율이 오를 때 이 품목 주문이 줄어드는 경향이 있다"는 식의 관계를 파악할 수 있습니다.
        </p>

        <div style={h3}>③ 리스크 등급</div>
        <p style={p}>
          월간 기준으로도 품목별 <b>위험 등급(A~F)</b>을 표시합니다. 주간 예측의 리스크와 마찬가지로
          E·F 등급은 즉시 대응, C·D 등급은 주의 관찰이 필요합니다.
        </p>

        <div style={h3}>④ 신뢰도 안내</div>
        <p style={p}>
          수요 변동이 심하거나 데이터가 부족한 품목은 <b>예측의 불확실성이 높습니다</b>.
          이런 품목은 별도의 "신뢰도 주의" 표시가 나타나며, 예측값을 참고만 하고 현장 상황과 함께 판단하시기를 권합니다.
        </p>

        <div style={h3}>⑤ CSV 내보내기 · AI 조치 항목</div>
        <p style={p}>
          주간 예측과 마찬가지로 <b>CSV 파일 다운로드</b>가 가능하고,
          AI가 제안하는 <b>조치 항목</b>(예: "재고 보충 필요", "과잉 주의")도 함께 표시됩니다.
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         수요예측 — 모델 평가
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>📈 수요예측 — 모델 평가</div>
        <p style={p}>
          넥스플로AI는 여러 개의 예측 방법(모델)을 동시에 사용하고, <b>어떤 모델이 가장 정확한지 자동으로 비교</b>합니다.
          이 화면은 "AI의 성적표"라고 생각하시면 됩니다. 각 예측 모델이 실제로 얼마나 잘 맞추고 있는지 보여줍니다.
        </p>
        <div style={tip}>
          <b>💡 비유:</b> 일기예보를 여러 기상청에서 내놓는 것처럼, 우리도 여러 AI 모델이 각자 예측을 내고,
          그중 <b>가장 정확한 모델의 결과를 자동으로 선택</b>합니다. 이 화면은 각 기상청의 적중률을 비교하는 것과 같습니다.
        </div>

        <div style={h3}>5개 탭 살펴보기</div>
        <p style={p}>이 화면은 5개의 탭으로 구성되어 있습니다. 각 탭을 클릭하면 해당 내용이 표시됩니다.</p>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid ${T.blue}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 6 }}>탭 1: 전체 요약 (Overview)</div>
          <p style={{ ...p, marginBottom: 0 }}>
            모든 모델의 핵심 성적을 한 화면에 요약합니다. 각 모델의 정확도 수치가 나란히 표시되어 한눈에 비교할 수 있습니다.
          </p>
        </div>
        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid ${T.green}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 6 }}>탭 2: 정확도 분석 (Accuracy Analysis)</div>
          <p style={{ ...p, marginBottom: 0 }}>
            각 모델이 실제 값과 얼마나 가까웠는지 <b>차트로 시각화</b>합니다.
            막대가 짧을수록(오차가 작을수록) 좋은 모델입니다.
          </p>
        </div>
        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid #F59E0B` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B', marginBottom: 6 }}>탭 3: 과적합 분석 (Overfitting Analysis)</div>
          <p style={{ ...p, marginBottom: 0 }}>
            <b>"과적합"이란?</b> 시험 문제를 달달 외워서 시험은 만점이지만 응용 문제는 못 푸는 것과 비슷합니다.
            AI가 과거 데이터에만 딱 맞추고 새로운 데이터는 잘 못 맞추는 현상입니다.
            이 탭에서 과적합 여부를 확인합니다. 학습용 성적과 실전 성적 차이가 작을수록 좋습니다.
          </p>
        </div>
        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid #8B5CF6` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#8B5CF6', marginBottom: 6 }}>탭 4: 중요 요인 분석 (Feature Importance)</div>
          <p style={{ ...p, marginBottom: 0 }}>
            AI가 예측할 때 <b>어떤 정보를 가장 많이 참고하는지</b> 순위를 보여줍니다.
            예: "과거 4주 평균 수주량" → "환율" → "DRAM 가격" 순으로 중요하다면,
            과거 수주 패턴이 가장 큰 예측 근거라는 뜻입니다.
          </p>
        </div>
        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid #EC4899` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#EC4899', marginBottom: 6 }}>탭 5: 임원용 요약 (Executive Report)</div>
          <p style={{ ...p, marginBottom: 0 }}>
            경영진이 빠르게 확인할 수 있도록 <b>핵심 내용만 간결하게 정리</b>한 탭입니다.
            "예측 모델이 잘 작동하고 있나요?"라는 질문에 바로 답할 수 있는 내용이 담겨 있습니다.
          </p>
        </div>

        <div style={h3}>주요 지표 용어 쉽게 이해하기</div>
        <p style={p}>
          모델 평가에는 여러 가지 수치가 나옵니다. 전부 외울 필요는 없고, 아래 원칙만 기억하세요:
        </p>
        <ul style={ul}>
          <li style={li}><b>MAPE (평균 오차율)</b> — "평균적으로 얼마나 틀렸나". <b>숫자가 작을수록 정확</b>. 15% 이하면 양호</li>
          <li style={li}><b>R² (설명력)</b> — "실제 변동을 얼마나 잘 설명하나". <b>1에 가까울수록 좋음</b>. 0.7 이상이면 양호</li>
          <li style={li}><b>MAE (평균 절대 오차)</b> — "평균적으로 몇 개 차이가 나는가". 예: MAE 50 = 평균 50개 차이</li>
          <li style={li}><b>±5 정확도</b> — 예측과 실제의 차이가 5개 이내인 비율. <b>높을수록 좋음</b></li>
        </ul>
        <div style={tip}>
          <b>💡 핵심:</b> 일반 사용자는 <b>MAPE 수치만 확인</b>하셔도 충분합니다.
          MAPE가 15% 이하이면 "AI 예측이 잘 맞고 있다"고 보시면 됩니다.
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         재고 관리 — 재고 현황
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>📦 재고 관리 — 재고 현황</div>
        <p style={p}>
          우리 회사가 보유한 <b>모든 품목의 재고 상태를 한 화면에서</b> 확인할 수 있는 곳입니다.
          "어떤 품목이 얼마나 있고, 그게 며칠분이며, 부족한지 넘치는지"를 한눈에 볼 수 있습니다.
        </p>

        <div style={h3}>① 요약 카드 (화면 상단)</div>
        <p style={p}>화면 맨 위에 핵심 수치 4개가 카드로 표시됩니다.</p>
        <ul style={ul}>
          <li style={li}><b>전체 SKU 수</b> — 시스템에 등록된 총 품목 수</li>
          <li style={li}><b>총 재고 수량</b> — 모든 품목의 재고 수량 합계</li>
          <li style={li}><b>위험/부족 품목 수</b> — 재고가 안전 기준 이하인 품목이 몇 개인지</li>
          <li style={li}><b>평균 커버리지</b> — 전체 품목의 평균 재고 보유 일수</li>
        </ul>

        <div style={h3}>② 품목 상태 구분</div>
        <p style={p}>각 품목은 재고 상태에 따라 색깔이 다르게 표시됩니다.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {[
            { label: '정상', c: T.green, desc: '재고 충분' },
            { label: '부족', c: T.amber, desc: '안전재고에 근접' },
            { label: '위험', c: T.red, desc: '안전재고 이하' },
            { label: '과잉', c: '#8B5CF6', desc: '필요 이상으로 많음' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.surface2, borderRadius: 6, padding: '4px 10px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.c }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text1 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: T.text3 }}>({s.desc})</span>
            </div>
          ))}
        </div>

        <div style={h3}>③ 재고 유형별 분류 차트</div>
        <p style={p}>
          재고를 <b>종류별로 나누어</b> 원형 차트로 보여줍니다 — 완제품, 반제품, 원재료, 부자재, 포장재, 자산 등.
          어떤 유형의 재고가 얼마나 차지하는지 비율을 한눈에 파악할 수 있습니다.
        </p>

        <div style={h3}>④ 주요 용어 설명</div>
        <ul style={ul}>
          <li style={li}><b>안전재고</b> — "최소한 이만큼은 항상 보유해야 한다"는 기준 수량. 갑작스런 주문 증가에 대비하는 최소 보유량입니다. AI가 과거 주문 변동과 납품 소요 시간을 분석하여 자동으로 계산합니다.</li>
          <li style={li}><b>커버리지 일수</b> — 현재 재고로 <b>앞으로 며칠간 납품이 가능한지</b>를 뜻합니다. 예: 커버리지 15일 = 지금 재고로 15일간 버틸 수 있다. 목표는 보통 21일(약 3주)입니다.</li>
          <li style={li}><b>단가 / 재고금액</b> — 품목의 단위 가격과, 현재 재고의 총 금액(수량 × 단가)을 보여줍니다.</li>
        </ul>

        <div style={h3}>⑤ 검색 및 필터</div>
        <p style={p}>
          품목이 수천~수만 개라도, 원하는 품목을 빠르게 찾을 수 있습니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>검색창</b> — 품목코드, 품목명, 규격 중 아무거나 입력하면 즉시 검색됩니다</li>
          <li style={li}><b>상태 필터</b> — "위험 품목만 보기", "과잉 품목만 보기" 등 원하는 상태만 골라볼 수 있습니다</li>
          <li style={li}><b>유형 필터</b> — 완제품, 원재료 등 특정 유형만 필터링 가능합니다</li>
          <li style={li}><b>고객사·카테고리 필터</b> — 특정 고객사나 제품군만 선택하여 볼 수 있습니다</li>
        </ul>

        <div style={h3}>⑥ 추세 분석</div>
        <p style={p}>
          특정 품목의 재고가 시간이 지나면서 <b>늘고 있는지, 줄고 있는지 흐름</b>을 차트로 보여줍니다.
          재고가 계속 줄어드는 추세라면 미리 발주를 준비해야 합니다.
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         재고 관리 — 리스크 관리
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>📦 재고 관리 — 리스크 관리</div>
        <p style={p}>
          1만 개가 넘는 품목을 일일이 확인할 수는 없습니다. 이 화면에서는 AI가 <b>모든 품목을 자동으로 분석하여,
          위험한 품목만 골라서 "이 품목 조심하세요!"라고 알려줍니다</b>.
          마치 건강검진 결과표처럼, 각 품목에 등급(A~F)을 매겨줍니다.
        </p>

        <div style={h3}>① 위험 등급 체계 (A~F)</div>
        <p style={p}>AI가 0~100점으로 위험 점수를 매기고, 그에 따라 등급을 부여합니다.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { g: 'A', label: '매우 안전', c: '#10B981', desc: '재고 충분, 수요 안정. 특별한 조치 불필요' },
            { g: 'B', label: '안전', c: '#84CC16', desc: '양호한 상태. 정기 모니터링만 하면 됨' },
            { g: 'C', label: '보통', c: '#F59E0B', desc: '일부 주의 요소 있음. 다음 주 계획 시 참고' },
            { g: 'D', label: '주의', c: '#F97316', desc: '위험 요소 감지. 이번 주 안에 대응 검토 필요' },
            { g: 'E', label: '위험', c: '#EF4444', desc: '결품 가능성 높음. 긴급 발주 또는 생산 투입 검토' },
            { g: 'F', label: '긴급', c: '#7C3AED', desc: '즉시 조치 필요. 고객 납기 지연 위험 임박' },
          ].map(item => (
            <div key={item.g} style={{ ...card, padding: '10px 12px', borderLeft: `3px solid ${item.c}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, background: item.c, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{item.g}</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: item.c }}>{item.label}</span>
              </div>
              <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>

        <div style={h3}>② 4가지 위험 유형</div>
        <p style={p}>AI는 4가지 관점에서 위험을 분석합니다. 같은 품목이 여러 위험을 동시에 가질 수도 있습니다.</p>
        <ul style={ul}>
          <li style={li}><span style={badge(T.redSoft, T.red)}>결품 위험</span> 재고가 바닥나서 <b>고객에게 물건을 못 줄</b> 수 있는 상황. 가장 긴급한 위험입니다.</li>
          <li style={li}><span style={badge('#8B5CF620', '#8B5CF6')}>과잉 위험</span> 재고가 필요 이상으로 많아 <b>보관 비용이 낭비</b>되고, 오래되면 폐기해야 할 수 있습니다.</li>
          <li style={li}><span style={badge(T.amberSoft, T.amber)}>납기 위험</span> 납품 기한까지 <b>물건을 맞추기 어려운</b> 상황. 공급업체 리드타임(배송 소요 시간)과 관련됩니다.</li>
          <li style={li}><span style={badge(T.blueSoft, T.blue)}>마진 위험</span> 원자재 가격 상승 등으로 <b>수익이 줄어들</b> 수 있는 상황입니다.</li>
        </ul>

        <div style={h3}>③ 품목 상세 확인</div>
        <p style={p}>
          목록에서 품목을 클릭하면 <b>상세 정보</b>를 볼 수 있습니다:
          현재 재고량, 안전재고, 리드타임(납품 소요일), 담당 고객사, 그리고 AI가 어떤 근거로 이 등급을 매겼는지 점수 분석 내역을 확인할 수 있습니다.
        </p>

        <div style={h3}>④ 검색 및 필터</div>
        <p style={p}>
          위험 유형(결품/과잉/납기/마진), 상태, 심각도(긴급/높음/보통/낮음) 등으로 필터링할 수 있습니다.
          "결품 위험만 보기" 등 원하는 조건을 선택하면 해당 품목만 필터링됩니다.
        </p>

        <div style={warn}>
          <b>⚠️ 권장 조치:</b> E·F 등급 품목은 <b>오늘 중으로</b> 확인하고, D 등급은 <b>이번 주 안에</b> 검토하세요.
          A·B 등급은 별도 조치 없이 정기 모니터링만 하시면 됩니다.
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         최적화 — 생산 권고 (Action Queue)
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🎯 최적화 — 생산 권고</div>
        <p style={p}>
          AI가 수요예측 결과와 현재 재고를 종합 분석하여, <b>"어떤 제품을, 언제, 얼마나 생산해야 하는지"</b>를 구체적으로 제안하는 화면입니다.
          마치 숙련된 생산 관리자가 옆에서 "이건 이만큼 만드세요"라고 조언해 주는 것과 같습니다.
        </p>

        <div style={h3}>① 주차(Plan Week) 선택</div>
        <p style={p}>
          화면 상단에서 <b>어느 주차의 생산 계획</b>을 볼지 선택합니다. 주차를 바꾸면 해당 주에 맞는 생산 권고 목록이 표시됩니다.
        </p>

        <div style={h3}>② 생산 권고 목록 읽기</div>
        <p style={p}>각 권고 항목에는 다음 정보가 표시됩니다:</p>
        <ul style={ul}>
          <li style={li}><b>품목 정보</b> — 품목코드, 품목명, 규격, 카테고리</li>
          <li style={li}><b>추천 생산량</b> — AI가 계산한 최적 생산 수량</li>
          <li style={li}><b>생산 일정</b> — 언제까지 생산을 완료해야 하는지</li>
          <li style={li}><b>우선순위</b> — <span style={badge(T.redSoft, T.red)}>긴급</span> <span style={badge(T.amberSoft, T.amber)}>높음</span> <span style={badge(T.blueSoft, T.blue)}>보통</span> <span style={badge(T.surface2, T.text3)}>낮음</span> 4단계로 표시</li>
        </ul>

        <div style={h3}>③ AI가 이렇게 추천하는 이유</div>
        <p style={p}>
          각 항목을 펼치면 AI가 <b>왜 이 수량을 추천하는지</b> 근거를 보여줍니다:
        </p>
        <ul style={ul}>
          <li style={li}><b>평균 소비량</b> — 최근 이 품목이 주당 평균 얼마나 나갔는지</li>
          <li style={li}><b>미처리 주문</b> — 아직 납품하지 못한 주문이 얼마나 남았는지</li>
          <li style={li}><b>재고 소진 예상일</b> — 지금 재고가 몇 일 후에 바닥나는지</li>
          <li style={li}><b>리드타임</b> — 원자재 조달에 걸리는 시간</li>
          <li style={li}><b>P90 수요 예측</b> — 최대 수요 시나리오 기준 필요 수량</li>
        </ul>

        <div style={h3}>④ 상태(Status) 흐름</div>
        <p style={p}>각 권고는 아래 순서로 진행됩니다:</p>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
          {['초안(Draft)', '승인 대기(Pending)', '승인됨(Approved)', '실행 중(In Progress)', '완료(Completed)'].map((s, i) => (
            <React.Fragment key={s}>
              <span style={{ ...badge(T.blueSoft, T.blue), fontSize: 11 }}>{s}</span>
              {i < 4 && <span style={{ color: T.text3, fontSize: 11 }}>→</span>}
            </React.Fragment>
          ))}
        </div>
        <p style={p}>
          AI가 처음 만든 권고는 "초안" 상태입니다. 담당자가 검토 후 <b>"승인" 버튼</b>을 누르면 생산 계획에 반영됩니다.
          현장 사정에 맞지 않으면 수량을 수정하거나, 메모를 남기고 건너뛸 수 있습니다.
        </p>

        <div style={h3}>⑤ 카테고리별 분포 · 주요 품목 차트</div>
        <p style={p}>
          화면 상단에 <b>카테고리별 분포</b>(원형 차트)와 <b>생산량 상위 품목</b>(막대 차트)이 표시됩니다.
          어떤 제품군에 생산이 집중되어 있는지, 이번 주 가장 많이 생산해야 하는 품목이 무엇인지 한눈에 파악할 수 있습니다.
        </p>

        <div style={h3}>⑥ 필터 · 검색</div>
        <p style={p}>
          상태(초안/승인/실행 등), 우선순위(긴급/높음/보통/낮음), 카테고리별로 필터링할 수 있고,
          품목코드나 품목명으로 검색도 가능합니다.
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         최적화 — 구매 권고
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🎯 최적화 — 구매 권고</div>
        <p style={p}>
          생산에 필요한 원자재·부품을 <b>"언제, 얼마나, 어디서 주문해야 하는지"</b> AI가 자동으로 계산해서 추천하는 화면입니다.
          BOM(부품 구성표 — 제품을 만들기 위해 필요한 부품 목록)을 기반으로, 가장 경제적인 주문 수량까지 알려줍니다.
        </p>

        <div style={h3}>① 구매 권고 목록 읽기</div>
        <p style={p}>각 항목에 다음 정보가 표시됩니다:</p>
        <ul style={ul}>
          <li style={li}><b>부품 정보</b> — 부품코드, 부품명, 규격</li>
          <li style={li}><b>추천 주문 수량</b> — AI가 계산한 최적 주문량</li>
          <li style={li}><b>공급사</b> — 이 부품을 납품하는 업체명. 대체 공급사 정보도 함께 표시됩니다</li>
          <li style={li}><b>리드타임(납품 소요일)</b> — 주문 후 물건이 도착하기까지 걸리는 날수. 예: 14일 = 주문 후 2주 소요</li>
          <li style={li}><b>예상 입고일</b> — 지금 주문하면 언제쯤 도착할지</li>
          <li style={li}><b>주문 금액</b> — 추천 수량 기준 예상 비용 (원/백만원/억원 단위 자동 변환)</li>
        </ul>

        <div style={h3}>② 긴급도 구분</div>
        <p style={p}>각 항목은 긴급도에 따라 색깔이 다르게 표시됩니다. <b>빨간색(긴급)부터 먼저 처리</b>하시면 됩니다.</p>
        <ul style={ul}>
          <li style={li}><span style={badge(T.redSoft, T.red)}>긴급</span> 즉시 발주하지 않으면 생산 차질 발생 가능</li>
          <li style={li}><span style={badge(T.amberSoft, T.amber)}>높음</span> 이번 주 안에 발주 필요</li>
          <li style={li}><span style={badge(T.blueSoft, T.blue)}>보통</span> 예정된 발주 — 일정에 맞춰 처리</li>
          <li style={li}><span style={badge(T.surface2, T.text3)}>낮음</span> 여유 있음 — 다음 주 처리 가능</li>
        </ul>

        <div style={h3}>③ 주요 계산 근거</div>
        <p style={p}>AI는 다음을 종합적으로 고려하여 주문 수량을 결정합니다:</p>
        <ul style={ul}>
          <li style={li}><b>순 소요량</b> — 생산에 필요한 부품 수량에서 현재 재고를 뺀 실제 부족분</li>
          <li style={li}><b>안전재고</b> — 최소 보유해야 하는 기준 수량</li>
          <li style={li}><b>재발주점</b> — "재고가 이 수준 이하로 떨어지면 주문해야 한다"는 기준점</li>
          <li style={li}><b>경제적 주문량(EOQ)</b> — 주문 비용과 보관 비용을 모두 고려한 <b>가장 비용 효율적인 주문 수량</b></li>
        </ul>
        <div style={tip}>
          <b>💡 쉽게 이해하기:</b> EOQ는 "너무 적게 자주 주문하면 배송비가 낭비되고, 너무 많이 한번에 주문하면 보관비가 낭비되니,
          <b>딱 적당한 양</b>을 계산해 주는 것"입니다.
        </div>

        <div style={h3}>④ 상태 흐름 · 공급사 분석</div>
        <p style={p}>
          각 권고는 <b>대기 → 승인 → 발주 → 입고 완료</b> 순서로 진행됩니다.
          화면 상단에는 공급사별 발주 금액 분포 차트도 표시되어, 특정 공급사에 발주가 집중되지 않는지 확인할 수 있습니다.
        </p>

        <div style={h3}>⑤ CSV 내보내기</div>
        <p style={p}>
          구매 권고 목록을 <b>엑셀 파일로 다운로드</b>하여 구매팀에 전달하거나, ERP 시스템에 입력하는 데 활용할 수 있습니다.
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         최적화 — 시나리오 분석
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🎯 최적화 — 시나리오 분석</div>
        <p style={p}>
          <b>"만약 수요가 30% 늘어나면?", "안전재고를 줄이면 비용이 얼마나 절약될까?"</b>
          같은 가정을 직접 설정하고, 그 결과를 미리 확인해 보는 화면입니다.
          실제로 돈을 쓰거나 생산을 바꾸기 전에 <b>"리허설"을 해볼 수 있는 곳</b>이라고 생각하시면 됩니다.
        </p>

        <div style={h3}>3개 탭 구성</div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid ${T.blue}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 6 }}>탭 1: 시나리오 시뮬레이션</div>
          <p style={{ ...p, marginBottom: 4 }}>
            <b>슬라이더(조절 바)</b>를 좌우로 움직여서 다양한 가정을 설정합니다.
          </p>
          <ul style={{ ...ul, marginBottom: 0 }}>
            <li style={li}><b>수요 변동</b> — 수요가 늘거나 줄 때를 가정 (예: +30%, -20%)</li>
            <li style={li}><b>생산량 변동</b> — 생산 능력이 달라질 때를 가정</li>
            <li style={li}><b>안전재고 비율</b> — 안전재고를 늘리거나 줄일 때의 영향</li>
            <li style={li}><b>발주량 변동</b> — 한 번에 주문하는 양을 바꿀 때</li>
            <li style={li}><b>리드타임 변동</b> — 납품 소요 시간이 길어지거나 짧아질 때</li>
          </ul>
        </div>
        <p style={p}>
          슬라이더를 움직이면 바로 아래에 <b>결과 카드</b>가 나타납니다:
          최종 재고량, 재고 부족이 발생하는 주 수, 비용 변화, 납품률 변화 등을 즉시 확인할 수 있습니다.
        </p>
        <div style={tip}>
          <b>💡 활용 예시:</b> "환율 상승으로 원자재 수입이 2주 늦어진다면?" → 리드타임을 +2주로 설정 → 재고 부족이 몇 주간 발생하는지 확인 → 사전에 재고 확보 결정
        </div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid ${T.green}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 6 }}>탭 2: 시나리오 비교</div>
          <p style={{ ...p, marginBottom: 0 }}>
            여러 가정을 <b>저장해 두고 나란히 비교</b>할 수 있습니다.
            예: "현재 유지" vs "수요 30% 증가" vs "안전재고 50% 축소"를 동시에 비교하여
            어떤 전략이 가장 유리한지 판단할 수 있습니다. 방사형(거미줄) 차트로 여러 지표를 한눈에 비교합니다.
          </p>
        </div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid #F59E0B` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B', marginBottom: 6 }}>탭 3: 민감도 분석</div>
          <p style={{ ...p, marginBottom: 0 }}>
            "어떤 요인이 가장 큰 영향을 미치는지" 분석합니다.
            예를 들어, 수요 변동과 리드타임 변동 중 <b>어느 쪽이 재고 비용에 더 큰 영향</b>을 주는지 확인할 수 있습니다.
            영향이 큰 요인에 우선적으로 대응 전략을 세우면 효과적입니다.
          </p>
        </div>

        <div style={h3}>업계 대표 시나리오 프리셋</div>
        <p style={p}>
          슬라이더를 직접 조절하기 어려우시다면, 미리 준비된 <b>업계 대표 시나리오</b>(예: "반도체 슈퍼사이클", "경기 침체", "공급 부족")를
          선택하면 관련 수치가 자동으로 설정됩니다.
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         최적화 — AI 시나리오
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🎯 최적화 — AI 시나리오</div>
        <p style={p}>
          앞의 "시나리오 분석"이 사용자가 직접 수치를 조절하는 것이라면,
          이 화면은 <b>AI가 스스로 다양한 예측 모델을 돌려보고 그 결과를 비교</b>해 주는 곳입니다.
          "어떤 AI 모델이 이 품목을 가장 잘 예측하는가?"를 확인할 수 있습니다.
        </p>

        <div style={h3}>3개 탭 구성</div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid ${T.blue}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 6 }}>탭 1: AI 예측 시뮬레이션</div>
          <p style={{ ...p, marginBottom: 0 }}>
            4개의 AI 모델(Segment Best, LightGBM, SVR, Ridge)을 선택하여 주차별 예측 결과를 시뮬레이션합니다.
            각 모델의 예측값(P10/P50/P90)이 어떻게 다른지 비교할 수 있습니다.
          </p>
        </div>
        <div style={tip}>
          <b>💡 참고:</b> 모델 이름을 외울 필요는 없습니다. 시스템이 자동으로 <b>가장 정확한 모델을 선택</b>하여 사용합니다.
          이 화면은 "혹시 다른 모델이 더 나을까?" 확인하고 싶을 때 사용하는 고급 기능입니다.
        </div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid ${T.green}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 6 }}>탭 2: 모델 비교</div>
          <p style={{ ...p, marginBottom: 0 }}>
            여러 모델의 성능을 <b>방사형(거미줄) 차트</b>로 비교합니다.
            정확도, 안정성, 반응 속도 등 여러 기준으로 어떤 모델이 우수한지 한눈에 파악할 수 있습니다.
          </p>
        </div>

        <div style={{ ...card, padding: '14px 16px', marginBottom: 10, borderLeft: `3px solid #EF4444` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}>탭 3: 리스크 시나리오</div>
          <p style={{ ...p, marginBottom: 0 }}>
            반도체 업계에서 실제 발생할 수 있는 위험 상황(공급 부족, 수출 규제, 경기 침체 등)을
            선택하면, AI가 <b>"이 상황이 오면 우리 재고와 수요에 어떤 영향이 있을지"</b>를 자동으로 분석합니다.
            각 시나리오별 발생 확률과 예상 영향도가 시각화됩니다.
          </p>
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         외부 지표 — 업계 동향
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🌍 외부 지표 — 업계 동향 (뉴스)</div>
        <p style={p}>
          반도체 관련 <b>최신 뉴스와 시장 동향</b>을 한곳에 모아서 보여주는 화면입니다.
          여러 뉴스 사이트를 돌아다닐 필요 없이 이 화면에서 업계 흐름을 파악할 수 있습니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>뉴스 목록</b> — 제목, 출처, 날짜가 표시되며, 클릭하면 원문 기사로 이동합니다</li>
          <li style={li}><b>카테고리 구분</b> — 반도체, AI, 공급망 등 카테고리별로 분류되어 있어 원하는 분야만 필터링 가능</li>
          <li style={li}><b>국내/해외 구분</b> — 국내 뉴스와 해외 뉴스를 탭으로 전환하여 볼 수 있습니다</li>
          <li style={li}><b>핵심 키워드</b> — 각 뉴스에서 중요한 키워드가 자동 추출되어 하이라이트됩니다</li>
          <li style={li}><b>AI 인사이트</b> — AI가 뉴스 내용을 분석하여 "우리 사업에 미치는 영향"을 색깔별로 요약합니다 (긍정/부정/중립)</li>
          <li style={li}><b>관련 영상</b> — 뉴스와 관련된 유튜브 영상이 있으면 함께 표시됩니다</li>
        </ul>
        <div style={tip}>
          <b>💡 활용법:</b> 매일 아침 업계 동향을 5분만 훑어보면, 시장 변화에 빠르게 대응할 수 있습니다.
          AI가 "부정적" 판단한 뉴스가 많아지면 수요 감소를 대비하고, "긍정적" 뉴스가 많으면 생산량 증대를 검토해 보세요.
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         외부 지표 — 반도체 지표
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🌍 외부 지표 — 반도체 산업 지표</div>
        <p style={p}>
          반도체 업계의 <b>핵심 가격 지표</b>를 차트로 보여줍니다.
          이 지표들이 오르내리면 우리 제품의 수요에도 영향을 미치기 때문에, AI가 예측에 자동으로 반영합니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>SOX 지수 (필라델피아 반도체 지수)</b> — 전 세계 반도체 기업 주가를 종합한 지수. <b>반도체 업계 전체의 건강 상태를 보여주는 온도계</b>와 같습니다. 이 지수가 오르면 반도체 업황이 좋아지고 있다는 뜻입니다.</li>
          <li style={li}><b>DRAM 가격</b> — 메모리 반도체의 대표 가격. <b>오르면 수요 증가(공급 부족) 신호</b>, 내리면 수요 감소(공급 과잉) 신호입니다.</li>
          <li style={li}><b>NAND 가격</b> — 저장 메모리(SSD, USB 등에 쓰이는) 가격. DRAM과 비슷한 흐름을 보이지만, 별도로 추적합니다.</li>
        </ul>
        <div style={h3}>차트 보는 법</div>
        <p style={p}>
          시간에 따른 가격 변화가 <b>선 그래프</b>로 표시됩니다. 기간을 선택하여 최근 1개월, 3개월, 6개월, 1년 등 원하는 범위로 조절할 수 있습니다.
          차트 위에 마우스를 올리면 해당 시점의 정확한 수치가 표시됩니다.
        </p>
        <div style={h3}>AI 영향 분석</div>
        <p style={p}>
          각 지표 아래에 AI가 <b>"이 지표가 우리 수요에 어떤 영향을 주는지"</b> 분석 결과를 보여줍니다.
          예: "SOX 지수 상승 시 → 4주 후 수요 5~10% 증가 예상"
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         외부 지표 — 글로벌 수요
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🌍 외부 지표 — 글로벌 수요</div>
        <p style={p}>
          전 세계 경제의 큰 흐름을 보여주는 지표들입니다. 글로벌 경기가 좋으면 반도체 수요도 늘어나고,
          침체되면 줄어드는 경향이 있어 <b>장기적인 수요 방향을 예측하는 데 참고</b>합니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>IPI (산업생산지수)</b> — 공장에서 실제로 물건을 얼마나 만들고 있는지 나타내는 지표. <b>이 숫자가 오르면 "경기가 좋다, 물건이 잘 팔린다"</b>는 뜻입니다.</li>
          <li style={li}><b>PMI (구매관리자지수)</b> — 공장의 구매 담당자들에게 "앞으로 주문이 늘 것 같나요?"라고 물어본 결과. <b>50 이상이면 경기 확장</b>, 50 미만이면 경기 위축 신호입니다.</li>
          <li style={li}><b>HS8541 수입액</b> — 반도체 관련 부품의 실제 수입 금액. <b>직접적인 수요 규모</b>를 파악할 수 있습니다.</li>
        </ul>
        <div style={h3}>AI 상관관계 분석</div>
        <p style={p}>
          이 지표들이 <b>우리 제품 수요와 얼마나 관련 있는지</b>를 AI가 분석합니다.
          예: "PMI가 1포인트 상승하면 → 우리 수요 약 3% 증가 경향"
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         외부 지표 — 환율 / 금리
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🌍 외부 지표 — 환율 · 금리</div>
        <p style={p}>
          <b>원/달러 환율</b>과 <b>한국은행 기준금리</b> 변화를 추적합니다.
          반도체 부품·소재 업계는 원자재 수입 비중이 높아 환율 변동이 원가에 직접 영향을 미칩니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>원/달러 환율</b> — 환율이 오르면(원화 약세) 수입 원자재 비용이 올라갑니다. 반대로 내리면 비용이 줄어듭니다. <b>급격한 변동이 있을 때 구매 시점 조절에 참고</b>하세요.</li>
          <li style={li}><b>기준금리</b> — 한국은행이 정하는 이자율. 금리가 오르면 기업 투자가 위축되고 수요가 줄 수 있으며, 내리면 그 반대입니다. <b>장기적인 경기 방향을 가늠하는 지표</b>입니다.</li>
        </ul>
        <div style={h3}>AI 영향 분석</div>
        <p style={p}>
          환율·금리 변동이 <b>수요예측에 어떤 영향을 주는지</b> AI 분석 결과를 함께 보여줍니다.
          예: "환율 50원 상승 시 → 수입 원자재 비용 약 4% 증가 → 마진 압박 예상"
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         외부 지표 — 물류
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🌍 외부 지표 — 물류</div>
        <p style={p}>
          원자재와 완제품을 운송하는 데 드는 <b>물류 비용</b>을 추적합니다.
          해상 운임이 급등하면 원자재 조달이 비싸지고 납기도 늦어질 수 있습니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>BDI (발틱 건화물 지수)</b> — <b>국제 해상 운송비를 대표하는 지수</b>입니다. 쉽게 말해, "배로 물건을 보내는 비용이 얼마나 비싼지" 보여줍니다. BDI가 오르면 물류비 부담이 커집니다.</li>
          <li style={li}><b>컨테이너 운임</b> — 실제 컨테이너 운송 비용 추이. BDI보다 더 직접적인 물류비 지표입니다.</li>
        </ul>
        <div style={h3}>공급망에 미치는 영향</div>
        <p style={p}>
          물류비가 급등하면: ① 원자재 구매 비용이 올라가고 ② 납품 기간(리드타임)이 길어질 수 있습니다.
          이 화면에서 물류비 추세를 확인하고, 비용이 오르는 추세라면 <b>미리 원자재를 확보해 두는 전략</b>을 검토하세요.
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         외부 지표 — 원자재
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>🌍 외부 지표 — 원자재</div>
        <p style={p}>
          반도체 부품·소재 생산에 사용되는 <b>주요 원자재 가격</b>을 추적합니다.
          원자재 가격이 오르면 생산 원가도 올라가므로, 구매 시점과 재고 전략에 영향을 줍니다.
        </p>
        <ul style={ul}>
          <li style={li}><b>구리 가격</b> — 반도체 패키징, 리드프레임 등에 사용. <b>전자부품 원가의 핵심 원자재</b>입니다.</li>
          <li style={li}><b>WTI 원유 가격</b> — 에너지·수송 비용에 영향. 유가가 오르면 전반적인 제조 비용이 올라갑니다.</li>
          <li style={li}><b>금 가격</b> — 반도체 와이어 본딩 등에 사용. 금값 변동은 고급 부품의 원가에 영향을 줍니다.</li>
        </ul>
        <div style={h3}>원가 관리에 활용하기</div>
        <p style={p}>
          원자재 가격이 상승 추세라면 <b>미리 구매하여 비용을 확정</b>하는 것이 유리하고,
          하락 추세라면 <b>구매를 늦추는 전략</b>이 비용을 절감할 수 있습니다.
          이 화면의 가격 차트를 참고하여 구매 타이밍을 결정하세요.
        </p>
      </div>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         임원 보고서
         ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={sectionBox}>
        <div style={h2}>📋 임원 보고서</div>
        <p style={p}>
          경영진이 빠르게 의사결정할 수 있도록, <b>한 주간의 핵심 데이터를 한 페이지로 자동 정리</b>하는 화면입니다.
          매주 경영진에게 보고할 때 이 페이지를 그대로 인쇄하거나 PDF로 저장하면 됩니다.
        </p>

        <div style={h3}>① 주차 선택</div>
        <p style={p}>
          화면 상단의 드롭다운에서 <b>보고할 주차</b>를 선택합니다.
          선택하면 해당 주의 데이터로 보고서가 자동 생성됩니다.
        </p>

        <div style={h3}>② 주간 핵심 KPI 카드</div>
        <p style={p}>보고서 상단에 6가지 핵심 지표가 카드로 표시됩니다:</p>
        <ul style={ul}>
          <li style={li}><b>주간 수주량</b> — 이번 주에 받은 총 주문 수량</li>
          <li style={li}><b>주간 생산량</b> — 이번 주에 실제 생산한 수량</li>
          <li style={li}><b>주간 수주액</b> — 이번 주 총 주문 금액</li>
          <li style={li}><b>전주 대비 변화율</b> — 지난주와 비교하여 늘었는지 줄었는지 (▲ 증가 / ▼ 감소)</li>
          <li style={li}><b>재고 커버리지</b> — 현재 재고로 며칠간 납품 가능한지</li>
          <li style={li}><b>예측 정확도</b> — 지난주 AI 예측이 실제와 얼마나 맞았는지</li>
        </ul>

        <div style={h3}>③ 주요 품목 순위</div>
        <p style={p}>
          수주량 기준 <b>상위 품목</b>이 순위별로 표시됩니다.
          어떤 제품이 가장 많이 팔리고 있는지 한눈에 파악할 수 있습니다.
        </p>

        <div style={h3}>④ AI 추천 조치 요약</div>
        <p style={p}>
          AI가 이번 주 가장 중요하다고 판단한 <b>조치 사항 TOP 항목</b>이 우선순위·이유와 함께 표시됩니다.
          경영진이 "이번 주 우선 해결할 과제"를 빠르게 파악할 수 있습니다.
        </p>

        <div style={h3}>⑤ 리스크 요약</div>
        <p style={p}>
          전체 품목의 <b>위험 등급 분포</b>를 요약합니다. "E·F 등급이 몇 개, D 등급이 몇 개" 형태로 한눈에 볼 수 있습니다.
        </p>

        <div style={h3}>⑥ AI 분석 서술</div>
        <p style={p}>
          AI가 이번 주 상황을 <b>사람이 읽기 쉬운 문장으로 정리</b>합니다:
          이번 주 요약, 지난주 대비 변화, 주요 위험, 권장 조치 등이 보고서 형식으로 작성됩니다.
        </p>

        <div style={h3}>⑦ 인쇄 · PDF · CSV 내보내기</div>
        <p style={p}>
          화면 우측 상단 버튼으로 <b>인쇄(Print)</b> 또는 <b>PDF 저장</b>이 가능합니다.
          브라우저의 인쇄 기능에서 "PDF로 저장"을 선택하면 파일로 보관할 수 있습니다.
          데이터를 엑셀로 추가 가공하고 싶다면 CSV 내보내기를 사용하세요.
        </p>
        <div style={tip}>
          <b>💡 활용법:</b> 매주 월요일 아침, 임원 보고서를 열어 해당 주차 보고서를 PDF로 저장하세요.
          이전에 엑셀과 파워포인트로 2~3시간 들여 만들던 보고서를 <b>클릭 한 번</b>으로 대체할 수 있습니다.
        </div>
      </div>

      {/* ── 성과를 위한 활용 가이드 ─────────────────────── */}
      <div style={sectionBox}>
        <div style={h2}>🏆 이렇게 활용하면 성과가 달라집니다</div>
        <p style={p}>
          넥스플로AI를 도입하셨다면, 아래 활용법을 따라 해 보세요.<br />
          각 단계별로 기대할 수 있는 효과와 함께 설명드립니다.
        </p>

        {/* ── 1단계: 매일 아침 대시보드 확인 ── */}
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, borderLeft: `4px solid #3B82F6` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#3B82F6', color: '#fff', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>1</span>
            매일 아침, 대시보드부터 확인하세요
          </div>
          <p style={p}>
            출근 후 가장 먼저 <b>대시보드</b>를 열어보세요. 마치 자동차 계기판처럼, 오늘 우리 회사의 핵심 상태를 한눈에 보여줍니다.
          </p>
          <ul style={ul}>
            <li style={li}><b>"구매 발주 필요"</b> 숫자가 빨간색이면 → 지금 당장 주문해야 할 품목이 있다는 뜻</li>
            <li style={li}><b>"긴급 대응 SKU"</b> 숫자가 0이 아니면 → 재고 부족으로 납기 지연 위험이 있다는 신호</li>
            <li style={li}><b>"재고 커버리지"</b>가 21일 미만이면 → 전체적으로 재고가 부족한 상태</li>
          </ul>
          <div style={tip}>
            <b>💡 기대효과:</b> 매일 5분만 투자하면, 이전에는 수시간 걸리던 현황 파악을 즉시 끝낼 수 있습니다.
            문제를 미리 알 수 있으니, 사후 대응이 아닌 <b>사전 대응</b>이 가능해집니다.
          </div>
        </div>

        {/* ── 2단계: 주간 예측으로 생산회의 준비 ── */}
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, borderLeft: `4px solid #8B5CF6` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#8B5CF6', color: '#fff', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>2</span>
            주간 생산회의 전에 "수요예측" 페이지를 열어보세요
          </div>
          <p style={p}>
            매주 생산회의를 하신다면, 회의 전에 <b>주간 예측</b> 페이지에서 주요 품목의 예측값을 확인하세요.
          </p>
          <ul style={ul}>
            <li style={li}><b>중간값(P50)</b>을 기준으로 생산 계획을 세우되, <b>상한(P90)</b>도 함께 확인하세요</li>
            <li style={li}>만약 중간값과 상한의 차이가 크다면, 그 품목은 수요 변동이 크다는 뜻이므로 여유 재고를 좀 더 확보하는 게 안전합니다</li>
            <li style={li}>차트 아래 <b>"리스크 요약"</b> 표에서 빨간색(결품 위험)이 보이면 해당 품목을 우선 논의하세요</li>
          </ul>
          <div style={tip}>
            <b>💡 기대효과:</b> "감"이 아닌 <b>데이터 근거</b>로 회의하니 논의가 빨라지고, 생산회의 준비 시간이 절반 이하로 줄어듭니다.
            엑셀로 수요를 추정하던 시간(주 3~4시간)을 다른 업무에 쓸 수 있습니다.
          </div>
        </div>

        {/* ── 3단계: 리스크 등급 활용 ── */}
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, borderLeft: `4px solid #EF4444` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#EF4444', color: '#fff', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>3</span>
            E·F 등급 품목은 즉시 조치, D 등급은 이번 주 안에 검토하세요
          </div>
          <p style={p}>
            <b>리스크 관리</b> 페이지에서 품목별 위험 등급을 확인하세요.
            AI가 결품(재고 부족), 과잉(재고 넘침), 납기 지연, 마진 악화 등 4가지 위험을 자동으로 점수 매기고 등급을 부여합니다.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ background: T.redSoft, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.red, marginBottom: 4 }}>E·F 등급 (긴급·위험)</div>
              <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}>
                재고 부족으로 고객 납기를 못 맞출 수 있습니다.<br/>
                → <b>오늘 중으로</b> 긴급 발주 또는 생산 투입 검토
              </div>
            </div>
            <div style={{ background: T.amberSoft, borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.amber, marginBottom: 4 }}>C·D 등급 (보통·주의)</div>
              <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}>
                아직 여유가 있지만, 방치하면 위험해질 수 있습니다.<br/>
                → <b>이번 주 안에</b> 생산 계획에 반영 여부 검토
              </div>
            </div>
          </div>
          <div style={tip}>
            <b>💡 기대효과:</b> 1만 개가 넘는 품목을 일일이 확인할 필요 없이, AI가 위험한 것만 골라서 알려줍니다.
            <b>결품(납기 지연) 사고를 사전에 방지</b>하고, 과잉 재고로 인한 불필요한 비용도 줄일 수 있습니다.
          </div>
        </div>

        {/* ── 4단계: AI 생산·구매 권고 활용 ── */}
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, borderLeft: `4px solid #10B981` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#10B981', color: '#fff', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>4</span>
            AI가 제안하는 생산·구매 권고를 검토하고 승인하세요
          </div>
          <p style={p}>
            <b>생산 권고(Action Queue)</b>와 <b>구매 권고(Purchase)</b> 페이지에서 AI가 "이 품목을 얼마나 생산하세요",
            "이 부품을 언제 주문하세요"라고 구체적으로 제안합니다.
          </p>
          <ul style={ul}>
            <li style={li}>각 권고 항목에는 <b>"왜 이렇게 추천하는지"</b> 이유가 함께 표시됩니다 (평균 소비량, 잔여 재고일, 리드타임 등)</li>
            <li style={li}>내용이 맞다면 <b>"승인"</b> 버튼을 눌러 확정하세요. 현장 사정이 다르다면 수량을 수정하거나 건너뛸 수 있습니다</li>
            <li style={li}>구매 권고에서는 <b>긴급도</b>별로 정렬되어 있으니, 빨간색(긴급)부터 처리하시면 됩니다</li>
          </ul>
          <div style={tip}>
            <b>💡 기대효과:</b> 담당자가 품목별로 "얼마나 만들까, 얼마나 주문할까"를 하나하나 계산하던 시간을 <b>80% 이상 절감</b>할 수 있습니다.
            AI가 초안을 만들고, 사람은 검토·승인만 하는 구조입니다.
          </div>
        </div>

        {/* ── 5단계: 시나리오 분석으로 선제 대응 ── */}
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, borderLeft: `4px solid #F59E0B` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#F59E0B', color: '#fff', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>5</span>
            "만약에…" 상황이 궁금할 때, 시나리오 분석을 활용하세요
          </div>
          <p style={p}>
            "수요가 갑자기 30% 늘어나면 우리 재고가 버틸까?", "환율이 급등하면 원자재 비용은 얼마나 올라갈까?"
            같은 질문에 답을 얻을 수 있습니다.
          </p>
          <ul style={ul}>
            <li style={li}><b>시나리오 분석</b> 페이지에서 수요, 생산량, 안전재고 등의 슬라이더를 움직여 가정을 설정하세요</li>
            <li style={li}>설정을 바꾸면 바로 결과가 나옵니다: 재고 부족 주수, 비용 변화, 납품률 변화 등</li>
            <li style={li}>여러 시나리오를 저장해 두고 비교하면, 경영진에게 보고할 때 근거 자료로 활용 가능합니다</li>
          </ul>
          <div style={tip}>
            <b>💡 기대효과:</b> 갑작스러운 시장 변동에도 당황하지 않고, <b>미리 대응 계획을 세워둘 수 있습니다.</b>
            "이런 상황이면 이렇게 하자"는 플랜B를 미리 준비하는 것과 같습니다.
          </div>
        </div>

        {/* ── 6단계: 외부 지표 모니터링 ── */}
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, borderLeft: `4px solid #06B6D4` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#06B6D4', color: '#fff', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>6</span>
            외부 지표로 시장 흐름을 읽으세요
          </div>
          <p style={p}>
            반도체 업계는 환율, 반도체 가격, 원자재 가격 같은 외부 요인에 크게 영향을 받습니다.
            <b>외부 지표</b> 메뉴에서 이런 정보를 한곳에서 확인할 수 있습니다.
          </p>
          <ul style={ul}>
            <li style={li}><b>업계 동향</b>에서 최신 뉴스를 확인하면, 시장이 어디로 움직이는지 감을 잡을 수 있습니다</li>
            <li style={li}><b>반도체 지표</b>에서 DRAM·NAND 가격이 오르고 있다면, 수요 증가를 예상하고 재고를 늘려둘 수 있습니다</li>
            <li style={li}><b>환율</b>이 급변하면, 수입 원자재 비용에 영향이 크므로 구매 시점 조절에 참고하세요</li>
          </ul>
          <div style={tip}>
            <b>💡 기대효과:</b> 여러 사이트를 돌아다니며 뉴스·환율·지표를 확인하던 시간을 절약하고,
            AI가 이 데이터를 예측에 자동 반영하므로 <b>더 정확한 수요예측</b>이 가능합니다.
          </div>
        </div>

        {/* ── 7단계: 임원 보고서 자동화 ── */}
        <div style={{ ...card, padding: '18px 20px', marginBottom: 16, borderLeft: `4px solid #EC4899` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#EC4899', color: '#fff', borderRadius: 20, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>7</span>
            임원 보고서는 AI가 자동으로 만들어 드립니다
          </div>
          <p style={p}>
            매주 경영진에게 보고해야 하는 내용을 <b>임원 보고서</b> 페이지에서 자동으로 생성합니다.
            주간 핵심 지표, 주요 이슈, AI 분석 요약이 한 페이지로 정리되어 나옵니다.
          </p>
          <ul style={ul}>
            <li style={li}>원하는 주차를 선택하면 해당 주의 보고서가 자동 생성됩니다</li>
            <li style={li}>인쇄 또는 PDF 저장이 가능하므로, 바로 보고 자료로 활용할 수 있습니다</li>
            <li style={li}>CSV 내보내기로 엑셀 추가 편집도 가능합니다</li>
          </ul>
          <div style={tip}>
            <b>💡 기대효과:</b> 보고서 작성에 들이던 시간(주 2~3시간)을 <b>거의 0으로</b> 줄일 수 있습니다.
            항상 동일한 형식으로 정리되니, 보고 품질도 일정하게 유지됩니다.
          </div>
        </div>

        {/* ── 종합 성과 요약 ── */}
        <div style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #F0FDF4 50%, #FFF7ED 100%)', borderRadius: 12, padding: '20px 24px', marginBottom: 12, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text1, marginBottom: 14, textAlign: 'center' }}>
            넥스플로AI를 꾸준히 활용하면 기대할 수 있는 변화
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {[
              { icon: '📦', title: '재고 과잉 20% 감소', desc: 'AI 예측 기반 생산으로 불필요한 재고 쌓임 방지' },
              { icon: '⏱️', title: '수작업 분석 80% 절감', desc: '엑셀 수요 추정, 재고 확인 등 반복 업무 자동화' },
              { icon: '📋', title: '보고서 준비 50% 단축', desc: '생산회의 자료·임원 보고서 자동 생성' },
              { icon: '🚨', title: '결품·납기지연 사전 방지', desc: 'AI 리스크 감지로 문제 발생 전에 미리 대응' },
            ].map(item => (
              <div key={item.title} style={{ ...card, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={warn}>
          <b>📌 핵심 포인트:</b> 넥스플로AI는 <b>사람의 판단을 대체하는 것이 아니라, 더 좋은 판단을 하도록 돕는 도구</b>입니다.
          AI가 초안을 만들고, 숫자를 정리하고, 위험을 먼저 알려주면 — 담당자는 경험과 현장 감각을 더해 최종 결정을 내리시면 됩니다.
          꾸준히 활용할수록 AI의 예측이 더 정확해지고, 업무 효율은 점점 높아집니다.
        </div>
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
            파일은 UTF-8 인코딩으로 저장되어 한글이 깨지지 않습니다.
          </p>
        </Accordion>
        <Accordion title="외부 지표(환율, 반도체 가격 등)는 수동으로 입력해야 하나요?">
          <p style={p}>
            아닙니다. 환율, SOX 지수, DRAM·NAND 가격, 원유 가격, 금리 등 <b>30개 이상의 외부 지표가 자동으로 수집</b>됩니다.
            각 데이터 제공처(FRED, 한국은행, 거래소 등)에서 자동으로 가져오며,
            AI 예측에도 자동으로 반영되므로 별도 입력이 필요 없습니다.
          </p>
        </Accordion>
        <Accordion title="리스크 등급(A~F)은 어떤 기준으로 매겨지나요?">
          <p style={p}>
            AI가 결품(재고 부족), 과잉(재고 넘침), 납기 지연, 마진 악화 4가지 관점에서 품목을 분석하여
            0~100점의 위험 점수를 매기고, 점수에 따라 A(매우 안전)~F(긴급) 등급을 부여합니다.
            현재 재고량, 안전재고, 수요 예측, 리드타임(납품 소요일), 가격 변동 등을 종합적으로 고려합니다.
          </p>
        </Accordion>
        <Accordion title="시나리오 분석에서 저장한 시나리오는 다른 사람도 볼 수 있나요?">
          <p style={p}>
            저장한 시나리오는 <b>같은 조직 내 사용자</b>끼리 공유됩니다.
            팀원이 만든 시나리오를 확인하거나 비교 분석에 활용할 수 있습니다.
            생산회의 전에 여러 시나리오를 미리 준비해 두면 논의가 훨씬 수월해집니다.
          </p>
        </Accordion>
        <Accordion title="화면에 표시되는 데이터가 실제 데이터인지 샘플인지 어떻게 구분하나요?">
          <p style={p}>
            각 화면 상단에 데이터 출처 배지가 표시됩니다:<br />
            <b>초록색 "DB"</b> = 실제 데이터베이스에서 가져온 데이터<br />
            <b>주황색 "MOCK"</b> = 샘플(테스트) 데이터<br />
            <b>빨간색 "ERROR"</b> = 데이터 로딩 실패, 관리자에게 문의 필요
          </p>
        </Accordion>
        <Accordion title="모델 평가의 여러 지표 중 어떤 것만 보면 되나요?">
          <p style={p}>
            일반 사용자는 <b>MAPE(평균 오차율)</b> 하나만 확인하셔도 충분합니다.
            MAPE가 15% 이하이면 "AI 예측이 잘 맞고 있다"고 보시면 됩니다.
            더 자세한 분석이 필요한 경우에만 다른 탭(정확도 분석, 과적합 분석 등)을 확인하세요.
          </p>
        </Accordion>
        <Accordion title="구매 권고에서 EOQ(경제적 주문량)란 무엇인가요?">
          <p style={p}>
            너무 적게 자주 주문하면 매번 배송비가 들고, 너무 많이 한 번에 주문하면 보관 비용이 낭비됩니다.
            <b>EOQ는 이 두 가지 비용을 모두 고려하여 "가장 비용이 적게 드는 최적 주문 수량"</b>을 계산한 것입니다.
            AI가 자동으로 계산하므로, 제시된 추천 수량을 참고하시면 됩니다.
          </p>
        </Accordion>
        <Accordion title="임원 보고서를 PDF로 저장하려면 어떻게 하나요?">
          <p style={p}>
            임원 보고서 화면에서 <b>인쇄 버튼</b>을 클릭한 뒤, 프린터 선택에서 <b>"PDF로 저장"</b>을 선택하세요.
            (브라우저에 따라 "Microsoft Print to PDF" 또는 "다른 이름으로 저장" 등의 옵션이 있습니다.)
            PDF 파일이 다운로드되어 이메일 첨부나 보관에 바로 활용할 수 있습니다.
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
