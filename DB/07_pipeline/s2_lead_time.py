"""
Step 2: 제품별 리드타임 통계 산출
산출 로직: purchase_order에서 receipt_date - po_date (완료건만)

입력 테이블: purchase_order
출력 테이블: product_lead_time
"""

import statistics
from collections import defaultdict
from datetime import date

from config import supabase, upsert_batch


def fetch_all_rows(table: str, select: str, filters: dict | None = None) -> list:
    """Supabase 테이블 전체 행 조회 (페이징)"""
    all_rows = []
    offset = 0
    page_size = 1000
    while True:
        q = supabase.table(table).select(select).range(offset, offset + page_size - 1)
        if filters:
            for col, val in filters.items():
                q = q.eq(col, val)
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
    print("[S2] 리드타임 통계 산출 시작")

    # 완료된 발주만 (status='F')
    po_rows = fetch_all_rows(
        "purchase_order",
        "component_product_id,cd_partner,po_date,receipt_date,status",
    )
    print(f"  구매발주 전체: {len(po_rows):,}건")

    # 리드타임 계산: (product_id, supplier_code) → [lead_days, ...]
    lead_map = defaultdict(list)
    skipped = 0
    for r in po_rows:
        if r.get("status") != "F":
            continue
        po_date = r.get("po_date")
        receipt_date = r.get("receipt_date")
        if not po_date or not receipt_date:
            skipped += 1
            continue

        pid = r["component_product_id"]
        supplier = r.get("cd_partner") or ""
        try:
            d_po = date.fromisoformat(po_date)
            d_rcpt = date.fromisoformat(receipt_date)
            lead_days = (d_rcpt - d_po).days
            if lead_days >= 0:
                lead_map[(pid, supplier)].append(lead_days)
        except ValueError:
            skipped += 1

    print(f"  완료건 리드타임 산출: {sum(len(v) for v in lead_map.values()):,}건 (건너뜀: {skipped})")

    # 통계 산출
    today_str = date.today().isoformat()
    results = []
    for (pid, supplier), days_list in lead_map.items():
        if not days_list:
            continue
        sorted_days = sorted(days_list)
        n = len(sorted_days)
        p90_idx = int(n * 0.9)
        if p90_idx >= n:
            p90_idx = n - 1

        results.append({
            "product_id": pid,
            "supplier_code": supplier if supplier else None,
            "calc_date": today_str,
            "avg_lead_days": round(statistics.mean(sorted_days), 2),
            "med_lead_days": round(statistics.median(sorted_days), 2),
            "p90_lead_days": round(sorted_days[p90_idx], 2),
            "min_lead_days": sorted_days[0],
            "max_lead_days": sorted_days[-1],
            "sample_count": n,
        })

    print(f"  리드타임 통계: {len(results):,}개 (제품-공급사 조합)")

    if results:
        upsert_batch("product_lead_time", results)

    count = supabase.table("product_lead_time").select("id", count="exact").execute()
    print(f"[S2] 완료 — product_lead_time: {count.count:,}행")


if __name__ == "__main__":
    run()
