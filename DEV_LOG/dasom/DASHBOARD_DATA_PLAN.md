# 대시보드 실데이터 연동 현황 및 계획서

> **작성자**: 김다솜 (dev/dasom)
> **최초 작성**: 2026-03-07
> **최종 업데이트**: 2026-03-09
> **용도**: 팀 공유 — 대시보드 구역별 실데이터 연동 현황 및 ML 팀 요청 사항 정리

---

## 0. 핵심 요약

> **현재 대시보드의 실데이터 연동 현황**

| 구분 | 실데이터 여부 | 이유 |
|------|:---:|------|
| 수주량 차트 실적선 | ✅ **실데이터** | `daily_order` ~65,000행 연동 완료 |
| 재고 커버리지 KPI | ✅ **실데이터** | `inventory` ~105,000행 + `daily_order` 연동 완료 |
| 구매 발주 KPI | ✅ **실데이터** | `purchase_order` ~65,000행 연동 완료 |
| 예측 밴드 (P10/P50/P90) | ❌ **목업** | `forecast_result` 테이블 비어 있음 — ML 미실행 |
| 위험 도넛 차트 | ❌ **목업** | `risk_score` 테이블 비어 있음 — ML 미실행 |
| AI 생산 권고 카드 | ❌ **목업** | `action_queue` 테이블 비어 있음 — ML 미실행 |
| AI 생산 권고 KPI | ❌ **목업** | `action_queue` 비어 있어 Mock fallback |
| 긴급 대응 SKU KPI | ❌ **목업** | `risk_score` 비어 있어 Mock fallback |
| AI 인사이트 요약 | ❌ **하드코딩** | Phase 4 GPT 연동 예정, 현재 고정 텍스트 |

**결론**: 실데이터 3개 항목, 목업 6개 항목. 목업 6개는 모두 ML 파이프라인 미실행이 원인.
코드는 준비 완료 — ML 팀이 해당 테이블에 데이터를 적재하면 **자동으로 실데이터로 전환**됨.

---

## 1. 전체 데이터 흐름

```
[DB 실데이터 — 현재 연동 완료]
daily_order    (~65,000행)  →  /api/dashboard  →  수주량 추이 차트 (실적선)   ✅
inventory      (~105,000행) →  /api/dashboard  →  재고 커버리지 KPI           ✅
purchase_order (~65,000행)  →  /api/dashboard  →  구매 발주 KPI               ✅

[ML 파이프라인 — 미실행, 테이블 비어 있음]
LightGBM 예측  →  forecast_result  →  예측 밴드 차트 (P10/P50/P90)    ❌ 목업
리스크 스코어링 →  risk_score      →  위험 도넛 차트 + 긴급 SKU KPI   ❌ 목업
권고 생성      →  action_queue     →  AI 생산 권고 카드 + KPI          ❌ 목업

[Phase 4 — GPT 자동 생성]
forecast_result + risk_score  →  OpenAI API  →  AI 인사이트 텍스트    ❌ 하드코딩
```

---

## 2. 구역별 상세 현황

### 2-1. 수주량 추이 차트 ✅ 실데이터

| 항목 | 내용 |
|------|------|
| **연동 테이블** | `daily_order` |
| **사용 컬럼** | `order_date`, `order_qty` |
| **집계 방식** | 최근 15개월, 월별 SUM |
| **단위** | EA (수량) |
| **이전 상태** | `daily_revenue` (매출=후행지표) 사용 |
| **변경 이유** | 생산계획팀에게 수주량(선행지표)이 더 직접적인 의사결정 근거 |
| **상태** | ✅ DB 실데이터 연동 완료 |
| **목업 부분** | 예측 밴드(P10/P50/P90) — `forecast_result` 비어 있어 `ORDER_FORECAST` 상수로 대체 중 |

**API 응답 예시**
```json
"orderActual": [
  { "ym": "2024-12", "m": "'24.12", "actual": 62300 },
  { "ym": "2025-01", "m": "'25.01", "actual": 58910 }
]
```

---

### 2-2. 재고 커버리지 KPI ✅ 실데이터

| 항목 | 내용 |
|------|------|
| **연동 테이블** | `inventory`, `daily_order` |
| **사용 컬럼** | `inventory.inventory_qty`, `inventory.snapshot_date`, `daily_order.order_qty` |
| **산출식** | 최신 스냅샷 전체 재고량 ÷ (최근 30일 수주량 합계 ÷ 30일) |
| **상태 기준** | ≥21일: 달성 / 14~20일: 관찰 / <14일: 위험 |
| **상태** | ✅ DB 실데이터 연동 완료 |

> **변경 사항**: 이전에는 `daily_revenue.quantity`(출하 기준) 기반으로 커버리지 계산 → 현재 `daily_order.order_qty`(수주 기준)으로 변경. 수주가 생산 투입의 직접 입력이므로 더 정확.

---

### 2-3. 구매 발주 KPI ✅ 실데이터

