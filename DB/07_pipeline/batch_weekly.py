"""
주간 ML 파이프라인 배치 실행기

용도:
  - Windows 작업 스케줄러에 등록하여 주 1회 자동 실행
  - DataPipelineManager에서 수동 트리거 시에도 사용 가능

실행:
  python DB/07_pipeline/batch_weekly.py              # 주간 전체 (S0→S8)
  python DB/07_pipeline/batch_weekly.py --monthly    # 월간 포함 (S0→S8 + 3m,4m,4s)
  python DB/07_pipeline/batch_weekly.py --step=0,1,2 # 특정 스텝만

결과:
  - 각 스텝 성공/실패를 Supabase pipeline_run 테이블에 기록
  - 실패 시 system_alert 테이블에 알림 자동 생성
  - 로그 파일: DB/07_pipeline/logs/batch_YYYY-MM-DD.log
"""

import sys
import os
import time
import json
from datetime import datetime, timezone

# 모듈 경로
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import supabase

# ─── 로그 디렉토리 생성 ───
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(LOG_DIR, exist_ok=True)

# ─── 로거 ───
class BatchLogger:
    def __init__(self):
        today = datetime.now().strftime("%Y-%m-%d")
        self.log_path = os.path.join(LOG_DIR, f"batch_{today}.log")
        self.f = open(self.log_path, "a", encoding="utf-8")

    def log(self, msg: str):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}"
        print(line)
        self.f.write(line + "\n")
        self.f.flush()

    def close(self):
        self.f.close()


# ─── DB 기록 함수 ───
def record_pipeline_run(pipeline_id: str, pipeline_name: str,
                        started_at: str, finished_at: str,
                        status: str, duration_sec: int, message: str):
    """pipeline_run 테이블에 실행 기록"""
    try:
        supabase.table("pipeline_run").insert({
            "pipeline_id": pipeline_id,
            "pipeline_name": pipeline_name,
            "started_at": started_at,
            "finished_at": finished_at,
            "status": status,
            "duration_sec": duration_sec,
            "message": message,
        }).execute()
    except Exception as e:
        print(f"  [!] pipeline_run 기록 실패: {e}")


def create_alert(title: str, message: str, severity: str = "high"):
    """system_alert 테이블에 알림 생성 (6시간 내 중복 방지)"""
    try:
        from datetime import timedelta
        six_hours_ago = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()

        existing = (supabase.table("system_alert")
                    .select("id")
                    .eq("title", title)
                    .eq("is_dismissed", False)
                    .gte("created_at", six_hours_ago)
                    .limit(1)
                    .execute())

        if existing.data:
            return  # 중복 스킵

        supabase.table("system_alert").insert({
            "alert_type": "pipeline",
            "severity": severity,
            "title": title,
            "message": message,
            "source": "batch_weekly",
            "target_page": "data-pipeline",
        }).execute()
    except Exception as e:
        print(f"  [!] 알림 생성 실패: {e}")


# ─── 스텝 정의 ───
def get_steps(include_monthly: bool = False, target_steps=None):
    """실행할 스텝 목록 반환"""
    import s0_aggregation
    import s1_daily_inventory
    import s2_lead_time
    import s3_feature_store
    import s4_forecast
    import s5_risk_score
    import s6_action_queue
    import s7_production_plan
    import s8_purchase_optimization

    weekly = [
        ("0", "주별·월별 집계", s0_aggregation),
        ("1", "일간 추정 재고 계산", s1_daily_inventory),
        ("2", "리드타임 통계 산출", s2_lead_time),
        ("3", "피처 엔지니어링(주간)", s3_feature_store),
        ("4", "수요예측 모델(주간)", s4_forecast),
        ("5", "리스크 스코어링", s5_risk_score),
        ("6", "조치 큐 생성", s6_action_queue),
        ("7", "생산 최적화", s7_production_plan),
        ("8", "발주 최적화", s8_purchase_optimization),
    ]

    monthly = []
    if include_monthly:
        import s3m_feature_store_monthly
        import s4m_forecast_monthly
        import s4s_segment_selector
        monthly = [
            ("3m", "피처 엔지니어링(월간)", s3m_feature_store_monthly),
            ("4m", "수요예측 모델(월간)", s4m_forecast_monthly),
            ("4s", "구간별 모델 선택", s4s_segment_selector),
        ]

    all_steps = weekly + monthly

    if target_steps:
        filtered = [s for s in all_steps if s[0] in target_steps]
        return filtered

    return all_steps


