"""
Step 6: 조치 큐 생성
리스크 등급 C 이상(total_risk > 40) 제품에 대해 권장 조치 자동 생성
S7/S8 결과가 존재하면 suggested_qty를 정교하게 산출

입력 테이블: risk_score, product_master, (optional) production_plan, purchase_recommendation
출력 테이블: action_queue
"""

from datetime import date
from collections import defaultdict

from config import supabase, upsert_batch


def fetch_all(table: str, select: str) -> list:
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


def get_severity(individual_score: float, total_risk: float) -> str:
    """개별 리스크 점수 + 종합 리스크를 조합하여 심각도 산정.
    - critical: 개별 90+ AND 종합 D등급(61+)
    - high:     개별 80+ OR (개별 60+ AND 종합 61+)
    - medium:   개별 40+
    - low:      나머지
    """
    if individual_score >= 90 and total_risk > 60:
        return "critical"
    elif individual_score >= 80 or (individual_score >= 60 and total_risk > 60):
        return "high"
    elif individual_score > 40:
        return "medium"
    return "low"


def _load_optimization_data() -> tuple:
    """S7/S8 결과 로드 (테이블 미존재 시 빈 dict 반환)
    Returns: (pp_map, pr_map)
        pp_map: {product_id: {planned_qty, daily_capacity, ...}}
        pr_map: {component_product_id: {recommended_qty, ...}}
    """
    pp_map, pr_map = {}, {}
    try:
        pp_rows = fetch_all("production_plan",
                            "product_id,plan_date,planned_qty,daily_capacity,plan_type")
        if pp_rows:
            latest_date = max(r["plan_date"] for r in pp_rows)
            for r in pp_rows:
                if r["plan_date"] == latest_date:
                    pp_map[r["product_id"]] = r
            print(f"  S7 생산계획 연동: {len(pp_map):,}개 제품")
    except Exception:
        pass

    try:
        pr_rows = fetch_all("purchase_recommendation",
                            "component_product_id,plan_date,recommended_qty")
        if pr_rows:
            latest_date = max(r["plan_date"] for r in pr_rows)
            for r in pr_rows:
                if r["plan_date"] == latest_date:
                    pr_map[r["component_product_id"]] = r
            print(f"  S8 발주추천 연동: {len(pr_map):,}개 자재")
    except Exception:
        pass

    return pp_map, pr_map


