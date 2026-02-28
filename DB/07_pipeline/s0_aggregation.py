"""
Step 0: 주차 캘린더 생성 + 주별·월별 집계 데이터 생성
- 주차 캘린더(calendar_week) 차원 테이블 생성
- 수주(daily_order), 매출(daily_revenue), 생산(daily_production) → 4개 집계 테이블

입력 테이블: daily_order, daily_revenue, daily_production
출력 테이블: calendar_week, weekly_product_summary, weekly_customer_summary,
            monthly_product_summary, monthly_customer_summary
"""

from datetime import date, timedelta

import pandas as pd

from config import supabase, upsert_batch


def build_calendar_weeks(min_date: date, max_date: date) -> list:
    """데이터 범위에 해당하는 모든 ISO 주차 행 생성"""
    # min_date가 속한 주의 월요일로 이동
    start = min_date - timedelta(days=min_date.weekday())
    # max_date가 속한 주의 일요일까지 포함
    end = max_date + timedelta(days=6 - max_date.weekday())

    rows = []
    current = start
    seen = set()
    while current <= end:
        iso = current.isocalendar()
        year_week = f"{iso[0]}-W{iso[1]:02d}"
        if year_week not in seen:
            seen.add(year_week)
            week_start = current
            week_end = current + timedelta(days=6)
            # 목요일 기준으로 소속 월 결정 (ISO 8601 규칙)
            thursday = current + timedelta(days=3)
            year_month = thursday.strftime("%Y-%m")
            quarter = (thursday.month - 1) // 3 + 1
            rows.append({
                "year_week": year_week,
                "year": iso[0],
                "week_num": iso[1],
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "year_month": year_month,
                "quarter": quarter,
            })
        current += timedelta(days=7)
    return rows


def fetch_all_rows(table: str, select: str, order_col: str | None = None) -> list:
    """Supabase 테이블 전체 행 조회 (1000행 페이징)"""
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        q = supabase.table(table).select(select).range(offset, offset + page_size - 1)
        if order_col:
            q = q.order(order_col)
        resp = q.execute()
        rows = resp.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def iso_week_info(dt: pd.Timestamp) -> tuple:
    """ISO 주차 정보 반환: (year_week, week_start, week_end)"""
    iso = dt.isocalendar()
    year_week = f"{iso[0]}-W{iso[1]:02d}"
    week_start = dt - pd.Timedelta(days=dt.weekday())  # 월요일
    week_end = week_start + pd.Timedelta(days=6)        # 일요일
    return year_week, week_start.date().isoformat(), week_end.date().isoformat()


def load_data():
    """3개 일별 테이블 데이터 로드"""
    print("  데이터 로드 중...")

    # 수주
    order_rows = fetch_all_rows(
        "daily_order",
        "order_date,customer_id,product_id,order_qty,order_amount"
    )
    print(f"    daily_order: {len(order_rows):,}건")

    # 매출
    revenue_rows = fetch_all_rows(
        "daily_revenue",
        "revenue_date,customer_id,product_id,quantity,revenue_amount"
    )
    print(f"    daily_revenue: {len(revenue_rows):,}건")

    # 생산
    production_rows = fetch_all_rows(
        "daily_production",
        "production_date,product_id,produced_qty"
    )
    print(f"    daily_production: {len(production_rows):,}건")

    return order_rows, revenue_rows, production_rows


