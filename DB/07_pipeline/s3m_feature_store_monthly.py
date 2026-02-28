"""
Step 3m: 월간 피처 엔지니어링 (feature_store_monthly)
monthly_product_summary + monthly_customer_summary + 외부지표 → feature_store_monthly

입력 테이블: monthly_product_summary, monthly_customer_summary,
            inventory, purchase_order, economic_indicator, exchange_rate, trade_statistics
출력 테이블: feature_store_monthly
"""

from collections import defaultdict

import numpy as np
import pandas as pd

from config import supabase, upsert_batch


# ─────────────────────────────────────────────────────────────
# 데이터 로드 유틸
# ─────────────────────────────────────────────────────────────

def fetch_all(table: str, select: str) -> list:
    """Supabase 테이블 전체 행 페이징 조회 (테이블 미존재 시 빈 리스트 반환)"""
    all_rows, offset, ps = [], 0, 1000
    while True:
        try:
            q = supabase.table(table).select(select).range(offset, offset + ps - 1)
            resp = q.execute()
        except Exception as e:
            if "PGRST205" in str(e) or "Could not find" in str(e):
                print(f"    [!] 테이블 '{table}' 미존재 — 빈 데이터로 진행")
                return []
            raise
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < ps:
            break
        offset += ps
    return all_rows


# ─────────────────────────────────────────────────────────────
# 1) 월간 제품 집계 로드
# ─────────────────────────────────────────────────────────────

def load_monthly_product() -> pd.DataFrame:
    rows = fetch_all(
        "monthly_product_summary",
        "product_id,year_month,"
        "order_qty,order_amount,order_count,"
        "revenue_qty,revenue_amount,revenue_count,"
        "produced_qty,production_count,customer_count",
    )
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    num_cols = [
        "order_qty", "order_amount", "order_count",
        "revenue_qty", "revenue_amount", "revenue_count",
        "produced_qty", "production_count", "customer_count",
    ]
    for c in num_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)

    # month_start 파생
    df["month_start"] = pd.to_datetime(df["year_month"] + "-01")
    df = df.sort_values(["product_id", "year_month"]).reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────
# 2) 월간 고객 집계 → 고객 집중도 피처
# ─────────────────────────────────────────────────────────────

def load_customer_concentration() -> pd.DataFrame:
    rows = fetch_all(
        "monthly_customer_summary",
        "product_id,customer_id,year_month,order_qty",
    )
    if not rows:
        return pd.DataFrame(columns=[
            "product_id", "year_month",
            "top1_customer_pct", "top3_customer_pct", "customer_hhi",
        ])

    df = pd.DataFrame(rows)
    df["order_qty"] = pd.to_numeric(df["order_qty"], errors="coerce").fillna(0)

    result = []
    for (pid, ym), grp in df.groupby(["product_id", "year_month"]):
        total = grp["order_qty"].sum()
        if total <= 0:
            result.append({
                "product_id": pid, "year_month": ym,
                "top1_customer_pct": 0.0, "top3_customer_pct": 0.0,
                "customer_hhi": 0.0,
            })
            continue

        shares = (grp["order_qty"] / total).sort_values(ascending=False)
        top1 = float(shares.iloc[0]) * 100 if len(shares) >= 1 else 0.0
        top3 = float(shares.iloc[:3].sum()) * 100 if len(shares) >= 1 else 0.0
        hhi = float((shares ** 2).sum())

        result.append({
            "product_id": pid, "year_month": ym,
            "top1_customer_pct": round(top1, 2),
            "top3_customer_pct": round(top3, 2),
            "customer_hhi": round(hhi, 4),
        })

    return pd.DataFrame(result)


# ─────────────────────────────────────────────────────────────
# 3) 재고 (월별 스냅샷 직접 사용)
# ─────────────────────────────────────────────────────────────

