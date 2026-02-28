"""
리스크 스코어링 검증 스크립트
─────────────────────────────────────────
1. S5 리스크 스코어를 실데이터로 재산출 & DB 결과와 비교
2. 등급 분포 분석 (편중 여부)
3. 가중치 민감도 분석 (weight sensitivity)
4. 조치 큐(S6) 실효성 검토
─────────────────────────────────────────
실행:
  cd DB/07_pipeline && python validate_risk.py
"""

import sys
import os
import statistics

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collections import defaultdict
from config import supabase, RISK_WEIGHTS, RISK_GRADE_BOUNDS, get_risk_grade


def fetch_all(table: str, select: str) -> list:
    all_rows, offset, ps = [], 0, 1000
    while True:
        try:
            resp = supabase.table(table).select(select).range(offset, offset + ps - 1).execute()
        except Exception as e:
            if "PGRST205" in str(e) or "Could not find" in str(e):
                return []
            raise
        if not resp.data:
            break
        all_rows.extend(resp.data)
        if len(resp.data) < ps:
            break
        offset += ps
    return all_rows


def print_section(title: str):
    print(f"\n{'='*64}")
    print(f"  {title}")
    print(f"{'='*64}")


def print_bar(label: str, count: int, total: int, width: int = 30):
    pct = count / total * 100 if total else 0
    filled = int(pct / 100 * width)
    bar = "#" * filled + "." * (width - filled)
    print(f"  {label:>5}: [{bar}] {count:>5} ({pct:5.1f}%)")


# ──────────────────────────────────────────────────
# 1. 실데이터 로드 & 등급 분포 분석
# ──────────────────────────────────────────────────
def analyze_risk_scores():
    print_section("1. risk_score 테이블 실데이터 분석")

    rows = fetch_all("risk_score", "*")
    if not rows:
        print("  [!] risk_score 테이블이 비어있음 — 먼저 S5를 실행하세요")
        return None

    # 최신 eval_date만
    latest = {}
    for r in rows:
        pid = r["product_id"]
        if pid not in latest or r["eval_date"] > latest[pid]["eval_date"]:
            latest[pid] = r
    rows = list(latest.values())

    eval_dates = set(r["eval_date"] for r in rows)
    print(f"  eval_date(s): {sorted(eval_dates)}")
    print(f"  총 제품 수: {len(rows):,}")

    # 등급 분포
    grade_cnt = defaultdict(int)
    for r in rows:
        grade_cnt[r.get("risk_grade", "?")] += 1
    print(f"\n  [등급 분포]")
    for g in ["A", "B", "C", "D", "F"]:
        print_bar(g, grade_cnt.get(g, 0), len(rows))

    # 편중 경고
    dominant = max(grade_cnt, key=grade_cnt.get)
    dominant_pct = grade_cnt[dominant] / len(rows) * 100
    if dominant_pct > 70:
        print(f"\n  ⚠ 경고: {dominant}등급에 {dominant_pct:.1f}% 편중 — 가중치/임계값 조정 검토 필요")

    # 점수 통계
    fields = ["stockout_risk", "excess_risk", "delivery_risk", "margin_risk", "total_risk"]
    print(f"\n  [점수 통계]")
    print(f"  {'항목':>15}  {'평균':>7}  {'중위':>7}  {'표준편차':>7}  {'최소':>7}  {'최대':>7}  {'>0 비율':>7}")
    print(f"  {'─'*75}")

    scores_by_field = {}
    for f in fields:
        vals = [float(r.get(f) or 0) for r in rows]
        scores_by_field[f] = vals
        avg = statistics.mean(vals) if vals else 0
        med = statistics.median(vals) if vals else 0
        std = statistics.stdev(vals) if len(vals) > 1 else 0
        nonzero_pct = sum(1 for v in vals if v > 0) / len(vals) * 100 if vals else 0
        print(f"  {f:>15}  {avg:7.1f}  {med:7.1f}  {std:7.1f}  {min(vals):7.1f}  {max(vals):7.1f}  {nonzero_pct:6.1f}%")

    # 재고일수 분석
    inv_days_vals = [float(r["inventory_days"]) for r in rows if r.get("inventory_days") is not None]
    if inv_days_vals:
        print(f"\n  [재고일수 분포]")
        buckets = [
            ("< 7일 (위험)", lambda d: d < 7),
            ("7~14일 (주의)", lambda d: 7 <= d < 14),
            ("14~30일 (양호)", lambda d: 14 <= d < 30),
            ("30~90일 (과잉주의)", lambda d: 30 <= d < 90),
            (">= 90일 (과잉)", lambda d: d >= 90),
        ]
        for label, fn in buckets:
            cnt = sum(1 for d in inv_days_vals if fn(d))
            print_bar(label, cnt, len(inv_days_vals))

    return rows


