@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-Theme.ps1"
set "exit_code=%errorlevel%"
if "%exit_code%"=="0" goto done
echo.
if not "%exit_code%"=="2" goto pause_now
echo Theme endpoint unavailable. No Codex process was closed or restarted.
echo Finish active work, fully exit Codex, then run LAUNCH-CODEX-THEMED.cmd.
:pause_now
echo.
pause
:done
exit /b %exit_code%