| 항목 | 내용 |
|------|------|
| **연동 테이블** | `purchase_order` |
| **사용 컬럼** | `status` |
| **집계 조건** | `status IN ('R', 'P')` — 미입고(R) + 처리중(P) |
| **상태 기준** | 0건: 달성 / 1~3건: 관찰 / 4건 이상: 위험 |
| **상태** | ✅ DB 실데이터 연동 완료 |

---

### 2-4. 예측 밴드 차트 (P10/P50/P90) ❌ 목업

| 항목 | 내용 |
|------|------|
| **목표 테이블** | `forecast_result` |
| **현재 상태** | 테이블 존재하나 **데이터 없음** (ML 미실행) |
| **현재 처리** | `ORDER_FORECAST` 상수(하드코딩)로 대체 표시 |
| **UI 표시** | 예측 밴드 점선으로 표시 (데이터는 가짜) |
| **전환 조건** | ML 팀이 `forecast_result`에 데이터 적재 시 자동 전환 |

**ML 팀 요청 — `forecast_result` 테이블 적재 스펙**

| 컬럼명 | 타입 | 설명 | 필수 |
|--------|------|------|:----:|
| `model_id` | VARCHAR(50) | 모델 식별자 (예: `lgbm_q_v1`) | ✅ |
| `product_id` | VARCHAR(20) | 제품 코드 / 전체 합산은 `'ALL'` 또는 별도 집계 | ✅ |
| `forecast_date` | DATE | 예측 실행일 | ✅ |
| `target_date` | DATE | 예측 대상일 (월 첫째날 권장) | ✅ |
| `horizon_days` | INT | 예측 지평 (30 고정) | ✅ |
| `p10` | NUMERIC | 보수 예측값 (EA) | ✅ |
| `p50` | NUMERIC | 기준 예측값 (EA) | ✅ |
| `p90` | NUMERIC | 낙관 예측값 (EA) | ✅ |

> **프론트 요구**: 전체 합산 기준 최근 15개월치. 대시보드 차트 X축은 `'YY.MM` 형식으로 자동 변환됨.

---

### 2-5. 위험 도넛 차트 ❌ 목업

| 항목 | 내용 |
|------|------|
| **목표 테이블** | `risk_score` |
| **현재 상태** | 테이블 존재하나 **데이터 없음** (ML 미실행) |
| **현재 처리** | `RISK_DONUT` 상수 (A:187, B:143, C:89, D:45, E:28, F:12 하드코딩) |
| **전환 조건** | ML 팀이 `risk_score`에 데이터 적재 시 자동 전환 |

**연동 쿼리 (현재 route.ts에 구현 완료 — 데이터만 기다리는 중)**
```sql
SELECT risk_grade, COUNT(*) as count
FROM risk_score
WHERE eval_date = (SELECT MAX(eval_date) FROM risk_score)
GROUP BY risk_grade
ORDER BY risk_grade;
```

**ML 팀 요청 — `risk_score` 테이블 적재 스펙**

| 컬럼명 | 타입 | 설명 | 필수 |
|--------|------|------|:----:|
| `product_id` | VARCHAR(20) | 제품 코드 | ✅ |
| `eval_date` | DATE | 평가일 | ✅ |
| `risk_grade` | VARCHAR(1) | A / B / C / D / E / F | ✅ |
| `total_risk` | NUMERIC(5,2) | 0~100 종합 점수 | ✅ |
| `stockout_risk` | NUMERIC(5,2) | 결품 리스크 점수 | 권고 |
| `excess_risk` | NUMERIC(5,2) | 과잉 리스크 점수 | 권고 |
| `delivery_risk` | NUMERIC(5,2) | 납기 리스크 점수 | 권고 |

---

### 2-6. AI 생산 권고 카드 + KPI ❌ 목업

| 항목 | 내용 |
|------|------|
| **목표 테이블** | `action_queue` |
| **현재 상태** | 테이블 존재하나 **데이터 없음** (ML 미실행) |
| **현재 처리** | `ACTION_ITEMS_FULL` 상수 상위 3건 (하드코딩) |
| **전환 조건** | ML 팀이 `action_queue`에 데이터 적재 시 자동 전환 |

**연동 쿼리 (현재 route.ts에 구현 완료 — 데이터만 기다리는 중)**
```sql
SELECT id, product_id, risk_type, severity, action_type, description, suggested_qty, eval_date
FROM action_queue
WHERE status = 'pending'
  AND severity IN ('critical', 'high', 'medium')
ORDER BY severity ASC
LIMIT 3;
```

**ML 팀 요청 — `action_queue` 테이블 적재 스펙**