def to_dataframes(order_rows, revenue_rows, production_rows):
    """딕셔너리 리스트 → pandas DataFrame 변환"""
    df_order = pd.DataFrame(order_rows) if order_rows else pd.DataFrame(
        columns=["order_date", "customer_id", "product_id", "order_qty", "order_amount"]
    )
    df_revenue = pd.DataFrame(revenue_rows) if revenue_rows else pd.DataFrame(
        columns=["revenue_date", "customer_id", "product_id", "quantity", "revenue_amount"]
    )
    df_prod = pd.DataFrame(production_rows) if production_rows else pd.DataFrame(
        columns=["production_date", "product_id", "produced_qty"]
    )

    # 날짜 변환
    if not df_order.empty:
        df_order["date"] = pd.to_datetime(df_order["order_date"])
        df_order["order_qty"] = pd.to_numeric(df_order["order_qty"], errors="coerce").fillna(0)
        df_order["order_amount"] = pd.to_numeric(df_order["order_amount"], errors="coerce").fillna(0)

    if not df_revenue.empty:
        df_revenue["date"] = pd.to_datetime(df_revenue["revenue_date"])
        df_revenue["quantity"] = pd.to_numeric(df_revenue["quantity"], errors="coerce").fillna(0)
        df_revenue["revenue_amount"] = pd.to_numeric(df_revenue["revenue_amount"], errors="coerce").fillna(0)

    if not df_prod.empty:
        df_prod["date"] = pd.to_datetime(df_prod["production_date"])
        df_prod["produced_qty"] = pd.to_numeric(df_prod["produced_qty"], errors="coerce").fillna(0)

    return df_order, df_revenue, df_prod


def add_period_columns(df: pd.DataFrame) -> pd.DataFrame:
    """year_week, week_start, week_end, year_month 컬럼 추가"""
    if df.empty:
        df["year_week"] = []
        df["week_start"] = []
        df["week_end"] = []
        df["year_month"] = []
        return df

    iso_info = df["date"].apply(iso_week_info)
    df["year_week"] = iso_info.apply(lambda x: x[0])
    df["week_start"] = iso_info.apply(lambda x: x[1])
    df["week_end"] = iso_info.apply(lambda x: x[2])
    df["year_month"] = df["date"].dt.strftime("%Y-%m")
    return df


# ─────────────────────────────────────────────────────────────
# 주별 집계
# ─────────────────────────────────────────────────────────────

def build_weekly_product(df_order, df_revenue, df_prod) -> list:
    """주별 × 제품별 집계"""
    # 수주 집계
    grp_order = pd.DataFrame()
    if not df_order.empty:
        grp_order = df_order.groupby(["product_id", "year_week", "week_start", "week_end"]).agg(
            order_qty=("order_qty", "sum"),
            order_amount=("order_amount", "sum"),
            order_count=("order_qty", "count"),
            customer_count_o=("customer_id", "nunique"),
        ).reset_index()

    # 매출 집계
    grp_rev = pd.DataFrame()
    if not df_revenue.empty:
        grp_rev = df_revenue.groupby(["product_id", "year_week", "week_start", "week_end"]).agg(
            revenue_qty=("quantity", "sum"),
            revenue_amount=("revenue_amount", "sum"),
            revenue_count=("quantity", "count"),
            customer_count_r=("customer_id", "nunique"),
        ).reset_index()

    # 생산 집계
    grp_prod = pd.DataFrame()
    if not df_prod.empty:
        grp_prod = df_prod.groupby(["product_id", "year_week", "week_start", "week_end"]).agg(
            produced_qty=("produced_qty", "sum"),
            production_count=("produced_qty", "count"),
        ).reset_index()

    # 병합
    merge_keys = ["product_id", "year_week", "week_start", "week_end"]
    if not grp_order.empty and not grp_rev.empty:
        merged = pd.merge(grp_order, grp_rev, on=merge_keys, how="outer")
    elif not grp_order.empty:
        merged = grp_order
    elif not grp_rev.empty:
        merged = grp_rev
    else:
        merged = pd.DataFrame(columns=merge_keys)

    if not grp_prod.empty:
        merged = pd.merge(merged, grp_prod, on=merge_keys, how="outer")

    if merged.empty:
        return []

    # NaN → 0
    fill_cols = ["order_qty", "order_amount", "order_count",
                 "revenue_qty", "revenue_amount", "revenue_count",
                 "produced_qty", "production_count",
                 "customer_count_o", "customer_count_r"]
    for c in fill_cols:
        if c in merged.columns:
            merged[c] = merged[c].fillna(0)

    # customer_count = max(수주 거래처, 매출 거래처)
    cc_o = merged.get("customer_count_o", 0)
    cc_r = merged.get("customer_count_r", 0)
    merged["customer_count"] = pd.DataFrame({"o": cc_o, "r": cc_r}).max(axis=1).astype(int)

    rows = []
    for _, r in merged.iterrows():
        rows.append({
            "product_id": r["product_id"],
            "year_week": r["year_week"],
            "week_start": r["week_start"],
            "week_end": r["week_end"],
            "order_qty": round(float(r.get("order_qty", 0)), 6),
            "order_amount": round(float(r.get("order_amount", 0)), 4),
            "order_count": int(r.get("order_count", 0)),
            "revenue_qty": round(float(r.get("revenue_qty", 0)), 6),
            "revenue_amount": round(float(r.get("revenue_amount", 0)), 4),
            "revenue_count": int(r.get("revenue_count", 0)),
            "produced_qty": round(float(r.get("produced_qty", 0)), 6),
            "production_count": int(r.get("production_count", 0)),
            "customer_count": int(r.get("customer_count", 0)),
        })
    return rows


