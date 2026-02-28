"""
Step 5: 리스크 스코어링
결품(stockout) / 과잉(excess) / 납기(delivery) / 마진(margin) 리스크 산출

입력 테이블: forecast_result, daily_inventory_estimated, product_lead_time,
            daily_order, daily_revenue, purchase_order, bom
출력 테이블: risk_score
"""

from datetime import date, timedelta
from collections import defaultdict

from config import supabase, upsert_batch, RISK_WEIGHTS, get_risk_grade


def fetch_all(table: str, select: str) -> list:
    all_rows, offset, ps = [], 0, 1000
    while True:
        try:
            resp = supabase.table(table).select(select).range(offset, offset + ps - 1).execute()
        except Exception as e:
            if "PGRST205" in str(e) or "Could not find" in str(e) or "57014" in str(e):
                print(f"    [!] 테이블 '{table}' 조회 실패 — 빈 데이터로 진행")
                return []
            raise
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < ps:
            break
        offset += ps
    return all_rows


def clamp(val: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, val))


def run():
    print("[S5] 리스크 스코어링 시작")
    today = date.today()
    today_str = today.isoformat()

    # 1) 최신 예측 결과 (forecast_date = 가장 최근)
    forecast_rows = fetch_all(
        "forecast_result",
        "product_id,p10,p50,p90,horizon_days",
    )
    # product_id → {horizon: {p10, p50, p90}}
    fc_map = defaultdict(dict)
    for r in forecast_rows:
        pid = r["product_id"]
        h = r["horizon_days"]
        fc_map[pid][h] = {
            "p10": float(r["p10"] or 0),
            "p50": float(r["p50"] or 0),
            "p90": float(r["p90"] or 0),
        }
    print(f"  예측 결과: {len(fc_map):,}개 제품")

    # 2) 최신 재고 스냅샷 (inventory 테이블에서 직접)
    inv_rows = fetch_all("inventory", "snapshot_date,product_id,inventory_qty")
    inv_map = {}
    inv_latest_ym = {}
    for r in inv_rows:
        pid = r["product_id"]
        ym = r["snapshot_date"]
        qty = float(r["inventory_qty"] or 0)
        if pid not in inv_latest_ym or ym > inv_latest_ym[pid]:
            inv_latest_ym[pid] = ym
            inv_map[pid] = qty
        elif ym == inv_latest_ym.get(pid):
            inv_map[pid] = inv_map.get(pid, 0) + qty  # 다중 창고 합산
    print(f"  최신 재고: {len(inv_map):,}개 제품")

    # 3) 리드타임 (purchase_order에서 직접 계산)
    po_lead_rows = fetch_all("purchase_order", "component_product_id,po_date,receipt_date,status")
    from datetime import date as _date
    lead_days_map = defaultdict(list)
    for r in po_lead_rows:
        if r.get("status") != "F" or not r.get("po_date") or not r.get("receipt_date"):
            continue
        try:
            d1 = _date.fromisoformat(r["po_date"])
            d2 = _date.fromisoformat(r["receipt_date"])
            days = (d2 - d1).days
            if days >= 0:
                lead_days_map[r["component_product_id"]].append(days)
        except ValueError:
            pass
    lead_avg = {}
    lead_p90 = {}
    for pid, days_list in lead_days_map.items():
        sorted_d = sorted(days_list)
        lead_avg[pid] = sum(sorted_d) / len(sorted_d)
        p90_idx = min(int(len(sorted_d) * 0.9), len(sorted_d) - 1)
        lead_p90[pid] = float(sorted_d[p90_idx])
    print(f"  리드타임: {len(lead_avg):,}개 제품")

    # 4) 미처리 수주 (status='R') — 납기 리스크용
    order_rows = fetch_all("daily_order", "product_id,expected_delivery_date,order_qty,status")
    open_orders = defaultdict(list)
    for r in order_rows:
        if r.get("status") == "R" and r.get("expected_delivery_date"):
            pid = r["product_id"]
            open_orders[pid].append({
                "delivery": r["expected_delivery_date"],
                "qty": float(r["order_qty"] or 0),
            })
    print(f"  미처리 수주: {sum(len(v) for v in open_orders.values()):,}건")

    # 5) 일평균 수요 (최근 30일 수주 기반)
    all_order_rows = fetch_all("daily_order", "product_id,order_date,order_qty")
    recent_demand = defaultdict(float)
    demand_days = defaultdict(set)
    cutoff = (today - timedelta(days=90)).isoformat()
    for r in all_order_rows:
        if r["order_date"] and r["order_date"] >= cutoff:
            pid = r["product_id"]
            recent_demand[pid] += float(r["order_qty"] or 0)
            demand_days[pid].add(r["order_date"])
    daily_avg_demand = {}
    for pid in recent_demand:
        n_days = len(demand_days[pid])
        if n_days > 0:
            daily_avg_demand[pid] = recent_demand[pid] / n_days

    # 6) 마진 분석: BOM 원가 vs 매출
    bom_rows = fetch_all("bom", "parent_product_id,component_product_id,usage_qty")
    po_rows = fetch_all("purchase_order", "component_product_id,unit_price")

    # 부품별 최근 단가
    comp_price = defaultdict(list)
    for r in po_rows:
        pid = r.get("component_product_id")
        price = r.get("unit_price")
        if pid and price:
            comp_price[pid].append(float(price))
    avg_comp_price = {pid: sum(ps) / len(ps) for pid, ps in comp_price.items() if ps}

    # 제품별 BOM 원가
    bom_cost = defaultdict(float)
    for r in bom_rows:
        parent = r["parent_product_id"]
        comp = r["component_product_id"]
        usage = float(r["usage_qty"] or 0)
        if comp in avg_comp_price:
            bom_cost[parent] += avg_comp_price[comp] * usage

    # 제품별 최근 평균 매출단가
    rev_rows = fetch_all("daily_revenue", "product_id,quantity,revenue_amount")
    rev_total = defaultdict(lambda: [0.0, 0.0])
    for r in rev_rows:
        pid = r["product_id"]
        qty = float(r["quantity"] or 0)
        amt = float(r["revenue_amount"] or 0)
        rev_total[pid][0] += amt
        rev_total[pid][1] += qty
    avg_rev_price = {}
    for pid, (amt, qty) in rev_total.items():
        if qty > 0:
            avg_rev_price[pid] = amt / qty

    # 7) 리스크 산출
    all_products = set(fc_map.keys()) | set(inv_map.keys()) | set(daily_avg_demand.keys())
    results = []

    for pid in all_products:
        inv_qty = inv_map.get(pid, 0)
        avg_demand = daily_avg_demand.get(pid, 0)
        lt_p90 = lead_p90.get(pid, 14)  # 기본 14일
        lt_mean = lead_avg.get(pid, 7)
        fc = fc_map.get(pid, {})
        fc_30 = fc.get(28, fc.get(30, fc.get(14, fc.get(7, {}))))
        demand_p90 = fc_30.get("p90", avg_demand * 30)
        demand_p50 = fc_30.get("p50", avg_demand * 30)

        # 재고일수
        inv_days = inv_qty / avg_demand if avg_demand > 0 else 999
        # 안전재고 = P90 리드타임 × 일평균 수요
        safety_stock = lt_p90 * avg_demand

        # ① 결품 리스크 (0~100)
        if avg_demand <= 0:
            stockout = 0.0
        elif inv_qty <= 0:
            stockout = 100.0
        elif inv_days < lt_p90:
            stockout = clamp(80 + (lt_p90 - inv_days) / lt_p90 * 20)
        elif inv_qty < safety_stock:
            stockout = clamp(50 + (safety_stock - inv_qty) / safety_stock * 30)
        elif inv_days < lt_p90 * 2:
            stockout = clamp(30 * (1 - (inv_days - lt_p90) / lt_p90))
        else:
            stockout = 0.0

        # ② 과잉 리스크 (0~100)
        if avg_demand <= 0:
            # 수요 이력 없는 제품: 재고 있으면 경고 수준(30), 없으면 0
            excess = 30.0 if inv_qty > 0 else 0.0
        else:
            monthly_demand = avg_demand * 30
            months_supply = inv_qty / monthly_demand
            if months_supply > 6:
                excess = clamp(80 + (months_supply - 6) * 5)
            elif months_supply > 3:
                excess = clamp(40 + (months_supply - 3) * 13.3)
            elif months_supply > 2:
                excess = clamp(20 + (months_supply - 2) * 20)
            else:
                excess = 0.0

        # ③ 납기 리스크 (0~100)
        delivery = 0.0
        orders = open_orders.get(pid, [])
        if orders:
            urgent_count = 0
            overdue_count = 0
            for o in orders:
                try:
                    dd = date.fromisoformat(o["delivery"])
                    remaining = (dd - today).days
                    if remaining < 0:
                        overdue_count += 1
                    elif remaining < lt_mean:
                        urgent_count += 1
                except ValueError:
                    pass
            if overdue_count > 0:
                # 납기 초과: 70점 기준, 건수 비례 증가
                delivery = clamp(70 + overdue_count * 5)
            elif urgent_count > 0:
                # 리드타임 내 긴급: 건수 비례 (40점 시작)
                delivery = clamp(40 + urgent_count * 8)

        # ④ 마진 리스크 (0~100)
        margin = 0.0
        if pid in bom_cost and pid in avg_rev_price:
            cost = bom_cost[pid]
            rev = avg_rev_price[pid]
            if rev > 0:
                margin_pct = (rev - cost) / rev * 100
                if margin_pct < 5:
                    margin = clamp(80 + (5 - margin_pct) * 4)
                elif margin_pct < 10:
                    margin = clamp(40 + (10 - margin_pct) * 8)
                elif margin_pct < 20:
                    margin = clamp(10 + (20 - margin_pct))

        # 종합 리스크
        total = (
            stockout * RISK_WEIGHTS["stockout"]
            + excess * RISK_WEIGHTS["excess"]
            + delivery * RISK_WEIGHTS["delivery"]
            + margin * RISK_WEIGHTS["margin"]
        )
        grade = get_risk_grade(total)

        results.append({
            "product_id": pid,
            "eval_date": today_str,
            "stockout_risk": round(stockout, 2),
            "excess_risk": round(excess, 2),
            "delivery_risk": round(delivery, 2),
            "margin_risk": round(margin, 2),
            "total_risk": round(total, 2),
            "risk_grade": grade,
            "inventory_days": round(inv_days, 2) if inv_days < 999 else None,
            "demand_p90": round(demand_p90, 6),
            "safety_stock": round(safety_stock, 6),
        })

    print(f"  리스크 산출: {len(results):,}개 제품")

    # 등급 분포
    grade_dist = defaultdict(int)
    for r in results:
        grade_dist[r["risk_grade"]] += 1
    print(f"  등급 분포: {dict(sorted(grade_dist.items()))}")

    if results:
        upsert_batch("risk_score", results, on_conflict="product_id,eval_date")

    count = supabase.table("risk_score").select("id", count="exact").execute()
    print(f"[S5] 완료 — risk_score: {count.count:,}행")


if __name__ == "__main__":
    run()
