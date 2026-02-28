"""
Step 3: 피처 엔지니어링
내부 ERP 피처(롤링 윈도우) + 외부지표 조인 → feature_store 테이블

입력 테이블: daily_order, daily_revenue, daily_production,
            daily_inventory_estimated, product_lead_time,
            economic_indicator, trade_statistics
출력 테이블: feature_store
"""

from datetime import date, timedelta
from collections import defaultdict

from config import supabase, upsert_batch


def fetch_all(table: str, select: str) -> list:
    """전체 행 페이징 조회"""
    all_rows, offset, ps = [], 0, 1000
    while True:
        resp = supabase.table(table).select(select).range(offset, offset + ps - 1).execute()
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < ps:
            break
        offset += ps
    return all_rows


def build_daily_agg(rows: list, date_col: str, pid_col: str, qty_col: str) -> dict:
    """date_str → product_id → sum(qty)"""
    agg = defaultdict(lambda: defaultdict(float))
    for r in rows:
        d = r.get(date_col)
        pid = r.get(pid_col)
        qty = float(r.get(qty_col) or 0)
        if d and pid:
            agg[d][pid] += qty
    return agg


def rolling_sum(daily_agg: dict, pid: str, end_date: date, window: int) -> float:
    """end_date 포함 과거 window일 합계"""
    total = 0.0
    for i in range(window):
        d = (end_date - timedelta(days=i)).isoformat()
        total += daily_agg.get(d, {}).get(pid, 0.0)
    return total


