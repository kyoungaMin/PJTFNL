"""
예측형 관제(Control Tower) 파이프라인 통합 실행기

실행:
  python DB/07_pipeline/run_pipeline.py              # 전체 실행 (주간)
  python DB/07_pipeline/run_pipeline.py --step=1,2   # 특정 스텝만
  python DB/07_pipeline/run_pipeline.py --step=4     # 단일 스텝
  python DB/07_pipeline/run_pipeline.py --step=3m,4m # 월간 피처+예측
  python DB/07_pipeline/run_pipeline.py --step=4 --tune   # 주간 예측 + Grid Search 튜닝
  python DB/07_pipeline/run_pipeline.py --step=4m --tune  # 월간 예측 + Grid Search 튜닝
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
import s3m_feature_store_monthly
import s4m_forecast_monthly

# 숫자 스텝 (주간 파이프라인)
STEPS = {
    0: ("주별·월별 집계", s0_aggregation),
    1: ("일간 추정 재고 계산", s1_daily_inventory),
    2: ("리드타임 통계 산출", s2_lead_time),
    3: ("피처 엔지니어링(주간)", s3_feature_store),
    4: ("수요예측 모델(주간)", s4_forecast),
    5: ("리스크 스코어링", s5_risk_score),
    6: ("조치 큐 생성", s6_action_queue),
}

# 문자열 스텝 (월간 파이프라인)
NAMED_STEPS = {
    "3m": ("피처 엔지니어링(월간)", s3m_feature_store_monthly),
    "4m": ("수요예측 모델(월간)", s4m_forecast_monthly),
}


TUNE_STEPS = {"4", "4m"}  # --tune 플래그가 적용되는 스텝


def main():
    # --step 옵션 파싱
    target_steps_raw = None
    tune_mode = "--tune" in sys.argv
    for arg in sys.argv[1:]:
        if arg.startswith("--step="):
            target_steps_raw = arg.split("=", 1)[1].split(",")

    # 실행할 스텝 결정
    run_list = []  # [(key, name, module), ...]

    if target_steps_raw:
        for s in target_steps_raw:
            s = s.strip()
            if s in NAMED_STEPS:
                name, module = NAMED_STEPS[s]
                run_list.append((s, name, module))
            else:
                try:
                    num = int(s)
                    if num in STEPS:
                        name, module = STEPS[num]
                        run_list.append((str(num), name, module))
                    else:
                        print(f"[!] 알 수 없는 스텝: {s}")
                except ValueError:
                    print(f"[!] 알 수 없는 스텝: {s}")
    else:
        # 기본: 숫자 스텝만 실행 (0~6)
        for num in sorted(STEPS.keys()):
            name, module = STEPS[num]
            run_list.append((str(num), name, module))

    print("=" * 60)
    print("예측형 관제 파이프라인 실행")
    print(f"실행 스텝: {[r[0] for r in run_list]}")
    if tune_mode:
        print(f"튜닝 모드: ON (Grid Search)")
    print("=" * 60)

    total_start = time.time()
    results = []

    for step_key, name, module in run_list:
        print(f"\n{'─' * 60}")
        print(f"Step {step_key}: {name}")
        print(f"{'─' * 60}")

        start = time.time()
        try:
            if step_key in TUNE_STEPS and tune_mode:
                module.run(tune=True)
            else:
                module.run()
            elapsed = time.time() - start
            results.append({"key": step_key, "name": name, "status": "OK", "time": elapsed})
            print(f"  >> Step {step_key} 완료 ({elapsed:.1f}s)")
        except Exception as e:
            elapsed = time.time() - start
            results.append({"key": step_key, "name": name, "status": f"ERROR: {e}", "time": elapsed})
            print(f"  >> Step {step_key} 실패: {e}")
            import traceback
            traceback.print_exc()

    total_time = time.time() - total_start

    # 결과 요약
    print(f"\n{'=' * 60}")
    print("파이프라인 실행 결과")
    print(f"{'=' * 60}")
    print(f"{'Step':>5} {'이름':<25} {'소요시간':>10} {'상태':<10}")
    print(f"{'─' * 60}")
    for info in results:
        print(f"{info['key']:>5} {info['name']:<25} {info['time']:>9.1f}s {info['status']}")
    print(f"{'─' * 60}")
    print(f"{'합계':>31} {total_time:>9.1f}s")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
