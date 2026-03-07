# 대시보드 실데이터 연동 계획서

> **작성자**: 김다솜 (dev/dasom)
> **작성일**: 2026-03-07
> **담당 페이지**: 로그인, 대시보드, 관리자 페이지

---

## 1. 전체 데이터 흐름

```
[DB 실데이터]       →    [ML 파이프라인]    →    [예측/리스크 테이블]    →    [대시보드]
daily_revenue             (LightGBM 등)           forecast_result              차트·KPI
daily_order                                        risk_score
inventory                                          action_queue

[DB 실데이터]       →    [/api/dashboard]   →    [대시보드]
daily_revenue             (서버 쿼리)              매출 실적 차트     ← 지금 바로 가능
inventory                                          재고 KPI
purchase_order                                     발주 KPI

[DB 예측결과]       →    [GPT API 호출]     →    [AI 인사이트 텍스트]
forecast_result                                                         ← ML + AI 완료 후
risk_score
action_queue
```

---

## 2. 대시보드 구성 vs 연결 DB 테이블

| 대시보드 영역 | 현재 상태 | 연결할 DB 테이블 | 데이터 존재 여부 | 작업 시점 |
|---|---|---|---|---|
| 매출 실적 차트 | 하드코딩 | `daily_revenue` (월별 합계) | ✅ ~100,000행 | **지금 바로** |
| 재고 커버리지 KPI | 하드코딩 | `inventory` (최신 스냅샷) | ✅ ~105,000행 | **지금 바로** |
| 구매 발주 KPI | 하드코딩 | `purchase_order` (미입고) | ✅ ~65,000행 | **지금 바로** |
| 매출 예측 밴드 (P10/P50/P90) | 하드코딩 | `forecast_result` | ⚠️ ML 실행 필요 | ML 완료 후 |
| 위험 품목 도넛 (A~F) | 하드코딩 | `risk_score` | ⚠️ ML 실행 필요 | ML 완료 후 |
| AI 생산 권고 3건 | 하드코딩 | `action_queue` | ⚠️ ML 실행 필요 | ML 완료 후 |
| AI 인사이트 텍스트 | 하드코딩 | GPT API + 위 테이블들 | ⚠️ ML + AI 연동 필요 | ML + AI 완료 후 |

---

## 3. ML 파이프라인 의존 관계

### 지금 바로 연동 가능한 테이블

| 테이블 | 행 수 | 활용 목적 | 쿼리 방향 |
|---|---|---|---|
| `daily_revenue` | ~100,000 | 월별 매출 실적 차트 | `GROUP BY MONTH` 합계 |
| `inventory` | ~105,000 | 전체 재고량 KPI | `MAX(snapshot_date)` 기준 합계 |
| `purchase_order` | ~65,000 | 미처리 발주 건수 KPI | `status = 미입고` 카운트 |

### ML 파이프라인 실행 후 연동할 테이블

| 테이블 | 생성 주체 | 대시보드 활용 | 비고 |
|---|---|---|---|
| `forecast_result` | LightGBM 예측 모델 | 월별 P10/P50/P90 예측 밴드 차트 | 전체 합산 기준 필요 |
| `risk_score` | 리스크 스코어링 모델 | A~F 등급별 SKU 수 도넛 차트 | 최신 날짜 기준 |
| `action_queue` | 권고 생성 파이프라인 | 미처리 상위 3건 카드 | status = '미처리' 기준 |

---

## 4. AI 인사이트 연동 방식

### 흐름
```
대시보드 로드
  → /api/ai-insights 호출 (서버)
  → DB에서 핵심 수치 조회 (매출, 재고, 위험건수, 예측값)
  → OpenAI GPT API에 프롬프트 전송
      "다음 데이터를 보고 경영진 보고용 인사이트 5줄을 작성해줘: ..."
  → GPT 응답 텍스트 → 화면에 표시
```

### 필요 조건

| 항목 | 상태 | 비고 |
|---|---|---|
| `OPENAI_API_KEY` | ✅ `.env`에 존재 | `sk-proj-...` |
| `forecast_result` 데이터 | ⚠️ ML 완료 후 | 예측 수치 없으면 AI 인사이트 품질 저하 |
| `risk_score` 데이터 | ⚠️ ML 완료 후 | 위험 현황 없으면 인사이트 의미 없음 |