def run():
    print("[S3] 피처 엔지니어링 시작")

    # 1) 내부 데이터 로드
    order_rows = fetch_all("daily_order", "order_date,product_id,order_qty")
    revenue_rows = fetch_all("daily_revenue", "revenue_date,product_id,quantity")
    prod_rows = fetch_all("daily_production", "production_date,product_id,produced_qty")

    daily_order = build_daily_agg(order_rows, "order_date", "product_id", "order_qty")
    daily_ship = build_daily_agg(revenue_rows, "revenue_date", "product_id", "quantity")
    daily_prod = build_daily_agg(prod_rows, "production_date", "product_id", "produced_qty")
    print(f"  수주: {len(order_rows):,}건, 출하: {len(revenue_rows):,}건, 생산: {len(prod_rows):,}건")

    # 2) 추정 재고 로드 (date → pid → qty)
    inv_rows = fetch_all("daily_inventory_estimated", "target_date,product_id,estimated_qty")
    inv_map = {}
    for r in inv_rows:
        inv_map[(r["target_date"], r["product_id"])] = float(r["estimated_qty"] or 0)
    print(f"  추정 재고: {len(inv_rows):,}건")

    # 3) 리드타임 로드 (product_id → avg_lead_days) — 최신 calc_date 기준
    lt_rows = fetch_all("product_lead_time", "product_id,avg_lead_days,calc_date")
    lead_map = {}
    for r in lt_rows:
        pid = r["product_id"]
        # 가장 최근 calc_date의 값으로 덮어쓰기 (정렬 불필요, 같은 제품이면 최신 우선)
        if pid not in lead_map:
            lead_map[pid] = float(r["avg_lead_days"] or 0)
    print(f"  리드타임: {len(lead_map):,}개 제품")

    # 4) 평균 단가 로드 (product_id → avg unit_price)
    po_rows = fetch_all("purchase_order", "component_product_id,unit_price,currency")
    price_map = defaultdict(list)
    for r in po_rows:
        pid = r.get("component_product_id")
        price = r.get("unit_price")
        if pid and price:
            price_map[pid].append(float(price))
    avg_price = {pid: sum(ps) / len(ps) for pid, ps in price_map.items() if ps}
    print(f"  단가 정보: {len(avg_price):,}개 제품")

    # 5) 외부지표 로드
    econ_rows = fetch_all("economic_indicator", "indicator_code,date,value")
    # indicator_code → date → value
    econ_map = defaultdict(dict)
    for r in econ_rows:
        econ_map[r["indicator_code"]][r["date"]] = float(r["value"] or 0)
    print(f"  경제지표: {len(econ_rows):,}건")

    # 6) 무역통계 로드
    trade_rows = fetch_all("trade_statistics", "hs_code,year_month,export_amount,import_amount")
    # year_month → (export_sum, import_sum)
    trade_map = defaultdict(lambda: [0.0, 0.0])
    for r in trade_rows:
        ym = r["year_month"]  # 'YYYY-MM'
        trade_map[ym][0] += float(r.get("export_amount") or 0)
        trade_map[ym][1] += float(r.get("import_amount") or 0)
    print(f"  무역통계: {len(trade_rows):,}건")

    # 7) 활성 제품·날짜 결정 (수주가 있는 제품-일자만)
    all_dates = set()
    all_products = set()
    for d, pids in daily_order.items():
        all_dates.add(d)
        all_products.update(pids.keys())
    for d, pids in daily_ship.items():
        all_dates.add(d)
        all_products.update(pids.keys())

    sorted_dates = sorted(all_dates)
    print(f"  대상: {len(all_products):,}개 제품 × {len(sorted_dates):,}일")

    # 8) 외부지표 forward-fill 헬퍼
    def get_econ(indicator: str, target: str) -> float | None:
        """해당일 또는 직전 가용일 값 반환"""
        series = econ_map.get(indicator, {})
        if target in series:
            return series[target]
        # forward-fill: 최근 90일 내 가장 가까운 과거 값
        dt = date.fromisoformat(target)
        for i in range(1, 91):
            prev = (dt - timedelta(days=i)).isoformat()
            if prev in series:
                return series[prev]
        return None

    def get_trade(target_date: str) -> tuple[float | None, float | None]:
        """해당 월의 반도체 무역 합계"""
        ym = target_date[:7]  # 'YYYY-MM'
        data = trade_map.get(ym)
        if data:
            return data[0], data[1]
        return None, None

    # 9) 피처 생성
    results = []
    for date_str in sorted_dates:
        dt = date.fromisoformat(date_str)

        # 외부지표 (해당일 공통)
        usd_krw = get_econ("DEXKOUS", date_str)
        fed_rate = get_econ("FEDFUNDS", date_str)
        wti = get_econ("WTI_WEEKLY", date_str)
        if wti is None:
            wti = get_econ("WTI_MONTHLY", date_str)
        indpro = get_econ("INDPRO", date_str)
        semi_exp, semi_imp = get_trade(date_str)

        for pid in all_products:
            row = {
                "product_id": pid,
                "target_date": date_str,
                # 내부 피처: 롤링 윈도우
                "order_qty_7d": round(rolling_sum(daily_order, pid, dt, 7), 6),
                "order_qty_30d": round(rolling_sum(daily_order, pid, dt, 30), 6),
                "order_qty_90d": round(rolling_sum(daily_order, pid, dt, 90), 6),
                "shipped_qty_7d": round(rolling_sum(daily_ship, pid, dt, 7), 6),
                "shipped_qty_30d": round(rolling_sum(daily_ship, pid, dt, 30), 6),
                "produced_qty_7d": round(rolling_sum(daily_prod, pid, dt, 7), 6),
                "produced_qty_30d": round(rolling_sum(daily_prod, pid, dt, 30), 6),
                # 추정 재고
                "inventory_qty": inv_map.get((date_str, pid)),
                # 리드타임
                "avg_lead_days": lead_map.get(pid),
                # 평균 단가
                "avg_unit_price": round(avg_price[pid], 6) if pid in avg_price else None,
                # 외부 피처
                "usd_krw": usd_krw,
                "fed_funds_rate": fed_rate,
                "wti_price": wti,
                "indpro_index": indpro,
                "semi_export_amt": semi_exp,
                "semi_import_amt": semi_imp,
                # 시계열 피처
                "dow": dt.weekday(),
                "month": dt.month,
                "is_holiday": False,
            }
            results.append(row)

        # 배치 적재
        if len(results) >= 3000:
            upsert_batch("feature_store", results)
            print(f"    {date_str} — {len(results):,}행 적재")
            results = []

    if results:
        upsert_batch("feature_store", results)
        print(f"    잔여 {len(results):,}행 적재")

    count = supabase.table("feature_store").select("id", count="exact").execute()
    print(f"[S3] 완료 — feature_store: {count.count:,}행")


if __name__ == "__main__":
    run()
