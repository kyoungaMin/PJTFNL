# Inventory Performance Design (2026-03-13)

## 배경
- `Inventory` 페이지는 선택 월 기준으로 재고, 위험 상태, 유형별 추이, 카테고리 구성, SKU 목록을 동시에 계산한다.
- 현재 API는 정확도를 높이기 위해 선택 월 기준 전체 재고 SKU를 메모리에서 재구성하고 있으며, 데이터가 많아질수록 응답 시간이 빠르게 증가한다.
- 이번 수정으로 선택 월 기준 정합성은 개선했지만, 구조적으로는 여전히 무거운 편이라 다음 단계 설계가 필요하다.

## 현재 병목 요약
- `inventory` 원천 테이블을 월별로 전량 스캔해 `product_id -> stock` 집계를 매 요청마다 다시 계산한다.
- `product_master`, `risk_score`, `weekly_product_summary`, `purchase_order`, `weekly_customer_summary`를 요청마다 조합한다.
- 대시보드 카드와 목록 API가 일부 중복 집계를 수행한다.
- 필터 결과 건수를 맞추기 위해 서버 메모리에서 상태/카테고리/검색 조합을 다시 계산한다.

## 목표
- 첫 화면 대시보드 응답: 1초 내외
- 목록 첫 페이지 응답: 1초 내외
- 페이지네이션 추가 로드: 500ms~800ms 목표
- 선택 월/유형/상태/카테고리 기준 데이터 정합성 유지

## 제안 1. 월별 집계 테이블 도입
- 테이블명 예시: `inventory_monthly_snapshot`
- grain:
  - `snapshot_month`
  - `product_id`
  - `stock_qty`
  - `product_type`
  - `product_category`
  - `product_name`
  - `monthly_risk_eval_date`
  - `safety_stock`
  - `risk_grade`
  - `status_code`
  - `weekly_demand_avg_8w`
  - `unit_cost_avg_6m`
  - `top_customer_4w`
- 효과:
  - 목록 API는 이 테이블에서 바로 필터링/정렬/카운트 가능
  - 대시보드 카드와 목록이 동일한 기준 컬럼을 공유
  - 위험 상태 계산을 매 요청마다 다시 하지 않아도 됨

## 제안 2. Supabase RPC 또는 SQL View 분리
- RPC 1: `get_inventory_dashboard(month, type)`
  - KPI, 추이, 유형별 통계, 카테고리 구성 반환
- RPC 2: `get_inventory_list(month, type, search, status, category, page, page_size)`
  - `rows`, `total_count`, `base_total_count`, `status_counts`, `category_options` 반환
- 장점:
  - 클라이언트와 API 레이어에서 반복되는 후처리 감소
  - 데이터베이스의 정렬/집계 최적화를 직접 활용 가능
  - 응답 shape를 안정적으로 유지하면서 내부 로직만 고도화 가능

## 제안 3. 인덱스 전략
- 원천 테이블 유지 시 필요한 인덱스:
  - `inventory(snapshot_date, product_id)`
  - `risk_score(eval_type, eval_date, product_id)`
  - `product_master(product_code, product_type, product_category)`
  - `weekly_product_summary(product_id, week_start)`
  - `weekly_customer_summary(product_id, week_start)`
  - `purchase_order(component_product_id, po_date)`
- 집계 테이블 도입 시:
  - `inventory_monthly_snapshot(snapshot_month, product_type, status_code, product_category)`
  - `inventory_monthly_snapshot(snapshot_month, product_id)`
  - 검색이 많다면 `product_name`, `product_id`에 text search 고려

## 제안 4. 캐시 계층
- 현재 적용:
  - API 메모리 캐시 30초 TTL
- 다음 단계:
  - 월/유형 기준 대시보드 응답을 별도 캐시
  - 목록 API는 `month/type/search/status/category/page` 기준 캐시
  - 배치 적재가 끝날 때 캐시 무효화

## 제안 5. UI/UX 분리
- 대시보드 카드/그래프는 빠른 집계 응답에만 의존
- 목록은 별도 로더와 페이지 상태를 유지
- 하단 정보 문구 유지:
  - `현재 로드 건수`
  - `필터 결과 건수`
  - `선택 월 기준 조회 대상 건수`
- 이 구조는 유지하는 것이 사용자의 오해를 줄이는 데 유리함

## 구현 우선순위
1. SQL View 또는 RPC로 목록 API 이전
2. 월별 집계 테이블 생성 배치 추가
3. 대시보드 API를 집계 테이블 기반으로 전환
4. 캐시 TTL/무효화 전략 연결
5. 검색을 full-text 또는 trigram 기반으로 고도화

## 권장 구현안
- 가장 현실적인 다음 스텝은 `inventory_monthly_snapshot` 생성 + `get_inventory_list` RPC 도입이다.
- 이유:
  - 현재 가장 느린 부분이 목록 필터/카운트 계산이기 때문
  - 대시보드보다 목록 쿼리 비용이 더 크고, 사용자가 체감하는 지연도 여기서 크게 발생하기 때문

## 예상 산출물
- DB migration 1건
- snapshot 적재 스크립트 또는 cron job 1건
- API route 단순화
- `Inventory.tsx`는 응답 바인딩만 담당하도록 축소
