@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-Codex-Themed.ps1"
set "exit_code=%errorlevel%"
if "%exit_code%"=="0" goto done
echo.
pause
:done
exit /b %exit_code%
