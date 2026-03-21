@echo off
:: ============================================================
:: 배치 코디네이터 실행 스크립트
:: Windows Task Scheduler가 5분마다 이 파일을 실행
:: ============================================================

:: 로그 폴더 생성
if not exist "%~dp0..\logs" mkdir "%~dp0..\logs"

:: 환경변수 로드
call "%~dp0env_secrets.bat"

:: coordinator 실행 (로그 파일에 기록)
node "%~dp0coordinator.mjs" >> "%~dp0..\logs\coordinator.log" 2>&1
