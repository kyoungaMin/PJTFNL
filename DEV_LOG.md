# 프로젝트 INDEX — 반도체 부품·소재 수요예측 AI SaaS

> **프로젝트명**: 반도체 부품·소재 수요 변동성 분석 및 재고 리스크 최적화 AI SaaS
> **프로젝트 시작일**: 2026-02-27
> **최종 수정일**: 2026-03-07

---

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| **목표** | 일별 수주 데이터 기반 수요 변동성 분석, 재고 리스크 점수화, 생산·발주 의사결정 최적화 |
| **대상 산업** | 반도체 부품·소재 제조/유통 |
| **서비스 형태** | 산업 특화형 AI SaaS (웹 기반 대시보드) |
| **핵심 기능** | 수요예측, 리스크 스코어링, 발주 추천, 생산계획 최적화 |

### 보유 데이터 현황

| 파일명 | 설명 | 비고 |
|--------|------|------|
| `일별수주.csv` | 일별 수주 데이터 (핵심 입력) | 수요 변동성 분석 기반 |
| `일별매출.csv` | 일별 매출 실적 | 수요-매출 갭 분석 |
| `일별생산.csv` | 일별 생산 실적 | 생산 캐파 분석 |
| `재고.csv` | 현재 재고 현황 | 리스크 점수 산정 기반 |
| `구매발주.csv` | 구매 발주 이력 | 리드타임 분석 |
| `제품마스터.csv` | 제품 기본 정보 | 제품 분류·속성 |
| `BOM.csv` | 자재명세서 | 소재→부품 연결 관계 |
| `고객사.csv` | 고객사 정보 | 고객별 수요 패턴 |
| `거래처.csv` | 거래처(공급사) 정보 | 공급 리드타임·안정성 |

---

## 개발일지 구조

> 개발일지는 `git config --global user.name` 기준으로 **개발자별 폴더** 안에 **일자별 파일**로 관리됩니다.

```
DEV_LOG/
├── _TEMPLATE.md          ← 일자별 개발일지 템플릿
├── kyoungaMin/
│   ├── 2026-02-27.md
│   └── ...
├── jieun/
│   └── ...
├── sungmin/
│   └── ...
└── dasom/
    └── ...
```

### 개발자 현황

| Git user.name | Git user.email | 역할 | 비고 |
|---------------|----------------|------|------|
| kyoungaMin | kamin@penta.co.kr | | |
| jieun | | | |
| sungmin | | | |
| dasom | | | |

---

## 마일스톤 계획

| 단계 | 마일스톤 | 목표 기한 | 상태 |
|------|----------|-----------|------|
| Phase 1 | 데이터 탐색·전처리 파이프라인 구축 | | `완료` |
| Phase 2 | 수요 변동성 분석 모델 개발 | | `완료` |
| Phase 3 | 재고 리스크 점수화 엔진 개발 | | `완료` |
| Phase 4 | 생산·발주 최적화 알고리즘 개발 | | `완료` |
| Phase 5 | 웹 대시보드 및 API 서버 구축 | | `진행중` |
| Phase 6 | 통합 테스트·배포 | | `대기` |

---

## 기술 스택 (확정 시 업데이트)

| 영역 | 기술 | 선정 사유 |
|------|------|-----------|
| **백엔드** | FastAPI (Python) | Python ML 연동, 자동 API 문서(Swagger), 비동기 지원 |
| **프론트엔드** | Next.js (React) | SSR/SSG 대시보드, Supabase 공식 지원, Vercel 배포 |
| **데이터 파이프라인** | Python (supabase-py, pandas) | DB 직접 연동, 6단계 순차 파이프라인 |
| **ML/AI 모델** | LightGBM Quantile / 이동평균 fallback | P10/P50/P90 분위 예측, 외부 피처 활용 |
| **데이터베이스** | PostgreSQL (Supabase) | SaaS 프로덕션, 팀 공유, REST API 제공 |
| **배포/인프라** | | |

---

## 누적 의사결정 로그

