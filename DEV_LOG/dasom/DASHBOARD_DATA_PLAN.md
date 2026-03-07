# 대시보드 실데이터 연동 계획서

> **작성자**: 김다솜 (dev/dasom)
> **최초 작성**: 2026-03-07
> **용도**: 데이터/ML 팀 전달용 — 대시보드 연동에 필요한 DB 테이블 스펙 및 현황 정리

---

## 1. 전체 데이터 흐름

```
[DB 실데이터]       →    /api/dashboard    →    대시보드
daily_revenue             (서버 쿼리)              매출 실적 차트     ← 완료
inventory                                          재고 KPI           ← 완료
purchase_order                                     발주 KPI           ← 완료

[ML 파이프라인]     →    DB 적재           →    대시보드
LightGBM 예측             forecast_result          매출 예측 밴드     ← ML 완료 후
리스크 스코어링            risk_score               위험 도넛 차트     ← ML 완료 후
권고 생성                  action_queue             AI 생산 권고       ← ML 완료 후

[DB 예측결과]       →    GPT API           →    AI 인사이트 텍스트  ← ML + AI 완료 후
```

---

## 2. 현황 — 연동 완료 vs 대기 중

| 대시보드 영역 | 상태 | 연결 테이블 | 비고 |
|---|---|---|---|
| 매출 실적 차트 (실선) | ✅ 완료 | `daily_revenue` | 월별 합계, 백만원 단위 |
| 재고 커버리지 KPI | ✅ 완료 | `inventory` | 최신 스냅샷 기준 |
| 구매 발주 KPI | ✅ 완료 | `purchase_order` | 미처리 건수 |
| 매출 예측 밴드 (P10/P50/P90) | ⏳ ML 대기 | `forecast_result` | ML 실행 결과 필요 |
| 위험 품목 도넛 (A~F 등급) | ⏳ ML 대기 | `risk_score` | ML 실행 결과 필요 |
| AI 생산 권고 카드 | ⏳ ML 대기 | `action_queue` | ML 파이프라인 결과물 |
| AI 인사이트 텍스트 | ⏳ ML + AI 대기 | 위 3개 + GPT API | ML 완료 후 작업 |

---

## 3. ML 팀 요청 사항 — 테이블 컬럼 스펙

### 요청 1 — `forecast_result` 테이블

**목적**: 대시보드 매출 예측 밴드 차트 (점선 P10/P50/P90)

| 컬럼명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `target_month` | DATE | 예측 대상 월 (월 첫째날) | `2025-03-01` |
| `product_id` | VARCHAR | 제품 코드 (전체 합산은 NULL) | `NULL` |
| `p10` | NUMERIC | 보수 예측값 (백만원) | `5200` |
| `p50` | NUMERIC | 기준 예측값 (백만원) | `6300` |
| `p90` | NUMERIC | 낙관 예측값 (백만원) | `7800` |
| `created_at` | TIMESTAMPTZ | 예측 생성 일시 | `2026-03-07 09:00:00` |

**프론트 요구사항**
- 전체 합산 기준 (`product_id = NULL` 또는 별도 집계 컬럼)으로 최근 15개월치 필요
- 이미 지난 달은 `daily_revenue` 실적과 함께 차트에 표시

---

### 요청 2 — `risk_score` 테이블

**목적**: 대시보드 위험 품목 도넛 차트 (A~F 등급별 SKU 수)

| 컬럼명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `product_id` | VARCHAR | 제품 코드 | `SKU-0421` |
| `score_date` | DATE | 스코어 산출일 | `2026-03-07` |
| `risk_grade` | VARCHAR(1) | 위험 등급 (A~F) | `E` |
| `risk_score` | NUMERIC | 0~100 점수 | `87` |
| `risk_type` | VARCHAR | 위험 유형 | `결품` |

**프론트 요구사항**
- 최신 `score_date` 기준 등급별 SKU 수만 필요
- 등급은 A/B/C/D/E/F 6단계 고정

---

### 요청 3 — `action_queue` 테이블

**목적**: 대시보드 AI 생산 권고 카드 (상위 3건), 액션큐 페이지 전체 목록

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

**프론트 요구사항**
- 대시보드: `status = '미처리'` + `priority = 'HIGH'` 순 정렬, 상위 3건만 표시
- 액션큐 페이지: 전체 목록, `status` 업데이트(승인/반려) 기능 예정

---

## 4. AI 인사이트 연동 조건

| 항목 | 상태 |
|---|---|
| `OPENAI_API_KEY` | ✅ `.env`에 존재 |
| `forecast_result` 데이터 | ⏳ ML 완료 후 |
| `risk_score` 데이터 | ⏳ ML 완료 후 |

ML 파이프라인 완료 후 `/api/ai-insights` 엔드포인트를 추가하여 DB 핵심 수치 → GPT 프롬프트 → 인사이트 텍스트 자동 생성 예정.

---

*문의: rusia0567@naver.com / dev/dasom 브랜치*
