"""
Step 5: 리스크 스코어링
결품(stockout) / 과잉(excess) / 납기(delivery) / 마진(margin) 리스크 산출

입력 테이블: forecast_result, daily_inventory_estimated, product_lead_time,
            daily_order, daily_revenue, purchase_order, bom
출력 테이블: risk_score

사용법:
  python s5_risk_score.py                       # 오늘 기준 주간 리스크
  python s5_risk_score.py --type=monthly        # 오늘 기준 월간 리스크
  python s5_risk_score.py --backfill            # 2026-01 ~ 2026-02 주간+월간 백필
"""

from datetime import date, timedelta
from collections import defaultdict

from config import supabase, upsert_batch, RISK_WEIGHTS, get_risk_grade, SEGMENT_MODEL_ID


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


# ─── 공통 데이터 로드 (1회만) ───────────────────────────────────────────────
_cache = {}


def _load_common_data():
    """DB에서 공통 데이터를 1회 로드하여 캐시"""
    if _cache:
        return _cache

    # 1) 예측 결과 — segment_best_v1 우선, 없으면 전체 폴백
    forecast_rows = fetch_all("forecast_result", "model_id,product_id,p10,p50,p90,horizon_days")
    fc_map = defaultdict(dict)
    fc_fallback = defaultdict(dict)
    for r in forecast_rows:
        pid = r["product_id"]
        h = r["horizon_days"]
        entry = {
            "p10": float(r["p10"] or 0),
            "p50": float(r["p50"] or 0),
            "p90": float(r["p90"] or 0),
        }
        if r.get("model_id") == SEGMENT_MODEL_ID:
            fc_map[pid][h] = entry
        elif pid not in fc_map or h not in fc_map[pid]:
            fc_fallback[pid][h] = entry
    # segment_best에 없는 제품은 폴백으로 보충
    for pid, horizons in fc_fallback.items():
        for h, entry in horizons.items():
            if h not in fc_map.get(pid, {}):
                fc_map[pid][h] = entry
    print(f"  예측 결과: {len(fc_map):,}개 제품 (segment_best 우선)")

    # 2) 재고 스냅샷 (날짜별)
    inv_rows = fetch_all("inventory", "snapshot_date,product_id,inventory_qty")
    # product_id → {snapshot_date → qty}
    inv_by_date = defaultdict(lambda: defaultdict(float))
    for r in inv_rows:
        pid = r["product_id"]
        sd = r["snapshot_date"]
        inv_by_date[pid][sd] += float(r["inventory_qty"] or 0)
    print(f"  재고 스냅샷: {len(inv_by_date):,}개 제품")

    # 3) 리드타임
    po_lead_rows = fetch_all("purchase_order", "component_product_id,po_date,receipt_date,status")
    lead_days_map = defaultdict(list)
    for r in po_lead_rows:
        if r.get("status") != "F" or not r.get("po_date") or not r.get("receipt_date"):
            continue
        try:
            d1 = date.fromisoformat(r["po_date"])
            d2 = date.fromisoformat(r["receipt_date"])
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

    # 4) 수주 (전체)
    all_order_rows = fetch_all("daily_order", "product_id,order_date,order_qty,expected_delivery_date,status")
    print(f"  수주 데이터: {len(all_order_rows):,}건")

    # 5) BOM + 부품단가
    bom_rows = fetch_all("bom", "parent_product_id,component_product_id,usage_qty")
    po_rows = fetch_all("purchase_order", "component_product_id,unit_price")
    comp_price = defaultdict(list)
    for r in po_rows:
        pid = r.get("component_product_id")
        price = r.get("unit_price")
        if pid and price:
            comp_price[pid].append(float(price))
    avg_comp_price = {pid: sum(ps) / len(ps) for pid, ps in comp_price.items() if ps}
    bom_cost = defaultdict(float)
    for r in bom_rows:
        parent = r["parent_product_id"]
        comp = r["component_product_id"]
        usage = float(r["usage_qty"] or 0)
        if comp in avg_comp_price:
            bom_cost[parent] += avg_comp_price[comp] * usage

    # 6) 매출단가
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

    _cache.update({
        "fc_map": fc_map,
        "inv_by_date": inv_by_date,
        "lead_avg": lead_avg,
        "lead_p90": lead_p90,
        "all_order_rows": all_order_rows,
        "bom_cost": bom_cost,
        "avg_rev_price": avg_rev_price,
    })
    return _cache


def _get_inventory_at(inv_by_date, pid, eval_d):
    """eval_date 이전 가장 가까운 재고 스냅샷 반환"""
    snapshots = inv_by_date.get(pid, {})
    if not snapshots:
        return 0
    eval_str = eval_d.isoformat()
    # eval_date 이하 중 가장 최근
    candidates = [sd for sd in snapshots if sd <= eval_str]
    if candidates:
        return snapshots[max(candidates)]
    # 없으면 가장 오래된 것
    return snapshots[min(snapshots)]


def _compute_demand(all_order_rows, eval_d, lookback_days=90):
    """eval_date 기준 과거 lookback_days 내 일평균 수요 산출"""
    cutoff = (eval_d - timedelta(days=lookback_days)).isoformat()
    eval_str = eval_d.isoformat()
    recent_demand = defaultdict(float)
    demand_days = defaultdict(set)
    for r in all_order_rows:
        od = r.get("order_date")
        if od and cutoff <= od <= eval_str:
            pid = r["product_id"]
            recent_demand[pid] += float(r["order_qty"] or 0)
            demand_days[pid].add(od)
    daily_avg = {}
    for pid in recent_demand:
        n = len(demand_days[pid])
        if n > 0:
            daily_avg[pid] = recent_demand[pid] / n
    return daily_avg


