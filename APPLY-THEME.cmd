@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-Theme.ps1"
set "exit_code=%errorlevel%"
if not "%exit_code%"=="2" goto done
echo.
echo Theme endpoint unavailable. Opening the safe recovery launcher...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-Codex-Themed.ps1" -AutoRecover
set "exit_code=%errorlevel%"
:done
if "%exit_code%"=="0" goto exit_now
echo.
pause
:exit_now
exit /b %exit_code%