def build_weekly_customer(df_order, df_revenue) -> list:
    """주별 × 거래처 × 제품별 집계"""
    # 수주 집계
    grp_order = pd.DataFrame()
    if not df_order.empty:
        grp_order = df_order.groupby(["product_id", "customer_id", "year_week", "week_start", "week_end"]).agg(
            order_qty=("order_qty", "sum"),
            order_amount=("order_amount", "sum"),
            order_count=("order_qty", "count"),
        ).reset_index()

    # 매출 집계
    grp_rev = pd.DataFrame()
    if not df_revenue.empty:
        grp_rev = df_revenue.groupby(["product_id", "customer_id", "year_week", "week_start", "week_end"]).agg(
            revenue_qty=("quantity", "sum"),
            revenue_amount=("revenue_amount", "sum"),
            revenue_count=("quantity", "count"),
        ).reset_index()

    # 병합
    merge_keys = ["product_id", "customer_id", "year_week", "week_start", "week_end"]
    if not grp_order.empty and not grp_rev.empty:
        merged = pd.merge(grp_order, grp_rev, on=merge_keys, how="outer")
    elif not grp_order.empty:
        merged = grp_order
    elif not grp_rev.empty:
        merged = grp_rev
    else:
        return []

    if merged.empty:
        return []

    fill_cols = ["order_qty", "order_amount", "order_count",
                 "revenue_qty", "revenue_amount", "revenue_count"]
    for c in fill_cols:
        if c in merged.columns:
            merged[c] = merged[c].fillna(0)

    rows = []
    for _, r in merged.iterrows():
        rows.append({
            "product_id": r["product_id"],
            "customer_id": r["customer_id"],
            "year_week": r["year_week"],
            "week_start": r["week_start"],
            "week_end": r["week_end"],
            "order_qty": round(float(r.get("order_qty", 0)), 6),
            "order_amount": round(float(r.get("order_amount", 0)), 4),
            "order_count": int(r.get("order_count", 0)),
            "revenue_qty": round(float(r.get("revenue_qty", 0)), 6),
            "revenue_amount": round(float(r.get("revenue_amount", 0)), 4),
            "revenue_count": int(r.get("revenue_count", 0)),
        })
    return rows


# ─────────────────────────────────────────────────────────────
# 월별 집계
# ─────────────────────────────────────────────────────────────

