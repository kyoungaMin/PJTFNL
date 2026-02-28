"""
Step 1: 일간 추정 재고 계산 (pandas 벡터화 버전)
산출식: estimated_qty = 월초 스냅샷 + 월초부터 누적(생산) - 월초부터 누적(출하=매출)

입력 테이블: inventory, daily_production, daily_revenue
출력 테이블: daily_inventory_estimated
"""

import numpy as np
import pandas as pd

from config import supabase, upsert_batch


def fetch_all_rows(table: str, select: str) -> list:
    """Supabase 테이블 전체 행 조회 (1000행 페이징)"""
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        resp = (
            supabase.table(table)
            .select(select)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def run():
    print("[S1] 일간 추정 재고 계산 시작 (pandas 벡터화)")

    # ── 1) 재고 스냅샷 로드 ──────────────────────────────────
    inv_rows = fetch_all_rows("inventory", "snapshot_date,product_id,inventory_qty")
    if not inv_rows:
        print("  [!] inventory 데이터 없음")
        return

    inv_df = pd.DataFrame(inv_rows)
    inv_df["inventory_qty"] = pd.to_numeric(inv_df["inventory_qty"], errors="coerce").fillna(0)
    # 같은 (snapshot_date, product_id)에 여러 창고 → 합산
    inv_df = inv_df.groupby(["snapshot_date", "product_id"], as_index=False)["inventory_qty"].sum()
    print(f"  재고 스냅샷: {inv_df['snapshot_date'].nunique()}개월, 제품 {inv_df['product_id'].nunique():,}개")

    # ── 2) 일별 생산 로드 ─────────────────────────────────────
    prod_rows = fetch_all_rows("daily_production", "production_date,product_id,produced_qty")
    if prod_rows:
        prod_df = pd.DataFrame(prod_rows)
        prod_df["produced_qty"] = pd.to_numeric(prod_df["produced_qty"], errors="coerce").fillna(0)
        prod_df = prod_df.groupby(["production_date", "product_id"], as_index=False)["produced_qty"].sum()
        prod_df.rename(columns={"production_date": "target_date"}, inplace=True)
    else:
        prod_df = pd.DataFrame(columns=["target_date", "product_id", "produced_qty"])
    print(f"  일별 생산: {len(prod_df):,}건")

    # ── 3) 일별 출하(=매출) 로드 ──────────────────────────────
    ship_rows = fetch_all_rows("daily_revenue", "revenue_date,product_id,quantity")
    if ship_rows:
        ship_df = pd.DataFrame(ship_rows)
        ship_df["quantity"] = pd.to_numeric(ship_df["quantity"], errors="coerce").fillna(0)
        ship_df = ship_df.groupby(["revenue_date", "product_id"], as_index=False)["quantity"].sum()
        ship_df.rename(columns={"revenue_date": "target_date", "quantity": "shipped_qty"}, inplace=True)
    else:
        ship_df = pd.DataFrame(columns=["target_date", "product_id", "shipped_qty"])
    print(f"  일별 출하(매출): {len(ship_df):,}건")

    # ── 4) 날짜 범위 & 제품 목록 결정 ────────────────────────
    all_dates = set()
    if len(prod_df) > 0:
        all_dates.update(prod_df["target_date"].unique())
    if len(ship_df) > 0:
        all_dates.update(ship_df["target_date"].unique())
    if not all_dates:
        print("  [!] 생산/출하 데이터 없음")
        return

    date_range = pd.date_range(min(all_dates), max(all_dates), freq="D")
    print(f"  데이터 범위: {date_range[0].date()} ~ {date_range[-1].date()} ({len(date_range)}일)")

    all_products = set(inv_df["product_id"].unique())
    if len(prod_df) > 0:
        all_products.update(prod_df["product_id"].unique())
    if len(ship_df) > 0:
        all_products.update(ship_df["product_id"].unique())
    all_products = sorted(all_products)
    print(f"  대상 제품 수: {len(all_products):,}")

    # ── 5) 풀 그리드 생성 (product × date) ─────────────────
    # 메모리 최적화: 제품을 배치로 처리
    PRODUCT_BATCH = 200
    total_upserted = 0

    for batch_start in range(0, len(all_products), PRODUCT_BATCH):
        batch_products = all_products[batch_start: batch_start + PRODUCT_BATCH]

        # 제품 × 날짜 그리드
        grid = pd.MultiIndex.from_product(
            [batch_products, date_range],
            names=["product_id", "target_date"],
        ).to_frame(index=False)
        grid["target_date"] = grid["target_date"].dt.strftime("%Y-%m-%d")
        grid["ym"] = grid["target_date"].str[:7].str.replace("-", "")  # YYYYMM

        # 생산 조인
        if len(prod_df) > 0:
            bp = prod_df[prod_df["product_id"].isin(batch_products)]
            grid = grid.merge(bp, on=["target_date", "product_id"], how="left")
        else:
            grid["produced_qty"] = 0.0
        grid["produced_qty"] = grid["produced_qty"].fillna(0.0)

        # 출하 조인
        if len(ship_df) > 0:
            bs = ship_df[ship_df["product_id"].isin(batch_products)]
            grid = grid.merge(bs, on=["target_date", "product_id"], how="left")
        else:
            grid["shipped_qty"] = 0.0
        grid["shipped_qty"] = grid["shipped_qty"].fillna(0.0)

        # 재고 스냅샷 조인
        inv_sub = inv_df[inv_df["product_id"].isin(batch_products)].copy()
        inv_sub.rename(columns={"snapshot_date": "ym"}, inplace=True)
        grid = grid.merge(inv_sub, on=["ym", "product_id"], how="left")
        grid["inventory_qty"] = grid["inventory_qty"].fillna(0.0)

        # 월 내 일자 (day of month) → 월초 기준 누적 계산용
        grid["day_of_month"] = pd.to_datetime(grid["target_date"]).dt.day
        grid["month_key"] = grid["ym"]

        # 월별 + 제품별 정렬 후 cumsum
        grid = grid.sort_values(["product_id", "target_date"])
        grid["month_group"] = grid["product_id"] + "_" + grid["month_key"]

        grid["cumul_produced"] = grid.groupby("month_group")["produced_qty"].cumsum()
        grid["cumul_shipped"] = grid.groupby("month_group")["shipped_qty"].cumsum()

        # estimated_qty = snapshot_base + cumul_produced - cumul_shipped
        grid["snapshot_base"] = grid["inventory_qty"]
        grid["estimated_qty"] = grid["snapshot_base"] + grid["cumul_produced"] - grid["cumul_shipped"]

        # 출력 컬럼 정리
        out = grid[["product_id", "target_date", "snapshot_base", "cumul_produced", "cumul_shipped", "estimated_qty"]].copy()
        out["snapshot_base"] = out["snapshot_base"].round(6)
        out["cumul_produced"] = out["cumul_produced"].round(6)
        out["cumul_shipped"] = out["cumul_shipped"].round(6)
        out["estimated_qty"] = out["estimated_qty"].round(6)

        # 적재
        records = out.to_dict("records")
        if records:
            upserted = upsert_batch("daily_inventory_estimated", records, on_conflict="product_id,target_date")
            total_upserted += upserted
            print(f"    배치 {batch_start // PRODUCT_BATCH + 1}: 제품 {len(batch_products)}개, {upserted:,}행 적재")

    # 결과 확인
    count = supabase.table("daily_inventory_estimated").select("id", count="exact").execute()
    print(f"[S1] 완료 — daily_inventory_estimated: {count.count:,}행 (총 {total_upserted:,}행 적재)")


if __name__ == "__main__":
    run()
