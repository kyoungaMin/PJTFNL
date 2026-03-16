# 개발일지 2026-03-16 — 안전재고 산출 로직 전면 개선

> 작성자: SKKim (boy02men@gmail.com)
> 프로젝트: Project_Clockwise / forecastai

---

## 작업 목표

- 재고 현황 페이지의 안전재고 수치가 현재고 대비 10~100배 과대 산출되는 문제 원인 파악 및 수정
- 안전재고 공식을 업계 표준(Z-score 기반)으로 교체
- API 레이어의 날짜 필터 로직 개선

---

## 근본 원인 분석 (2건)

### 원인 1 — 수요 계산 분모 오류 (핵심)

```python
# 기존 (오류): 수주 발생일 수로 나눔
avg_demand = total_qty / len(order_days)   # 예: 30,000 / 5 = 6,000/일

# 수정 후: lookback 전체 기간(90일)으로 나눔
avg_demand = total_qty / lookback_days     # 예: 30,000 / 90 = 333/일
```

제품이 90일 중 5일만 수주됐을 경우 분모가 5가 되어 실제보다 18배 과대 계산되는 구조적 오류.
std_demand도 zero-demand 일수를 포함한 전체 분산으로 재산출.

### 원인 2 — 안전재고 공식의 이상치 취약성

```python
# 기존: P90 납기 × 일평균 수요 (이상치에 취약)
safety_stock = lead_p90 * avg_demand

# 수정 후: Z-score 기반 표준 공식 (95% 서비스 수준)
# Z × √(lead_avg × σ_demand² + avg_demand² × σ_lead²)
safety_stock = 1.65 * math.sqrt(
    lead_avg * (std_demand ** 2) + (avg_demand ** 2) * (std_lead ** 2)
)
```

P90 납기를 그대로 곱하면 납기 이상치가 선형으로 증폭됨.
새 공식은 수요 변동성(σ_demand)과 납기 변동성(σ_lead)을 분리해 제곱근 하에서 합산.

### 원인 3 — API 날짜 필터 로직 오류

```typescript
// 기존: 선택 월 이전의 가장 최근 risk_score만 조회 → 3월 계산값이 2월 뷰에서 무시됨
.lte('eval_date', '2026-02-28')

// 수정 후: 항상 최신 monthly 평가 사용
// (안전재고 = 현재 파라미터 기준 최소 보유량이므로 월 필터 불필요)
SELECT eval_date FROM risk_score WHERE eval_type='monthly'
ORDER BY eval_date DESC LIMIT 1
```

---

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `DB/07_pipeline/s5_risk_score.py` | `_compute_demand()` 분모 수정 + Z-score 공식 적용 + σ_lead 직접 계산 |
| `DB/07_pipeline/s7_production_plan.py` | `load_daily_demand()` 분모 수정 + Z-score 공식 적용 + σ_lead P90 역산 |
| `DB/07_pipeline/s8_purchase_optimization.py` | `load_lead_times()` σ_lead 추가 + Z-score 공식 적용 |
| `forecastai/src/app/api/inventory/route.ts` | `resolveMonthlyRiskDate()` 날짜 필터 제거 → 항상 최신 사용 |

---

## 파이프라인 재실행 결과

```
[S5] monthly 2026-03-16: 13,292건
등급 분포: {'A': 10286, 'B': 1842, 'C': 1112, 'D': 52}
(E, F 등급 완전히 소멸 — 과대 안전재고로 인한 허위 위험 신호 제거)
```

---

## 개선 효과 (주요 품목)

| 품목 | 구 안전재고 | 신 안전재고 | 감소율 |
|------|-----------|-----------|--------|
| AS-007[R1] | 81,713 EA | 4,668 EA | -94% |
| BOLT COATING | 229,067 EA | 19,855 EA | -91% |
| [SDC] AS-216 | 103,936 EA | 4,831 EA | -95% |
| FILLER CARPLEX 1120 | 11,200,000 EA | 0 EA (수주 없음) | 정상화 |

---

## 기술 메모

- σ_lead 계산: S5는 purchase_order에서 직접 실측 → S7/S8은 P90 역산 `(p90 - avg) / 1.28`
- σ_demand 계산: zero-demand 일수 포함 전체 분산 `(ss_order + ss_zero) / (N-1)`
- DB 스키마 변경 없음 — `product_lead_time` 컬럼 추가 없이 기존 avg/p90으로 σ_lead 추정
- `SAFETY_STOCK_Z = 1.65` (95% 서비스 수준, 향후 품목별 조정 가능하도록 상수화)