# ──────────────────────────────────────────────────
# 2. 가중치 민감도 분석
# ──────────────────────────────────────────────────
def weight_sensitivity(rows: list):
    if not rows:
        return

    print_section("2. 가중치 민감도 분석")

    scenarios = {
        "현재 가중치": RISK_WEIGHTS,
        "결품 중시 (0.50/0.15/0.20/0.15)": {"stockout": 0.50, "excess": 0.15, "delivery": 0.20, "margin": 0.15},
        "균등 가중 (0.25/0.25/0.25/0.25)": {"stockout": 0.25, "excess": 0.25, "delivery": 0.25, "margin": 0.25},
        "납기 중시 (0.25/0.15/0.45/0.15)": {"stockout": 0.25, "excess": 0.15, "delivery": 0.45, "margin": 0.15},
        "결품+과잉 (0.35/0.35/0.20/0.10)": {"stockout": 0.35, "excess": 0.35, "delivery": 0.20, "margin": 0.10},
    }

    print(f"  {'시나리오':<35}  {'A':>5}  {'B':>5}  {'C':>5}  {'D':>5}  {'F':>5}  {'평균점수':>8}  {'C이상%':>6}")
    print(f"  {'─'*85}")

    for name, w in scenarios.items():
        grade_cnt = defaultdict(int)
        total_scores = []
        for r in rows:
            s = float(r.get("stockout_risk") or 0)
            e = float(r.get("excess_risk") or 0)
            d = float(r.get("delivery_risk") or 0)
            m = float(r.get("margin_risk") or 0)
            total = s * w["stockout"] + e * w["excess"] + d * w["delivery"] + m * w["margin"]
            grade = get_risk_grade(total)
            grade_cnt[grade] += 1
            total_scores.append(total)

        avg = statistics.mean(total_scores) if total_scores else 0
        high_risk = sum(grade_cnt.get(g, 0) for g in ["C", "D", "F"])
        high_pct = high_risk / len(rows) * 100 if rows else 0

        print(f"  {name:<35}  "
              f"{grade_cnt.get('A',0):>5}  {grade_cnt.get('B',0):>5}  "
              f"{grade_cnt.get('C',0):>5}  {grade_cnt.get('D',0):>5}  "
              f"{grade_cnt.get('F',0):>5}  {avg:>8.1f}  {high_pct:>5.1f}%")


# ──────────────────────────────────────────────────
# 3. 개별 리스크 항목 상세 TOP 10
# ──────────────────────────────────────────────────
def top_risk_products(rows: list):
    if not rows:
        return

    print_section("3. 리스크 항목별 TOP 10 제품")

    # 제품명 매핑
    pm_rows = fetch_all("product_master", "product_code,product_name")
    name_map = {r["product_code"]: r["product_name"] or r["product_code"] for r in pm_rows}

    for field, label in [
        ("total_risk", "종합 리스크"),
        ("stockout_risk", "결품 리스크"),
        ("excess_risk", "과잉 리스크"),
        ("delivery_risk", "납기 리스크"),
        ("margin_risk", "마진 리스크"),
    ]:
        sorted_rows = sorted(rows, key=lambda r: float(r.get(field) or 0), reverse=True)[:10]
        print(f"\n  [{label} TOP 10]")
        print(f"  {'#':>3}  {'제품코드':>12}  {'제품명':>20}  {'점수':>6}  {'등급':>4}  {'재고일수':>8}")
        print(f"  {'─'*60}")
        for i, r in enumerate(sorted_rows, 1):
            pid = r["product_id"]
            pname = name_map.get(pid, "-")[:18]
            score = float(r.get(field) or 0)
            grade = r.get("risk_grade", "?")
            inv_d = r.get("inventory_days")
            inv_str = f"{float(inv_d):.0f}" if inv_d else "N/A"
            print(f"  {i:>3}  {pid:>12}  {pname:>20}  {score:>6.1f}  {grade:>4}  {inv_str:>8}")


