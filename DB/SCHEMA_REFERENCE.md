# DB 스키마 & 외부 API 레퍼런스

> **프로젝트**: 반도체 부품·소재 수요예측 AI SaaS
> **DB**: PostgreSQL (Supabase)
> **최종 수정일**: 2026-03-01

---

## 1. 테이블 목록

| # | 테이블명 | 설명 | DDL 파일 | 행 수 | 비고 |
|---|----------|------|----------|-------|------|
| 1 | `product_master` | 제품 마스터 | `01_ddl.sql` | ~2,500 | PK: product_code |
| 2 | `supplier` | 거래처 (공급사) | `01_ddl.sql` | ~300 | PK: customer_code |
| 3 | `customer` | 고객사 | `01_ddl.sql` | ~500 | PK: id |
| 4 | `bom` | 자재명세서 (BOM) | `01_ddl.sql` | ~3,000 | 부모-자식 제품 관계 |
| 5 | `purchase_order` | 구매발주 | `01_ddl.sql` | ~65,000 | 발주·입고일, 단가 |
| 6 | `daily_revenue` | 일별 매출 | `01_ddl.sql` | ~100,000 | 매출액, 환율 |
| 7 | `daily_production` | 일별 생산 | `01_ddl.sql` | ~110,000 | 생산수량, 라인 |
| 8 | `daily_order` | 일별 수주 | `01_ddl.sql` | ~65,000 | **수요예측 핵심 입력** |
| 9 | `inventory` | 재고 스냅샷 | `01_ddl.sql` | ~105,000 | 월별 재고 |
| 10 | `economic_indicator` | 경제지표 (FRED/EIA/MARKET/BOK/CHINA) | `03_external_ddl.sql` | ~8,475 | 시계열 통합 |
| 11 | `trade_statistics` | 무역통계 (관세청) | `03_external_ddl.sql` | 3,240 | HS코드별 수출입 |
| 12 | `user_profile` | 사용자 프로필 | `05_auth_ddl.sql` | — | Supabase Auth 확장 |
| 13 | `login_history` | 로그인 이력 | `05_auth_ddl.sql` | — | 접속 감사 로그 |
| 14 | `daily_inventory_estimated` | 일간 추정 재고 | `06_analytics_ddl.sql` | — | 월간 스냅샷 기반 일간 보간 |
| 15 | `product_lead_time` | 제품별 리드타임 | `06_analytics_ddl.sql` | — | 발주~입고 통계 |
| 16 | `feature_store` | 피처 스토어 | `06_analytics_ddl.sql` | — | ML 입력 피처 |
| 17 | `forecast_result` | 예측 결과 | `06_analytics_ddl.sql` | — | P10/P50/P90 밴드 |
| 18 | `risk_score` | 리스크 스코어 | `06_analytics_ddl.sql` | — | 결품/과잉/납기/마진 |
| 19 | `action_queue` | 조치 큐 | `06_analytics_ddl.sql` | — | 권장 조치 및 추적 |
| 20 | `calendar_week` | 주차 캘린더 | `08_aggregation_ddl.sql` | 121 | ISO 8601 차원 테이블 |
| 21 | `weekly_product_summary` | 주별 제품 집계 | `08_aggregation_ddl.sql` | 130,697 | 수주·매출·생산 통합 |
| 22 | `weekly_customer_summary` | 주별 거래처×제품 집계 | `08_aggregation_ddl.sql` | 95,868 | 수주·매출 |
| 23 | `monthly_product_summary` | 월별 제품 집계 | `08_aggregation_ddl.sql` | 65,712 | 수주·매출·생산 통합 |
| 24 | `monthly_customer_summary` | 월별 거래처×제품 집계 | `08_aggregation_ddl.sql` | 55,149 | 수주·매출 |
| 25 | `exchange_rate` | 일별 환율 | `09_exchange_rate_ddl.sql` | ~5,300 | USD/JPY/EUR/CNY→KRW |
| 26 | `feature_store_weekly` | 주간 피처 스토어 (LightGBM) | `13_feature_store_weekly_ddl.sql` | 83,719 | 제품×주 ~70피처 + 타겟 |
| 27 | `feature_store_monthly` | 월간 피처 스토어 (LightGBM) | `14_feature_store_monthly_ddl.sql` | 48,416 | 제품×월 ~55피처 + 타겟 |
| 28 | `model_evaluation` | 모델 평가 지표 | `15_model_evaluation_ddl.sql` | — | MAPE/RMSE/Coverage/Pinball |
| 29 | `feature_importance` | 피처 중요도 | `15_model_evaluation_ddl.sql` | — | LightGBM gain/split |
| 30 | `tuning_result` | 튜닝 결과 | `15_model_evaluation_ddl.sql` | — | Grid Search 이력 |

**총 30개 테이블** | 내부 데이터 451,093행 + 외부지표 11,715건 + 환율 ~5,300건 + 분석 6테이블 + 집계 5테이블 + ML 2테이블 + 평가 3테이블

---

## 2. 테이블 상세 스키마

### 2.1 마스터 테이블

#### product_master — 제품 마스터
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| product_code | VARCHAR(20) | PK | 제품 코드 |
| product_name | VARCHAR(200) | | 제품명 |
| product_specification | VARCHAR(200) | | 제품 사양 |
| product_type | VARCHAR(50) | | 제품 유형 |
| product_category | VARCHAR(100) | | 제품 카테고리 |

#### supplier — 거래처
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| customer_code | VARCHAR(10) | PK | 거래처 코드 |
| customer_name | VARCHAR(200) | | 거래처명 |
| country | VARCHAR(5) | | 국가 코드 |

#### customer — 고객사
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| id | VARCHAR(10) | PK | 고객사 ID |
| company_name | VARCHAR(200) | | 회사명 |
| industry_type_uptae | VARCHAR(100) | | 업태 |
| industry_type_upjong | VARCHAR(500) | | 업종 |
| industry_type_jongmok | VARCHAR(500) | | 종목 |
| country | VARCHAR(5) | | 국가 코드 |

### 2.2 트랜잭션 테이블

#### bom — 자재명세서
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| parent_product_id | VARCHAR(20) | | 모제품 코드 → product_master |
| component_product_id | VARCHAR(20) | | 자제품 코드 → product_master |
| usage_qty | NUMERIC(18,6) | | 소요량 |

#### purchase_order — 구매발주
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| cd_partner | VARCHAR(10) | | 거래처 코드 → supplier |
| supplier_name | VARCHAR(200) | | 거래처명 |
| component_product_id | VARCHAR(20) | | 자재 코드 → product_master |
| po_date | DATE | | 발주일 |
| receipt_date | DATE | | 입고일 |
| po_qty | NUMERIC(18,6) | | 발주 수량 |
| unit_price | NUMERIC(18,6) | | 단가 |
| currency | VARCHAR(5) | | 통화 (KRW/USD 등) |
| status | VARCHAR(5) | | 상태 |