| 날짜 | 작성자 | 결정 사항 | 선택지 | 결정 | 사유 |
|------|--------|-----------|--------|------|------|
| 2026-02-27 | kyoungaMin | 개발일지 형식 | Notion / Markdown | Markdown | 코드와 함께 버전 관리 가능 |
| 2026-02-27 | kyoungaMin | 개발일지 구조 | 단일파일 / 개발자별 분리 | 개발자별 분리 | 4인 분담 개발, 충돌 방지 |
| 2026-02-27 | kyoungaMin | 개발자 식별 방식 | Windows 계정 / Git config / 수동 입력 | Git config | 별도 매핑 불필요, 실명 가독성 |
| 2026-02-27 | kyoungaMin | 데이터베이스 | SQLite / PostgreSQL / DuckDB | PostgreSQL (Supabase) | SaaS 프로덕션 환경, 팀 공유 |
| 2026-02-27 | kyoungaMin | FK 제약조건 | 설정 / 미설정 | 미설정 | 데이터 유연성 우선 |
| 2026-02-27 | kyoungaMin | 데이터 적재 방식 | Python / SQL / CLI | SQL + Python | DDL은 SQL Editor, 데이터는 REST API |
| 2026-02-27 | kyoungaMin | 백엔드 프레임워크 | FastAPI / Next.js API / Express / Django | FastAPI (Python) | ML 연동, 자동 Swagger, 비동기 |
| 2026-02-27 | kyoungaMin | 프론트엔드 프레임워크 | Next.js / React+Vite / Streamlit / Vue+Nuxt | Next.js (React) | SSR 대시보드, Supabase 지원, Vercel 배포 |
| 2026-02-27 | kyoungaMin | 외부지표 DB 구조 | 소스별 분리 / 통합 테이블 | 통합 2테이블 (economic_indicator + trade_statistics) | 시계열은 통합, 무역통계는 구조가 달라 분리 |
| 2026-02-27 | kyoungaMin | 인증 방식 | Supabase Auth / 자체 구현 | Supabase Auth | 내장 JWT, OAuth 지원, 별도 인증 로직 불필요 |
| 2026-02-27 | kyoungaMin | 권한 구조 | 단일 역할 / RBAC / 조직+역할 | RBAC (4단계) | admin/manager/analyst/viewer, B2B SaaS 적합 |
| 2026-02-28 | kyoungaMin | 출하 데이터 대체 | 별도 출하 테이블 / 매출 대체 | 매출(daily_revenue) 대체 | B2B 반도체 특성상 출하≈매출 래그 미미 |
| 2026-02-28 | kyoungaMin | 일간 재고 산출 | DB 뷰 / Python 계산 테이블 | Python 계산 → 테이블 적재 | 월초 스냅샷 기반 일간 보간, 복잡한 누적 로직 |
| 2026-02-28 | kyoungaMin | 예측 모델 | Prophet / ARIMA / LightGBM Quantile | LightGBM Quantile | P10/P50/P90 밴드 직접 산출, 외부 피처 활용 용이 |
| 2026-02-28 | kyoungaMin | 리스크 가중치 | 균등 / 불균등 | 불균등 (결품35%/과잉25%/납기25%/마진15%) | 제조업 특성상 결품 리스크가 가장 치명적 |
| 2026-02-28 | kyoungaMin | 조치 큐 생성 기준 | 전체 / C등급 이상 | C등급 이상 (total_risk > 40) | 과다 알림 방지, 운영 실효성 |
| 2026-03-01 | kyoungaMin | 수요 0 제품 과잉 리스크 | 무조건 0 / 고정 30 / 재고금액 비례 | 고정 30점 | 재고 존재 시 경고 필요하나 데이터 없이 과대평가 방지 |
| 2026-03-01 | kyoungaMin | 등급 경계 구현 | 범위 튜플 / 상한값 리스트 | 상한값 리스트 | 정수 사이 갭(20.5점) 버그 방지 |
| 2026-03-01 | kyoungaMin | S6 심각도 산정 | 개별점수만 / 종합점수만 / 개별×종합 조합 | 조합 | critical을 진정한 위험에만 한정, 우선순위 실행력 |
| 2026-03-01 | kyoungaMin | S7 생산량 기준 | P50만 / P90만 / 리스크별 동적 | 리스크별 동적 | 결품 위험 시 P90, 과잉 위험 시 10% 감량 |
| 2026-03-01 | kyoungaMin | S8 발주량 산출 | lot-for-lot만 / EOQ만 / EOQ+fallback | EOQ+fallback | EOQ 불가 시 lot-for-lot 자동 전환 |
| 2026-03-01 | kyoungaMin | 공급사 추천 가중치 | 단가 위주 / 리드타임 위주 / 종합 점수 | 종합(리드0.4+단가0.35+신뢰0.25) | 편향 방지, 대체 공급사 함께 제시 |

---

## 모델 실험 종합 추적표