def load_inventory_monthly() -> pd.DataFrame:
    rows = fetch_all("inventory", "snapshot_date,product_id,inventory_qty")
    if not rows:
        return pd.DataFrame(columns=["product_id", "year_month", "inventory_qty"])

    inv = pd.DataFrame(rows)
    inv["inventory_qty"] = pd.to_numeric(inv["inventory_qty"], errors="coerce").fillna(0)
    inv = inv.groupby(["snapshot_date", "product_id"], as_index=False)["inventory_qty"].sum()

    # snapshot_date 'YYYYMM' → 'YYYY-MM'
    inv["year_month"] = inv["snapshot_date"].str[:4] + "-" + inv["snapshot_date"].str[4:]
    result = inv.groupby(["product_id", "year_month"], as_index=False)["inventory_qty"].sum()
    return result


# ─────────────────────────────────────────────────────────────
# 4) 리드타임
# ─────────────────────────────────────────────────────────────

def load_lead_time() -> dict:
    rows = fetch_all(
        "purchase_order",
        "component_product_id,po_date,receipt_date,status",
    )
    if not rows:
        return {}

    df = pd.DataFrame(rows)
    df = df[df["status"] == "F"].copy()
    df = df.dropna(subset=["po_date", "receipt_date"])
    if df.empty:
        return {}

    df["po_date"] = pd.to_datetime(df["po_date"], errors="coerce")
    df["receipt_date"] = pd.to_datetime(df["receipt_date"], errors="coerce")
    df = df.dropna(subset=["po_date", "receipt_date"])
    df["lead_days"] = (df["receipt_date"] - df["po_date"]).dt.days
    df = df[df["lead_days"] >= 0]

    avg_lead = df.groupby("component_product_id")["lead_days"].mean()
    return avg_lead.to_dict()


# ─────────────────────────────────────────────────────────────
# 5) 평균 단가
# ─────────────────────────────────────────────────────────────

def load_avg_unit_price() -> dict:
    rows = fetch_all("purchase_order", "component_product_id,unit_price")
    price_map = defaultdict(list)
    for r in rows:
        pid = r.get("component_product_id")
        price = r.get("unit_price")
        if pid and price:
            price_map[pid].append(float(price))
    return {pid: sum(ps) / len(ps) for pid, ps in price_map.items() if ps}


# ─────────────────────────────────────────────────────────────
# 6) 외부지표 → 월간 시계열 (이미 월별이므로 간단)
# ─────────────────────────────────────────────────────────────

