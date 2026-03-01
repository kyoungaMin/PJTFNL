"""
Step 7: 생산 최적화 (Production Plan)
수요예측 + 현재재고 + 생산캐파 + 리스크 기반으로 제품별 최적 생산량 산출

입력 테이블: forecast_result, inventory, daily_production,
            risk_score, product_lead_time, daily_order
출력 테이블: production_plan
"""

from datetime import date, timedelta
from collections import defaultdict

from config import (
    supabase, upsert_batch,
    PRODUCTION_PLAN_DAYS, PRODUCTION_CAPACITY_BUFFER, PRODUCTION_LOOKBACK_DAYS,
)


# ─── 데이터 로드 ─────────────────────────────────────────────

def fetch_all(table: str, select: str = "*") -> list:
    """Supabase 페이징 조회"""
    all_rows, offset, ps = [], 0, 1000
    while True:
        try:
            resp = (supabase.table(table)
                    .select(select)
                    .range(offset, offset + ps - 1)
                    .execute())
        except Exception as e:
            if "PGRST" in str(e) or "Could not find" in str(e):
                print(f"    [!] 테이블 '{table}' 조회 실패 -- 빈 데이터로 진행")
                return []
            raise
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < ps:
            break
        offset += ps
    return all_rows


def load_forecast_data() -> dict:
    """forecast_result에서 제품별 최신 예측 로드
    Returns: {product_id: {horizon_days: {p10, p50, p90}}}
    """
    rows = fetch_all("forecast_result",
                     "product_id,p10,p50,p90,horizon_days,forecast_date")
    # 최신 forecast_date만 유지
    latest = {}
    for r in rows:
        pid = r["product_id"]
        h = r["horizon_days"]
        key = (pid, h)
        if key not in latest or r["forecast_date"] > latest[key]["forecast_date"]:
            latest[key] = r

    fc_map = defaultdict(dict)
    for (pid, h), r in latest.items():
        fc_map[pid][h] = {
            "p10": float(r["p10"] or 0),
            "p50": float(r["p50"] or 0),
            "p90": float(r["p90"] or 0),
        }
    return dict(fc_map)


def load_inventory_data() -> dict:
    """최신 재고 스냅샷: {product_id: inventory_qty}"""
    rows = fetch_all("inventory", "snapshot_date,product_id,inventory_qty")
    inv_map = {}
    inv_latest_ym = {}
    for r in rows:
        pid = r["product_id"]
        ym = r["snapshot_date"]
        qty = float(r["inventory_qty"] or 0)
        if pid not in inv_latest_ym or ym > inv_latest_ym[pid]:
            inv_latest_ym[pid] = ym
            inv_map[pid] = qty
        elif ym == inv_latest_ym.get(pid):
            inv_map[pid] = inv_map.get(pid, 0) + qty
    return inv_map


def load_production_capacity() -> dict:
    """daily_production 이력 기반 일평균 캐파시티
    Returns: {product_id: {daily_avg, daily_max, active_days}}
    """
    rows = fetch_all("daily_production",
                     "production_date,product_id,produced_qty")
    cutoff = (date.today() - timedelta(days=PRODUCTION_LOOKBACK_DAYS)).isoformat()

    prod_by_product = defaultdict(lambda: defaultdict(float))
    for r in rows:
        if r.get("production_date") and r["production_date"] >= cutoff:
            pid = r["product_id"]
            prod_by_product[pid][r["production_date"]] += float(r["produced_qty"] or 0)

    capacity = {}
    for pid, daily_map in prod_by_product.items():
        vals = list(daily_map.values())
        if vals:
            capacity[pid] = {
                "daily_avg": sum(vals) / len(vals),
                "daily_max": max(vals),
                "active_days": len(vals),
            }
    return capacity


def load_risk_data() -> dict:
    """risk_score 최신: {product_id: row}"""
    rows = fetch_all("risk_score", "*")
    latest = {}
    for r in rows:
        pid = r["product_id"]
        if pid not in latest or r["eval_date"] > latest[pid]["eval_date"]:
            latest[pid] = r
    return latest


