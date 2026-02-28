"""
Step 3: 주간 피처 엔지니어링 (feature_store_weekly)
weekly_product_summary + weekly_customer_summary + 외부지표 → feature_store_weekly

입력 테이블: weekly_product_summary, weekly_customer_summary,
            daily_inventory_estimated, product_lead_time, purchase_order,
            economic_indicator, exchange_rate, trade_statistics, calendar_week
출력 테이블: feature_store_weekly
"""

from collections import defaultdict
from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import supabase, upsert_batch


# ─────────────────────────────────────────────────────────────
# 데이터 로드 유틸
# ─────────────────────────────────────────────────────────────

def fetch_all(table: str, select: str, order_col: str | None = None) -> list:
    """Supabase 테이블 전체 행 페이징 조회 (테이블 미존재 시 빈 리스트 반환)"""
    all_rows, offset, ps = [], 0, 1000
    while True:
        try:
            q = supabase.table(table).select(select).range(offset, offset + ps - 1)
            if order_col:
                q = q.order(order_col)
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
# 1) 주간 제품 집계 로드 (기반 테이블)
# ─────────────────────────────────────────────────────────────

def load_weekly_product() -> pd.DataFrame:
    """weekly_product_summary → DataFrame"""
    rows = fetch_all(
        "weekly_product_summary",
        "product_id,year_week,week_start,week_end,"
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

    df["week_start"] = pd.to_datetime(df["week_start"])
    df["week_end"] = pd.to_datetime(df["week_end"])
    df = df.sort_values(["product_id", "year_week"]).reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────
# 2) 주간 고객 집계 → 고객 집중도 피처
# ─────────────────────────────────────────────────────────────

def load_customer_concentration() -> pd.DataFrame:
    """weekly_customer_summary → (product_id, year_week) 별 HHI, top1/3 비중"""
    rows = fetch_all(
        "weekly_customer_summary",
        "product_id,customer_id,year_week,order_qty",
    )
    if not rows:
        return pd.DataFrame(columns=[
            "product_id", "year_week",
            "top1_customer_pct", "top3_customer_pct", "customer_hhi",
        ])

    df = pd.DataFrame(rows)
    df["order_qty"] = pd.to_numeric(df["order_qty"], errors="coerce").fillna(0)

    result = []
    for (pid, yw), grp in df.groupby(["product_id", "year_week"]):
        total = grp["order_qty"].sum()
        if total <= 0:
            result.append({
                "product_id": pid, "year_week": yw,
                "top1_customer_pct": 0.0, "top3_customer_pct": 0.0,
                "customer_hhi": 0.0,
            })
            continue

        shares = (grp["order_qty"] / total).sort_values(ascending=False)
        top1 = float(shares.iloc[0]) * 100 if len(shares) >= 1 else 0.0
        top3 = float(shares.iloc[:3].sum()) * 100 if len(shares) >= 1 else 0.0
        hhi = float((shares ** 2).sum())

        result.append({
            "product_id": pid, "year_week": yw,
            "top1_customer_pct": round(top1, 2),
            "top3_customer_pct": round(top3, 2),
            "customer_hhi": round(hhi, 4),
        })

    return pd.DataFrame(result)


# ─────────────────────────────────────────────────────────────
# 3) 재고 (week_end 기준 스냅샷)
# ─────────────────────────────────────────────────────────────

def load_inventory_weekly(calendar_df: pd.DataFrame) -> pd.DataFrame:
    """재고 스냅샷(월별)을 주간으로 매핑 (daily_inventory_estimated 불필요)

    - inventory 테이블의 월별 스냅샷을 직접 사용
    - 각 주의 해당 월 스냅샷을 inventory_qty로 매핑
    """
    rows = fetch_all("inventory", "snapshot_date,product_id,inventory_qty")
    if not rows:
        return pd.DataFrame(columns=["product_id", "year_week", "inventory_qty"])

    inv = pd.DataFrame(rows)
    inv["inventory_qty"] = pd.to_numeric(inv["inventory_qty"], errors="coerce").fillna(0)
    # 같은 (snapshot_date, product_id)에 여러 창고 → 합산
    inv = inv.groupby(["snapshot_date", "product_id"], as_index=False)["inventory_qty"].sum()

    # snapshot_date 형식: 'YYYYMM'
    # calendar_df의 year_week → YYYYMM 매핑
    cal = calendar_df[["year_week", "week_end"]].copy()
    cal["week_end"] = pd.to_datetime(cal["week_end"])
    cal["ym"] = cal["week_end"].dt.strftime("%Y%m")

    # (ym, product_id) → inventory_qty 딕셔너리 → 주별 매핑
    merged = cal[["year_week", "ym"]].merge(
        inv.rename(columns={"snapshot_date": "ym"}),
        on="ym", how="inner",
    )
    result = merged.groupby(["product_id", "year_week"], as_index=False)["inventory_qty"].sum()
    return result


# ─────────────────────────────────────────────────────────────
# 4) 리드타임 (제품별 최신)
# ─────────────────────────────────────────────────────────────

def load_lead_time() -> dict:
    """purchase_order에서 직접 리드타임 계산 → {product_id: avg_lead_days}

    리드타임 = receipt_date - po_date (완료건 status='F'만)
    product_lead_time 테이블 불필요
    """
    rows = fetch_all(
        "purchase_order",
        "component_product_id,po_date,receipt_date,status",
    )
    if not rows:
        return {}

    df = pd.DataFrame(rows)
    # 완료건만
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
    """purchase_order → {product_id: avg_unit_price}"""
    rows = fetch_all("purchase_order", "component_product_id,unit_price")
    price_map = defaultdict(list)
    for r in rows:
        pid = r.get("component_product_id")
        price = r.get("unit_price")
        if pid and price:
            price_map[pid].append(float(price))
    return {pid: sum(ps) / len(ps) for pid, ps in price_map.items() if ps}


# ─────────────────────────────────────────────────────────────
# 6) 외부지표 → 주간 시계열
# ─────────────────────────────────────────────────────────────

def load_external_weekly(calendar_df: pd.DataFrame) -> pd.DataFrame:
    """경제지표 + 환율 + 무역통계 → year_week 기준 피처 DataFrame"""

    # 6a) 주차 캘린더를 기반으로 날짜 → year_week 매핑 생성
    cal = calendar_df[["year_week", "week_start", "week_end", "year_month"]].copy()
    cal["week_start"] = pd.to_datetime(cal["week_start"])
    cal["week_end"] = pd.to_datetime(cal["week_end"])

    # 6b) 경제지표 로드
    econ_rows = fetch_all("economic_indicator", "source,indicator_code,date,value")
    econ_df = pd.DataFrame(econ_rows) if econ_rows else pd.DataFrame(
        columns=["source", "indicator_code", "date", "value"]
    )
    if not econ_df.empty:
        econ_df["date"] = pd.to_datetime(econ_df["date"])
        econ_df["value"] = pd.to_numeric(econ_df["value"], errors="coerce")

    # 6c) 환율 로드
    exrate_rows = fetch_all("exchange_rate", "base_currency,rate_date,rate")
    exrate_df = pd.DataFrame(exrate_rows) if exrate_rows else pd.DataFrame(
        columns=["base_currency", "rate_date", "rate"]
    )
    if not exrate_df.empty:
        exrate_df["rate_date"] = pd.to_datetime(exrate_df["rate_date"])
        exrate_df["rate"] = pd.to_numeric(exrate_df["rate"], errors="coerce")

    # 6d) 무역통계 로드
    trade_rows = fetch_all("trade_statistics", "hs_code,year_month,export_amount,import_amount")
    trade_df = pd.DataFrame(trade_rows) if trade_rows else pd.DataFrame(
        columns=["hs_code", "year_month", "export_amount", "import_amount"]
    )
    if not trade_df.empty:
        trade_df["export_amount"] = pd.to_numeric(trade_df["export_amount"], errors="coerce").fillna(0)
        trade_df["import_amount"] = pd.to_numeric(trade_df["import_amount"], errors="coerce").fillna(0)

    # ── 일별 지표 → 주간 평균 ──
    DAILY_INDICATORS = {
        "SOX": "sox_index",
        "BALTIC_DRY": "baltic_dry_index",
        "COPPER_LME": "copper_lme",
    }
    WEEKLY_INDICATORS = {
        "DRAM_DDR4": "dram_price",
        "NAND_TLC": "nand_price",
        "WTI_WEEKLY": "wti_price",
    }
    MONTHLY_INDICATORS = {
        "SILICON_WAFER": "silicon_wafer_price",
        "FEDFUNDS": "fed_funds_rate",
        "INDPRO": "indpro_index",
        "IPMAN": "ipman_index",
        "KR_BASE_RATE": "kr_base_rate",
        "KR_IPI_MFG": "kr_ipi_mfg",
        "KR_BSI_MFG": "kr_bsi_mfg",
        "CN_PMI_MFG": "cn_pmi_mfg",
    }

    result = cal[["year_week"]].copy()

    if not econ_df.empty:
        # 날짜를 year_week에 매핑
        date_to_week = {}
        for _, row in cal.iterrows():
            ws = row["week_start"]
            for d in range(7):
                dt = ws + pd.Timedelta(days=d)
                date_to_week[dt] = row["year_week"]

        econ_df["year_week"] = econ_df["date"].map(date_to_week)

        # 일별 지표 → 주간 평균
        for code, col_name in DAILY_INDICATORS.items():
            subset = econ_df[econ_df["indicator_code"] == code].dropna(subset=["year_week"])
            if not subset.empty:
                weekly_avg = subset.groupby("year_week")["value"].mean().reset_index()
                weekly_avg.columns = ["year_week", col_name]
                result = result.merge(weekly_avg, on="year_week", how="left")
            else:
                result[col_name] = np.nan

        # 주간 지표 → 마지막 값
        for code, col_name in WEEKLY_INDICATORS.items():
            subset = econ_df[econ_df["indicator_code"] == code].dropna(subset=["year_week"])
            if not subset.empty:
                weekly_last = subset.sort_values("date").groupby("year_week")["value"].last().reset_index()
                weekly_last.columns = ["year_week", col_name]
                result = result.merge(weekly_last, on="year_week", how="left")
            else:
                result[col_name] = np.nan

        # 월별 지표 → year_month로 조인 후 주차에 forward-fill
        for code, col_name in MONTHLY_INDICATORS.items():
            subset = econ_df[econ_df["indicator_code"] == code]
            if not subset.empty:
                # 월별 → 마지막 값
                subset = subset.copy()
                subset["year_month"] = subset["date"].dt.strftime("%Y-%m")
                monthly_val = subset.groupby("year_month")["value"].last().reset_index()
                monthly_val.columns = ["year_month", col_name]
                # year_week → year_month 매핑으로 조인
                yw_ym = cal[["year_week", "year_month"]].drop_duplicates()
                monthly_merged = yw_ym.merge(monthly_val, on="year_month", how="left")
                result = result.merge(
                    monthly_merged[["year_week", col_name]], on="year_week", how="left"
                )
            else:
                result[col_name] = np.nan
    else:
        for indicators in [DAILY_INDICATORS, WEEKLY_INDICATORS, MONTHLY_INDICATORS]:
            for col_name in indicators.values():
                result[col_name] = np.nan

    # ── 환율 → 주간 평균 ──
    CURRENCY_MAP = {
        "USD": "usd_krw",
        "JPY": "jpy_krw",
        "EUR": "eur_krw",
        "CNY": "cny_krw",
    }
    if not exrate_df.empty:
        # 날짜 → year_week 매핑 재사용
        if not econ_df.empty:
            exrate_df["year_week"] = exrate_df["rate_date"].map(date_to_week)
        else:
            date_to_week = {}
            for _, row in cal.iterrows():
                ws = row["week_start"]
                for d in range(7):
                    dt = ws + pd.Timedelta(days=d)
                    date_to_week[dt] = row["year_week"]
            exrate_df["year_week"] = exrate_df["rate_date"].map(date_to_week)

        for currency, col_name in CURRENCY_MAP.items():
            subset = exrate_df[exrate_df["base_currency"] == currency].dropna(subset=["year_week"])
            if not subset.empty:
                weekly_avg = subset.groupby("year_week")["rate"].mean().reset_index()
                weekly_avg.columns = ["year_week", col_name]
                result = result.merge(weekly_avg, on="year_week", how="left")
            else:
                result[col_name] = np.nan
    else:
        for col_name in CURRENCY_MAP.values():
            result[col_name] = np.nan

    # ── 무역통계 → 월별 합계 → 주간 매핑 ──
    if not trade_df.empty:
        monthly_trade = trade_df.groupby("year_month").agg(
            semi_export_amt=("export_amount", "sum"),
            semi_import_amt=("import_amount", "sum"),
        ).reset_index()
        monthly_trade["semi_trade_balance"] = (
            monthly_trade["semi_export_amt"] - monthly_trade["semi_import_amt"]
        )
        # 수출 변화율
        monthly_trade = monthly_trade.sort_values("year_month")
        monthly_trade["semi_export_roc"] = (
            monthly_trade["semi_export_amt"].pct_change()
        )

        yw_ym = cal[["year_week", "year_month"]].drop_duplicates()
        trade_merged = yw_ym.merge(monthly_trade, on="year_month", how="left")
        result = result.merge(
            trade_merged[["year_week", "semi_export_amt", "semi_import_amt",
                          "semi_trade_balance", "semi_export_roc"]],
            on="year_week", how="left",
        )
    else:
        for c in ["semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc"]:
            result[c] = np.nan

    # forward-fill 모든 외부지표 (주차 순서대로)
    result = result.sort_values("year_week")
    fill_cols = [c for c in result.columns if c != "year_week"]
    result[fill_cols] = result[fill_cols].ffill()

    return result


# ─────────────────────────────────────────────────────────────
# 7) 피처 엔지니어링 메인 로직
# ─────────────────────────────────────────────────────────────

def build_features(df_wps: pd.DataFrame, df_conc: pd.DataFrame,
                   df_inv: pd.DataFrame, df_ext: pd.DataFrame,
                   lead_map: dict, price_map: dict) -> pd.DataFrame:
    """주간 제품 집계 → 전체 피처 DataFrame 생성"""

    df = df_wps.copy()

    # ── A: 수주 이력 래그 (groupby product_id → shift) ──
    grp = df.groupby("product_id")

    for lag in [1, 2, 4, 8, 13, 26, 52]:
        df[f"order_qty_lag{lag}"] = grp["order_qty"].shift(lag)

    # 이동평균
    df["order_qty_ma4"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).mean()
    )
    df["order_qty_ma13"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(13, min_periods=1).mean()
    )
    df["order_qty_ma26"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(26, min_periods=1).mean()
    )

    # 수주 건수, 금액
    df["order_count_lag1"] = grp["order_count"].shift(1)
    df["order_count_ma4"] = grp["order_count"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).mean()
    )
    df["order_amount_lag1"] = grp["order_amount"].shift(1)

    # ── B: 모멘텀 ──
    # 4주 변화율: (ma4 현재 vs 4주 전 ma4)
    ma4_shifted = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).mean()
    )
    ma4_lag4 = grp["order_qty"].transform(
        lambda x: x.shift(5).rolling(4, min_periods=1).mean()
    )
    df["order_qty_roc_4w"] = np.where(
        ma4_lag4 > 0, (ma4_shifted - ma4_lag4) / ma4_lag4, 0.0
    )

    ma4_lag13 = grp["order_qty"].transform(
        lambda x: x.shift(14).rolling(4, min_periods=1).mean()
    )
    df["order_qty_roc_13w"] = np.where(
        ma4_lag13 > 0, (ma4_shifted - ma4_lag13) / ma4_lag13, 0.0
    )

    df["order_qty_diff_1w"] = df["order_qty_lag1"] - df["order_qty_lag2"]
    df["order_qty_diff_4w"] = df["order_qty_lag1"] - grp["order_qty"].shift(5)

    # ── C: 변동성 ──
    df["order_qty_std4"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=2).std()
    )
    df["order_qty_std13"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(13, min_periods=2).std()
    )
    df["order_qty_cv4"] = np.where(
        df["order_qty_ma4"] > 0,
        df["order_qty_std4"] / df["order_qty_ma4"],
        0.0,
    )
    df["order_qty_max4"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).max()
    )
    df["order_qty_min4"] = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).min()
    )

    # 비영(non-zero) 주 수
    df["order_qty_nonzero_4w"] = grp["order_qty"].transform(
        lambda x: (x.shift(1) > 0).rolling(4, min_periods=1).sum()
    ).astype("Int16")
    df["order_qty_nonzero_13w"] = grp["order_qty"].transform(
        lambda x: (x.shift(1) > 0).rolling(13, min_periods=1).sum()
    ).astype("Int16")

    # ── D: 공급측 ──
    df["revenue_qty_lag1"] = grp["revenue_qty"].shift(1)
    df["revenue_qty_ma4"] = grp["revenue_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).mean()
    )
    df["produced_qty_lag1"] = grp["produced_qty"].shift(1)
    df["produced_qty_ma4"] = grp["produced_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).mean()
    )

    # book-to-bill: 최근 4주 수주합 / 최근 4주 출하합
    order_4w = grp["order_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).sum()
    )
    rev_4w = grp["revenue_qty"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).sum()
    )
    df["book_to_bill_4w"] = np.where(rev_4w > 0, order_4w / rev_4w, 1.0)

    # 리드타임, 단가
    df["avg_lead_days"] = df["product_id"].map(lead_map)
    df["avg_unit_price"] = df["product_id"].map(price_map)

    # 주문 평균 단가 (금액/수량)
    df["order_avg_value"] = np.where(
        df["order_qty_lag1"] > 0,
        df["order_amount_lag1"] / df["order_qty_lag1"],
        np.nan,
    )

    # ── E: 고객 집중도 조인 ──
    if not df_conc.empty:
        # lag 1주 적용: 현재 주가 아닌 직전 주의 고객 집중도
        df_conc_lag = df_conc.copy()
        # year_week 기준으로 shift는 join 후 처리
        df = df.merge(df_conc_lag, on=["product_id", "year_week"], how="left")
    else:
        df["top1_customer_pct"] = np.nan
        df["top3_customer_pct"] = np.nan
        df["customer_hhi"] = np.nan

    df["customer_count_lag1"] = grp["customer_count"].shift(1)
    df["customer_count_ma4"] = grp["customer_count"].transform(
        lambda x: x.shift(1).rolling(4, min_periods=1).mean()
    )

    # ── 재고 조인 ──
    if not df_inv.empty:
        df = df.merge(df_inv, on=["product_id", "year_week"], how="left")
    else:
        df["inventory_qty"] = np.nan

    # inventory_weeks = 재고 / 주간 평균 수주량
    df["inventory_weeks"] = np.where(
        df["order_qty_ma4"] > 0,
        df["inventory_qty"] / df["order_qty_ma4"],
        np.nan,
    )

    # ── F: 외부지표 조인 ──
    if not df_ext.empty:
        df = df.merge(df_ext, on="year_week", how="left")

    # SOX 변화율
    if "sox_index" in df.columns:
        sox_grp = df.groupby("product_id")["sox_index"]
        sox_lag4 = sox_grp.shift(4)
        df["sox_roc_4w"] = np.where(
            sox_lag4 > 0, (df["sox_index"] - sox_lag4) / sox_lag4, 0.0
        )

        dram_grp = df.groupby("product_id")["dram_price"]
        dram_lag4 = dram_grp.shift(4)
        df["dram_roc_4w"] = np.where(
            dram_lag4 > 0, (df["dram_price"] - dram_lag4) / dram_lag4, 0.0
        )

        usd_grp = df.groupby("product_id")["usd_krw"]
        usd_lag4 = usd_grp.shift(4)
        df["usd_krw_roc_4w"] = np.where(
            usd_lag4 > 0, (df["usd_krw"] - usd_lag4) / usd_lag4, 0.0
        )
    else:
        df["sox_roc_4w"] = np.nan
        df["dram_roc_4w"] = np.nan
        df["usd_krw_roc_4w"] = np.nan

    # ── K: 시간 피처 ──
    df["week_num"] = df["week_start"].dt.isocalendar().week.astype(int)
    df["month"] = df["week_start"].dt.month
    df["quarter"] = (df["month"] - 1) // 3 + 1

    # 설/추석/연말 (대략적 주차 기반)
    df["is_holiday_week"] = df["week_num"].isin([1, 2, 5, 6, 38, 39, 40])
    df["is_year_end"] = df["week_num"] >= 51

    # ── 타겟 (forward-shift) ──
    df["target_1w"] = grp["order_qty"].shift(-1)
    shift_m2 = grp["order_qty"].shift(-2)
    df["target_2w"] = df["target_1w"] + shift_m2
    shift_m3 = grp["order_qty"].shift(-3)
    shift_m4 = grp["order_qty"].shift(-4)
    df["target_4w"] = df["target_2w"] + shift_m3 + shift_m4

    return df


