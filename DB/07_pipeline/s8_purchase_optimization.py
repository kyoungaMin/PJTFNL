"""
Step 8: 발주 최적화 (Purchase Optimization)
BOM 전개 + 안전재고/ROP/EOQ + 공급사 추천 기반 최적 발주 추천

입력 테이블: production_plan (S7 출력), bom, inventory, purchase_order,
            product_lead_time, supplier
출력 테이블: purchase_recommendation
"""

import json
from datetime import date, timedelta
from collections import defaultdict
from math import sqrt

from config import (
    supabase, upsert_batch,
    PRODUCTION_PLAN_DAYS, ORDERING_COST, HOLDING_RATE, SUPPLIER_WEIGHTS,
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


def load_production_plan() -> list:
    """S7 생산 계획 중 최신 plan_date 로드"""
    rows = fetch_all("production_plan",
                     "product_id,plan_date,planned_qty,target_start,target_end,priority")
    if not rows:
        return []
    latest_date = max(r["plan_date"] for r in rows)
    return [r for r in rows if r["plan_date"] == latest_date]


def load_bom_data() -> dict:
    """BOM: {parent_product_id: [(component_product_id, usage_qty)]}"""
    rows = fetch_all("bom", "parent_product_id,component_product_id,usage_qty")
    bom_map = defaultdict(list)
    for r in rows:
        bom_map[r["parent_product_id"]].append((
            r["component_product_id"],
            float(r["usage_qty"] or 0),
        ))
    return dict(bom_map)


def load_component_inventory() -> dict:
    """자재 재고: {product_id: qty}"""
    rows = fetch_all("inventory", "snapshot_date,product_id,inventory_qty")
    inv_map = {}
    inv_latest = {}
    for r in rows:
        pid = r["product_id"]
        ym = r["snapshot_date"]
        qty = float(r["inventory_qty"] or 0)
        if pid not in inv_latest or ym > inv_latest[pid]:
            inv_latest[pid] = ym
            inv_map[pid] = qty
        elif ym == inv_latest.get(pid):
            inv_map[pid] = inv_map.get(pid, 0) + qty
    return inv_map


def load_pending_po() -> dict:
    """미입고 발주 잔량 (status != 'F'): {component_product_id: pending_qty}"""
    rows = fetch_all("purchase_order", "component_product_id,po_qty,status")
    pending = defaultdict(float)
    for r in rows:
        if r.get("status") != "F":
            pid = r.get("component_product_id")
            if pid:
                pending[pid] += float(r["po_qty"] or 0)
    return dict(pending)


def load_lead_times() -> dict:
    """자재별 최신 리드타임: {product_id: {avg, p90}}"""
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


def load_supplier_profiles() -> dict:
    """공급사별 프로파일: {component_product_id: [{supplier_code, name, avg_lead, avg_price, on_time_rate}]}"""
    po_rows = fetch_all("purchase_order",
                        "component_product_id,cd_partner,supplier_name,"
                        "po_date,receipt_date,unit_price,status")
    # 공급사 마스터에서 이름 매핑
    sup_rows = fetch_all("supplier", "customer_code,customer_name")
    name_map = {r["customer_code"]: r["customer_name"] for r in sup_rows}

    profiles = defaultdict(lambda: defaultdict(lambda: {
        "lead_days": [], "prices": [], "on_time": 0, "total": 0, "name": "",
    }))

    for r in po_rows:
        comp = r.get("component_product_id")
        sup = r.get("cd_partner")
        if not comp or not sup:
            continue

        prof = profiles[comp][sup]
        prof["name"] = name_map.get(sup, r.get("supplier_name") or sup)
        prof["total"] += 1

        price = r.get("unit_price")
        if price:
            prof["prices"].append(float(price))

        if r.get("status") == "F" and r.get("po_date") and r.get("receipt_date"):
            try:
                d1 = date.fromisoformat(r["po_date"])
                d2 = date.fromisoformat(r["receipt_date"])
                lead = (d2 - d1).days
                if lead >= 0:
                    prof["lead_days"].append(lead)
                    if lead <= 30:
                        prof["on_time"] += 1
            except (ValueError, TypeError):
                pass

    result = {}
    for comp, suppliers in profiles.items():
        comp_list = []
        for sup, prof in suppliers.items():
            if not prof["lead_days"] and not prof["prices"]:
                continue
            avg_lead = (sum(prof["lead_days"]) / len(prof["lead_days"])
                        if prof["lead_days"] else None)
            avg_price = (sum(prof["prices"]) / len(prof["prices"])
                         if prof["prices"] else None)
            on_time_rate = (prof["on_time"] / len(prof["lead_days"])
                           if prof["lead_days"] else None)
            comp_list.append({
                "supplier_code": sup,
                "supplier_name": prof["name"],
                "avg_lead_days": avg_lead,
                "avg_unit_price": avg_price,
                "sample_count": len(prof["lead_days"]),
                "on_time_rate": on_time_rate,
            })
        if comp_list:
            result[comp] = comp_list
    return result


# ─── 계산 함수 ───────────────────────────────────────────────

def select_best_supplier(suppliers: list) -> tuple:
    """가중 점수 기반 최적 + 대체 공급사 선택
    Returns: (best_dict, alt_dict_or_None)
    """
    if not suppliers:
        return None, None
    if len(suppliers) == 1:
        return suppliers[0], None

    w_lead = SUPPLIER_WEIGHTS["lead_time"]
    w_price = SUPPLIER_WEIGHTS["unit_price"]
    w_rel = SUPPLIER_WEIGHTS["reliability"]

    leads = [s["avg_lead_days"] for s in suppliers if s["avg_lead_days"] is not None]
    prices = [s["avg_unit_price"] for s in suppliers if s["avg_unit_price"] is not None]

    lead_min, lead_max = (min(leads), max(leads)) if leads else (0, 1)
    price_min, price_max = (min(prices), max(prices)) if prices else (0, 1)
    lead_range = lead_max - lead_min if lead_max != lead_min else 1
    price_range = price_max - price_min if price_max != price_min else 1

    scored = []
    for s in suppliers:
        lead_score = (1 - (s["avg_lead_days"] - lead_min) / lead_range
                      if s["avg_lead_days"] is not None else 0.5)
        price_score = (1 - (s["avg_unit_price"] - price_min) / price_range
                       if s["avg_unit_price"] is not None else 0.5)
        reliability = s["on_time_rate"] if s["on_time_rate"] is not None else 0.5

        total = w_lead * lead_score + w_price * price_score + w_rel * reliability
        scored.append((total, s))

    scored.sort(key=lambda x: -x[0])
    best = scored[0][1]
    alt = scored[1][1] if len(scored) > 1 else None
    return best, alt


def calc_eoq(annual_demand: float, unit_price: float) -> tuple:
    """경제적 주문량 (EOQ)
    Returns: (eoq_qty, method_str)
    """
    if annual_demand <= 0 or unit_price <= 0:
        return 0, "lot_for_lot"
    holding_cost = unit_price * HOLDING_RATE
    if holding_cost <= 0:
        return annual_demand / 12, "lot_for_lot"
    try:
        eoq = sqrt(2 * annual_demand * ORDERING_COST / holding_cost)
        return eoq, "eoq"
    except (ValueError, ZeroDivisionError):
        return annual_demand / 12, "lot_for_lot"


# ─── 메인 실행 ────────────────────────────────────────────────

def run():
    print("[S8] 발주 최적화 시작")
    today = date.today()
    today_str = today.isoformat()

    # --- 1) 데이터 로드 ---
    plan_rows = load_production_plan()
    bom_map = load_bom_data()
    inv_map = load_component_inventory()
    pending_po = load_pending_po()
    supplier_profiles = load_supplier_profiles()
    lead_map = load_lead_times()

    print(f"  생산계획: {len(plan_rows):,}  BOM구조: {len(bom_map):,}  "
          f"공급사프로파일: {len(supplier_profiles):,}")

    if not plan_rows:
        print("  [!] 생산 계획 없음 -- S7 먼저 실행 필요")
        cnt = supabase.table("purchase_recommendation").select("id", count="exact").execute()
        print(f"[S8] 완료 -- purchase_recommendation: {cnt.count:,}행 (변동 없음)")
        return

    # --- 2) BOM 전개 → 총소요량 ---
    gross_req = defaultdict(float)
    parent_map = defaultdict(set)

    for plan in plan_rows:
        pid = plan["product_id"]
        planned_qty = float(plan["planned_qty"] or 0)
        if planned_qty <= 0:
            continue
        for comp_id, usage_qty in bom_map.get(pid, []):
            gross_req[comp_id] += planned_qty * usage_qty
            parent_map[comp_id].add(pid)

    print(f"  BOM 전개 대상 자재: {len(gross_req):,}개")

    if not gross_req:
        print("  [!] BOM 전개 결과 없음 (BOM 미등록 또는 생산량 0)")
        cnt = supabase.table("purchase_recommendation").select("id", count="exact").execute()
        print(f"[S8] 완료 -- purchase_recommendation: {cnt.count:,}행 (변동 없음)")
        return

    # --- 3) 자재별 발주 추천 ---
    results = []
    for comp_id, gross_qty in gross_req.items():
        # 재고·미입고
        current_inv = inv_map.get(comp_id, 0)
        pending = pending_po.get(comp_id, 0)

        # 순소요량
        net_req = max(0, gross_qty - current_inv - pending)

        # 일평균 소비량
        daily_consumption = gross_qty / PRODUCTION_PLAN_DAYS if PRODUCTION_PLAN_DAYS > 0 else 0

        # 리드타임
        lt = lead_map.get(comp_id, {"avg": 7, "p90": 14})
        lead_avg = lt["avg"]
        lead_p90 = lt["p90"]

        # 안전재고 & ROP
        safety_stock = lead_p90 * daily_consumption
        rop = daily_consumption * lead_avg + safety_stock

        # 공급사 선택
        suppliers = supplier_profiles.get(comp_id, [])
        best_sup, alt_sup = select_best_supplier(suppliers)

        unit_price = (best_sup["avg_unit_price"]
                      if best_sup and best_sup["avg_unit_price"] else 0)

        # EOQ 계산
        annual_demand = daily_consumption * 365
        eoq, method = calc_eoq(annual_demand, unit_price)

        # 추천 발주량 결정
        if net_req <= 0:
            # 순소요 없어도 ROP 아래면 보충 발주
            available = current_inv + pending
            if available < rop:
                recommended_qty = max(safety_stock, eoq)
                order_method = method
            else:
                continue  # 발주 불필요
        elif eoq > 0 and eoq > net_req:
            recommended_qty = eoq
            order_method = method
        else:
            recommended_qty = net_req
            order_method = "lot_for_lot"

        recommended_qty = max(0, recommended_qty)
        if recommended_qty <= 0:
            continue

        # 발주 일정
        sup_lead = (best_sup["avg_lead_days"]
                    if best_sup and best_sup["avg_lead_days"] else lead_avg)
        need_date = today + timedelta(days=PRODUCTION_PLAN_DAYS)
        latest_order_date = need_date - timedelta(days=int(sup_lead))
        if latest_order_date < today:
            latest_order_date = today
        expected_receipt = today + timedelta(days=int(sup_lead))

        # 긴급도
        if latest_order_date <= today and net_req > current_inv:
            urgency = "critical"
        elif latest_order_date <= today + timedelta(days=3):
            urgency = "high"
        elif net_req > 0:
            urgency = "medium"
        else:
            urgency = "low"

        # 설명
        parents_list = sorted(parent_map[comp_id])[:5]
        desc_parts = [f"BOM 소스: {','.join(parents_list)}"]
        if net_req > 0:
            desc_parts.append(f"순소요 {net_req:.0f}")
        if current_inv < safety_stock:
            desc_parts.append(f"재고({current_inv:.0f})<안전재고({safety_stock:.0f})")

        results.append({
            "component_product_id": comp_id,
            "plan_date": today_str,
            "parent_product_ids": json.dumps(parents_list),
            "gross_requirement": round(gross_qty, 6),
            "current_inventory": round(current_inv, 6),
            "pending_po_qty": round(pending, 6),
            "net_requirement": round(net_req, 6),
            "safety_stock": round(safety_stock, 6),
            "reorder_point": round(rop, 6),
            "recommended_qty": round(recommended_qty, 6),
            "order_method": order_method,
            "recommended_supplier": best_sup["supplier_code"] if best_sup else None,
            "supplier_name": best_sup["supplier_name"] if best_sup else None,
            "supplier_lead_days": round(sup_lead, 2) if sup_lead else None,
            "supplier_unit_price": round(unit_price, 6) if unit_price else None,
            "alt_supplier": alt_sup["supplier_code"] if alt_sup else None,
            "alt_supplier_name": alt_sup["supplier_name"] if alt_sup else None,
            "latest_order_date": latest_order_date.isoformat(),
            "expected_receipt_date": expected_receipt.isoformat(),
            "need_date": need_date.isoformat(),
            "urgency": urgency,
            "description": "; ".join(desc_parts),
            "status": "pending",
        })

    print(f"  발주 추천: {len(results):,}건")

    # 분포 출력
    urg_dist = defaultdict(int)
    method_dist = defaultdict(int)
    for r in results:
        urg_dist[r["urgency"]] += 1
        method_dist[r["order_method"]] += 1
    print(f"  긴급도: {dict(sorted(urg_dist.items()))}")
    print(f"  발주방식: {dict(sorted(method_dist.items()))}")

    # --- 4) DB 적재 ---
    if results:
        upsert_batch("purchase_recommendation", results,
                     on_conflict="component_product_id,plan_date")

    cnt = supabase.table("purchase_recommendation").select("id", count="exact").execute()
    print(f"[S8] 완료 -- purchase_recommendation: {cnt.count:,}행")
