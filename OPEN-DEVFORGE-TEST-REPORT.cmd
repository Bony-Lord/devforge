@echo off
setlocal
powershell.exe -NoProfile -NonInteractive -Command "$report=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'DevForgeTests\latest.json') -Raw | ConvertFrom-Json; Start-Process -FilePath $report.report"
set "testExit=%ERRORLEVEL%"
if not "%testExit%"=="0" if not defined DEVFORGE_TEST_NO_PAUSE pause
exit /b %testExit%
