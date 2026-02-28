"""
파이프라인 공통 설정 — Supabase 연결, 상수 정의
"""

import io
import os
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

# .env 로드 (프로젝트 루트)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: .env에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 배치 설정
BATCH_SIZE = 500
BATCH_DELAY = 0.3
MAX_RETRIES = 3

# 리스크 가중치
RISK_WEIGHTS = {
    "stockout": 0.35,
    "excess": 0.25,
    "delivery": 0.25,
    "margin": 0.15,
}

# 리스크 등급 경계
RISK_GRADE_BOUNDS = {
    "A": (0, 20),
    "B": (21, 40),
    "C": (41, 60),
    "D": (61, 80),
    "F": (81, 100),
}


def get_risk_grade(score: float) -> str:
    for grade, (lo, hi) in RISK_GRADE_BOUNDS.items():
        if lo <= score <= hi:
            return grade
    return "F"


def upsert_batch(table: str, rows: list, batch_size: int = BATCH_SIZE,
                  on_conflict: str | None = None) -> int:
    """배치 UPSERT (ON CONFLICT 활용) — 재시도 포함"""
    import time

    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        for attempt in range(MAX_RETRIES):
            try:
                q = supabase.table(table)
                if on_conflict:
                    q.upsert(batch, on_conflict=on_conflict).execute()
                else:
                    q.upsert(batch).execute()
                total += len(batch)
                break
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    time.sleep((attempt + 1) * 3)
                else:
                    raise
        time.sleep(BATCH_DELAY)
    return total