> **결론**: AI 인사이트는 ML 파이프라인이 완료된 이후에 작업 예정

---

## 5. ML/데이터 개발자에게 요청할 내용

> 아래 내용을 슬랙 또는 GitHub Issue로 전달해주세요.

---

### 📌 요청 1 — `forecast_result` 테이블 컬럼 요청

**목적**: 대시보드 매출 예측 밴드 차트 (P10/P50/P90)

| 컬럼명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `target_month` | DATE | 예측 대상 월 (월 첫째날) | `2025-03-01` |
| `product_id` | VARCHAR | 제품 코드 (전체 합산은 NULL) | `NULL` |
| `p10` | NUMERIC | 보수 예측값 (백만원) | `5200` |
| `p50` | NUMERIC | 기준 예측값 (백만원) | `6300` |
| `p90` | NUMERIC | 낙관 예측값 (백만원) | `7800` |
| `created_at` | TIMESTAMPTZ | 예측 생성 일시 | `2026-03-07 09:00:00` |

**프론트 요구사항**:
- 전체 합산 기준 (`product_id = NULL` 또는 별도 집계 컬럼)으로 최근 15개월치 필요
- 이미 지난 달은 실적(`daily_revenue`)과 비교 표시 예정

---

### 📌 요청 2 — `risk_score` 테이블 컬럼 요청

**목적**: 대시보드 위험 품목 도넛 차트 (A~F 등급별 SKU 수)

| 컬럼명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `product_id` | VARCHAR | 제품 코드 | `SKU-0421` |
| `score_date` | DATE | 스코어 산출일 | `2026-03-07` |
| `risk_grade` | VARCHAR(1) | 위험 등급 | `E` |
| `risk_score` | NUMERIC | 0~100 점수 | `87` |
| `risk_type` | VARCHAR | 위험 유형 | `결품` |

**프론트 요구사항**:
- 대시보드는 **최신 `score_date` 기준** 등급별 SKU 수만 필요
- 등급은 A/B/C/D/E/F 6단계로 고정

---

### 📌 요청 3 — `action_queue` 테이블 컬럼 요청

**목적**: 대시보드 AI 생산 권고 카드 (상위 3건 표시)

| 컬럼명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `product_id` | VARCHAR | 제품 코드 | `SKU-0421` |
| `product_name` | VARCHAR | 제품명 | `A타입 반도체 커넥터` |
| `priority` | VARCHAR | 우선순위 | `HIGH` / `MED` / `LOW` |
| `action_type` | VARCHAR | 권고 유형 | `생산 증량 권고` |
| `detail` | VARCHAR | 상세 내용 | `3,000EA → 4,200EA` |
| `impact` | VARCHAR | 기대 효과 | `납기준수율 +12%p` |
| `deadline` | VARCHAR | 처리 기한 | `W03 마감` |
| `risk_type` | VARCHAR | 리스크 유형 | `결품` |
| `status` | VARCHAR | 처리 상태 | `미처리` / `검토중` / `완료` |
| `created_at` | TIMESTAMPTZ | 생성 일시 | |

**프론트 요구사항**:
- `status = '미처리'` + `priority = 'HIGH'` 순으로 정렬해서 상위 3건 표시
- `status` 업데이트 기능 대시보드에서 구현 예정 (승인/반려)

---

## 6. 개발 단계별 일정

| 단계 | 작업 내용 | 선행 조건 | 담당 |
|---|---|---|---|
| **Phase 1** | 매출 실적·재고·발주 KPI 연동 | 없음 (DB 실데이터 있음) | 김다솜 |
| **Phase 2** | 관리자 페이지 실데이터 연동 | 없음 | 김다솜 |
| **Phase 3** | 예측 밴드·위험 도넛·생산 권고 연동 | ML 파이프라인 완료 | 김다솜 + ML 팀 |
| **Phase 4** | AI 인사이트 자동 생성 (GPT) | Phase 3 완료 | 김다솜 |

---

*문의: dasom@company.com / dev/dasom 브랜치*