#### daily_revenue — 일별 매출
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| revenue_date | DATE | | 매출일 |
| customer_id | VARCHAR(10) | | 고객사 ID → customer |
| product_id | VARCHAR(20) | | 제품 코드 → product_master |
| quantity | NUMERIC(18,6) | | 수량 |
| revenue_amount | NUMERIC(18,4) | | 매출액 |
| currency | VARCHAR(5) | | 통화 |
| exchange_rate | NUMERIC(12,4) | | 환율 |
| domestic_flag | BOOLEAN | | 내수 여부 |

#### daily_production — 일별 생산
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| production_date | DATE | | 생산일 |
| work_start_date | TIMESTAMP | | 작업 시작 |
| work_end_date | TIMESTAMP | | 작업 종료 |
| product_id | VARCHAR(20) | | 제품 코드 → product_master |
| produced_qty | NUMERIC(18,6) | | 생산 수량 |
| line_id | VARCHAR(10) | | 생산 라인 ID |
| mfg_order_serial | VARCHAR(30) | | 제조지시 번호 |

#### daily_order — 일별 수주 (수요예측 핵심)
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| order_date | DATE | | 수주일 |
| expected_delivery_date | DATE | | 납기 예정일 |
| customer_id | VARCHAR(10) | | 고객사 ID → customer |
| product_id | VARCHAR(20) | | 제품 코드 → product_master |
| order_qty | NUMERIC(18,6) | | 수주 수량 |
| order_amount | NUMERIC(18,4) | | 수주 금액 |
| status | VARCHAR(5) | | 상태 |

#### inventory — 재고
| 컬럼 | 타입 | PK | 설명 |
|------|------|:--:|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| snapshot_date | VARCHAR(6) | | 스냅샷 월 (YYYYMM) |
| product_id | VARCHAR(20) | | 제품 코드 → product_master |
| inventory_qty | NUMERIC(18,6) | | 재고 수량 |
| warehouse | VARCHAR(10) | | 창고 코드 |

### 2.3 외부지표 테이블

#### economic_indicator — 경제지표 시계열
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| source | VARCHAR(20) | NOT NULL | 데이터 소스 (FRED, EIA, ECOS) |
| indicator_code | VARCHAR(50) | NOT NULL | 지표 코드 |
| indicator_name | VARCHAR(200) | | 지표명 |
| date | DATE | NOT NULL | 날짜 |
| value | NUMERIC(18,6) | | 값 |
| unit | VARCHAR(50) | | 단위 |
| fetched_at | TIMESTAMPTZ | DEFAULT NOW() | 수집 시각 |
| | | **UNIQUE** | (source, indicator_code, date) |

#### trade_statistics — 무역통계
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| hs_code | VARCHAR(20) | NOT NULL | HS 코드 |
| hs_description | VARCHAR(200) | | 품목 설명 (한글) |
| year_month | VARCHAR(7) | NOT NULL | 년월 (YYYY-MM) |
| export_amount | NUMERIC(18,2) | | 수출액 (USD) |
| export_weight | NUMERIC(18,2) | | 수출 중량 (kg) |
| import_amount | NUMERIC(18,2) | | 수입액 (USD) |
| import_weight | NUMERIC(18,2) | | 수입 중량 (kg) |
| balance | NUMERIC(18,2) | | 무역수지 (수출-수입) |
| fetched_at | TIMESTAMPTZ | DEFAULT NOW() | 수집 시각 |
| | | **UNIQUE** | (hs_code, year_month) |

#### exchange_rate — 일별 환율
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| base_currency | VARCHAR(3) | NOT NULL | 기준 통화 (USD, JPY, EUR, CNY) |
| quote_currency | VARCHAR(3) | NOT NULL, DEFAULT 'KRW' | 표시 통화 |
| rate_date | DATE | NOT NULL | 환율 일자 |
| rate | NUMERIC(12,4) | NOT NULL | 환율 값 (1 base = rate quote) |
| source | VARCHAR(20) | NOT NULL, DEFAULT 'FRED' | 데이터 소스 (FRED/BOK/GENERATED) |
| fetched_at | TIMESTAMPTZ | DEFAULT NOW() | 수집 시각 |
| | | **UNIQUE** | (base_currency, quote_currency, rate_date) |

### 2.4 인증/권한 테이블

#### user_profile — 사용자 프로필
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | UUID | PK, FK → auth.users | Supabase Auth 사용자 ID |
| email | VARCHAR(255) | | 이메일 |
| display_name | VARCHAR(100) | | 표시 이름 |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'viewer' | admin/manager/analyst/viewer |
| department | VARCHAR(100) | | 부서 |
| phone | VARCHAR(20) | | 연락처 |
| avatar_url | TEXT | | 프로필 이미지 URL |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | 계정 활성 여부 |
| last_login_at | TIMESTAMPTZ | | 마지막 로그인 |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 생성일 |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 수정일 (자동 갱신) |

#### login_history — 로그인 이력
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| user_id | UUID | NOT NULL, FK → auth.users | 사용자 ID |
| login_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | 로그인 시각 |
| ip_address | VARCHAR(45) | | 접속 IP (IPv4/IPv6) |
| user_agent | TEXT | | 브라우저/디바이스 정보 |
| status | VARCHAR(10) | NOT NULL, DEFAULT 'success' | success / failure |

**RLS 정책**: 본인 조회/수정 + admin 전체 관리
**Trigger**: 회원가입 시 `user_profile` 자동 생성 (role=viewer)

### 2.5 분석용 테이블 (예측형 관제 시스템)

#### daily_inventory_estimated — 일간 추정 재고
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| target_date | DATE | NOT NULL | 대상일 |
| snapshot_base | NUMERIC(18,6) | DEFAULT 0 | 월초 스냅샷 기준값 |
| cumul_produced | NUMERIC(18,6) | DEFAULT 0 | 월초~해당일 누적 생산 |
| cumul_shipped | NUMERIC(18,6) | DEFAULT 0 | 월초~해당일 누적 출하(=매출) |
| estimated_qty | NUMERIC(18,6) | NOT NULL | snapshot_base + cumul_produced - cumul_shipped |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, target_date) |

**산출식**: `estimated_qty = 월초 inventory 스냅샷 + 누적(daily_production) - 누적(daily_revenue)`

#### product_lead_time — 제품별 리드타임 통계
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| supplier_code | VARCHAR(10) | | 공급사 코드 |
| calc_date | DATE | NOT NULL | 산출 기준일 |
| avg_lead_days | NUMERIC(8,2) | | 평균 리드타임(일) |
| med_lead_days | NUMERIC(8,2) | | 중앙값 |
| p90_lead_days | NUMERIC(8,2) | | 90분위 리드타임 |
| min_lead_days | NUMERIC(8,2) | | 최솟값 |
| max_lead_days | NUMERIC(8,2) | | 최댓값 |
| sample_count | INT | | 산출 근거 건수 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, supplier_code, calc_date) |

