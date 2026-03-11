"""
Step 4S: 구간별 모델 선택기 (Segment-based Model Selector)

제품별 수요 규모에 따라 최적 모델의 예측 결과를 선택하여
model_id = 'segment_best_v1'로 forecast_result에 저장한다.

구간 분류 기준 (일평균 수주량, 최근 90일):
  - 저수요 (< 10):   주간=SVR Linear, 월간=SVR Linear
  - 중수요 (10~99):  주간=LightGBM,   월간=Ridge
  - 고수요 (100+):   주간=LightGBM,   월간=Ridge

입력 테이블: forecast_result, daily_order
출력 테이블: forecast_result (model_id='segment_best_v1')

사용법:
  python s4s_segment_selector.py              # 주간 + 월간
  python s4s_segment_selector.py --weekly     # 주간만
  python s4s_segment_selector.py --monthly    # 월간만
"""

from collections import defaultdict
from datetime import date, timedelta

from config import (
    supabase, upsert_batch,
    SEGMENT_MODEL_ID, SEGMENT_THRESHOLDS, SEGMENT_MODEL_MAP,
    SEGMENT_DEMAND_LOOKBACK_DAYS,
)


def fetch_all(table: str, select: str) -> list:
    all_rows, offset, ps = [], 0, 1000
    while True:
        try:
            resp = supabase.table(table).select(select).range(offset, offset + ps - 1).execute()
        except Exception as e:
            if "PGRST205" in str(e) or "Could not find" in str(e):
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


def classify_products() -> dict:
    """제품별 수요 구간 분류 → {product_id: 'low'|'mid'|'high'}"""
    cutoff = (date.today() - timedelta(days=SEGMENT_DEMAND_LOOKBACK_DAYS)).isoformat()
    rows = fetch_all("daily_order", "product_id,order_date,order_qty")

    # 제품별 최근 N일 수주 합계 / 수주 발생 일수
    demand_sum = defaultdict(float)
    demand_days = defaultdict(set)
    for r in rows:
        od = r.get("order_date", "")
        if od >= cutoff:
            pid = r["product_id"]
            demand_sum[pid] += float(r["order_qty"] or 0)
            demand_days[pid].add(od)

    # 일평균 수주량 계산
    daily_avg = {}
    for pid in demand_sum:
        n_days = len(demand_days[pid])
        if n_days > 0:
            daily_avg[pid] = demand_sum[pid] / n_days

    # 구간 분류
    low_th = SEGMENT_THRESHOLDS["low"]
    high_th = SEGMENT_THRESHOLDS["high"]
    segments = {}
    for pid, avg in daily_avg.items():
        if avg < low_th:
            segments[pid] = "low"
        elif avg >= high_th:
            segments[pid] = "high"
        else:
            segments[pid] = "mid"

    # 수주 데이터 없는 제품 → 저수요 취급
    return segments


def _load_forecasts_by_model(model_ids: list) -> dict:
    """model_id별 forecast 데이터를 로드
    Returns: {model_id: {(product_id, horizon_days): row_dict}}
    """
    rows = fetch_all("forecast_result",
                     "model_id,product_id,forecast_date,target_date,horizon_days,p10,p50,p90,actual_qty")

    # model_id 필터링
    target_set = set(model_ids)
    by_model = defaultdict(dict)
    for r in rows:
        mid = r.get("model_id")
        if mid not in target_set:
            continue
        pid = r["product_id"]
        h = r["horizon_days"]
        key = (pid, h)
        # 최신 forecast_date만 유지
        existing = by_model[mid].get(key)
        if not existing or r.get("forecast_date", "") > existing.get("forecast_date", ""):
            by_model[mid][key] = r

    return dict(by_model)