| 컬럼명 | 타입 | 설명 | 예시 | 필수 |
|--------|------|------|------|:----:|
| `product_id` | VARCHAR(20) | 제품 코드 | `SKU-0421` | ✅ |
| `eval_date` | DATE | 평가일 | `2026-03-09` | ✅ |
| `risk_type` | VARCHAR(20) | 위험 유형 | `stockout` / `excess` / `delivery` / `margin` | ✅ |
| `severity` | VARCHAR(10) | 심각도 | `critical` / `high` / `medium` / `low` | ✅ |
| `action_type` | VARCHAR(30) | 권고 유형 | `increase_production` / `expedite_po` / `reduce_order` / `adjust_price` | ✅ |
| `description` | TEXT | 권고 상세 내용 | `3,000EA → 4,200EA 증산 권고` | ✅ |
| `suggested_qty` | NUMERIC | 권고 수량 | `4200` | 권고 |
| `status` | VARCHAR(15) | 처리 상태 | `pending` (초기값) | ✅ |

> **severity 값 주의**: `HIGH` / `MED` / `LOW` 아님. 반드시 소문자 `critical` / `high` / `medium` / `low` 사용.

---

### 2-7. AI 인사이트 요약 ❌ 하드코딩

| 항목 | 내용 |
|------|------|
| **현재 상태** | 5개 문장 완전 하드코딩 |
| **전환 방법** | ML 완료 후 `/api/ai-insights` 엔드포인트 추가, OpenAI API로 자동 생성 |
| **필요 선행 조건** | `forecast_result` + `risk_score` 데이터 적재 완료 |

---

## 3. 구현 완료 사항 (2026-03-09)

### API — `/api/dashboard` (route.ts)

```
쿼리 1: daily_order     → 월별 수주량 집계 (최근 15개월)
쿼리 2: inventory       → 최신 스냅샷 전체 재고량 합산
쿼리 3: daily_order     → 최근 30일 수주량 (재고 커버리지 분모)
쿼리 4: purchase_order  → 미처리 PO 건수 (status R/P)
쿼리 5: risk_score      → 최신 eval_date 기준 등급별 COUNT (빈 배열 반환 시 프론트 Mock 사용)
쿼리 6: action_queue    → pending + severity 높은 순 Top3 (빈 배열 반환 시 프론트 Mock 사용)
```

### 프론트 — Dashboard.tsx

- 수주량 차트: DB 실적 있으면 실데이터, 없으면 `ORDER_FORECAST` Mock
- 위험 도넛: DB `riskGrades` 있으면 실데이터, 없으면 `RISK_DONUT` Mock + `샘플` 배지 표시
- AI 권고카드: DB `actionItems` 있으면 실데이터, 없으면 `ACTION_ITEMS_FULL` Mock + `샘플` 배지 표시
- KPI 재고/발주: DB 실데이터 (항상)
- KPI AI권고/긴급SKU: DB 데이터 있으면 실수치, 없으면 Mock 유지

---

## 4. ML 팀 액션 아이템 (목업 → 실데이터 전환 조건)

| 우선순위 | 테이블 | 적재 내용 | 전환되는 UI 영역 |
|:---:|------|------|------|
| 1 | `risk_score` | 제품별 일일 리스크 등급 (A~F) | 위험 도넛 차트 + 긴급 SKU KPI |
| 2 | `action_queue` | 리스크 기반 권고 조치 | AI 생산 권고 카드 + AI권고 KPI |
| 3 | `forecast_result` | 월별 수주량 P10/P50/P90 | 차트 예측 밴드 |
| 4 | (GPT 연동) | Phase 4 | AI 인사이트 요약 |

> ML 팀이 위 테이블에 데이터를 적재하면 **프론트/API 코드 수정 없이** 자동으로 실데이터로 전환됩니다.
> 쿼리는 이미 route.ts에 구현되어 있고, 프론트도 실데이터 우선, Mock 후순위로 처리합니다.

---

## 5. 목업 항목이 목업인 이유 (명확화)

| 항목 | 목업인 이유 | 해결 주체 |
|------|------|------|
| 예측 밴드 (P10/P50/P90) | `forecast_result` 테이블이 DDL만 존재, 행 수 0 | ML 팀 |
| 위험 도넛 차트 | `risk_score` 테이블이 DDL만 존재, 행 수 0 | ML 팀 |
| AI 생산 권고 카드 | `action_queue` 테이블이 DDL만 존재, 행 수 0 | ML 팀 |
| AI 생산 권고 KPI | action_queue 비어있어 Mock count 사용 | ML 팀 |
| 긴급 대응 SKU KPI | risk_score 비어있어 Mock count 사용 | ML 팀 |
| AI 인사이트 텍스트 | GPT 연동 Phase 4 예정 | 다솜 (ML 완료 후) |

> 위 항목들은 **코드 문제가 아님**. 현재 `/api/dashboard`는 해당 테이블을 정상적으로 쿼리하고 있음.
> 테이블이 비어 있기 때문에 빈 결과를 받고, 프론트에서 빈 결과 감지 시 Mock으로 fallback 처리.

---

*문의: rusia0567@naver.com / dev/dasom 브랜치*