# ──────────────────────────────────────────────────
# 4. 조치 큐 실효성 검토
# ──────────────────────────────────────────────────
def analyze_action_queue(risk_rows: list):
    print_section("4. 조치 큐(action_queue) 실효성 분석")

    aq_rows = fetch_all("action_queue", "*")
    if not aq_rows:
        print("  [!] action_queue 비어있음 — 먼저 S6을 실행하세요")
        return

    # 최신 eval_date 기준 필터
    latest_date = max(r["eval_date"] for r in aq_rows)
    current = [r for r in aq_rows if r["eval_date"] == latest_date]
    print(f"  최신 eval_date: {latest_date}")
    print(f"  총 조치 건수: {len(aq_rows):,}  (최신: {len(current):,})")

    # 리스크 타입별 분포
    type_cnt = defaultdict(int)
    for r in current:
        type_cnt[r["risk_type"]] += 1
    print(f"\n  [리스크 타입별 조치 건수]")
    for t in ["stockout", "excess", "delivery", "margin"]:
        print_bar(t, type_cnt.get(t, 0), len(current))

    # 심각도 분포
    sev_cnt = defaultdict(int)
    for r in current:
        sev_cnt[r["severity"]] += 1
    print(f"\n  [심각도 분포]")
    for s in ["critical", "high", "medium", "low"]:
        print_bar(s, sev_cnt.get(s, 0), len(current))

    # 조치 타입 분포
    act_cnt = defaultdict(int)
    for r in current:
        act_cnt[r["action_type"]] += 1
    print(f"\n  [조치 타입 분포]")
    for a, c in sorted(act_cnt.items(), key=lambda x: -x[1]):
        print_bar(a, c, len(current))

    # 상태 분포 (전체 이력)
    status_cnt = defaultdict(int)
    for r in aq_rows:
        status_cnt[r.get("status", "?")] += 1
    print(f"\n  [조치 상태 분포 (전체)]")
    for s in ["pending", "in_progress", "completed", "dismissed"]:
        print_bar(s, status_cnt.get(s, 0), len(aq_rows))

    # 커버리지 확인: C등급 이상인데 조치가 없는 제품 체크
    if risk_rows:
        risk_c_plus = set()
        for r in risk_rows:
            if r.get("risk_grade") in ("C", "D", "F"):
                risk_c_plus.add(r["product_id"])
        action_pids = set(r["product_id"] for r in current)
        no_action = risk_c_plus - action_pids
        has_action = risk_c_plus & action_pids
        print(f"\n  [커버리지]")
        print(f"    C등급 이상 제품: {len(risk_c_plus):,}")
        print(f"    조치 생성됨: {len(has_action):,} ({len(has_action)/len(risk_c_plus)*100:.1f}%)" if risk_c_plus else "")
        print(f"    조치 누락: {len(no_action):,}" if no_action else "    조치 누락: 0 (100% 커버)")
        if no_action and len(no_action) <= 10:
            print(f"    누락 제품: {sorted(no_action)}")

    # 1제품당 조치 수
    pid_action_cnt = defaultdict(int)
    for r in current:
        pid_action_cnt[r["product_id"]] += 1
    multi = {pid: cnt for pid, cnt in pid_action_cnt.items() if cnt > 1}
    if multi:
        print(f"\n  [복수 조치 제품] ({len(multi):,}개)")
        for pid, cnt in sorted(multi.items(), key=lambda x: -x[1])[:10]:
            print(f"    {pid}: {cnt}건")

    # 실효성 진단
    print(f"\n  [실효성 진단]")
    diagnoses = []
    if len(current) == 0:
        diagnoses.append("조치 0건 — S6 실행 여부 확인")
    if len(current) > 0 and sev_cnt.get("critical", 0) / len(current) > 0.5:
        diagnoses.append(f"critical 비율 {sev_cnt['critical']/len(current)*100:.0f}% — 임계값이 너무 낮거나 실제 위험 높음")
    if len(current) > 0 and sev_cnt.get("medium", 0) / len(current) > 0.8:
        diagnoses.append(f"medium 비율 {sev_cnt['medium']/len(current)*100:.0f}% — 대부분 경계선, 우선순위 구분 어려움")
    if risk_rows:
        total_products = len(risk_rows)
        action_ratio = len(action_pids) / total_products * 100
        if action_ratio > 60:
            diagnoses.append(f"전체 {total_products:,}개 중 {action_ratio:.0f}% 에 조치 — 너무 많아 실행력 저하 우려")
        elif action_ratio < 5:
            diagnoses.append(f"조치 대상 {action_ratio:.0f}% — 민감도 확인 필요")
    if not diagnoses:
        diagnoses.append("양호: 등급·심각도 분산, 커버리지 적절")
    for d in diagnoses:
        print(f"    - {d}")