#### feature_store — 피처 스토어 (ML 입력)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| target_date | DATE | NOT NULL | 대상일 |
| order_qty_7d | NUMERIC(18,6) | | 최근 7일 수주량 |
| order_qty_30d | NUMERIC(18,6) | | 최근 30일 수주량 |
| order_qty_90d | NUMERIC(18,6) | | 최근 90일 수주량 |
| shipped_qty_7d | NUMERIC(18,6) | | 최근 7일 출하량 |
| shipped_qty_30d | NUMERIC(18,6) | | 최근 30일 출하량 |
| produced_qty_7d | NUMERIC(18,6) | | 최근 7일 생산량 |
| produced_qty_30d | NUMERIC(18,6) | | 최근 30일 생산량 |
| inventory_qty | NUMERIC(18,6) | | 해당일 추정 재고 |
| avg_lead_days | NUMERIC(8,2) | | 평균 리드타임 |
| avg_unit_price | NUMERIC(18,6) | | 최근 평균 단가 |
| usd_krw | NUMERIC(12,4) | | USD/KRW 환율 |
| fed_funds_rate | NUMERIC(8,4) | | 미국 기준금리 |
| wti_price | NUMERIC(12,4) | | WTI 유가 |
| indpro_index | NUMERIC(12,4) | | 산업생산지수 |
| semi_export_amt | NUMERIC(18,2) | | 반도체 수출액 |
| semi_import_amt | NUMERIC(18,2) | | 반도체 수입액 |
| dow | SMALLINT | | 요일 (0=월~6=일) |
| month | SMALLINT | | 월 (1~12) |
| is_holiday | BOOLEAN | DEFAULT FALSE | 공휴일 여부 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, target_date) |

#### forecast_result — 예측 결과
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| model_id | VARCHAR(50) | NOT NULL | 모델 식별자 (예: lgbm_q_v1) |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| forecast_date | DATE | NOT NULL | 예측 실행일 |
| target_date | DATE | NOT NULL | 예측 대상일 |
| horizon_days | INT | NOT NULL | 예측 지평 (7/14/30일) |
| p10 | NUMERIC(18,6) | | 10분위 (낙관) |
| p50 | NUMERIC(18,6) | | 50분위 (중앙) |
| p90 | NUMERIC(18,6) | | 90분위 (비관) |
| actual_qty | NUMERIC(18,6) | | 실적 (사후 기입) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |

#### risk_score — 리스크 스코어
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| eval_date | DATE | NOT NULL | 평가일 |
| stockout_risk | NUMERIC(5,2) | | 결품 리스크 (0~100) |
| excess_risk | NUMERIC(5,2) | | 과잉 리스크 (0~100) |
| delivery_risk | NUMERIC(5,2) | | 납기 리스크 (0~100) |
| margin_risk | NUMERIC(5,2) | | 마진 리스크 (0~100) |
| total_risk | NUMERIC(5,2) | | 종합 리스크 (가중합) |
| risk_grade | VARCHAR(1) | | A/B/C/D/F |
| inventory_days | NUMERIC(8,2) | | 재고일수 |
| demand_p90 | NUMERIC(18,6) | | P90 예측 수요 |
| safety_stock | NUMERIC(18,6) | | 안전재고 수준 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, eval_date) |

**리스크 가중치**: 결품 35% + 과잉 25% + 납기 25% + 마진 15%
**등급 기준**: A(0~20) / B(21~40) / C(41~60) / D(61~80) / F(81~100)

#### action_queue — 조치 큐
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| eval_date | DATE | NOT NULL | 평가일 |
| risk_type | VARCHAR(20) | NOT NULL | stockout/excess/delivery/margin |
| severity | VARCHAR(10) | NOT NULL | critical/high/medium/low |
| action_type | VARCHAR(30) | NOT NULL | expedite_po/increase_production/reduce_order/adjust_price |
| description | TEXT | NOT NULL | 자연어 권장 조치 설명 |
| suggested_qty | NUMERIC(18,6) | | 권장 수량 |
| status | VARCHAR(15) | DEFAULT 'pending' | pending/in_progress/completed/dismissed |
| assigned_to | UUID | | 담당자 (user_profile.id) |
| resolved_at | TIMESTAMPTZ | | 해결 시각 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | 수정일 (자동 갱신) |

### 2.6 모델 평가 테이블

#### model_evaluation — 모델 평가 지표
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| model_id | VARCHAR(50) | NOT NULL | 모델 식별자 (lgbm_q_v2 등) |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| horizon_key | VARCHAR(20) | NOT NULL | 호라이즌 키 (target_1w 등) |
| horizon_days | INT | NOT NULL | 예측 일수 |
| eval_date | DATE | NOT NULL | 평가일 |
| mape | NUMERIC(10,4) | | MAPE (%) |
| rmse | NUMERIC(18,6) | | RMSE |
| mae | NUMERIC(18,6) | | MAE |
| coverage_rate | NUMERIC(5,2) | | P10~P90 밴드 내 실측치 비율 (%) |
| pinball_p10 | NUMERIC(18,6) | | Pinball loss (α=0.1) |
| pinball_p50 | NUMERIC(18,6) | | Pinball loss (α=0.5) |
| pinball_p90 | NUMERIC(18,6) | | Pinball loss (α=0.9) |
| n_folds | INT | | Walk-Forward CV 폴드 수 |
| n_samples_total | INT | | 전체 검증 샘플 수 |
| params_json | TEXT | | 학습 파라미터 (JSON) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (model_id, product_id, horizon_key, eval_date) |

#### feature_importance — 피처 중요도
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| model_id | VARCHAR(50) | NOT NULL | 모델 식별자 |
| horizon_key | VARCHAR(20) | NOT NULL | 호라이즌 키 |
| eval_date | DATE | NOT NULL | 평가일 |
| feature_name | VARCHAR(100) | NOT NULL | 피처명 |
| importance_gain | NUMERIC(12,6) | | LightGBM gain 중요도 |
| importance_split | NUMERIC(12,6) | | LightGBM split 중요도 |
| rank_gain | INT | | gain 기준 순위 (1=최중요) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (model_id, horizon_key, eval_date, feature_name) |

#### tuning_result — 하이퍼파라미터 튜닝 결과
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| model_id | VARCHAR(50) | NOT NULL | 모델 식별자 |
| horizon_key | VARCHAR(20) | NOT NULL | 호라이즌 키 |
| eval_date | DATE | NOT NULL | 평가일 |
| params_json | TEXT | NOT NULL | 테스트 파라미터 (JSON) |
| metric_name | VARCHAR(30) | NOT NULL | 최적화 대상 메트릭 |
| metric_value | NUMERIC(18,6) | | 메트릭 값 |
| is_best | BOOLEAN | DEFAULT FALSE | 최적 조합 여부 |
| n_folds | INT | | CV 폴드 수 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (model_id, horizon_key, eval_date, params_json) |

### 2.7 집계 테이블 (주별·월별)

#### calendar_week — 주차 캘린더 (차원 테이블)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| year_week | VARCHAR(8) | **PK** | ISO 주차 (2025-W08) |
| year | INT | NOT NULL | ISO 연도 |
| week_num | INT | NOT NULL | 주차 번호 (1~53) |
| week_start | DATE | NOT NULL | 주 시작일 (월요일) |
| week_end | DATE | NOT NULL | 주 종료일 (일요일) |
| year_month | VARCHAR(7) | NOT NULL | 목요일 기준 소속 월 |
| quarter | SMALLINT | NOT NULL | 분기 (1~4) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |

