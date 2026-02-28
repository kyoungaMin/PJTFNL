"""
예측형 관제(Control Tower) 파이프라인 통합 실행기

실행:
  python DB/07_pipeline/run_pipeline.py              # 전체 실행
  python DB/07_pipeline/run_pipeline.py --step=1,2   # 특정 스텝만
  python DB/07_pipeline/run_pipeline.py --step=4     # 단일 스텝
"""

import sys
import os
import time

# 모듈 경로 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import s0_aggregation
import s1_daily_inventory
import s2_lead_time
import s3_feature_store
import s4_forecast
import s5_risk_score
import s6_action_queue

STEPS = {
    0: ("주별·월별 집계", s0_aggregation),
    1: ("일간 추정 재고 계산", s1_daily_inventory),
    2: ("리드타임 통계 산출", s2_lead_time),
    3: ("피처 엔지니어링", s3_feature_store),
    4: ("수요예측 모델", s4_forecast),
    5: ("리스크 스코어링", s5_risk_score),
    6: ("조치 큐 생성", s6_action_queue),
}


def main():
    # --step 옵션 파싱
    target_steps = None
    for arg in sys.argv[1:]:
        if arg.startswith("--step="):
            target_steps = [int(s) for s in arg.split("=", 1)[1].split(",")]

    if target_steps:
        run_steps = {k: v for k, v in STEPS.items() if k in target_steps}
    else:
        run_steps = STEPS

    print("=" * 60)
    print("예측형 관제 파이프라인 실행")
    print(f"실행 스텝: {list(run_steps.keys())}")
    print("=" * 60)

    total_start = time.time()
    results = {}

    for step_num, (name, module) in sorted(run_steps.items()):
        print(f"\n{'─' * 60}")
        print(f"Step {step_num}: {name}")
        print(f"{'─' * 60}")

        start = time.time()
        try:
            module.run()
            elapsed = time.time() - start
            results[step_num] = {"name": name, "status": "OK", "time": elapsed}
            print(f"  >> Step {step_num} 완료 ({elapsed:.1f}s)")
        except Exception as e:
            elapsed = time.time() - start
            results[step_num] = {"name": name, "status": f"ERROR: {e}", "time": elapsed}
            print(f"  >> Step {step_num} 실패: {e}")
            import traceback
            traceback.print_exc()

    total_time = time.time() - total_start

    # 결과 요약
    print(f"\n{'=' * 60}")
    print("파이프라인 실행 결과")
    print(f"{'=' * 60}")
    print(f"{'Step':>5} {'이름':<20} {'소요시간':>10} {'상태':<10}")
    print(f"{'─' * 55}")
    for step_num, info in sorted(results.items()):
        print(f"{step_num:>5} {info['name']:<20} {info['time']:>9.1f}s {info['status']}")
    print(f"{'─' * 55}")
    print(f"{'합계':>26} {total_time:>9.1f}s")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