def load_external_monthly(year_months: list[str]) -> pd.DataFrame:
    """경제지표 + 환율 + 무역통계 → year_month 기준 피처 DataFrame"""

    result = pd.DataFrame({"year_month": sorted(set(year_months))})

    # 경제지표
    econ_rows = fetch_all("economic_indicator", "source,indicator_code,date,value")
    econ_df = pd.DataFrame(econ_rows) if econ_rows else pd.DataFrame(
        columns=["source", "indicator_code", "date", "value"]
    )
    if not econ_df.empty:
        econ_df["date"] = pd.to_datetime(econ_df["date"])
        econ_df["value"] = pd.to_numeric(econ_df["value"], errors="coerce")
        econ_df["year_month"] = econ_df["date"].dt.strftime("%Y-%m")

    # 지표 매핑 (모두 월간 평균/마지막 값으로 집계)
    INDICATOR_MAP = {
        "SOX": "sox_index",
        "DRAM_DDR4": "dram_price",
        "NAND_TLC": "nand_price",
        "SILICON_WAFER": "silicon_wafer_price",
        "FEDFUNDS": "fed_funds_rate",
        "WTI_WEEKLY": "wti_price",
        "INDPRO": "indpro_index",
        "IPMAN": "ipman_index",
        "KR_BASE_RATE": "kr_base_rate",
        "KR_IPI_MFG": "kr_ipi_mfg",
        "KR_BSI_MFG": "kr_bsi_mfg",
        "CN_PMI_MFG": "cn_pmi_mfg",
    }

    if not econ_df.empty:
        for code, col_name in INDICATOR_MAP.items():
            subset = econ_df[econ_df["indicator_code"] == code]
            if not subset.empty:
                monthly_val = subset.groupby("year_month")["value"].mean().reset_index()
                monthly_val.columns = ["year_month", col_name]
                result = result.merge(monthly_val, on="year_month", how="left")
            else:
                result[col_name] = np.nan
    else:
        for col_name in INDICATOR_MAP.values():
            result[col_name] = np.nan

    # 환율 → 월간 평균
    CURRENCY_MAP = {
        "USD": "usd_krw",
        "JPY": "jpy_krw",
        "EUR": "eur_krw",
        "CNY": "cny_krw",
    }
    exrate_rows = fetch_all("exchange_rate", "base_currency,rate_date,rate")
    exrate_df = pd.DataFrame(exrate_rows) if exrate_rows else pd.DataFrame(
        columns=["base_currency", "rate_date", "rate"]
    )
    if not exrate_df.empty:
        exrate_df["rate_date"] = pd.to_datetime(exrate_df["rate_date"])
        exrate_df["rate"] = pd.to_numeric(exrate_df["rate"], errors="coerce")
        exrate_df["year_month"] = exrate_df["rate_date"].dt.strftime("%Y-%m")

        for currency, col_name in CURRENCY_MAP.items():
            subset = exrate_df[exrate_df["base_currency"] == currency]
            if not subset.empty:
                monthly_avg = subset.groupby("year_month")["rate"].mean().reset_index()
                monthly_avg.columns = ["year_month", col_name]
                result = result.merge(monthly_avg, on="year_month", how="left")
            else:
                result[col_name] = np.nan
    else:
        for col_name in CURRENCY_MAP.values():
            result[col_name] = np.nan

    # 무역통계 → 이미 월별
    trade_rows = fetch_all("trade_statistics", "hs_code,year_month,export_amount,import_amount")
    trade_df = pd.DataFrame(trade_rows) if trade_rows else pd.DataFrame(
        columns=["hs_code", "year_month", "export_amount", "import_amount"]
    )
    if not trade_df.empty:
        trade_df["export_amount"] = pd.to_numeric(trade_df["export_amount"], errors="coerce").fillna(0)
        trade_df["import_amount"] = pd.to_numeric(trade_df["import_amount"], errors="coerce").fillna(0)

        monthly_trade = trade_df.groupby("year_month").agg(
            semi_export_amt=("export_amount", "sum"),
            semi_import_amt=("import_amount", "sum"),
        ).reset_index()
        monthly_trade["semi_trade_balance"] = (
            monthly_trade["semi_export_amt"] - monthly_trade["semi_import_amt"]
        )
        monthly_trade = monthly_trade.sort_values("year_month")
        monthly_trade["semi_export_roc"] = monthly_trade["semi_export_amt"].pct_change()

        result = result.merge(
            monthly_trade[["year_month", "semi_export_amt", "semi_import_amt",
                           "semi_trade_balance", "semi_export_roc"]],
            on="year_month", how="left",
        )
    else:
        for c in ["semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc"]:
            result[c] = np.nan

    # forward-fill
    result = result.sort_values("year_month")
    fill_cols = [c for c in result.columns if c != "year_month"]
    result[fill_cols] = result[fill_cols].ffill()

    return result


# ─────────────────────────────────────────────────────────────
# 7) 피처 엔지니어링 메인 로직
# ─────────────────────────────────────────────────────────────

