@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Test-ThemePackage.ps1"
set "exit_code=%errorlevel%"
echo.
pause
exit /b %exit_code%