#### weekly_product_summary — 주별 제품 집계
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| year_week | VARCHAR(8) | NOT NULL | ISO 주차 (2025-W08) |
| week_start | DATE | NOT NULL | 주 시작일 (월요일) |
| week_end | DATE | NOT NULL | 주 종료일 (일요일) |
| order_qty | NUMERIC(18,6) | DEFAULT 0 | 수주 수량 합계 |
| order_amount | NUMERIC(18,4) | DEFAULT 0 | 수주 금액 합계 |
| order_count | INT | DEFAULT 0 | 수주 건수 |
| revenue_qty | NUMERIC(18,6) | DEFAULT 0 | 매출 수량 합계 |
| revenue_amount | NUMERIC(18,4) | DEFAULT 0 | 매출 금액 합계 |
| revenue_count | INT | DEFAULT 0 | 매출 건수 |
| produced_qty | NUMERIC(18,6) | DEFAULT 0 | 생산 수량 합계 |
| production_count | INT | DEFAULT 0 | 생산 건수 |
| customer_count | INT | DEFAULT 0 | 거래처 수 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, year_week) |

#### weekly_customer_summary — 주별 거래처×제품 집계
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| customer_id | VARCHAR(10) | NOT NULL | 거래처 코드 |
| year_week | VARCHAR(8) | NOT NULL | ISO 주차 |
| week_start | DATE | NOT NULL | 주 시작일 |
| week_end | DATE | NOT NULL | 주 종료일 |
| order_qty | NUMERIC(18,6) | DEFAULT 0 | 수주 수량 합계 |
| order_amount | NUMERIC(18,4) | DEFAULT 0 | 수주 금액 합계 |
| order_count | INT | DEFAULT 0 | 수주 건수 |
| revenue_qty | NUMERIC(18,6) | DEFAULT 0 | 매출 수량 합계 |
| revenue_amount | NUMERIC(18,4) | DEFAULT 0 | 매출 금액 합계 |
| revenue_count | INT | DEFAULT 0 | 매출 건수 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, customer_id, year_week) |

#### monthly_product_summary — 월별 제품 집계
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| year_month | VARCHAR(7) | NOT NULL | 년월 (2025-02) |
| order_qty | NUMERIC(18,6) | DEFAULT 0 | 수주 수량 합계 |
| order_amount | NUMERIC(18,4) | DEFAULT 0 | 수주 금액 합계 |
| order_count | INT | DEFAULT 0 | 수주 건수 |
| revenue_qty | NUMERIC(18,6) | DEFAULT 0 | 매출 수량 합계 |
| revenue_amount | NUMERIC(18,4) | DEFAULT 0 | 매출 금액 합계 |
| revenue_count | INT | DEFAULT 0 | 매출 건수 |
| produced_qty | NUMERIC(18,6) | DEFAULT 0 | 생산 수량 합계 |
| production_count | INT | DEFAULT 0 | 생산 건수 |
| customer_count | INT | DEFAULT 0 | 거래처 수 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, year_month) |

#### monthly_customer_summary — 월별 거래처×제품 집계
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| customer_id | VARCHAR(10) | NOT NULL | 거래처 코드 |
| year_month | VARCHAR(7) | NOT NULL | 년월 |
| order_qty | NUMERIC(18,6) | DEFAULT 0 | 수주 수량 합계 |
| order_amount | NUMERIC(18,4) | DEFAULT 0 | 수주 금액 합계 |
| order_count | INT | DEFAULT 0 | 수주 건수 |
| revenue_qty | NUMERIC(18,6) | DEFAULT 0 | 매출 수량 합계 |
| revenue_amount | NUMERIC(18,4) | DEFAULT 0 | 매출 금액 합계 |
| revenue_count | INT | DEFAULT 0 | 매출 건수 |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | 생성일 |
| | | **UNIQUE** | (product_id, customer_id, year_month) |

#### feature_store_weekly — 주간 피처 스토어 (LightGBM 학습용)
| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| id | BIGINT IDENTITY | PK | 자동 증가 |
| product_id | VARCHAR(20) | NOT NULL | 제품 코드 |
| year_week | VARCHAR(8) | NOT NULL | ISO 주차 (2025-W08) |
| week_start | DATE | NOT NULL | 주 시작일 |
| order_qty_lag1~52 | NUMERIC(18,6) | | 수주량 래그 (1/2/4/8/13/26/52주) |
| order_qty_ma4/13/26 | NUMERIC(18,6) | | 이동평균 (4/13/26주) |
| order_qty_roc_4w/13w | NUMERIC(12,6) | | 변화율 |
| order_qty_std4/13 | NUMERIC(18,6) | | 표준편차 |
| order_qty_cv4 | NUMERIC(12,6) | | 변동계수 |
| sox_index, dram_price, nand_price | NUMERIC(12,4) | | 반도체 시장 지표 |
| usd_krw, jpy_krw, eur_krw, cny_krw | NUMERIC(12,4) | | 환율 |
| fed_funds_rate, wti_price, indpro_index | NUMERIC | | 거시경제 |
| kr_base_rate, kr_ipi_mfg, kr_bsi_mfg | NUMERIC | | 한국 경제지표 |
| target_1w | NUMERIC(18,6) | | T+1주 수주량 (타겟) |
| target_2w | NUMERIC(18,6) | | T+1~2주 수주량 합계 (타겟) |
| target_4w | NUMERIC(18,6) | | T+1~4주 수주량 합계 (타겟) |
| | | **UNIQUE** | (product_id, year_week) |

**피처 카테고리 (총 ~70개):** A.수주이력(13) B.모멘텀(4) C.변동성(7) D.공급측(8) E.고객집중도(5) F.가격(2) G.반도체시장(8) H.환율(5) I.거시경제(8) J.무역(4) K.시간(5)

---

## 3. DBML (Database Markup Language)