def build_features(df_mps: pd.DataFrame, df_conc: pd.DataFrame,
                   df_inv: pd.DataFrame, df_ext: pd.DataFrame,
                   lead_map: dict, price_map: dict) -> pd.DataFrame:
    """월간 제품 집계 → 전체 피처 DataFrame 생성"""

    df = df_mps.copy()
    grp = df.groupby("product_id")

    # ── A: 수주 이력 래그 ──
    for lag in [1, 2, 3, 6, 12]:
        df[f"order_qty_lag{lag}"] = grp["order_qty"].shift(lag)

    # 이동평균
    df["order_qty_ma3"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    )
    df["order_qty_ma6"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(6, min_periods=1).mean()
    )
    df["order_qty_ma12"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(12, min_periods=1).mean()
    )

    df["order_count_lag1"] = grp["order_count"].shift(1)
    df["order_amount_lag1"] = grp["order_amount"].shift(1)

    # ── B: 모멘텀 ──
    ma3_curr = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    )
    ma3_lag3 = grp["order_qty"].transform(
        lambda x: x.shift(4).rolling(3, min_periods=1).mean()
    )
    df["order_qty_roc_3m"] = np.where(ma3_lag3 > 0, (ma3_curr - ma3_lag3) / ma3_lag3, 0.0)

    ma3_lag6 = grp["order_qty"].transform(
        lambda x: x.shift(7).rolling(3, min_periods=1).mean()
    )
    df["order_qty_roc_6m"] = np.where(ma3_lag6 > 0, (ma3_curr - ma3_lag6) / ma3_lag6, 0.0)

    df["order_qty_diff_1m"] = df["order_qty_lag1"] - df["order_qty_lag2"]
    df["order_qty_diff_3m"] = df["order_qty_lag1"] - grp["order_qty"].shift(4)

    # ── C: 변동성 ──
    df["order_qty_std3"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=2).std()
    )
    df["order_qty_std6"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(6, min_periods=2).std()
    )
    df["order_qty_cv3"] = np.where(
        df["order_qty_ma3"] > 0, df["order_qty_std3"] / df["order_qty_ma3"], 0.0
    )
    df["order_qty_max3"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).max()
    )
    df["order_qty_min3"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).min()
    )
    df["order_qty_nonzero_3m"] = grp["order_qty"].transform(
        lambda x: (x.shift(1) > 0).rolling(3, min_periods=1).sum()
    ).astype("Int16")
    df["order_qty_nonzero_6m"] = grp["order_qty"].transform(
        lambda x: (x.shift(1) > 0).rolling(6, min_periods=1).sum()
    ).astype("Int16")

    # ── D: 공급측 ──
    df["revenue_qty_lag1"] = grp["revenue_qty"].shift(1)
    df["revenue_qty_ma3"] = grp["revenue_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    )
    df["produced_qty_lag1"] = grp["produced_qty"].shift(1)
    df["produced_qty_ma3"] = grp["produced_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    )

    # book-to-bill: 최근 3개월 수주합 / 최근 3개월 출하합
    order_3m = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).sum()
    )
    rev_3m = grp["revenue_qty"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).sum()
    )
    df["book_to_bill_3m"] = np.where(rev_3m > 0, order_3m / rev_3m, 1.0)

    df["avg_lead_days"] = df["product_id"].map(lead_map)
    df["avg_unit_price"] = df["product_id"].map(price_map)

    df["order_avg_value"] = np.where(
        df["order_qty_lag1"] > 0,
        df["order_amount_lag1"] / df["order_qty_lag1"],
        np.nan,
    )

    # ── E: 고객 집중도 조인 ──
    if not df_conc.empty:
        df = df.merge(df_conc, on=["product_id", "year_month"], how="left")
    else:
        df["top1_customer_pct"] = np.nan
        df["top3_customer_pct"] = np.nan
        df["customer_hhi"] = np.nan

    df["customer_count_lag1"] = grp["customer_count"].shift(1)
    df["customer_count_ma3"] = grp["customer_count"].transform(
        lambda x: x.shift(1).rolling(3, min_periods=1).mean()
    )

    # ── 재고 조인 ──
    if not df_inv.empty:
        df = df.merge(df_inv, on=["product_id", "year_month"], how="left")
    else:
        df["inventory_qty"] = np.nan

    # inventory_months = 재고 / 월간 평균 수주량
    df["inventory_months"] = np.where(
        df["order_qty_ma3"] > 0,
        df["inventory_qty"] / df["order_qty_ma3"],
        np.nan,
    )

    # ── F: 외부지표 조인 ──
    if not df_ext.empty:
        df = df.merge(df_ext, on="year_month", how="left")

    # 변화율 피처
    if "sox_index" in df.columns:
        sox_grp = df.groupby("product_id")["sox_index"]
        sox_lag3 = sox_grp.shift(3)
        df["sox_roc_3m"] = np.where(sox_lag3 > 0, (df["sox_index"] - sox_lag3) / sox_lag3, 0.0)

        dram_grp = df.groupby("product_id")["dram_price"]
        dram_lag3 = dram_grp.shift(3)
        df["dram_roc_3m"] = np.where(dram_lag3 > 0, (df["dram_price"] - dram_lag3) / dram_lag3, 0.0)

        usd_grp = df.groupby("product_id")["usd_krw"]
        usd_lag3 = usd_grp.shift(3)
        df["usd_krw_roc_3m"] = np.where(usd_lag3 > 0, (df["usd_krw"] - usd_lag3) / usd_lag3, 0.0)
    else:
        df["sox_roc_3m"] = np.nan
        df["dram_roc_3m"] = np.nan
        df["usd_krw_roc_3m"] = np.nan

    # ── K: 시간 피처 ──
    df["month"] = df["month_start"].dt.month
    df["quarter"] = (df["month"] - 1) // 3 + 1
    df["is_year_end"] = df["month"] >= 11

    # ── 타겟 (forward-shift) ──
    df["target_1m"] = grp["order_qty"].shift(-1)
    shift_m2 = grp["order_qty"].shift(-2)
    shift_m3 = grp["order_qty"].shift(-3)
    df["target_3m"] = df["target_1m"] + shift_m2 + shift_m3
    shift_m4 = grp["order_qty"].shift(-4)
    shift_m5 = grp["order_qty"].shift(-5)
    shift_m6 = grp["order_qty"].shift(-6)
    df["target_6m"] = df["target_3m"] + shift_m4 + shift_m5 + shift_m6

    return df