def build_monthly_product(df_order, df_revenue, df_prod) -> list:
    """월별 × 제품별 집계"""
    grp_order = pd.DataFrame()
    if not df_order.empty:
        grp_order = df_order.groupby(["product_id", "year_month"]).agg(
            order_qty=("order_qty", "sum"),
            order_amount=("order_amount", "sum"),
            order_count=("order_qty", "count"),
            customer_count_o=("customer_id", "nunique"),
        ).reset_index()

    grp_rev = pd.DataFrame()
    if not df_revenue.empty:
        grp_rev = df_revenue.groupby(["product_id", "year_month"]).agg(
            revenue_qty=("quantity", "sum"),
            revenue_amount=("revenue_amount", "sum"),
            revenue_count=("quantity", "count"),
            customer_count_r=("customer_id", "nunique"),
        ).reset_index()

    grp_prod = pd.DataFrame()
    if not df_prod.empty:
        grp_prod = df_prod.groupby(["product_id", "year_month"]).agg(
            produced_qty=("produced_qty", "sum"),
            production_count=("produced_qty", "count"),
        ).reset_index()

    merge_keys = ["product_id", "year_month"]
    if not grp_order.empty and not grp_rev.empty:
        merged = pd.merge(grp_order, grp_rev, on=merge_keys, how="outer")
    elif not grp_order.empty:
        merged = grp_order
    elif not grp_rev.empty:
        merged = grp_rev
    else:
        merged = pd.DataFrame(columns=merge_keys)

    if not grp_prod.empty:
        merged = pd.merge(merged, grp_prod, on=merge_keys, how="outer")

    if merged.empty:
        return []

    fill_cols = ["order_qty", "order_amount", "order_count",
                 "revenue_qty", "revenue_amount", "revenue_count",
                 "produced_qty", "production_count",
                 "customer_count_o", "customer_count_r"]
    for c in fill_cols:
        if c in merged.columns:
            merged[c] = merged[c].fillna(0)

    cc_o = merged.get("customer_count_o", 0)
    cc_r = merged.get("customer_count_r", 0)
    merged["customer_count"] = pd.DataFrame({"o": cc_o, "r": cc_r}).max(axis=1).astype(int)

    rows = []
    for _, r in merged.iterrows():
        rows.append({
            "product_id": r["product_id"],
            "year_month": r["year_month"],
            "order_qty": round(float(r.get("order_qty", 0)), 6),
            "order_amount": round(float(r.get("order_amount", 0)), 4),
            "order_count": int(r.get("order_count", 0)),
            "revenue_qty": round(float(r.get("revenue_qty", 0)), 6),
            "revenue_amount": round(float(r.get("revenue_amount", 0)), 4),
            "revenue_count": int(r.get("revenue_count", 0)),
            "produced_qty": round(float(r.get("produced_qty", 0)), 6),
            "production_count": int(r.get("production_count", 0)),
            "customer_count": int(r.get("customer_count", 0)),
        })
    return rows


def build_monthly_customer(df_order, df_revenue) -> list:
    """월별 × 거래처 × 제품별 집계"""
    grp_order = pd.DataFrame()
    if not df_order.empty:
        grp_order = df_order.groupby(["product_id", "customer_id", "year_month"]).agg(
            order_qty=("order_qty", "sum"),
            order_amount=("order_amount", "sum"),
            order_count=("order_qty", "count"),
        ).reset_index()

    grp_rev = pd.DataFrame()
    if not df_revenue.empty:
        grp_rev = df_revenue.groupby(["product_id", "customer_id", "year_month"]).agg(
            revenue_qty=("quantity", "sum"),
            revenue_amount=("revenue_amount", "sum"),
            revenue_count=("quantity", "count"),
        ).reset_index()

    merge_keys = ["product_id", "customer_id", "year_month"]
    if not grp_order.empty and not grp_rev.empty:
        merged = pd.merge(grp_order, grp_rev, on=merge_keys, how="outer")
    elif not grp_order.empty:
        merged = grp_order
    elif not grp_rev.empty:
        merged = grp_rev
    else:
        return []

    if merged.empty:
        return []

    fill_cols = ["order_qty", "order_amount", "order_count",
                 "revenue_qty", "revenue_amount", "revenue_count"]
    for c in fill_cols:
        if c in merged.columns:
            merged[c] = merged[c].fillna(0)

    rows = []
    for _, r in merged.iterrows():
        rows.append({
            "product_id": r["product_id"],
            "customer_id": r["customer_id"],
            "year_month": r["year_month"],
            "order_qty": round(float(r.get("order_qty", 0)), 6),
            "order_amount": round(float(r.get("order_amount", 0)), 4),
            "order_count": int(r.get("order_count", 0)),
            "revenue_qty": round(float(r.get("revenue_qty", 0)), 6),
            "revenue_amount": round(float(r.get("revenue_amount", 0)), 4),
            "revenue_count": int(r.get("revenue_count", 0)),
        })
    return rows