| 실험 ID | 날짜 | 작성자 | 대상 | 모델/방법 | 핵심 파라미터 | 주요 지표 | 비고 |
|---------|------|--------|------|----------|--------------|-----------|------|
| v1_baseline | 2026-03-07 | kyoungaMin | 주간 (target_1w) | LightGBM 5-Fold CV 앙상블 | max_depth=6, lr=0.05, reg_alpha=0.1, reg_lambda=1.0 | R²=0.2642, MAE=50.6, Gap=0.20 | 기본 설정 |
| v2_log_transform | 2026-03-07 | kyoungaMin | 주간 | LightGBM + log1p 변환 | 동일 + log1p/expm1 | R²=-0.0005, MAE=39.2, Gap=0.03 | R² 악화, 부적합 |
| v3_strong_reg | 2026-03-07 | kyoungaMin | 주간 | LightGBM 정규화 강화 | max_depth=4, num_leaves=15, reg_alpha=1.0, reg_lambda=5.0, min_child=50, lr=0.03 | R²=0.2667, MAE=49.7, Gap=0.09 | **★ 주간 BEST** |
| v4_log_reg | 2026-03-07 | kyoungaMin | 주간 | LightGBM Log+정규화 | v2+v3 결합 | R²=-0.0016, MAE=39.2, Gap=0.02 | R² 악화 |
| v5_full | 2026-03-07 | kyoungaMin | 주간 | LightGBM 종합 | v4+파생피처+P99캡핑 | R²=0.0001, MAE=39.2, Gap=0.04 | R² 악화 |
| monthly_v1_baseline | 2026-03-07 | kyoungaMin | 월간 (target_1m) | LightGBM 5-Fold CV 앙상블 | max_depth=6, lr=0.05, min_child=15 | R²=0.6403, MAE=59.6, Gap=0.11 | **★ 월간 BEST** |
| monthly_v2_log | 2026-03-07 | kyoungaMin | 월간 | LightGBM + log1p 변환 | 동일 + log1p/expm1 | R²=0.2940, MAE=62.1, Gap=0.01 | R² 대폭 하락 |
| monthly_v3_reg | 2026-03-07 | kyoungaMin | 월간 | LightGBM 정규화 강화 | max_depth=4, num_leaves=15, reg_alpha=1.0, reg_lambda=5.0 | R²=0.5984, MAE=60.1, Gap=0.02 | 과적합↓ but R²↓ |
| monthly_v4_log_reg | 2026-03-07 | kyoungaMin | 월간 | LightGBM Log+정규화 | v2+v3 결합 | R²=0.3179, MAE=60.5, Gap=-0.03 | R² 하락 |
| monthly_v5_full | 2026-03-07 | kyoungaMin | 월간 | LightGBM 종합 | v4+파생피처+P99캡핑 | R²=0.2450, MAE=62.5, Gap=-0.02 | R² 최저 |
| mc_lgbm_base | 2026-03-07 | kyoungaMin | 주간+월간 | LightGBM Baseline | max_depth=6, lr=0.05, reg_alpha=0.1 | 주간 R²=0.26/MAE=52.6/±5=6.7%, 월간 R²=0.67/MAE=60.0/±5=5.8% | 멀티모델 비교 |
| mc_lgbm_reg | 2026-03-07 | kyoungaMin | 주간+월간 | LightGBM 정규화 강화 | max_depth=4, num_leaves=15, reg_lambda=5.0 | 주간 R²=0.27/MAE=50.8/±5=6.5%, 월간 R²=0.61/MAE=60.8/±5=5.7% | 주간 R² 최고 |
| mc_lgbm_deep | 2026-03-07 | kyoungaMin | 주간+월간 | LightGBM Deep | max_depth=8, num_leaves=127, min_child=5 | 주간 R²=0.26/MAE=53.4/±5=5.4%, 월간 R²=0.67/MAE=64.0/±5=3.9% | 과적합 경향 |
| mc_lgbm_cons | 2026-03-07 | kyoungaMin | 주간+월간 | LightGBM Conservative | max_depth=3, num_leaves=7, lr=0.01 | 주간 R²=0.26/MAE=51.1/±5=6.3%, 월간 R²=0.52/MAE=65.1/±5=4.6% | 언더피팅 |
| mc_rf | 2026-03-07 | kyoungaMin | 주간+월간 | Random Forest | n_estimators=300, max_depth=8, min_samples_leaf=10 | 주간 R²=0.27/MAE=50.2/±5=15.4%, 월간 R²=0.68/MAE=55.3/±5=35.7% | ±5 양호 |
| mc_svr | 2026-03-07 | kyoungaMin | 주간+월간 | Linear SVR (scaled) | C=1.0, epsilon=0.1, StandardScaler | 주간 R²=0.02/MAE=39.3/±5=62.6%, 월간 R²=0.68/MAE=49.2/±5=47.8% | **±5 최고** |
| mc_ridge | 2026-03-07 | kyoungaMin | 주간+월간 | Ridge Regression (scaled) | alpha=1.0, StandardScaler | 주간 R²=0.26/MAE=42.3/±5=60.2%, 월간 R²=0.69/MAE=54.3/±5=27.6% | **월간 R² 최고** |