# ──────────────────────────────────────────────────
# 5. 개선 권장 사항 종합
# ──────────────────────────────────────────────────
def recommendations(rows: list):
    if not rows:
        return

    print_section("5. 개선 권장 사항")

    grade_cnt = defaultdict(int)
    for r in rows:
        grade_cnt[r.get("risk_grade", "?")] += 1

    total = len(rows)
    a_pct = grade_cnt.get("A", 0) / total * 100
    f_pct = grade_cnt.get("F", 0) / total * 100
    cd_pct = (grade_cnt.get("C", 0) + grade_cnt.get("D", 0)) / total * 100

    # 0점 비율 체크
    zero_stockout = sum(1 for r in rows if float(r.get("stockout_risk") or 0) == 0) / total * 100
    zero_delivery = sum(1 for r in rows if float(r.get("delivery_risk") or 0) == 0) / total * 100
    zero_margin = sum(1 for r in rows if float(r.get("margin_risk") or 0) == 0) == total

    recs = []

    if a_pct > 70:
        recs.append(f"A등급 {a_pct:.0f}% 편중 — 결품/과잉 임계값을 낮추거나 가중치 재조정 검토")
    if f_pct > 20:
        recs.append(f"F등급 {f_pct:.0f}% — 과도, 임계값 상향 또는 데이터 품질 점검")
    if cd_pct < 10:
        recs.append("C+D등급 < 10% — 주의·위험 구간 거의 없음, 세분화 부족")
    if zero_stockout > 90:
        recs.append(f"결품 리스크 0점 비율 {zero_stockout:.0f}% — 재고 충분하거나 수요 데이터 부족")
    if zero_delivery > 95:
        recs.append(f"납기 리스크 0점 비율 {zero_delivery:.0f}% — 미처리 수주(status=R) 확인")
    if zero_margin:
        recs.append("마진 리스크 전체 0점 — BOM 원가 또는 매출 단가 데이터 확인")

    if not recs:
        recs.append("특이사항 없음 — 등급 분포와 데이터 품질 양호")

    for i, r in enumerate(recs, 1):
        print(f"  {i}. {r}")

    print(f"\n  현재 가중치: {RISK_WEIGHTS}")
    print(f"  현재 등급 경계: {RISK_GRADE_BOUNDS}")


# ──────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────
def main():
    print("=" * 64)
    print("  리스크 스코어링 검증 리포트")
    print("=" * 64)

    risk_rows = analyze_risk_scores()
    weight_sensitivity(risk_rows)
    top_risk_products(risk_rows)
    analyze_action_queue(risk_rows)
    recommendations(risk_rows)

    print(f"\n{'='*64}")
    print("  검증 완료")
    print(f"{'='*64}\n")


if __name__ == "__main__":
    main()
