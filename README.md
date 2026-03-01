# AI 기반 수요 변동성 최적화 SaaS

> **반도체 부품·소재 제조기업을 위한 수요예측 및 재고 리스크 최적화 플랫폼**

---

## 1. 프로젝트 배경

### 현재 생산기획의 한계

수주 기반 제조업에서 ERP는 **과거 기록 시스템**입니다.

| 가능한 것 | 불가능한 것 |
|-----------|-------------|
| 수주 실적 조회 | "앞으로 얼마나 팔릴지" 예측 |
| 재고 현황 확인 | 재고 리스크 사전 감지 |
| 생산 실적 집계 | 최적 생산량 자동 산출 |
| 발주 이력 관리 | 발주 타이밍·수량 추천 |

생산량 증감 판단은 결국 **담당자 경험**, **엑셀 수작업**, **고객사 담당자 감**에 의존합니다.

그 결과:
- 갑작스런 수주 급증 → **납기 지연**
- 수주 급감 → **재고 과잉**
- 생산계획 수정이 항상 **사후 대응**

> **문제는 데이터가 없는 게 아니라, 데이터를 미래 의사결정으로 연결하는 구조가 없다는 것.**

### 이 솔루션의 포지셔닝

- ERP를 **대체**하는 것이 아닌, ERP 위에 얹는 **AI 의사결정 레이어**
- 복잡한 전사 SCM 구축 사업이 아닌, **생산기획 의사결정 특화 AI 도구**
- 기존 ERP 데이터만으로 시작 가능, **3개월 내 PoC 가능**

---

## 2. 타깃 사용자

### 대상 조직

| 대상 | 설명 |
|------|------|
| **생산기획 팀** | 주간/월간 생산계획 수립 담당 |
| **운영/SCM 담당** | 자재 조달·재고 관리 |
| **영업 관리** | 고객사별 수주 동향 파악 |
| **경영진** | 데이터 기반 의사결정 리포트 |

### 이런 상황의 기업에 적합

- 고객사별 주문 변동 폭이 큼
- 매주 생산계획을 수정함
- 매출과 생산 간 괴리가 자주 발생함
- "이번 달은 괜찮은데 다음 달이 불안"한 구조
- 반도체·부품·소재 등 글로벌 지표 영향이 큰 산업

---

## 3. 핵심 기능

### 3.1 수주 기반 AI 수요 예측

고객사별 x 제품별 수요를 **확률 밴드**로 예측합니다.

| 항목 | 내용 |
|------|------|
| **예측 단위** | 고객사별, 제품별, 주차별/월별 선택 |
| **예측 범위** | 주간: 1w/2w/4w (최대 28일) / 월간: 1m/3m/6m (최대 180일) |
| **예측 모델** | LightGBM Quantile Regression (주간 46피처, 월간 35피처) |
| **출력** | P10(낙관) / P50(중앙) / P90(비관) 밴드 |

```
사용자가 보는 화면:
"A제품은 6주 뒤부터 수요가 급증할 가능성이 높습니다. (P90: 1,200개)"
"B고객사는 다음 달 주문 감소 확률이 높습니다. (P50: -15%)"
```

### 3.2 외부 변수 반영 정확도 보정

반도체 산업은 단순 수주 흐름만으로 예측할 수 없습니다.

| 변수 카테고리 | 지표 | 활용 목적 |
|---------------|------|----------|
| **환율** | USD/KRW, JPY/KRW, EUR/KRW, CNY/KRW | 수출입 가격 변동 |
| **반도체 시장** | SOX 지수, DRAM 현물가, NAND 현물가, 웨이퍼 ASP | 산업 사이클 판단 |
| **거시경제** | 미국 기준금리, 산업생산지수, CPI, PPI | 글로벌 수요 환경 |
| **국내경제** | 한국 기준금리, CPI, 제조업 생산지수 | 국내 수요 환경 |
| **무역** | 반도체 HS코드 수출입액, 발틱운임지수 | 교역량·물류비 |
| **원자재** | WTI 유가, 구리 LME 가격 | 제조 원가 변동 |
| **중국** | 차이신 제조업 PMI | 최대 수요처 경기 |

### 3.3 재고 리스크 자동 스코어링

