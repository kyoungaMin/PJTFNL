# 작업일지 — 안전재고 데이터 품질 개선 (v2)

- **날짜**: 2026-03-16
- **작업자**: KoraenDavid
- **브랜치**: main
- **관련 파일**: `DB/07_pipeline/s5_risk_score.py`, `forecastai/src/app/api/inventory/route.ts`

---

## 배경

이전 세션(v1)에서 안전재고 Z-score 공식과 수요 분모를 수정한 이후에도
일부 제품(예: AS-208)의 안전재고가 현실과 동떨어지게 높은 값(57,704)으로 산출되는 문제가 지속됨.

---

## 발견된 문제 3가지

### 문제 1 — daily_order 테이블 중복 데이터

**현상**: 동일한 발주 건이 DB에 4번씩 반복 저장됨
**영향**:
- 실제 발주 수량 1,605개 → 합산 6,516개 (약 4배 부풀림)
- 일평균 수요 17.8개/일 → 72.4개/일로 과대 계산
- 수요 변동폭(σ)도 4배 과대 → 안전재고 공식 전체가 부풀려짐

**원인**: 파이프라인이 중복 실행되면서 같은 발주 데이터가 여러 번 삽입된 데이터 품질 문제

---

### 문제 2 — purchase_order 테이블에 18년짜리 리드타임 이상 데이터

**현상**: `po_date=2024-09-30`, `receipt_date=2042-11-04`인 기록 5건 존재
→ 리드타임 6,609일 (약 18년) → 실제 평균 16일인데 표준편차가 480일로 폭등
**영향**:
- 안전재고 공식의 `평균수요² × 리드타임표준편차²` 항이 폭발적으로 커짐
- AS-208 기준: 정상이면 약 1,200 수준인데 → 57,704으로 산출

**원인**: `receipt_date` 연도 입력 오류 (2024 → 2042 오타 추정), 5건 중복 저장

---

### 문제 3 — 1월 15일 단발성 대량 발주 (1,316개)

**현상**: 평소 발주량은 10~50개인데 1월 15일에 1,316개 단건 발주
**영향**: 수요 변동폭(σ)을 크게 높임
**비고**: 실제 발주 건일 수 있어 삭제하지 않고, 문제 1·2 해결 후 허용 가능 수준으로 판단

---

## 수정 내용

### 1. DB 정리 — 이상 리드타임 레코드 삭제

`purchase_order` 테이블에서 `receipt_date=2042-11-04`인 5건 직접 삭제:
```
삭제된 id: 10726, 40619, 70512, 100405, 130298
```

---

### 2. s5_risk_score.py — 리드타임 이상값 필터 추가

**파일**: `DB/07_pipeline/s5_risk_score.py`
**위치**: `_load_common_data()` 함수 내 리드타임 계산 부분

**변경 전**:
```python
if days >= 0:
    lead_days_map[r["component_product_id"]].append(days)
```

**변경 후**:
```python
# 365일 초과는 데이터 오류(예: receipt_date 연도 오입력)로 간주하여 제외
if 0 <= days <= 365:
    lead_days_map[r["component_product_id"]].append(days)
```

**효과**: 향후 유사한 이상 데이터가 재발해도 파이프라인이 자동으로 걸러냄

---

### 3. s5_risk_score.py — daily_order 중복 제거 로직 추가

**파일**: `DB/07_pipeline/s5_risk_score.py`
**위치**: `_compute_demand()` 함수 내 수요 집계 부분

**변경 전**:
```python
for r in all_order_rows:
    od = r.get("order_date")
    if od and cutoff <= od <= eval_str:
        pid = r["product_id"]
        demand_by_day[pid][od] += float(r["order_qty"] or 0)
        demand_days[pid].add(od)
```

**변경 후**:
```python
seen_orders: set = set()
for r in all_order_rows:
    od = r.get("order_date")
    if od and cutoff <= od <= eval_str:
        pid = r["product_id"]
        dedup_key = (pid, r.get("customer_id"), od, r.get("order_qty"), r.get("order_amount"))
        if dedup_key in seen_orders:
            continue
        seen_orders.add(dedup_key)
        demand_by_day[pid][od] += float(r["order_qty"] or 0)
        demand_days[pid].add(od)
```

**효과**: 동일한 (제품+고객+날짜+수량+금액) 조합이 중복 삽입되어 있어도 한 번만 집계

---

## S5 파이프라인 재실행 결과

| 제품 | 수정 전 안전재고 | 수정 후 안전재고 | 감소율 |
|------|------|------|------|
| AS-208 (01016-D010260) | 57,704 | **1,165** | -98% |
| BOLT COATING (00427-D090007) | 19,855 | 유지 | — |
| 전체 최대 안전재고 | 57,704 | **2,929** | -95% |
| 10,000 초과 품목 수 | 다수 | **0개** | — |

전체 안전재고 분포:
- 중앙값: 9개
- P90: 101개
- 최대: 2,929개

---

## UI 화면 변화

**재고 현황(Inventory) 페이지**:
- 안전재고 수치 전반적으로 현실화
- AS-208: 재고 4,944개 / 안전재고 1,165개 → 비율 4.2배 → "과잉" 상태로 정상 분류

**추가 발견 사항**:
- 일부 제품의 inventory_qty=-1이 같은 월에 4번 중복 저장 → stock 합계가 -4로 표시
  - 이는 daily_order와 동일한 파이프라인 중복 삽입 패턴
  - stock < 0이면 안전재고 비율과 무관하게 "위험" 분류 (현재 로직 정상 작동)

---

## 남은 과제

1. `inventory` 테이블 중복 데이터 점검 (daily_order와 동일 패턴 의심)
2. `daily_order` 테이블 자체 중복 제거 (DB 레벨 UNIQUE 제약 추가 검토)
3. S7, S8 파이프라인에도 동일한 deduplication 로직 적용 여부 검토
