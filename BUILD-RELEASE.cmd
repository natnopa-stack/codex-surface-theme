@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Build-Release.ps1"
set "exit_code=%errorlevel%"
echo.
pause
exit /b %exit_code%