4가지 유형의 리스크를 자동 평가합니다.

| 리스크 유형 | 가중치 | 산출 기준 |
|-------------|--------|----------|
| **결품 리스크** | 35% | 추정 재고 < P90 예측 수요 × 안전재고 비율 |
| **과잉 리스크** | 25% | 재고일수 > 기준일수 (90일) |
| **납기 리스크** | 25% | 리드타임 P90 > 잔여 납기일 |
| **마진 리스크** | 15% | 원가 상승 + 환율 변동 압박 |

**등급 체계**: A(0~20) / B(21~40) / C(41~60) / D(61~80) / F(81~100)

### 3.4 생산 대응안 자동 제안

예측 결과를 기반으로 **구체적 조치**를 제안합니다.

| 상황 | 자동 제안 | 우선순위 |
|------|----------|----------|
| 수요 급증 예상 (결품 위험) | 긴급 발주 / 증산 검토 | Critical |
| 수요 급감 예상 (과잉 위험) | 감산 / 발주 보류 | High |
| 납기 지연 위험 | 대체 공급사 / 긴급 입고 | Critical |
| 변동성 과다 | 안전재고 상향 / 단계적 대응 | Medium |
| 특정 고객사 집중 리스크 | 우선 대응 품목 알림 | High |

### 3.5 다차원 집계 대시보드

| 집계 단위 | 내용 |
|-----------|------|
| **주별 제품 집계** | 수주·매출·생산 통합 (ISO 주차 기준) |
| **주별 거래처 집계** | 거래처별 수주·매출 추이 |
| **월별 제품 집계** | 월간 트렌드, 전월 대비 변화율 |
| **월별 거래처 집계** | 고객사별 점유율, TOP 10 |

---

## 4. 사용자 시나리오

```
1. 생산기획 담당자가 로그인 → 대시보드 확인
       ↓
2. 주별 또는 월별 예측 단위 선택
       ↓
3. 시스템이 향후 수요 예측 제시 (P10/P50/P90 밴드)
       ↓
4. 변동성 큰 품목 자동 식별 (리스크 등급 C 이상)
       ↓
5. 권장 조치 확인 → 생산계획 수정
       ↓
6. 예측 vs 실적 비교 리포트로 모델 신뢰도 확인
```

> 생산회의에서 "감"이 아닌 **데이터 기반 설명**이 가능해집니다.

---

## 5. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────┐
│                    사용자 (브라우저)                    │
│              Next.js 대시보드 + Vercel 배포             │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                FastAPI 백엔드 서버                      │
│  ┌────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ 예측 API    │  │ 리스크 API │  │ 대시보드 API    │  │
│  └────────────┘  └───────────┘  └────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ Supabase Client
┌──────────────────────▼──────────────────────────────┐
│            PostgreSQL (Supabase)                      │
│                                                       │
│  ┌─ 마스터 ──────────────────────────────────────┐   │
│  │ product_master / supplier / customer / bom     │   │
│  └───────────────────────────────────────────────┘   │
│  ┌─ 트랜잭션 ────────────────────────────────────┐   │
│  │ daily_order / daily_revenue / daily_production │   │
│  │ purchase_order / inventory                     │   │
│  └───────────────────────────────────────────────┘   │
│  ┌─ 외부지표 ────────────────────────────────────┐   │
│  │ economic_indicator / trade_statistics           │   │
│  │ exchange_rate                                   │   │
│  └───────────────────────────────────────────────┘   │
│  ┌─ 분석·예측 ───────────────────────────────────┐   │
│  │ feature_store / forecast_result / risk_score   │   │
│  │ action_queue / daily_inventory_estimated       │   │
│  └───────────────────────────────────────────────┘   │
│  ┌─ ML 피처 ─────────────────────────────────────┐   │
│  │ feature_store_weekly (46피처, 83K행)            │   │
│  │ feature_store_monthly (35피처, 48K행)           │   │
│  └───────────────────────────────────────────────┘   │
│  ┌─ 최적화 ────────────────────────────────────────┐ │
│  │ production_plan / purchase_recommendation       │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─ 집계 ────────────────────────────────────────┐   │
│  │ weekly/monthly_product_summary                 │   │
│  │ weekly/monthly_customer_summary                │   │
│  └───────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
                       ▲
