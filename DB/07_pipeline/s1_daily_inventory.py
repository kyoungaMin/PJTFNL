"""
Step 1: 일간 추정 재고 계산
산출식: estimated_qty = 월초 스냅샷 + 누적(생산) - 누적(출하=매출)

입력 테이블: inventory, daily_production, daily_revenue
출력 테이블: daily_inventory_estimated
"""

from datetime import date, timedelta
from collections import defaultdict

from config import supabase, upsert_batch


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


def run():
    print("[S1] 일간 추정 재고 계산 시작")

    # 1) 재고 스냅샷 로드 (YYYYMM → product_id → qty)
    inv_rows = fetch_all_rows("inventory", "snapshot_date,product_id,inventory_qty")
    # 같은 (snapshot_date, product_id)에 여러 창고가 있을 수 있으므로 합산
    snapshots = defaultdict(lambda: defaultdict(float))
    for r in inv_rows:
        ym = r["snapshot_date"]  # 'YYYYMM'
        pid = r["product_id"]
        qty = float(r["inventory_qty"] or 0)
        snapshots[ym][pid] += qty
    print(f"  재고 스냅샷: {len(snapshots)}개월, 제품 수: {len(set(p for m in snapshots.values() for p in m))}")

    # 2) 일별 생산 로드
    prod_rows = fetch_all_rows("daily_production", "production_date,product_id,produced_qty")
    # date → product_id → sum(qty)
    daily_prod = defaultdict(lambda: defaultdict(float))
    for r in prod_rows:
        d = r["production_date"]
        pid = r["product_id"]
        qty = float(r["produced_qty"] or 0)
        daily_prod[d][pid] += qty
    print(f"  일별 생산: {len(prod_rows):,}건")

    # 3) 일별 출하(=매출) 로드
    ship_rows = fetch_all_rows("daily_revenue", "revenue_date,product_id,quantity")
    daily_ship = defaultdict(lambda: defaultdict(float))
    for r in ship_rows:
        d = r["revenue_date"]
        pid = r["product_id"]
        qty = float(r["quantity"] or 0)
        daily_ship[d][pid] += qty
    print(f"  일별 출하(매출): {len(ship_rows):,}건")

    # 4) 날짜 범위 결정
    all_dates = set()
    for d in daily_prod:
        all_dates.add(d)
    for d in daily_ship:
        all_dates.add(d)
    if not all_dates:
        print("  [!] 생산/출하 데이터 없음")
        return

    sorted_dates = sorted(all_dates)
    min_date = date.fromisoformat(sorted_dates[0])
    max_date = date.fromisoformat(sorted_dates[-1])
    print(f"  데이터 범위: {min_date} ~ {max_date}")

    # 5) 스냅샷이 있는 제품 목록
    all_products = set()
    for ym_data in snapshots.values():
        all_products.update(ym_data.keys())
    # 생산/출하에만 있는 제품도 포함
    for d_data in daily_prod.values():
        all_products.update(d_data.keys())
    for d_data in daily_ship.values():
        all_products.update(d_data.keys())
    print(f"  대상 제품 수: {len(all_products):,}")

    # 6) 일간 추정 재고 계산
    results = []
    current = min_date
    while current <= max_date:
        ym = current.strftime("%Y%m")
        month_start = current.replace(day=1)
        date_str = current.isoformat()

        for pid in all_products:
            base = snapshots.get(ym, {}).get(pid, 0.0)

            # 월초~해당일 누적 생산
            cumul_p = 0.0
            d = month_start
            while d <= current:
                ds = d.isoformat()
                cumul_p += daily_prod.get(ds, {}).get(pid, 0.0)
                d += timedelta(days=1)

            # 월초~해당일 누적 출하
            cumul_s = 0.0
            d = month_start
            while d <= current:
                ds = d.isoformat()
                cumul_s += daily_ship.get(ds, {}).get(pid, 0.0)
                d += timedelta(days=1)

            estimated = base + cumul_p - cumul_s

            results.append({
                "product_id": pid,
                "target_date": date_str,
                "snapshot_base": round(base, 6),
                "cumul_produced": round(cumul_p, 6),
                "cumul_shipped": round(cumul_s, 6),
                "estimated_qty": round(estimated, 6),
            })

        # 배치 업로드 (일 단위)
        if len(results) >= 5000:
            upsert_batch("daily_inventory_estimated", results)
            print(f"    {date_str} — {len(results):,}행 적재")
            results = []

        current += timedelta(days=1)

    # 잔여 데이터 적재
    if results:
        upsert_batch("daily_inventory_estimated", results)
        print(f"    잔여 {len(results):,}행 적재")

    # 결과 확인
    count = supabase.table("daily_inventory_estimated").select("id", count="exact").execute()
    print(f"[S1] 완료 — daily_inventory_estimated: {count.count:,}행")


if __name__ == "__main__":
    run()