# ─────────────────────────────────────────────────────────────
# 출력 컬럼 정의
# ─────────────────────────────────────────────────────────────

OUTPUT_COLS = [
    "product_id", "year_month", "month_start",
    # A: 수주 이력
    "order_qty_lag1", "order_qty_lag2", "order_qty_lag3",
    "order_qty_lag6", "order_qty_lag12",
    "order_qty_ma3", "order_qty_ma6", "order_qty_ma12",
    "order_count_lag1", "order_amount_lag1",
    # B: 모멘텀
    "order_qty_roc_3m", "order_qty_roc_6m",
    "order_qty_diff_1m", "order_qty_diff_3m",
    # C: 변동성
    "order_qty_std3", "order_qty_std6", "order_qty_cv3",
    "order_qty_max3", "order_qty_min3",
    "order_qty_nonzero_3m", "order_qty_nonzero_6m",
    # D: 공급측
    "revenue_qty_lag1", "revenue_qty_ma3",
    "produced_qty_lag1", "produced_qty_ma3",
    "inventory_qty", "inventory_months", "avg_lead_days", "book_to_bill_3m",
    # E: 고객 집중도
    "customer_count_lag1", "customer_count_ma3",
    "top1_customer_pct", "top3_customer_pct", "customer_hhi",
    # F: 가격
    "avg_unit_price", "order_avg_value",
    # G: 반도체 시장
    "sox_index", "sox_roc_3m", "dram_price", "dram_roc_3m",
    "nand_price", "silicon_wafer_price",
    # H: 환율
    "usd_krw", "usd_krw_roc_3m", "jpy_krw", "eur_krw", "cny_krw",
    # I: 거시경제
    "fed_funds_rate", "wti_price", "indpro_index", "ipman_index",
    "kr_base_rate", "kr_ipi_mfg", "kr_bsi_mfg", "cn_pmi_mfg",
    # J: 무역
    "semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc",
    # K: 시간
    "month", "quarter", "is_year_end",
    # 타겟
    "target_1m", "target_3m", "target_6m",
]