┌──────────────────────┴──────────────────────────────┐
│            데이터 파이프라인 (Python)                    │
│                                                       │
│  CSV 적재 → 외부 API 수집 → 환율/지수/ECOS 적재        │
│  → 주간 파이프라인 (S0~S8) + 월간 파이프라인 (S3m~S4m)  │
└───────────────────────────────────────────────────────┘
        ▲                                    ▲
   ERP 데이터                        외부 API
   (CSV Export)          (FRED / EIA / 관세청 / ECOS)
```

---

## 6. 데이터 파이프라인

### 6.1 데이터 적재 흐름

```
[1] ERP CSV 내보내기 → python DB/02_load_data.py → 9개 마스터/트랜잭션 테이블
[2] 외부 API 수집    → python DB/04_load_external_data.py → economic_indicator + trade_statistics
[3] 환율 데이터      → python DB/10_load_exchange_rate.py → exchange_rate (4통화 5,321건)
[4] 산업 지수 데이터  → python DB/11_load_indices.py → economic_indicator (10지표 4,886건)
[5] ECOS 실데이터    → python DB/12_load_ecos.py → economic_indicator (10종 1,810건)
```

### 6.2 분석 파이프라인 (주간 7단계 + 월간 2단계)

```bash
# 주간 파이프라인 전체 실행 (S0~S8)
python DB/07_pipeline/run_pipeline.py

# 월간 파이프라인 실행
python DB/07_pipeline/run_pipeline.py --step=3m,4m

