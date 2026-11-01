@echo off
chcp 65001 >nul
cd /d "%~dp0"
node desktop\soak\run.cjs --stop %*
pause
