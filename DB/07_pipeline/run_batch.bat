@echo off
REM ═══════════════════════════════════════════════════════
REM  ML 파이프라인 주간 배치 실행
REM  Windows 작업 스케줄러에 등록하여 주 1회 자동 실행
REM
REM  등록 방법:
REM    1. Win+R → taskschd.msc
REM    2. 작업 만들기 → 트리거: 매주 월요일 06:00
REM    3. 동작: 이 파일의 전체 경로 지정
REM
REM  수동 실행:
REM    run_batch.bat                  (주간 S0-S8)
REM    run_batch.bat --monthly        (주간+월간)
REM    run_batch.bat --step=0,1,2     (특정 스텝만)
REM ═══════════════════════════════════════════════════════

cd /d "%~dp0"
cd ..\..

echo [%date% %time%] ML 배치 파이프라인 시작
echo ──────────────────────────────────────

C:\Python314\python.exe DB\07_pipeline\batch_weekly.py %*

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [성공] 파이프라인 배치 정상 완료
) else (
    echo.
    echo [실패] 파이프라인 배치 중 오류 발생 — 로그 확인 필요
    echo 로그 위치: DB\07_pipeline\logs\
)

echo.
echo [%date% %time%] 배치 종료