def load_lead_times() -> dict:
    """product_lead_time: {product_id: {avg, p90}}"""
    rows = fetch_all("product_lead_time",
                     "product_id,avg_lead_days,p90_lead_days,calc_date")
    latest = {}
    for r in rows:
        pid = r["product_id"]
        if pid not in latest or r["calc_date"] > latest[pid]["calc_date"]:
            latest[pid] = r
    return {
        pid: {
            "avg": float(r["avg_lead_days"] or 7),
            "p90": float(r["p90_lead_days"] or 14),
        }
        for pid, r in latest.items()
    }


def load_open_orders() -> dict:
    """미처리 수주(status='R'): {product_id: [{delivery, qty}]}"""
    rows = fetch_all("daily_order",
                     "product_id,expected_delivery_date,order_qty,status")
    open_orders = defaultdict(list)
    for r in rows:
        if r.get("status") == "R" and r.get("expected_delivery_date"):
            open_orders[r["product_id"]].append({
                "delivery": r["expected_delivery_date"],
                "qty": float(r["order_qty"] or 0),
            })
    return dict(open_orders)


def load_daily_demand() -> dict:
    """최근 N일 일평균 수요: {product_id: daily_avg}"""
    rows = fetch_all("daily_order", "product_id,order_date,order_qty")
    cutoff = (date.today() - timedelta(days=PRODUCTION_LOOKBACK_DAYS)).isoformat()
    demand_sum = defaultdict(float)
    demand_days = defaultdict(set)
    for r in rows:
        if r.get("order_date") and r["order_date"] >= cutoff:
            pid = r["product_id"]
            demand_sum[pid] += float(r["order_qty"] or 0)
            demand_days[pid].add(r["order_date"])
    return {
        pid: demand_sum[pid] / len(demand_days[pid])
        for pid in demand_sum if demand_days[pid]
    }


# ─── 판정 함수 ───────────────────────────────────────────────

def determine_priority(risk_grade: str,
                       stockout_risk: float,
                       excess_risk: float) -> str:
    """리스크 기반 우선순위 결정"""
    if risk_grade == "F" or stockout_risk >= 80:
        return "critical"
    if risk_grade == "D" or stockout_risk >= 60 or excess_risk >= 80:
        return "high"
    if risk_grade == "C" or stockout_risk >= 40 or excess_risk >= 60:
        return "medium"
    return "low"


def determine_plan_type(planned_qty: float, recent_avg: float) -> str:
    """계획 유형 결정"""
    if recent_avg <= 0:
        return "new" if planned_qty > 0 else "maintain"
    ratio = planned_qty / recent_avg
    if ratio > 1.15:
        return "increase"
    if ratio < 0.85:
        return "decrease"
    return "maintain"


# ─── 메인 실행 ────────────────────────────────────────────────

