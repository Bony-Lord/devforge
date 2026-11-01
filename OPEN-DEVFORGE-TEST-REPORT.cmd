@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -NonInteractive -Command "$report=Get-Content -LiteralPath (Join-Path $env:USERPROFILE 'DevForgeTests\latest.json') -Raw | ConvertFrom-Json; Start-Process -FilePath $report.report"
if errorlevel 1 pause