# ─────────────────────────────────────────────────────────────
# 메인 실행
# ─────────────────────────────────────────────────────────────

def run():
    print("[S0] 주별·월별 집계 데이터 생성 시작")

    # 1) 데이터 로드
    order_rows, revenue_rows, production_rows = load_data()
    df_order, df_revenue, df_prod = to_dataframes(order_rows, revenue_rows, production_rows)

    # 2) 기간 컬럼 추가
    df_order = add_period_columns(df_order)
    df_revenue = add_period_columns(df_revenue)
    df_prod = add_period_columns(df_prod)

    # 2.5) 주차 캘린더 생성
    print("\n  [주차 캘린더] 생성 중...")
    all_dates = []
    if not df_order.empty:
        all_dates.extend(df_order["date"].dropna().tolist())
    if not df_revenue.empty:
        all_dates.extend(df_revenue["date"].dropna().tolist())
    if not df_prod.empty:
        all_dates.extend(df_prod["date"].dropna().tolist())

    if all_dates:
        min_dt = min(all_dates).date()
        max_dt = max(all_dates).date()
        cal_rows = build_calendar_weeks(min_dt, max_dt)
        if cal_rows:
            cnt = upsert_batch("calendar_week", cal_rows, on_conflict="year_week")
            print(f"    calendar_week: {cnt:,}행 적재 ({min_dt} ~ {max_dt})")
    else:
        print("    calendar_week: 날짜 데이터 없음")

    # 3) 주별 제품 집계
    print("\n  [주별 제품 집계] 생성 중...")
    wp_rows = build_weekly_product(df_order, df_revenue, df_prod)
    if wp_rows:
        cnt = upsert_batch("weekly_product_summary", wp_rows,
                           on_conflict="product_id,year_week")
        print(f"    weekly_product_summary: {cnt:,}행 적재")
    else:
        print("    weekly_product_summary: 데이터 없음")

    # 4) 주별 거래처 집계
    print("  [주별 거래처 집계] 생성 중...")
    wc_rows = build_weekly_customer(df_order, df_revenue)
    if wc_rows:
        cnt = upsert_batch("weekly_customer_summary", wc_rows,
                           on_conflict="product_id,customer_id,year_week")
        print(f"    weekly_customer_summary: {cnt:,}행 적재")
    else:
        print("    weekly_customer_summary: 데이터 없음")

    # 5) 월별 제품 집계
    print("  [월별 제품 집계] 생성 중...")
    mp_rows = build_monthly_product(df_order, df_revenue, df_prod)
    if mp_rows:
        cnt = upsert_batch("monthly_product_summary", mp_rows,
                           on_conflict="product_id,year_month")
        print(f"    monthly_product_summary: {cnt:,}행 적재")
    else:
        print("    monthly_product_summary: 데이터 없음")

    # 6) 월별 거래처 집계
    print("  [월별 거래처 집계] 생성 중...")
    mc_rows = build_monthly_customer(df_order, df_revenue)
    if mc_rows:
        cnt = upsert_batch("monthly_customer_summary", mc_rows,
                           on_conflict="product_id,customer_id,year_month")
        print(f"    monthly_customer_summary: {cnt:,}행 적재")
    else:
        print("    monthly_customer_summary: 데이터 없음")

    # 7) 결과 요약
    print(f"\n[S0] 완료 — 집계 결과:")
    cnt = supabase.table("calendar_week").select("year_week", count="exact").execute()
    print(f"    calendar_week: {cnt.count:,}행")
    for tbl in ["weekly_product_summary", "weekly_customer_summary",
                 "monthly_product_summary", "monthly_customer_summary"]:
        cnt = supabase.table(tbl).select("id", count="exact").execute()
        print(f"    {tbl}: {cnt.count:,}행")


if __name__ == "__main__":
    run()