---

## 데이터 전처리 이력

| 날짜 | 작성자 | 대상 파일 | 처리 내용 | 처리 전 | 처리 후 | 스크립트 |
|------|--------|----------|-----------|---------|---------|----------|
| — | — | — | — | — | — | — |

---

## 이슈 트래커

| ID | 등록일 | 등록자 | 제목 | 심각도 | 상태 | 해결일 | 해결자 | 해결 방법 |
|----|--------|--------|------|--------|------|--------|--------|-----------|
| ISS-001 | 2026-02-27 | kyoungaMin | ECOS API DNS 해석 실패 (ecos.bok.or.kr) | `중간` | `해결` | 2026-02-28 | kyoungaMin | 네트워크 환경 변경 후 정상 접속, 10종 지표 1,810건 적재 완료 |

---

## 참고자료·레퍼런스

| 주제 | 링크/출처 | 등록자 | 메모 |
|------|----------|--------|------|
| — | — | — | — |

---

## 변경 이력 (이 문서)

| 날짜 | 변경자 | 변경 내용 |
|------|--------|-----------|
| 2026-02-27 | kyoungaMin | 개발일지 템플릿 초기 생성 |
| 2026-02-27 | kyoungaMin | 개발자별 일자별 분리 구조로 전환 |
| 2026-02-27 | kyoungaMin | DB 기술 스택 확정 (Supabase PostgreSQL), DDL/적재 스크립트 추가 |
| 2026-02-27 | kyoungaMin | 외부지표 API 연동 (FRED/EIA/관세청), DDL·적재 스크립트 추가, 6,829건 적재 |
| 2026-02-28 | kyoungaMin | 예측형 관제 시스템 DDL 6테이블 + 6단계 파이프라인 구축 |
| 2026-02-28 | kyoungaMin | 주별·월별 집계 DDL 4테이블 + S0 파이프라인, 23테이블 체계 |
| 2026-02-28 | kyoungaMin | ECOS 한국은행 API 연동 (10종 실데이터 1,810건), ISS-001 해결 |
| 2026-03-01 | kyoungaMin | Phase 3 리스크 실데이터 검증: 등급경계 갭 버그, 과잉 리스크 폴백, 납기 스케일링, 심각도 로직 수정 |
| 2026-03-01 | kyoungaMin | Phase 4 생산·발주 최적화: S7(생산계획)+S8(발주추천) 신규 모듈, DDL 2테이블, S6 suggested_qty 보강 |
| 2026-03-07 | kyoungaMin | LightGBM 주간 5-Fold CV 평가 + 5개 실험 비교 프레임워크 구축, 주간 최적 V3(정규화 강화, R²=0.27) |
| 2026-03-07 | kyoungaMin | LightGBM 월간 5-Fold CV 평가 + 5개 실험 비교, 월간 최적 V1(베이스라인, R²=0.64) |
| 2026-03-07 | kyoungaMin | 멀티 모델 비교 (LightGBM 4종+RF+SVR+Ridge), ±5 허용 오차 분석, 경영진 요약 대시보드 생성 |
| 2026-03-07 | kyoungaMin | 프론트엔드 모델 평가 대시보드 UI (4탭, Recharts), API route, 기존 타입 에러 수정 |
| 2026-03-07 | kyoungaMin | 브랜치 통합: main→dev/kyoungaMin merge + 모델 평가 작업물 커밋·push (41d945f, 37파일) |
| 2026-03-07 | kyoungaMin | 구매권고 UI 개선: 가이드 모달, 로딩 스피너, 긴급도 바 차트, 발주방식 설명, Supabase 페이지네이션 |
| 2026-03-07 | kyoungaMin | 생산권고 UI 개선: 가이드 모달 배경 수정, 알고리즘 산식 추가, 로딩 UX |
| 2026-03-07 | kyoungaMin | S8 파이프라인 주차별 재고/PO 보정 계수 강화 (3%→15%/10%), product_master 배치 조인 |
| 2026-03-07 | kyoungaMin | 대시보드 구성 검토 보고서 작성 (DB 연동 가능 여부 + 사용자 유의미성 분석) |