```dbml
// ==============================================
// 반도체 부품·소재 수요예측 AI SaaS — DB Schema
// ==============================================

// ── 마스터 ──
Table product_master {
  product_code varchar(20) [pk, note: '제품 코드']
  product_name varchar(200) [note: '제품명']
  product_specification varchar(200) [note: '제품 사양']
  product_type varchar(50) [note: '제품 유형']
  product_category varchar(100) [note: '제품 카테고리']
}

Table supplier {
  customer_code varchar(10) [pk, note: '거래처 코드']
  customer_name varchar(200) [note: '거래처명']
  country varchar(5) [note: '국가']
}

Table customer {
  id varchar(10) [pk, note: '고객사 ID']
  company_name varchar(200) [note: '회사명']
  industry_type_uptae varchar(100) [note: '업태']
  industry_type_upjong varchar(500) [note: '업종']
  industry_type_jongmok varchar(500) [note: '종목']
  country varchar(5) [note: '국가']
}

// ── BOM ──
Table bom {
  id bigint [pk, increment, note: '자동 증가']
  parent_product_id varchar(20) [ref: > product_master.product_code, note: '모제품']
  component_product_id varchar(20) [ref: > product_master.product_code, note: '자제품']
  usage_qty numeric [note: '소요량']
}

// ── 트랜잭션 ──
Table purchase_order {
  id bigint [pk, increment]
  cd_partner varchar(10) [ref: > supplier.customer_code, note: '거래처']
  supplier_name varchar(200)
  component_product_id varchar(20) [ref: > product_master.product_code, note: '자재']
  po_date date [note: '발주일']
  receipt_date date [note: '입고일']
  po_qty numeric [note: '발주 수량']
  unit_price numeric [note: '단가']
  currency varchar(5)
  status varchar(5)

  indexes {
    po_date
    component_product_id
    cd_partner
  }
}

Table daily_revenue {
  id bigint [pk, increment]
  revenue_date date [note: '매출일']
  customer_id varchar(10) [ref: > customer.id, note: '고객사']
  product_id varchar(20) [ref: > product_master.product_code, note: '제품']
  quantity numeric [note: '수량']
  revenue_amount numeric [note: '매출액']
  currency varchar(5)
  exchange_rate numeric [note: '환율']
  domestic_flag boolean [note: '내수 여부']

  indexes {
    revenue_date
    product_id
    customer_id
  }
}

Table daily_production {
  id bigint [pk, increment]
  production_date date [note: '생산일']
  work_start_date timestamp [note: '작업 시작']
  work_end_date timestamp [note: '작업 종료']
  product_id varchar(20) [ref: > product_master.product_code, note: '제품']
  produced_qty numeric [note: '생산 수량']
  line_id varchar(10) [note: '생산 라인']
  mfg_order_serial varchar(30) [note: '제조지시 번호']

  indexes {
    production_date
    product_id
  }
}

Table daily_order {
  id bigint [pk, increment]
  order_date date [note: '수주일']
  expected_delivery_date date [note: '납기 예정일']
  customer_id varchar(10) [ref: > customer.id, note: '고객사']
  product_id varchar(20) [ref: > product_master.product_code, note: '제품']
  order_qty numeric [note: '수주 수량']
  order_amount numeric [note: '수주 금액']
  status varchar(5)

  Note: '수요예측 핵심 입력 테이블'

  indexes {
    order_date
    product_id
    customer_id
  }
}

Table inventory {
  id bigint [pk, increment]
  snapshot_date varchar(6) [note: '스냅샷 월 (YYYYMM)']
  product_id varchar(20) [ref: > product_master.product_code, note: '제품']
  inventory_qty numeric [note: '재고 수량']
  warehouse varchar(10) [note: '창고']

  indexes {
    snapshot_date
    product_id
  }
}

// ── 외부지표 ──
Table economic_indicator {
  id bigint [pk, increment]
  source varchar(20) [not null, note: 'FRED / EIA / ECOS']
  indicator_code varchar(50) [not null, note: '지표 코드']
  indicator_name varchar(200) [note: '지표명']
  date date [not null]
  value numeric [note: '값']
  unit varchar(50) [note: '단위']
  fetched_at timestamptz [default: `now()`]

  indexes {
    (source, indicator_code) [name: 'idx_econ_source_code']
    date [name: 'idx_econ_date']
    (source, indicator_code, date) [unique]
  }
}

Table trade_statistics {
  id bigint [pk, increment]
  hs_code varchar(20) [not null, note: 'HS 코드']
  hs_description varchar(200) [note: '품목 설명']
  year_month varchar(7) [not null, note: 'YYYY-MM']
  export_amount numeric [note: '수출액 (USD)']
  export_weight numeric [note: '수출 중량 (kg)']
  import_amount numeric [note: '수입액 (USD)']
  import_weight numeric [note: '수입 중량 (kg)']
  balance numeric [note: '무역수지']
  fetched_at timestamptz [default: `now()`]

  indexes {
    hs_code [name: 'idx_trade_hs']
    year_month [name: 'idx_trade_ym']
    (hs_code, year_month) [unique]
  }
}

Table exchange_rate {
  id bigint [pk, increment]
  base_currency varchar(3) [not null, note: '기준 통화 (USD/JPY/EUR/CNY)']
  quote_currency varchar(3) [not null, default: 'KRW', note: '표시 통화']
  rate_date date [not null, note: '환율 일자']
  rate numeric [not null, note: '환율 값']
  source varchar(20) [not null, default: 'FRED', note: 'FRED/BOK/GENERATED']
  fetched_at timestamptz [default: `now()`]

  indexes {
    rate_date [name: 'idx_exrate_date']
    (base_currency, quote_currency) [name: 'idx_exrate_currency']
    (base_currency, rate_date) [name: 'idx_exrate_base_date']
    (base_currency, quote_currency, rate_date) [unique]
  }
}

// ── 집계 ──
Table calendar_week {
  year_week varchar(8) [pk, note: 'ISO 주차 2025-W08']
  year int [not null]
  week_num int [not null]
  week_start date [not null, note: '월요일']
  week_end date [not null, note: '일요일']
  year_month varchar(7) [not null, note: '목요일 기준 소속 월']
  quarter smallint [not null]
  created_at timestamptz [default: `now()`]

  indexes {
    year
    year_month
  }
}

Table weekly_product_summary {
  id bigint [pk, increment]
  product_id varchar(20) [not null, ref: > product_master.product_code]
  year_week varchar(8) [not null, note: 'ISO 주차 2025-W08']
  week_start date [not null]
  week_end date [not null]
  order_qty numeric [default: 0]
  order_amount numeric [default: 0]
  order_count int [default: 0]
  revenue_qty numeric [default: 0]
  revenue_amount numeric [default: 0]
  revenue_count int [default: 0]
  produced_qty numeric [default: 0]
  production_count int [default: 0]
  customer_count int [default: 0]
  created_at timestamptz [default: `now()`]

  indexes {
    product_id
    year_week
    (product_id, year_week) [unique]
  }
}

Table weekly_customer_summary {
  id bigint [pk, increment]
  product_id varchar(20) [not null, ref: > product_master.product_code]
  customer_id varchar(10) [not null, ref: > supplier.customer_code]
  year_week varchar(8) [not null]
  week_start date [not null]
  week_end date [not null]
  order_qty numeric [default: 0]
  order_amount numeric [default: 0]
  order_count int [default: 0]
  revenue_qty numeric [default: 0]
  revenue_amount numeric [default: 0]
  revenue_count int [default: 0]
  created_at timestamptz [default: `now()`]

  indexes {
    product_id
    customer_id
    year_week
    (product_id, customer_id, year_week) [unique]
  }
}

Table monthly_product_summary {
  id bigint [pk, increment]
  product_id varchar(20) [not null, ref: > product_master.product_code]
  year_month varchar(7) [not null, note: '2025-02']
  order_qty numeric [default: 0]
  order_amount numeric [default: 0]
  order_count int [default: 0]
  revenue_qty numeric [default: 0]
  revenue_amount numeric [default: 0]
  revenue_count int [default: 0]
  produced_qty numeric [default: 0]
  production_count int [default: 0]
  customer_count int [default: 0]
  created_at timestamptz [default: `now()`]

  indexes {
    product_id
    year_month
    (product_id, year_month) [unique]
  }
}

Table monthly_customer_summary {
  id bigint [pk, increment]
  product_id varchar(20) [not null, ref: > product_master.product_code]
  customer_id varchar(10) [not null, ref: > supplier.customer_code]
  year_month varchar(7) [not null]
  order_qty numeric [default: 0]
  order_amount numeric [default: 0]
  order_count int [default: 0]
  revenue_qty numeric [default: 0]
  revenue_amount numeric [default: 0]
  revenue_count int [default: 0]
  created_at timestamptz [default: `now()`]

  indexes {
    product_id
    customer_id
    year_month
    (product_id, customer_id, year_month) [unique]
  }
}

// ── 인증/권한 ──
Table user_profile {
  id uuid [pk, note: 'FK → auth.users']
  email varchar(255)
  display_name varchar(100)
  role varchar(20) [not null, default: 'viewer', note: 'admin/manager/analyst/viewer']
  department varchar(100)
  phone varchar(20)
  avatar_url text
  is_active boolean [not null, default: true]
  last_login_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    role [name: 'idx_user_profile_role']
  }
}

Table login_history {
  id bigint [pk, increment]
  user_id uuid [not null, ref: > user_profile.id, note: 'FK → auth.users']
  login_at timestamptz [not null, default: `now()`]
  ip_address varchar(45)
  user_agent text
  status varchar(10) [not null, default: 'success', note: 'success/failure']

  indexes {
    user_id [name: 'idx_login_history_user']
    login_at [name: 'idx_login_history_at']
  }
}
```

