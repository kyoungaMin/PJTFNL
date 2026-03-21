@echo off
set TASK_NAME=ForecastAI_BatchCoordinator
set BAT_PATH=%~dp0run_coordinator.bat

echo [1/3] Deleting existing task...
schtasks /delete /tn "%TASK_NAME%" /f 2>nul

echo [2/3] Registering task (every 5 minutes)...
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c \"%BAT_PATH%\"" /sc minute /mo 5 /ru "%USERNAME%" /rl HIGHEST /f

if %ERRORLEVEL% equ 0 (
  echo.
  echo [3/3] Done!
  echo   Task name : %TASK_NAME%
  echo   Interval  : every 5 minutes
  echo   Script    : %BAT_PATH%
  echo.
  echo Check in Task Scheduler: taskschd.msc
) else (
  echo.
  echo Failed. Please run as Administrator.
)

pause