# 주간 + 월간 + 최적화 한 번에 실행
python DB/07_pipeline/run_pipeline.py --step=0,1,2,3,4,5,6,3m,4m,7,8
```

**주간 파이프라인 (S0~S8)**

| Step | 모듈 | 입력 | 출력 | 설명 |
|:----:|------|------|------|------|
| 0 | `s0_aggregation.py` | 수주, 매출, 생산 | 주별·월별 집계 4테이블 | ISO 주차 캘린더 + 다차원 집계 |
| 1 | `s1_daily_inventory.py` | 재고, 생산, 매출 | `daily_inventory_estimated` | 월초 스냅샷 기반 일간 재고 보간 |
| 2 | `s2_lead_time.py` | 구매발주 | `product_lead_time` | 제품별 리드타임 통계 (AVG/P90) |
| 3 | `s3_feature_store.py` | 전체 ERP + 외부지표 | `feature_store_weekly` | 주간 피처 엔지니어링 (46개 피처) |
| 4 | `s4_forecast.py` | feature_store_weekly | `forecast_result` | LightGBM Quantile 예측 (1w/2w/4w) |
| 5 | `s5_risk_score.py` | 예측 + 재고 + 리드타임 | `risk_score` | 4유형 리스크 스코어링 |
| 6 | `s6_action_queue.py` | risk_score + S7/S8 결과 | `action_queue` | C등급 이상 자동 조치 제안 (정교한 suggested_qty) |
| 7 | `s7_production_plan.py` | 예측 + 재고 + 캐파 + 리스크 | `production_plan` | 제품별 최적 생산량 산출 |
| 8 | `s8_purchase_optimization.py` | S7 + BOM + 리드타임 + 공급사 | `purchase_recommendation` | BOM 전개 + EOQ/ROP 기반 발주 추천 |

**월간 파이프라인 (S3m~S4m)**

| Step | 모듈 | 입력 | 출력 | 설명 |
|:----:|------|------|------|------|
| 3m | `s3m_feature_store_monthly.py` | 전체 ERP + 외부지표 | `feature_store_monthly` | 월간 피처 엔지니어링 (35개 피처) |
| 4m | `s4m_forecast_monthly.py` | feature_store_monthly | `forecast_result` | LightGBM Quantile 예측 (1m/3m/6m) |

> 주간과 월간 예측 결과는 동일한 `forecast_result` 테이블에 적재되며, `model_id`로 구분됩니다.
> - 주간: `lgbm_q_v2` (horizon: 7/14/28일) | fallback: `moving_avg_v1`
> - 월간: `lgbm_q_monthly_v1` (horizon: 30/90/180일) | fallback: `moving_avg_monthly_v1`

---

## 7. 기술 스택

| 영역 | 기술 | 선정 사유 |
|------|------|----------|
| **백엔드** | FastAPI (Python) | ML 연동, 자동 Swagger, 비동기 지원 |
| **프론트엔드** | Next.js (React) | SSR 대시보드, Supabase 연동, Vercel 배포 |
| **데이터베이스** | PostgreSQL (Supabase) | REST API, 실시간 구독, RLS 보안 |
| **ML 모델** | LightGBM Quantile | 주간(46피처)+월간(35피처) 이중 파이프라인, 이동평균 fallback |
| **외부 데이터** | FRED / EIA / 관세청 API | 거시경제·에너지·무역 실시간 수집 |
| **인증** | Supabase Auth + RBAC | JWT, 4단계 역할 (admin/manager/analyst/viewer) |
| **배포** | Vercel + Supabase Cloud | 서버리스, 자동 스케일링 |

---

## 8. DB 구조 (29개 테이블)

| 구분 | 테이블 수 | 주요 테이블 | 행 수 |
|------|----------|------------|-------|
| 마스터 | 3 | product_master, supplier, customer | ~3,300 |
| 트랜잭션 | 6 | daily_order, daily_revenue, daily_production, purchase_order, inventory, bom | ~448,000 |
| 외부지표 | 3 | economic_indicator, trade_statistics, exchange_rate | ~17,000 |
| 분석 | 6 | feature_store, forecast_result, risk_score, action_queue 등 | 파이프라인 생성 |
| ML 피처 | 2 | feature_store_weekly, feature_store_monthly | ~132,000 |
| 최적화 | 2 | production_plan, purchase_recommendation | 파이프라인 생성 |
| 집계 | 5 | weekly/monthly_product_summary, weekly/monthly_customer_summary, calendar_week | ~347,000 |
| 인증 | 2 | user_profile, login_history | — |

> 상세 스키마: [DB/SCHEMA_REFERENCE.md](DB/SCHEMA_REFERENCE.md)

---

## 9. 프로젝트 구조

```
PJTFNL/
├── README.md                          ← 이 문서
├── DEV_LOG.md                         ← 프로젝트 INDEX (마일스톤, 의사결정, 이슈)
├── .env                               ← 환경변수 (Supabase, API 키)
│
├── DATA/                              ← ERP 원본 CSV (9개)
│   ├── 일별수주.csv                    ← 수요예측 핵심 입력
│   ├── 일별매출.csv
│   ├── 일별생산.csv
│   ├── 재고.csv
│   ├── 구매발주.csv
│   ├── 제품마스터.csv
│   ├── BOM.csv
│   ├── 고객사.csv
│   └── 거래처.csv
│
├── DB/                                ← 데이터베이스 DDL + 파이프라인
│   ├── 01_ddl.sql                     ← 내부 데이터 9테이블
│   ├── 02_load_data.py                ← CSV → Supabase 적재
│   ├── 03_external_ddl.sql            ← 외부지표 2테이블
│   ├── 04_load_external_data.py       ← FRED/EIA/관세청 수집
│   ├── 05_auth_ddl.sql                ← 인증/권한 (RBAC + RLS)
│   ├── 06_analytics_ddl.sql           ← 분석용 6테이블
│   ├── 07_pipeline/                   ← 주간 9단계 + 월간 2단계 파이프라인
│   │   ├── run_pipeline.py            ← 통합 실행기 (주간/월간/최적화 선택)
│   │   ├── config.py                  ← 공통 설정 + 피처 컬럼 + 최적화 상수
│   │   ├── s0_aggregation.py          ← 주별·월별 집계
│   │   ├── s1_daily_inventory.py      ← 일간 추정 재고
│   │   ├── s2_lead_time.py            ← 리드타임 통계
│   │   ├── s3_feature_store.py        ← 주간 피처 엔지니어링 (46개)
│   │   ├── s3m_feature_store_monthly.py ← 월간 피처 엔지니어링 (35개)
│   │   ├── s4_forecast.py             ← 주간 수요예측 (LightGBM)
│   │   ├── s4m_forecast_monthly.py    ← 월간 수요예측 (LightGBM)
│   │   ├── s5_risk_score.py           ← 리스크 스코어링
│   │   ├── s6_action_queue.py         ← 조치 큐 생성 (S7/S8 연동)
│   │   ├── s7_production_plan.py      ← 생산 최적화 (캐파·리스크 기반)
│   │   └── s8_purchase_optimization.py ← 발주 최적화 (BOM·EOQ·공급사)
│   ├── 07_queries/                    ← 분석 쿼리
│   │   └── monthly_aggregation.sql    ← 월별 집계 7종
│   ├── 08_aggregation_ddl.sql         ← 집계 5테이블
│   ├── 09_exchange_rate_ddl.sql       ← 환율 테이블
│   ├── 10_load_exchange_rate.py       ← 환율 데이터 생성/적재
│   ├── 11_load_indices.py             ← 산업 지수 생성/적재
│   ├── 12_load_ecos.py               ← ECOS 한국은행 실데이터 적재
│   ├── 13_feature_store_weekly_ddl.sql  ← 주간 ML 피처 테이블
│   ├── 14_feature_store_monthly_ddl.sql ← 월간 ML 피처 테이블
│   ├── 16_optimization_ddl.sql        ← 생산계획 + 발주추천 테이블
│   └── SCHEMA_REFERENCE.md            ← DB 스키마 전체 레퍼런스
│
├── DEV_LOG/                           ← 개발일지
│   ├── _TEMPLATE.md
│   └── {개발자명}/YYYY-MM-DD.md
│
└── (향후)
    ├── backend/                        ← FastAPI 서버
    ├── frontend/                       ← Next.js 대시보드
    └── ml/                             ← ML 모델 학습/평가