> DBML 시각화: [dbdiagram.io](https://dbdiagram.io)에 위 코드를 붙여넣으면 ER 다이어그램을 확인할 수 있습니다.

---

## 4. 테이블 관계도 (논리적)

```
product_master (제품)
  ├─< bom.parent_product_id        (1:N 모제품)
  ├─< bom.component_product_id     (1:N 자제품)
  ├─< purchase_order.component_product_id
  ├─< daily_revenue.product_id
  ├─< daily_production.product_id
  ├─< daily_order.product_id
  ├─< inventory.product_id
  ├─< daily_inventory_estimated.product_id   ← 분석
  ├─< product_lead_time.product_id           ← 분석
  ├─< feature_store.product_id               ← 분석
  ├─< forecast_result.product_id             ← 분석
  ├─< risk_score.product_id                  ← 분석
  ├─< action_queue.product_id                ← 분석
  ├─< weekly_product_summary.product_id     ← 집계
  ├─< weekly_customer_summary.product_id    ← 집계
  ├─< monthly_product_summary.product_id    ← 집계
  └─< monthly_customer_summary.product_id   ← 집계

calendar_week (주차 캘린더)
  ├─< weekly_product_summary.year_week     ← 집계
  └─< weekly_customer_summary.year_week    ← 집계

customer (고객사)
  ├─< daily_revenue.customer_id
  └─< daily_order.customer_id

supplier (거래처)
  ├─< purchase_order.cd_partner
  ├─< product_lead_time.supplier_code        ← 분석
  ├─< weekly_customer_summary.customer_id    ← 집계
  └─< monthly_customer_summary.customer_id   ← 집계

auth.users (Supabase 내장)
  ├── user_profile.id  (1:1)
  ├─< login_history.user_id  (1:N)
  └─< action_queue.assigned_to               ← 분석
```

> FK 제약조건은 미설정 (데이터 유연성 우선). 위는 논리적 참조 관계입니다.
> 단, user_profile / login_history는 auth.users에 FK 설정됨 (ON DELETE CASCADE).

---

## 5. 외부 API 연동 목록

### 5.1 FRED — 미국 연방준비은행 경제 데이터

| 항목 | 내용 |
|------|------|
| **제공 기관** | Federal Reserve Bank of St. Louis |
| **API 문서** | https://fred.stlouisfed.org/docs/api/fred/ |
| **Base URL** | `https://api.stlouisfed.org/fred/` |
| **인증** | API Key (query param `api_key`) |
| **Rate Limit** | 120 requests/min |
| **응답 형식** | JSON |
| **환경변수** | `FRED_API_KEY` |
| **수집 기간** | 2021-01-01 ~ 현재 |
| **적재 테이블** | `economic_indicator` (source='FRED') |
| **적재 건수** | 3,051건 |

**수집 지표:**

| 지표 코드 | 지표명 | 단위 | 주기 | 활용 목적 |
|-----------|--------|------|------|----------|
| INDPRO | Industrial Production Index | Index 2017=100 | 월간 | 미국 산업생산 추이 → 반도체 수요 선행지표 |
| IPMAN | Manufacturing IP Index | Index 2017=100 | 월간 | 제조업 생산 추이 |
| DEXKOUS | USD/KRW Exchange Rate | KRW per USD | 일간 | 환율 변동 → 수출입 영향 |
| MANEMP | Manufacturing Employment | Thousands | 월간 | 제조업 고용 → 경기 판단 |
| UMCSENT | Consumer Sentiment Index | Index 1966Q1=100 | 월간 | 소비 심리 → 수요 예측 보조 |
| PCUOMFGOMFG | PPI Manufacturing | Index 1982=100 | 월간 | 제조업 생산자물가 → 원가 변동 |
| DTWEXBGS | Trade Weighted USD Index | Index Jan2006=100 | 일간 | 달러 강세/약세 → 수출 경쟁력 |
| CPIAUCSL | CPI All Urban Consumers | Index 1982-84=100 | 월간 | 인플레이션 → 금리 정책 영향 |
| UNRATE | Unemployment Rate | Percent | 월간 | 실업률 → 경기 판단 |
| FEDFUNDS | Federal Funds Rate | Percent | 월간 | 기준금리 → 투자/수요 영향 |

**예시 호출:**
```
GET https://api.stlouisfed.org/fred/series/observations
  ?series_id=INDPRO
  &api_key={FRED_API_KEY}
  &file_type=json
  &observation_start=2021-01-01
```

---

### 5.2 EIA — 미국 에너지정보청

| 항목 | 내용 |
|------|------|
| **제공 기관** | U.S. Energy Information Administration |
| **API 문서** | https://www.eia.gov/opendata/documentation.php |
| **Base URL** | `https://api.eia.gov/v2/` |
| **인증** | API Key (query param `api_key`) |
| **응답 형식** | JSON |
| **환경변수** | `EIA_API_KEY` |
| **수집 기간** | 2021-01 ~ 현재 |
| **적재 테이블** | `economic_indicator` (source='EIA') |
| **적재 건수** | 538건 |

**수집 지표:**

| 지표 코드 | Series ID | 지표명 | 단위 | 주기 | 활용 목적 |
|-----------|-----------|--------|------|------|----------|
| WTI_WEEKLY | PET.RWTC.W | WTI 원유 현물가격 | USD/barrel | 주간 | 에너지 비용 → 제조 원가 |
| WTI_MONTHLY | PET.RWTC.M | WTI 원유 현물가격 | USD/barrel | 월간 | 월간 추세 분석 |

**예시 호출:**
```
GET https://api.eia.gov/v2/petroleum/pri/spt/data/
  ?api_key={EIA_API_KEY}
  &frequency=weekly
  &data[0]=value
  &facets[series][]=RWTC
  &start=2021-01
```

---

### 5.3 관세청 — 품목별 수출입 실적

| 항목 | 내용 |
|------|------|
| **제공 기관** | 관세청 (Korea Customs Service) |
| **API 문서** | https://www.data.go.kr/data/15099706/openapi.do |
| **Base URL** | `https://apis.data.go.kr/1220000/Itemtrade` |
| **인증** | 서비스 키 (query param `serviceKey`) |
| **제한 사항** | 조회 기간 최대 1년, 연도별 분할 호출 필요 |
| **응답 형식** | XML |
| **환경변수** | `DATA_GO_KR_CUSTOMS_ENDPOINT`, `DATA_GO_KR_SERVICE_KEY` |
| **수집 기간** | 2021-01 ~ 현재 (연도별 분할) |
| **적재 테이블** | `trade_statistics` |
| **적재 건수** | 3,240건 (99개 세부 HS코드) |

**수집 HS 코드:**

| HS 코드 | 품목명 | 세부코드 수 | 활용 목적 |
|---------|--------|------------|----------|
| 8541 | 반도체 디바이스 (다이오드, 트랜지스터 등) | 41개 | 반도체 소자 수출입 동향 |
| 8542 | 전자집적회로 | 58개 | IC/메모리 수출입 동향 |

**예시 호출:**
```
GET https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList
  ?serviceKey={SERVICE_KEY}
  &strtYymm=202401
  &endYymm=202412
  &hsSgn=8541
  &numOfRows=10000
```

**응답 주요 필드:**
| XML 태그 | 설명 | DB 컬럼 |
|----------|------|---------|
| year | 년월 (2024.01) | year_month (→ 2024-01) |
| hsCode | 세부 HS코드 (8541101000) | hs_code |
| statKor | 품목 한글명 | hs_description |
| expDlr | 수출액 (USD) | export_amount |
| expWgt | 수출 중량 (kg) | export_weight |
| impDlr | 수입액 (USD) | import_amount |
| impWgt | 수입 중량 (kg) | import_weight |
| balPayments | 무역수지 | balance |

---

### 5.4 ECOS — 한국은행 경제통계시스템

| 항목 | 내용 |
|------|------|
| **제공 기관** | 한국은행 (Bank of Korea) |
| **API 문서** | https://ecos.bok.or.kr/api/#/ |
| **Base URL** | `https://ecos.bok.or.kr/api/StatisticSearch` |
| **인증** | API Key (URL path에 포함) |
| **응답 형식** | JSON |
| **환경변수** | `ECOS_API_KEY` |
| **수집 기간** | 2021-01 ~ 현재 |
| **적재 테이블** | `economic_indicator` (source='ECOS') |
| **적재 건수** | 1,810건 |

**수집 지표 (10종):**

| indicator_code | 통계코드 | 아이템코드 | 주기 | 지표명 | 단위 | 건수 |
|---------------|----------|-----------|------|--------|------|------|
| KR_BASE_RATE | 722Y001 | 0101000 | 월간 | 한국 기준금리 | Percent | 61 |
| KR_CPI | 901Y009 | 0 | 월간 | 소비자물가지수 (총지수) | Index 2020=100 | 61 |
| KR_IPI_MFG | 901Y033 | AB00/2 | 월간 | 광공업 생산지수 (계절조정) | Index 2020=100 | 60 |
| KR_BSI_MFG | 512Y014 | C0000/BA | 월간 | 제조업 BSI (업황전망) | Index | 62 |
| KR_PPI | 404Y014 | *AA | 월간 | 생산자물가지수 (총지수) | Index 2020=100 | 61 |
| KR_USD_RATE | 731Y003 | 0000003 | 일간 | 원/달러 환율 (종가 15:30) | KRW per USD | 1,263 |
| KR_TRADE_PRICE_EX | 402Y014 | *AA/W | 월간 | 수출물가지수 (원화기준) | Index 2020=100 | 61 |
| KR_TRADE_PRICE_IM | 401Y015 | *AA/W | 월간 | 수입물가지수 (원화기준) | Index 2020=100 | 61 |
| KR_EQUIP_INVEST | 901Y034 | I31AA/I10B | 월간 | 자본재 생산지수 (설비투자, 계절조정) | Index 2020=100 | 60 |
| KR_INVENTORY_MFG | 901Y034 | I31AB/I10E | 월간 | 중간재 재고지수 (제조업) | Index 2020=100 | 60 |

**API 호출 형식:**
```
GET https://ecos.bok.or.kr/api/StatisticSearch/{API_KEY}/json/kr/{START}/{END}/{STAT_CODE}/{FREQ}/{START_DATE}/{END_DATE}/{ITEM1}/{ITEM2}
```

**적재 스크립트**: `DB/12_load_ecos.py`

> **참고**: 기존 source='BOK' (11_load_indices.py 시뮬레이션 데이터)와 별도로 source='ECOS' 실데이터가 공존.
> KR_BASE_RATE, KR_CPI, KR_IPI_MFG는 BOK(시뮬레이션)과 ECOS(실데이터) 양쪽에 존재하며, 분석 시 ECOS 우선 사용 권장.

---

### 5.5 반도체 산업 지수 (생성 데이터)

> ECOS 미연동 보완 + 반도체 산업 특화 지표.
> 실제 시세 기반 앵커 포인트로 현실적 데이터 생성, `economic_indicator` 테이블에 적재.

| 지표 코드 | source | 지표명 | 단위 | 주기 | 활용 목적 |
|-----------|--------|--------|------|------|----------|
| SOX | MARKET | Philadelphia Semiconductor Index | Index | 일간 | 반도체 시장 심리·주가 추세 |
| DRAM_DDR4 | MARKET | DRAM DDR4 8Gb Spot Price | USD | 주간 | 메모리 반도체 가격 동향 |
| NAND_TLC | MARKET | NAND Flash 128Gb TLC Spot Price | USD | 주간 | 낸드 플래시 가격 동향 |
| SILICON_WAFER | MARKET | Silicon Wafer 300mm ASP | USD | 월간 | 웨이퍼 원재료 비용 추이 |
| BALTIC_DRY | MARKET | Baltic Dry Index | Index | 일간 | 글로벌 물류·운임 지표 |
| COPPER_LME | MARKET | Copper LME Price | USD/ton | 일간 | 경기 선행지표 (구리 가격) |
| KR_BASE_RATE | BOK | Korea BOK Base Rate | Percent | 월간 | 한국 기준금리 → 투자/수요 |
| KR_CPI | BOK | Korea Consumer Price Index | Index 2020=100 | 월간 | 한국 인플레이션 |
| KR_IPI_MFG | BOK | Korea Manufacturing Production Index | Index 2020=100 | 월간 | 한국 제조업 생산 추이 |
| CN_PMI_MFG | CHINA | China Caixin Manufacturing PMI | Index | 월간 | 중국 제조업 경기 → 반도체 수요 |

**적재 스크립트**: `DB/11_load_indices.py` (4,886건, source별 MARKET/BOK/CHINA 구분)

---

## 6. 환경변수 (.env)

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=sb_publishable_xxxxx       # 프론트엔드용 (RLS 적용)
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxxxx     # 백엔드/스크립트용 (RLS 우회)

# 외부 API
FRED_API_KEY=xxxxx                            # FRED 경제지표
EIA_API_KEY=xxxxx                             # EIA 에너지 가격
DATA_GO_KR_CUSTOMS_ENDPOINT=https://apis.data.go.kr/1220000/Itemtrade
DATA_GO_KR_SERVICE_KEY=xxxxx                  # 관세청 수출입
ECOS_API_KEY=xxxxx                            # 한국은행 ECOS (10종 연동)

# AI/LLM (향후)
OPENAI_API_KEY=sk-xxxxx
API_KEY=xxxxx                                 # Google Gemini
VITE_API_KEY=xxxxx                            # Gemini (프론트엔드)
TAVILY_API_KEY=xxxxx                          # Tavily 웹 검색
```

---

## 7. DDL 파일 목록

| 파일 | 설명 | 테이블 수 | 실행 순서 |
|------|------|----------|----------|
| `DB/01_ddl.sql` | 내부 데이터 (마스터 + 트랜잭션) | 9 | 1 |
| `DB/03_external_ddl.sql` | 외부지표 (경제지표 + 무역통계) | 2 | 2 |
| `DB/05_auth_ddl.sql` | 인증/권한 (Supabase Auth + RBAC + RLS) | 2 | 3 |
| `DB/06_analytics_ddl.sql` | 분석용 (예측형 관제 시스템) | 6 | 4 |
| `DB/08_aggregation_ddl.sql` | 주별·월별 집계 (캘린더 포함) | 5 | 5 |
| `DB/09_exchange_rate_ddl.sql` | 환율 (일별 통화별 KRW 기준) | 1 | 6 |
| `DB/13_feature_store_weekly_ddl.sql` | 주간 피처 스토어 (LightGBM 학습용) | 1 | 7 |
| `DB/14_feature_store_monthly_ddl.sql` | 월간 피처 스토어 (LightGBM 학습용) | 1 | 8 |
| `DB/15_model_evaluation_ddl.sql` | 모델 평가·피처 중요도·튜닝 결과 | 3 | 9 |

## 8. 데이터 적재 스크립트

| 파일 | 설명 | 실행 방법 |
|------|------|----------|
| `DB/02_load_data.py` | CSV → Supabase 적재 (9테이블) | `python DB/02_load_data.py` |
| `DB/04_load_external_data.py` | 외부 API → Supabase 적재 | `python DB/04_load_external_data.py` |
| `DB/07_pipeline/run_pipeline.py` | 예측형 관제 파이프라인 (6단계) | `python DB/07_pipeline/run_pipeline.py` |
| `DB/10_load_exchange_rate.py` | 환율 데이터 생성 & 적재 | `python DB/10_load_exchange_rate.py` |
| `DB/11_load_indices.py` | 반도체 산업 지수 생성 & 적재 | `python DB/11_load_indices.py` |
| `DB/12_load_ecos.py` | ECOS 한국은행 실데이터 적재 (10종) | `python DB/12_load_ecos.py` |

**스크립트 옵션:**
```bash
# 전체 적재
python DB/02_load_data.py

# 특정 CSV만 적재
python DB/02_load_data.py --only=일별수주.csv,제품마스터.csv

# 외부지표 전체 적재
python DB/04_load_external_data.py

# 특정 소스만 적재
python DB/04_load_external_data.py --only=fred
python DB/04_load_external_data.py --only=eia,customs

# 예측형 관제 파이프라인 전체 실행
python DB/07_pipeline/run_pipeline.py

# 특정 스텝만 실행
python DB/07_pipeline/run_pipeline.py --step=1,2   # 추정재고 + 리드타임
python DB/07_pipeline/run_pipeline.py --step=4     # 예측 모델만

# 환율 데이터 전체 적재 (USD, JPY, EUR, CNY)
python DB/10_load_exchange_rate.py

# 특정 통화만 적재
python DB/10_load_exchange_rate.py --only=usd,jpy

# API 무시, 강제 생성 모드
python DB/10_load_exchange_rate.py --generate

# 외부 지수 전체 적재 (10개 지표)
python DB/11_load_indices.py

# 특정 지표만 적재
python DB/11_load_indices.py --only=sox,dram,nand
python DB/11_load_indices.py --only=kr_base_rate,kr_cpi,kr_ipi

# ECOS 한국은행 실데이터 전체 적재 (10종)
python DB/12_load_ecos.py

# 특정 지표만 적재
python DB/12_load_ecos.py --only=kr_base_rate,kr_cpi
python DB/12_load_ecos.py --only=kr_usd_rate,kr_ppi,kr_bsi_mfg
```

### 파이프라인 스텝 설명

| Step | 모듈 | 입력 | 출력 | 설명 |
|:----:|------|------|------|------|
| 0 | `s0_aggregation.py` | daily_order, daily_revenue, daily_production | calendar_week + 집계 4테이블 | 주차 캘린더 + 주별·월별 집계 |
| 1 | `s1_daily_inventory.py` | inventory, daily_production, daily_revenue | daily_inventory_estimated | 일간 추정 재고 |
| 2 | `s2_lead_time.py` | purchase_order | product_lead_time | 리드타임 통계 |
| 3 | `s3_feature_store.py` | weekly_product/customer_summary + 외부지표 | feature_store_weekly | 주간 피처 엔지니어링 (~70개 피처) |
| 4 | `s4_forecast.py` | feature_store_weekly | forecast_result + model_evaluation + feature_importance | LightGBM Quantile 예측 + Walk-Forward CV 평가 |
| 5 | `s5_risk_score.py` | forecast + 재고 + 리드타임 | risk_score | 리스크 스코어링 |
| 6 | `s6_action_queue.py` | risk_score | action_queue | 권장 조치 생성 |
| 3m | `s3m_feature_store_monthly.py` | monthly_product/customer_summary + 외부지표 | feature_store_monthly | 월간 피처 엔지니어링 (~55개 피처) |
| 4m | `s4m_forecast_monthly.py` | feature_store_monthly | forecast_result + model_evaluation + feature_importance | 월간 LightGBM Quantile 예측 + 평가 |

**튜닝 모드**: `--tune` 플래그 추가 시 Step 4/4m에서 Grid Search 실행 → `tuning_result` 테이블에 결과 저장

---

## 9. RBAC 역할 정의

| 역할 | 설명 | 대시보드 조회 | 데이터 분석 | 모델 설정 | 보고서 | 사용자 관리 |
|------|------|:---:|:---:|:---:|:---:|:---:|
| `admin` | 시스템 관리자 | O | O | O | O | O |
| `manager` | 매니저 | O | O | O | O | X |
| `analyst` | 분석가 | O | O | X | X | X |
| `viewer` | 뷰어 (기본) | O | X | X | X | X |