def select_best(period: str) -> list:
    """구간별 최적 모델 선택 → segment_best_v1 행 생성

    Args:
        period: 'weekly' 또는 'monthly'
    Returns:
        선택된 forecast_result 행 리스트
    """
    model_map = SEGMENT_MODEL_MAP[period]
    needed_models = list(set(model_map.values()))
    print(f"  사용 모델: {needed_models}")

    # 1) 제품 구간 분류
    segments = classify_products()
    seg_counts = defaultdict(int)
    for seg in segments.values():
        seg_counts[seg] += 1
    print(f"  구간 분류: 저수요={seg_counts['low']:,} | 중수요={seg_counts['mid']:,} | 고수요={seg_counts['high']:,}")

    # 2) 모델별 예측 데이터 로드
    forecasts = _load_forecasts_by_model(needed_models)
    for mid in needed_models:
        count = len(forecasts.get(mid, {}))
        print(f"    {mid}: {count:,}건")

    # 3) 제품별 최적 모델 선택
    # 주간 horizon: 7, 14, 28 / 월간 horizon: 30, 90, 180
    if period == "weekly":
        target_horizons = {7, 14, 28}
    else:
        target_horizons = {30, 90, 180}

    results = []
    selected_count = defaultdict(int)
    fallback_count = 0

    # forecast에 등장하는 모든 product_id 수집
    all_product_ids = set()
    for mid_data in forecasts.values():
        for (pid, h) in mid_data.keys():
            if h in target_horizons:
                all_product_ids.add(pid)

    for pid in all_product_ids:
        seg = segments.get(pid, "low")  # 수요 데이터 없으면 저수요
        best_model = model_map[seg]

        for h in target_horizons:
            key = (pid, h)
            row = None

            # 1차: 구간별 최적 모델에서 선택
            if best_model in forecasts and key in forecasts[best_model]:
                row = forecasts[best_model][key]
            else:
                # 2차: 다른 모델에서 폴백
                for fallback_mid in needed_models:
                    if fallback_mid in forecasts and key in forecasts[fallback_mid]:
                        row = forecasts[fallback_mid][key]
                        fallback_count += 1
                        break

            if row:
                results.append({
                    "model_id": SEGMENT_MODEL_ID,
                    "product_id": pid,
                    "forecast_date": row.get("forecast_date", date.today().isoformat()),
                    "target_date": row.get("target_date"),
                    "horizon_days": h,
                    "p10": row["p10"],
                    "p50": row["p50"],
                    "p90": row["p90"],
                    "actual_qty": row.get("actual_qty"),
                })
                selected_count[best_model] += 1

    print(f"  선택 결과: {len(results):,}건 (폴백: {fallback_count:,}건)")
    for mid, cnt in sorted(selected_count.items()):
        print(f"    {mid}: {cnt:,}건 선택됨")

    return results


def _save(results: list, label: str):
    """결과 저장 — 기존 segment_best_v1 삭제 후 삽입"""
    if not results:
        print(f"  {label}: 저장할 데이터 없음")
        return

    # 기존 segment_best_v1 데이터 삭제 (해당 horizon만)
    horizons = list({r["horizon_days"] for r in results})
    for h in horizons:
        try:
            supabase.table("forecast_result") \
                .delete() \
                .eq("model_id", SEGMENT_MODEL_ID) \
                .eq("horizon_days", h) \
                .execute()
        except Exception as e:
            print(f"    [!] 기존 데이터 삭제 실패 (horizon={h}): {e}")

    # 배치 삽입
    for i in range(0, len(results), 500):
        batch = results[i:i + 500]
        supabase.table("forecast_result").insert(batch).execute()

    print(f"  {label}: {len(results):,}건 적재 완료")


def run_weekly():
    """주간 구간별 모델 선택"""
    print("\n" + "=" * 60)
    print("[S4S] 구간별 모델 선택 — 주간")
    print("=" * 60)
    results = select_best("weekly")
    _save(results, "주간 segment_best_v1")


def run_monthly():
    """월간 구간별 모델 선택"""
    print("\n" + "=" * 60)
    print("[S4S] 구간별 모델 선택 — 월간")
    print("=" * 60)
    results = select_best("monthly")
    _save(results, "월간 segment_best_v1")


def run():
    """주간 + 월간 모두 실행"""
    run_weekly()
    run_monthly()

    count = supabase.table("forecast_result") \
        .select("id", count="exact") \
        .eq("model_id", SEGMENT_MODEL_ID) \
        .execute()
    print(f"\n[S4S] 완료 — segment_best_v1 총 {count.count:,}행")


if __name__ == "__main__":
    import sys
    if "--weekly" in sys.argv:
        run_weekly()
    elif "--monthly" in sys.argv:
        run_monthly()
    else:
        run()