def _compute_open_orders(all_order_rows, eval_d):
    """eval_date 기준 미처리 수주"""
    eval_str = eval_d.isoformat()
    open_orders = defaultdict(list)
    for r in all_order_rows:
        od = r.get("order_date", "")
        if r.get("status") == "R" and r.get("expected_delivery_date") and od <= eval_str:
            pid = r["product_id"]
            open_orders[pid].append({
                "delivery": r["expected_delivery_date"],
                "qty": float(r["order_qty"] or 0),
            })
    return open_orders


def score_risk(eval_d: date, eval_type: str = "weekly") -> list:
    """특정 날짜·유형에 대한 리스크 스코어 산출"""
    data = _load_common_data()
    fc_map = data["fc_map"]
    inv_by_date = data["inv_by_date"]
    lead_avg = data["lead_avg"]
    lead_p90_map = data["lead_p90"]
    all_order_rows = data["all_order_rows"]
    bom_cost = data["bom_cost"]
    avg_rev_price = data["avg_rev_price"]

    daily_avg_demand = _compute_demand(all_order_rows, eval_d)
    open_orders = _compute_open_orders(all_order_rows, eval_d)

    # 재고 맵 (eval_date 기준)
    inv_map = {}
    for pid in inv_by_date:
        inv_map[pid] = _get_inventory_at(inv_by_date, pid, eval_d)

    all_products = set(fc_map.keys()) | set(inv_map.keys()) | set(daily_avg_demand.keys())
    results = []

    for pid in all_products:
        inv_qty = inv_map.get(pid, 0)
        avg_demand = daily_avg_demand.get(pid, 0)
        lt_p90 = lead_p90_map.get(pid, 14)
        lt_mean = lead_avg.get(pid, 7)
        fc = fc_map.get(pid, {})
        fc_30 = fc.get(28, fc.get(30, fc.get(14, fc.get(7, {}))))
        demand_p90 = fc_30.get("p90", avg_demand * 30)

        inv_days = inv_qty / avg_demand if avg_demand > 0 else 999
        safety_stock = lt_p90 * avg_demand

        # ① 결품 리스크
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

        # ② 과잉 리스크
        if avg_demand <= 0:
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

        # ③ 납기 리스크
        delivery = 0.0
        orders = open_orders.get(pid, [])
        if orders:
            urgent_count = 0
            overdue_count = 0
            for o in orders:
                try:
                    dd = date.fromisoformat(o["delivery"])
                    remaining = (dd - eval_d).days
                    if remaining < 0:
                        overdue_count += 1
                    elif remaining < lt_mean:
                        urgent_count += 1
                except ValueError:
                    pass
            if overdue_count > 0:
                delivery = clamp(70 + overdue_count * 5)
            elif urgent_count > 0:
                delivery = clamp(40 + urgent_count * 8)

        # ④ 마진 리스크
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
            "eval_date": eval_d.isoformat(),
            "eval_type": eval_type,
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

    return results


def _save_results(results: list, label: str):
    """결과 저장 및 등급 분포 출력"""
    grade_dist = defaultdict(int)
    for r in results:
        grade_dist[r["risk_grade"]] += 1
    print(f"  {label}: {len(results):,}건 | 등급 분포: {dict(sorted(grade_dist.items()))}")

    if results:
        upsert_batch("risk_score", results,
                      on_conflict="product_id,eval_date,eval_type")


def run(eval_type: str = "weekly"):
    """오늘 기준 리스크 스코어링 (기존 호환)"""
    print(f"[S5] 리스크 스코어링 시작 (eval_type={eval_type})")
    results = score_risk(date.today(), eval_type)
    _save_results(results, f"{eval_type} {date.today()}")

    count = supabase.table("risk_score").select("id", count="exact").execute()
    print(f"[S5] 완료 — risk_score: {count.count:,}행")


def run_backfill():
    """2026-01 ~ 2026-02 주간(매주 월요일) + 월간(매월 1일) 백필"""
    print("=" * 60)
    print("[S5] 리스크 스코어 백필 시작 (2026-01 ~ 2026-02)")
    print("=" * 60)

    # 주간 날짜: 매주 월요일
    weekly_dates = []
    d = date(2026, 1, 5)  # 2026-01-05 (월요일)
    end = date(2026, 2, 28)
    while d <= end:
        weekly_dates.append(d)
        d += timedelta(days=7)

    # 월간 날짜: 매월 1일
    monthly_dates = [date(2026, 1, 1), date(2026, 2, 1)]

    total_saved = 0

    # 주간 백필
    print(f"\n── 주간 백필: {len(weekly_dates)}개 날짜 ──")
    for eval_d in weekly_dates:
        results = score_risk(eval_d, "weekly")
        _save_results(results, f"weekly {eval_d}")
        total_saved += len(results)

    # 월간 백필
    print(f"\n── 월간 백필: {len(monthly_dates)}개 날짜 ──")
    for eval_d in monthly_dates:
        results = score_risk(eval_d, "monthly")
        _save_results(results, f"monthly {eval_d}")
        total_saved += len(results)

    count = supabase.table("risk_score").select("id", count="exact").execute()
    print(f"\n[S5] 백필 완료 — 총 {total_saved:,}건 적재 | DB risk_score: {count.count:,}행")


if __name__ == "__main__":
    import sys
    if "--backfill" in sys.argv:
        run_backfill()
    elif "--type=monthly" in sys.argv:
        run("monthly")
    else:
        run("weekly")