# ─────────────────────────────────────────────────────────────
# 출력 컬럼 정의
# ─────────────────────────────────────────────────────────────

OUTPUT_COLS = [
    "product_id", "year_week", "week_start",
    # A: 수주 이력
    "order_qty_lag1", "order_qty_lag2", "order_qty_lag4",
    "order_qty_lag8", "order_qty_lag13", "order_qty_lag26", "order_qty_lag52",
    "order_qty_ma4", "order_qty_ma13", "order_qty_ma26",
    "order_count_lag1", "order_count_ma4", "order_amount_lag1",
    # B: 모멘텀
    "order_qty_roc_4w", "order_qty_roc_13w",
    "order_qty_diff_1w", "order_qty_diff_4w",
    # C: 변동성
    "order_qty_std4", "order_qty_std13", "order_qty_cv4",
    "order_qty_max4", "order_qty_min4",
    "order_qty_nonzero_4w", "order_qty_nonzero_13w",
    # D: 공급측
    "revenue_qty_lag1", "revenue_qty_ma4",
    "produced_qty_lag1", "produced_qty_ma4",
    "inventory_qty", "inventory_weeks", "avg_lead_days", "book_to_bill_4w",
    # E: 고객 집중도
    "customer_count_lag1", "customer_count_ma4",
    "top1_customer_pct", "top3_customer_pct", "customer_hhi",
    # F: 가격
    "avg_unit_price", "order_avg_value",
    # G: 반도체 시장
    "sox_index", "sox_roc_4w", "dram_price", "dram_roc_4w",
    "nand_price", "silicon_wafer_price", "baltic_dry_index", "copper_lme",
    # H: 환율
    "usd_krw", "usd_krw_roc_4w", "jpy_krw", "eur_krw", "cny_krw",
    # I: 거시경제
    "fed_funds_rate", "wti_price", "indpro_index", "ipman_index",
    "kr_base_rate", "kr_ipi_mfg", "kr_bsi_mfg", "cn_pmi_mfg",
    # J: 무역
    "semi_export_amt", "semi_import_amt", "semi_trade_balance", "semi_export_roc",
    # K: 시간
    "week_num", "month", "quarter", "is_holiday_week", "is_year_end",
    # 타겟
    "target_1w", "target_2w", "target_4w",
]