# ─────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────

def run():
    print("[S3m] 월간 피처 엔지니어링 시작")

    # 1) 기반 데이터 로드
    print("  데이터 로드 중...")
    df_mps = load_monthly_product()
    if df_mps.empty:
        print("  [!] monthly_product_summary 비어있음. s0 먼저 실행 필요")
        return
    print(f"    monthly_product_summary: {len(df_mps):,}행, "
          f"제품: {df_mps['product_id'].nunique():,}개")

    # 고객 집중도
    print("  고객 집중도 계산 중...")
    df_conc = load_customer_concentration()
    print(f"    고객 집중도: {len(df_conc):,}행")

    # 재고
    print("  재고 데이터 로드 중...")
    df_inv = load_inventory_monthly()
    print(f"    월간 재고: {len(df_inv):,}행")

    # 리드타임, 단가
    lead_map = load_lead_time()
    price_map = load_avg_unit_price()
    print(f"    리드타임: {len(lead_map):,}개 제품, 단가: {len(price_map):,}개 제품")

    # 외부지표
    print("  외부지표 로드 중...")
    year_months = df_mps["year_month"].unique().tolist()
    df_ext = load_external_monthly(year_months)
    print(f"    외부지표: {len(df_ext):,}월 × {len(df_ext.columns)-1}개 지표")

    # 2) 피처 빌드
    print("\n  피처 생성 중...")
    df_features = build_features(df_mps, df_conc, df_inv, df_ext, lead_map, price_map)

    # 래그 피처 최소 요건: order_qty_lag1이 존재하는 행만
    df_features = df_features.dropna(subset=["order_qty_lag1"])

    # 출력 컬럼 선택
    existing_cols = [c for c in OUTPUT_COLS if c in df_features.columns]
    df_out = df_features[existing_cols].copy()

    # month_start를 ISO 문자열로 변환
    df_out["month_start"] = df_out["month_start"].dt.strftime("%Y-%m-%d")

    # bool → Python bool 변환
    if "is_year_end" in df_out.columns:
        df_out["is_year_end"] = df_out["is_year_end"].astype(bool)

    print(f"    결과: {len(df_out):,}행 × {len(existing_cols)}열")

    # 제품별 최소 6개월 이력 필터
    prod_counts = df_out.groupby("product_id").size()
    valid_products = prod_counts[prod_counts >= 6].index
    df_out = df_out[df_out["product_id"].isin(valid_products)]
    print(f"    6개월 이상 제품 필터 후: {len(df_out):,}행, "
          f"제품: {df_out['product_id'].nunique():,}개")

    # 3) Supabase 적재
    print("\n  feature_store_monthly 적재 중...")

    INT_COLS = {
        "order_count_lag1", "customer_count_lag1",
        "order_qty_nonzero_3m", "order_qty_nonzero_6m",
        "month", "quarter",
    }

    rows = df_out.replace({np.nan: None, np.inf: None, -np.inf: None}).to_dict("records")
    for row in rows:
        for k, v in row.items():
            if v is None:
                continue
            if isinstance(v, (np.integer,)):
                row[k] = int(v)
            elif isinstance(v, (np.floating,)):
                if k in INT_COLS:
                    row[k] = int(v)
                else:
                    row[k] = round(float(v), 6)
            elif isinstance(v, (np.bool_, bool)):
                row[k] = bool(v)
            elif isinstance(v, float) and k in INT_COLS:
                row[k] = int(v)

    cnt = upsert_batch("feature_store_monthly", rows, on_conflict="product_id,year_month")
    print(f"    적재 완료: {cnt:,}행")

    # 4) 결과 요약
    count = supabase.table("feature_store_monthly").select("id", count="exact").execute()
    print(f"\n[S3m] 완료 — feature_store_monthly: {count.count:,}행")

    target_notnull = df_out["target_1m"].notna().sum()
    print(f"    학습 가능 행 (target_1m 존재): {target_notnull:,}행")


if __name__ == "__main__":
    run()