def run():
    print("[S7] 생산 최적화 시작")
    today = date.today()
    today_str = today.isoformat()

    # --- 1) 데이터 로드 ---
    fc_map = load_forecast_data()
    inv_map = load_inventory_data()
    capacity = load_production_capacity()
    risk_data = load_risk_data()
    lead_times = load_lead_times()
    open_orders = load_open_orders()
    daily_demand = load_daily_demand()

    print(f"  예측: {len(fc_map):,}  재고: {len(inv_map):,}  "
          f"캐파: {len(capacity):,}  리스크: {len(risk_data):,}")

    # --- 2) 대상 제품 ---
    all_products = set(fc_map.keys()) | set(daily_demand.keys())
    print(f"  대상 제품: {len(all_products):,}개")

    # --- 3) 주간 생산 계획 산출 ---
    target_start = today
    target_end = today + timedelta(days=PRODUCTION_PLAN_DAYS - 1)

    results = []
    for pid in all_products:
        # 예측 데이터 (7일 → 14일 → 28일 → 30일 순으로 fallback)
        fc = fc_map.get(pid, {})
        fc_best = fc.get(7, fc.get(14, fc.get(28, fc.get(30, {}))))
        demand_p50 = fc_best.get("p50", 0)
        demand_p90 = fc_best.get("p90", 0)

        # 예측 없으면 일평균수요 × 기간
        if demand_p50 <= 0:
            avg_d = daily_demand.get(pid, 0)
            demand_p50 = avg_d * PRODUCTION_PLAN_DAYS
            demand_p90 = demand_p50 * 1.5

        # 재고
        inv_qty = inv_map.get(pid, 0)

        # 리드타임 & 안전재고
        lt = lead_times.get(pid, {"avg": 7, "p90": 14})
        avg_d = daily_demand.get(pid, 0)
        safety_stock = lt["p90"] * avg_d

        # 순소요량
        net_req = max(0, demand_p50 + safety_stock - inv_qty)
        net_req_max = max(0, demand_p90 + safety_stock - inv_qty)

        # 미처리 수주 긴급분 반영
        orders = open_orders.get(pid, [])
        urgent_qty = 0
        for o in orders:
            try:
                dd = date.fromisoformat(o["delivery"])
                if dd <= target_end:
                    urgent_qty += o["qty"]
            except (ValueError, TypeError):
                pass
        if urgent_qty > 0:
            net_req = max(net_req, urgent_qty - inv_qty)

        # 캐파시티 제약
        cap = capacity.get(pid, {})
        daily_cap = cap.get("daily_avg", 0) * PRODUCTION_CAPACITY_BUFFER
        max_cap = (daily_cap * PRODUCTION_PLAN_DAYS) if daily_cap > 0 else float("inf")

        # 리스크 기반 조정
        risk = risk_data.get(pid, {})
        risk_grade = risk.get("risk_grade", "A")
        stockout_risk = float(risk.get("stockout_risk") or 0)
        excess_risk = float(risk.get("excess_risk") or 0)

        if risk_grade in ("D", "F") and stockout_risk > 60:
            planned_qty = min(net_req_max, max_cap) if max_cap < float("inf") else net_req_max
        elif risk_grade in ("D", "F") and excess_risk > 60:
            planned_qty = max(0, net_req * 0.9)
        else:
            planned_qty = min(net_req, max_cap) if max_cap < float("inf") else net_req

        planned_qty = max(0, planned_qty)

        # 우선순위 & 유형
        priority = determine_priority(risk_grade, stockout_risk, excess_risk)
        recent_prod_avg = cap.get("daily_avg", 0) * PRODUCTION_PLAN_DAYS
        plan_type = determine_plan_type(planned_qty, recent_prod_avg)

        # 설명 생성
        desc_parts = []
        if stockout_risk > 60:
            desc_parts.append(f"결품위험 {stockout_risk:.0f}점")
        if excess_risk > 60:
            desc_parts.append(f"과잉위험 {excess_risk:.0f}점")
        if urgent_qty > 0:
            desc_parts.append(f"긴급수주 {urgent_qty:.0f}개")
        if max_cap < float("inf") and planned_qty >= max_cap * 0.9:
            desc_parts.append("캐파한계근접")
        description = ", ".join(desc_parts) if desc_parts else None

        results.append({
            "product_id": pid,
            "plan_date": today_str,
            "plan_horizon": "weekly",
            "target_start": target_start.isoformat(),
            "target_end": target_end.isoformat(),
            "demand_p50": round(demand_p50, 6),
            "demand_p90": round(demand_p90, 6),
            "current_inventory": round(inv_qty, 6),
            "safety_stock": round(safety_stock, 6),
            "daily_capacity": round(daily_cap, 6) if daily_cap > 0 else None,
            "max_capacity": round(max_cap, 6) if max_cap < float("inf") else None,
            "planned_qty": round(planned_qty, 6),
            "min_qty": round(max(0, net_req * 0.8), 6),
            "max_qty": round(net_req_max, 6),
            "priority": priority,
            "plan_type": plan_type,
            "risk_grade": risk_grade,
            "description": description,
            "status": "draft",
        })

    print(f"  생산 계획 산출: {len(results):,}건")

    # 분포 출력
    pri_dist = defaultdict(int)
    type_dist = defaultdict(int)
    for r in results:
        pri_dist[r["priority"]] += 1
        type_dist[r["plan_type"]] += 1
    print(f"  우선순위: {dict(sorted(pri_dist.items()))}")
    print(f"  계획유형: {dict(sorted(type_dist.items()))}")

    # --- 4) DB 적재 ---
    if results:
        upsert_batch("production_plan", results,
                     on_conflict="product_id,plan_date,plan_horizon")

    cnt = supabase.table("production_plan").select("id", count="exact").execute()
    print(f"[S7] 완료 -- production_plan: {cnt.count:,}행")