# ─── 메인 실행 ───
def main():
    # 옵션 파싱
    include_monthly = "--monthly" in sys.argv
    target_steps = None
    for arg in sys.argv[1:]:
        if arg.startswith("--step="):
            target_steps = [s.strip() for s in arg.split("=", 1)[1].split(",")]

    steps = get_steps(include_monthly, target_steps)
    if not steps:
        print("실행할 스텝이 없습니다.")
        return

    logger = BatchLogger()
    mode = "주간+월간" if include_monthly else "주간"
    logger.log(f"{'=' * 60}")
    logger.log(f"ML 파이프라인 배치 실행 ({mode})")
    logger.log(f"스텝: {[s[0] for s in steps]}")
    logger.log(f"{'=' * 60}")

    batch_start = datetime.now(timezone.utc)
    batch_started_at = batch_start.isoformat()
    results = []
    failed_steps = []

    for step_key, step_name, module in steps:
        logger.log(f"\n{'─' * 50}")
        logger.log(f"Step {step_key}: {step_name}")
        logger.log(f"{'─' * 50}")

        started_at = datetime.now(timezone.utc).isoformat()
        start_time = time.time()

        try:
            module.run()
            elapsed = time.time() - start_time
            finished_at = datetime.now(timezone.utc).isoformat()
            duration_sec = int(elapsed)

            results.append({"key": step_key, "name": step_name, "status": "OK", "time": elapsed})
            logger.log(f"  >> Step {step_key} 완료 ({elapsed:.1f}s)")

            # DB 기록
            record_pipeline_run(
                pipeline_id=f"ml-s{step_key}",
                pipeline_name=f"S{step_key} {step_name}",
                started_at=started_at,
                finished_at=finished_at,
                status="success",
                duration_sec=duration_sec,
                message=f"배치 실행 완료 ({elapsed:.1f}s)",
            )

        except Exception as e:
            elapsed = time.time() - start_time
            finished_at = datetime.now(timezone.utc).isoformat()
            duration_sec = int(elapsed)
            error_msg = str(e)

            results.append({"key": step_key, "name": step_name, "status": f"ERROR: {error_msg}", "time": elapsed})
            failed_steps.append(step_name)
            logger.log(f"  >> Step {step_key} 실패: {error_msg}")

            import traceback
            traceback.print_exc()

            # DB 기록
            record_pipeline_run(
                pipeline_id=f"ml-s{step_key}",
                pipeline_name=f"S{step_key} {step_name}",
                started_at=started_at,
                finished_at=finished_at,
                status="failed",
                duration_sec=duration_sec,
                message=error_msg[:200],
            )

    # ─── 종합 결과 ───
    total_time = time.time() - batch_start.timestamp()
    batch_finished_at = datetime.now(timezone.utc).isoformat()

    logger.log(f"\n{'=' * 60}")
    logger.log(f"배치 실행 결과")
    logger.log(f"{'=' * 60}")
    logger.log(f"{'Step':>5} {'이름':<28} {'소요':>8} {'상태'}")
    logger.log(f"{'─' * 60}")
    for r in results:
        logger.log(f"{r['key']:>5} {r['name']:<28} {r['time']:>7.1f}s {r['status']}")
    logger.log(f"{'─' * 60}")
    ok_count = sum(1 for r in results if r["status"] == "OK")
    fail_count = len(results) - ok_count
    logger.log(f"합계: {ok_count}성공 / {fail_count}실패 / {total_time:.1f}s")
    logger.log(f"{'=' * 60}")

    # 전체 배치 결과를 pipeline_run에 기록
    overall_status = "success" if fail_count == 0 else "failed"
    overall_msg = f"{ok_count}/{len(results)} 스텝 성공 ({total_time:.0f}s)"
    if failed_steps:
        overall_msg += f" | 실패: {', '.join(failed_steps[:3])}"

    record_pipeline_run(
        pipeline_id="ml-batch-weekly",
        pipeline_name=f"ML 배치 ({mode})",
        started_at=batch_started_at,
        finished_at=batch_finished_at,
        status=overall_status,
        duration_sec=int(total_time),
        message=overall_msg,
    )

    # 실패 시 모니터링 알림
    if failed_steps:
        create_alert(
            title=f"ML 배치 실패: {fail_count}개 스텝",
            message=f"실패 스텝: {', '.join(failed_steps)} ({mode})",
            severity="critical" if fail_count >= 3 else "high",
        )
        logger.log(f"\n[!] 모니터링 알림 생성 완료")

    logger.log(f"\n로그 저장: {logger.log_path}")
    logger.close()

    # 실패 시 exit code 1
    sys.exit(1 if fail_count > 0 else 0)


if __name__ == "__main__":
    main()