# ─────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────

def run():
    print("[S3] 주간 피처 엔지니어링 시작")

    # 1) 기반 데이터 로드
    print("  데이터 로드 중...")
    df_wps = load_weekly_product()
    if df_wps.empty:
        print("  [!] weekly_product_summary 비어있음. s0 먼저 실행 필요")
        return
    print(f"    weekly_product_summary: {len(df_wps):,}행, "
          f"제품: {df_wps['product_id'].nunique():,}개")

    # 캘린더
    cal_rows = fetch_all("calendar_week", "year_week,week_start,week_end,year_month")
    calendar_df = pd.DataFrame(cal_rows)
    print(f"    calendar_week: {len(calendar_df):,}행")

    # 고객 집중도
    print("  고객 집중도 계산 중...")
    df_conc = load_customer_concentration()
    print(f"    고객 집중도: {len(df_conc):,}행")

    # 재고
    print("  재고 데이터 로드 중...")
    df_inv = load_inventory_weekly(calendar_df)
    print(f"    주간 재고: {len(df_inv):,}행")

    # 리드타임, 단가
    lead_map = load_lead_time()
    price_map = load_avg_unit_price()
    print(f"    리드타임: {len(lead_map):,}개 제품, 단가: {len(price_map):,}개 제품")

    # 외부지표
    print("  외부지표 로드 중...")
    df_ext = load_external_weekly(calendar_df)
    print(f"    외부지표: {len(df_ext):,}주 × {len(df_ext.columns)-1}개 지표")

    # 2) 피처 빌드
    print("\n  피처 생성 중...")
    df_features = build_features(df_wps, df_conc, df_inv, df_ext, lead_map, price_map)

    # 래그 피처 최소 요건: order_qty_lag1이 존재하는 행만 (첫 주 제외)
    df_features = df_features.dropna(subset=["order_qty_lag1"])

    # 출력 컬럼 선택
    existing_cols = [c for c in OUTPUT_COLS if c in df_features.columns]
    df_out = df_features[existing_cols].copy()

    # week_start를 ISO 문자열로 변환
    df_out["week_start"] = df_out["week_start"].dt.strftime("%Y-%m-%d")

    # bool → Python bool 변환
    for c in ["is_holiday_week", "is_year_end"]:
        if c in df_out.columns:
            df_out[c] = df_out[c].astype(bool)

    print(f"    결과: {len(df_out):,}행 × {len(existing_cols)}열")

    # 제품별 최소 26주 이력 필터
    prod_counts = df_out.groupby("product_id").size()
    valid_products = prod_counts[prod_counts >= 26].index
    df_out = df_out[df_out["product_id"].isin(valid_products)]
    print(f"    26주 이상 제품 필터 후: {len(df_out):,}행, "
          f"제품: {df_out['product_id'].nunique():,}개")

    # 3) Supabase 적재
    print("\n  feature_store_weekly 적재 중...")

    # INT 컬럼 목록 (DB에서 INT/SMALLINT로 정의된 컬럼)
    INT_COLS = {
        "order_count_lag1", "customer_count_lag1",
        "order_qty_nonzero_4w", "order_qty_nonzero_13w",
        "week_num", "month", "quarter",
    }

    # NaN → None, numpy 타입 → Python 타입 변환
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

    cnt = upsert_batch("feature_store_weekly", rows, on_conflict="product_id,year_week")
    print(f"    적재 완료: {cnt:,}행")

    # 4) 결과 요약
    count = supabase.table("feature_store_weekly").select("id", count="exact").execute()
    print(f"\n[S3] 완료 — feature_store_weekly: {count.count:,}행")

    # 타겟 통계
    target_notnull = df_out["target_1w"].notna().sum()
    print(f"    학습 가능 행 (target_1w 존재): {target_notnull:,}행")


if __name__ == "__main__":
    run()