```

---

## 10. 빠른 시작

### 사전 요구사항

- Python 3.10+
- Supabase 프로젝트 (PostgreSQL)
- `.env` 파일 설정

### 설치 & 실행

```bash
# 1. 의존성 설치
pip install supabase python-dotenv requests lightgbm

# 2. DDL 실행 (Supabase SQL Editor에서 순서대로)
#    01_ddl.sql → 03_external_ddl.sql → 05_auth_ddl.sql
#    → 06_analytics_ddl.sql → 08_aggregation_ddl.sql → 09_exchange_rate_ddl.sql
#    → 13_feature_store_weekly_ddl.sql → 14_feature_store_monthly_ddl.sql
#    → 16_optimization_ddl.sql

# 3. 데이터 적재
python DB/02_load_data.py                # ERP CSV 데이터
python DB/04_load_external_data.py       # FRED/EIA/관세청
python DB/10_load_exchange_rate.py       # 환율 데이터
python DB/11_load_indices.py             # 산업 지수 데이터
python DB/12_load_ecos.py               # ECOS 한국은행 실데이터

# 4. 분석 파이프라인 실행
python DB/07_pipeline/run_pipeline.py              # 주간 전체 (S0~S8)
python DB/07_pipeline/run_pipeline.py --step=3m,4m # 월간 (피처+예측)
python DB/07_pipeline/run_pipeline.py --step=7,8   # 생산·발주 최적화만
```

---

## 11. 정량 목표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| 핵심 제품군 예측 오차 | MAPE 10~15% 이내 | 예측 vs 실적 비교 리포트 |
| 예측 범위 | 주별 24주 / 월별 6개월 | 시스템 설정 |
| 데이터 동기화 성공률 | 99% 이상 | 파이프라인 로그 모니터링 |
| 생산계획 반영률 | 80% 이상 | 조치 큐 완료율 추적 |
| 재고 과잉/결품 감소 | 20% 이상 개선 | 리스크 스코어 추이 |

---

## 12. ERP 대비 차별점

| 구분 | 기존 ERP | 본 솔루션 |
|------|---------|----------|
| 과거 실적 조회 | O | O |
| **미래 수요 예측** | X | O (P10/P50/P90) |
| **외부 변수 반영** | X | O (30+개 경제·산업지표, FRED/EIA/ECOS/관세청) |
| **리스크 자동 감지** | X | O (4유형, A~F 등급) |
| **생산 대응안 제안** | X | O (자동 조치 큐) |
| **다차원 집계 분석** | 제한적 | O (주별/월별/거래처별) |

---

## 13. 리스크 및 대응 전략

| 리스크 | 영향 | 대응 전략 |
|--------|------|----------|
| 고객사별 패턴 편차 큼 | 예측 정확도 저하 | 제품군 우선 적용 후 점진 확장, 고객사별 모델 분리 |
| 외부 변수 영향도 불확실 | 과적합/과소적합 | 변수 자동 가중치 학습 (feature importance), 정기 재학습 |
| 현업 미반영 가능성 | ROI 미달 | KPI 연계 리포트, "예측 vs 실제" 비교 대시보드 제공 |
| ECOS API 연동 불안정 | 한국 경제지표 결손 | ECOS 실데이터 + BOK 시뮬레이션 이중 적재, ECOS 우선 사용 |
| LightGBM 미설치 환경 | 모델 실행 불가 | 이동평균 fallback 자동 적용 |

---

## 14. 마일스톤

| Phase | 내용 | 상태 | 비고 |
|-------|------|------|------|
| **Phase 1** | 데이터 탐색·전처리·DB 구축 | **완료** | 27테이블, 내부+외부 데이터 적재 |
| **Phase 2** | 수요 변동성 분석 모델 개발 | **완료** | 주간+월간 LightGBM Quantile 파이프라인 구축 완료 |
| **Phase 3** | 재고 리스크 점수화 엔진 개발 | **완료** | 4유형 리스크 스코어링 + 조치 큐 파이프라인 구축 완료 |
| **Phase 4** | 생산·발주 최적화 알고리즘 개발 | **완료** | 생산계획(S7) + 발주추천(S8) + S6 보강 |
| Phase 5 | 웹 대시보드 및 API 서버 구축 | 대기 | |
| Phase 6 | 통합 테스트·배포 | 대기 | |

---

## 15. RBAC 권한 체계

| 역할 | 대시보드 | 데이터 분석 | 모델 설정 | 보고서 | 사용자 관리 |
|------|:---:|:---:|:---:|:---:|:---:|
| `admin` | O | O | O | O | O |
| `manager` | O | O | O | O | X |
| `analyst` | O | O | X | X | X |
| `viewer` | O | X | X | X | X |

---

## 16. 외부 API 연동

| 소스 | 제공 기관 | 수집 지표 | 상태 |
|------|----------|----------|------|
| **FRED** | 미국 연방준비은행 | 산업생산, 환율, 금리, CPI 등 10개 | 연동 완료 |
| **EIA** | 미국 에너지정보청 | WTI 원유 가격 (주간/월간) | 연동 완료 |
| **관세청** | 대한민국 관세청 | HS 8541/8542 수출입 통계 | 연동 완료 |
| **ECOS** | 한국은행 | 기준금리, CPI, PPI, 환율, 생산지수 등 10종 | **연동 완료** (1,810건) |
| **생성 데이터** | 시세 기반 앵커 | SOX, DRAM, NAND, BDI, 구리 등 10개 | 적재 완료 |

---

## 17. 기대 효과

### 정량적 효과

- **재고 최적화**: 과잉 생산 20% 감소, 재고 회전율 개선
- **납기 안정성**: 결품으로 인한 납기 지연 사전 방지
- **업무 효율**: 엑셀 분석 시간 80% 절감
- **의사결정 속도**: 주간 생산회의 준비 시간 50% 단축

### 정성적 효과

- 생산회의에서 **"감" 대신 "데이터"** 기반 의사결정
- 경영진에게 **예측 기반 설명** 가능
- 수요 변동에 대한 **사전 대응 체계** 구축
- 조직 내 **데이터 문화** 정착

---

## 참고 문서

| 문서 | 설명 |
|------|------|
| [DB/SCHEMA_REFERENCE.md](DB/SCHEMA_REFERENCE.md) | DB 스키마, API 연동, DBML 전체 레퍼런스 |
| [DEV_LOG.md](DEV_LOG.md) | 프로젝트 INDEX (마일스톤, 의사결정, 이슈) |
| [DEV_LOG/](DEV_LOG/) | 개발자별 일자별 개발일지 |