def run():
    print("[S6] 조치 큐 생성 시작")
    today_str = date.today().isoformat()

    # 1) 리스크 스코어 로드 (최신 eval_date만)
    risk_rows = fetch_all("risk_score", "*")
    # 최신 eval_date별 필터
    latest = {}
    for r in risk_rows:
        pid = r["product_id"]
        if pid not in latest or r["eval_date"] > latest[pid]["eval_date"]:
            latest[pid] = r
    print(f"  리스크 스코어: {len(latest):,}개 제품")

    # 2) 제품명 매핑
    pm_rows = fetch_all("product_master", "product_code,product_name")
    name_map = {r["product_code"]: r["product_name"] or r["product_code"] for r in pm_rows}

    # 2-1) S7/S8 결과 로드 (optional)
    pp_map, pr_map = _load_optimization_data()

    # 3) C등급 이상 필터 (total_risk > 40)
    high_risk = {pid: r for pid, r in latest.items() if float(r["total_risk"] or 0) > 40}
    print(f"  C등급 이상 (조치 대상): {len(high_risk):,}개 제품")

    # 4) 조치 생성
    actions = []

    for pid, r in high_risk.items():
        pname = name_map.get(pid, pid)
        eval_dt = r["eval_date"]
        inv_days = r.get("inventory_days")
        inv_days_str = f"{float(inv_days):.0f}일" if inv_days else "N/A"
        total_risk = float(r.get("total_risk") or 0)

        stockout = float(r.get("stockout_risk") or 0)
        excess = float(r.get("excess_risk") or 0)
        delivery = float(r.get("delivery_risk") or 0)
        margin = float(r.get("margin_risk") or 0)

        # S7/S8 데이터 참조
        pp = pp_map.get(pid, {})
        planned_qty = float(pp.get("planned_qty") or 0)
        daily_cap = float(pp.get("daily_capacity") or 0)
        recent_avg = daily_cap / 1.2 * 7 if daily_cap > 0 else 0  # 버퍼 제거 후 주간 환산
        pr = pr_map.get(pid, {})
        rec_qty = float(pr.get("recommended_qty") or 0)

        # 결품 리스크 조치
        if stockout > 40:
            sev = get_severity(stockout, total_risk)
            if stockout > 60:
                # expedite_po: S8 발주추천 > 기존 안전재고 > fallback
                sq = rec_qty if rec_qty > 0 else float(r.get("safety_stock") or 0)
                actions.append({
                    "product_id": pid,
                    "eval_date": eval_dt,
                    "risk_type": "stockout",
                    "severity": sev,
                    "action_type": "expedite_po",
                    "description": f"[{pname}] 재고일수 {inv_days_str}, 결품 위험 {stockout:.0f}점. 긴급 발주 또는 기존 발주 납기 단축 필요.",
                    "suggested_qty": sq if sq > 0 else None,
                    "status": "pending",
                })
            else:
                # increase_production: S7 계획량 - 최근 평균
                sq = max(0, planned_qty - recent_avg) if planned_qty > 0 else None
                actions.append({
                    "product_id": pid,
                    "eval_date": eval_dt,
                    "risk_type": "stockout",
                    "severity": sev,
                    "action_type": "increase_production",
                    "description": f"[{pname}] 재고일수 {inv_days_str}, 결품 주의 {stockout:.0f}점. 생산량 증대 검토.",
                    "suggested_qty": sq if sq and sq > 0 else None,
                    "status": "pending",
                })

        # 과잉 리스크 조치
        if excess > 40:
            sev = get_severity(excess, total_risk)
            # reduce_production: 최근 평균 - S7 계획량
            sq = max(0, recent_avg - planned_qty) if recent_avg > 0 and planned_qty >= 0 else None
            actions.append({
                "product_id": pid,
                "eval_date": eval_dt,
                "risk_type": "excess",
                "severity": sev,
                "action_type": "reduce_production",
                "description": f"[{pname}] 재고일수 {inv_days_str}, 과잉 재고 {excess:.0f}점. 생산 축소 또는 판촉 검토.",
                "suggested_qty": sq if sq and sq > 0 else None,
                "status": "pending",
            })

        # 납기 리스크 조치
        if delivery > 40:
            sev = get_severity(delivery, total_risk)
            # expedite_production: S7 계획량 활용
            sq = planned_qty if planned_qty > 0 else None
            actions.append({
                "product_id": pid,
                "eval_date": eval_dt,
                "risk_type": "delivery",
                "severity": sev,
                "action_type": "expedite_production",
                "description": f"[{pname}] 납기 리스크 {delivery:.0f}점. 생산 우선순위 조정 또는 부분 납품 검토.",
                "suggested_qty": sq,
                "status": "pending",
            })

        # 마진 리스크 조치
        if margin > 40:
            sev = get_severity(margin, total_risk)
            actions.append({
                "product_id": pid,
                "eval_date": eval_dt,
                "risk_type": "margin",
                "severity": sev,
                "action_type": "adjust_price",
                "description": f"[{pname}] 마진 리스크 {margin:.0f}점. 단가 재협상 또는 대체 공급사 검토.",
                "suggested_qty": None,
                "status": "pending",
            })

    print(f"  생성된 조치: {len(actions):,}건")

    # 심각도 분포
    sev_dist = defaultdict(int)
    for a in actions:
        sev_dist[a["severity"]] += 1
    print(f"  심각도 분포: {dict(sorted(sev_dist.items()))}")

    if actions:
        # 같은 eval_date의 기존 pending 조치 삭제 후 재생성
        supabase.table("action_queue").delete().eq(
            "eval_date", today_str
        ).eq("status", "pending").execute()
        for i in range(0, len(actions), 500):
            batch = actions[i:i + 500]
            supabase.table("action_queue").insert(batch).execute()

    count = supabase.table("action_queue").select("id", count="exact").execute()
    print(f"[S6] 완료 — action_queue: {count.count:,}행")


if __name__ == "__main__":
    run()
