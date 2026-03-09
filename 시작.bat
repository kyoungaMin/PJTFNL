@echo off
title Project Clockwise - Dev Server
echo.
echo  ================================
echo   Project Clockwise 개발 서버
echo  ================================
echo.

cd /d "%~dp0forecastai"

:: Node.js 확인
where node >nul 2>&1
if errorlevel 1 (
  echo [오류] Node.js가 설치되어 있지 않습니다.
  pause
  exit /b
)

:: 의존성 설치 여부 확인
if not exist "node_modules" (
  echo  node_modules 없음 - 패키지 설치 중...
  npm install
)

echo  서버 시작 중...
echo  브라우저: http://localhost:3000
echo  종료: Ctrl+C
echo.

:: 브라우저 자동 열기 (2초 후)
start /b cmd /c "timeout /t 2 >nul && start http://localhost:3000"

npm run dev
