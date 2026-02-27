# DB 스키마 & 외부 API 레퍼런스

> **프로젝트**: 반도체 부품·소재 수요예측 AI SaaS
> **DB**: PostgreSQL (Supabase)
> **최종 수정일**: 2026-02-27

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
| 10 | `economic_indicator` | 경제지표 (FRED/EIA) | `03_external_ddl.sql` | 3,589 | 시계열 통합 |
| 11 | `trade_statistics` | 무역통계 (관세청) | `03_external_ddl.sql` | 3,240 | HS코드별 수출입 |
| 12 | `user_profile` | 사용자 프로필 | `05_auth_ddl.sql` | — | Supabase Auth 확장 |
| 13 | `login_history` | 로그인 이력 | `05_auth_ddl.sql` | — | 접속 감사 로그 |

**총 13개 테이블** | 내부 데이터 451,093행 + 외부지표 6,829건

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
  └─< inventory.product_id

customer (고객사)
  ├─< daily_revenue.customer_id
  └─< daily_order.customer_id

supplier (거래처)
  └─< purchase_order.cd_partner

auth.users (Supabase 내장)
  ├── user_profile.id  (1:1)
  └─< login_history.user_id  (1:N)
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

### 5.4 ECOS — 한국은행 경제통계시스템 (미연동)

| 항목 | 내용 |
|------|------|
| **제공 기관** | 한국은행 (Bank of Korea) |
| **API 문서** | https://ecos.bok.or.kr/api/#/ |
| **Base URL** | `https://ecos.bok.or.kr/api/` |
| **인증** | API Key (URL path에 포함) |
| **응답 형식** | JSON / XML |
| **환경변수** | `ECOS_API_KEY` |
| **상태** | DNS 해석 실패 (`ecos.bok.or.kr` 접속 불가) — 네트워크 이슈, 추후 재시도 |

**수집 예정 지표:**

| 통계코드 | 지표명 | 주기 | 활용 목적 |
|----------|--------|------|----------|
| 064Y001 | 원/달러 환율 | 일간 | 환율 (FRED DEXKOUS 교차 검증) |
| 028Y15S | 한국 기준금리 | 월간 | 국내 금리 정책 → 투자/수요 |
| 021Y125 | 소비자물가지수 | 월간 | 국내 인플레이션 |
| 013Y202 | 수출입 동향 | 월간 | 한국 전체 수출입 추이 |

**예시 호출:**
```
GET https://ecos.bok.or.kr/api/StatisticSearch
  /{API_KEY}/JSON/kr/1/100/064Y001/MM/202501/202501/0000001
```

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
ECOS_API_KEY=xxxxx                            # 한국은행 (미연동)

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

## 8. 데이터 적재 스크립트

| 파일 | 설명 | 실행 방법 |
|------|------|----------|
| `DB/02_load_data.py` | CSV → Supabase 적재 (9테이블) | `python DB/02_load_data.py` |
| `DB/04_load_external_data.py` | 외부 API → Supabase 적재 | `python DB/04_load_external_data.py` |

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
```

---

## 9. RBAC 역할 정의

| 역할 | 설명 | 대시보드 조회 | 데이터 분석 | 모델 설정 | 보고서 | 사용자 관리 |
|------|------|:---:|:---:|:---:|:---:|:---:|
| `admin` | 시스템 관리자 | O | O | O | O | O |
| `manager` | 매니저 | O | O | O | O | X |
| `analyst` | 분석가 | O | O | X | X | X |
| `viewer` | 뷰어 (기본) | O | X | X | X | X |
