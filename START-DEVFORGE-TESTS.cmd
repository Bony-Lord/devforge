@echo off
chcp 65001 >nul
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Требуется Node.js 22 или новее.
  pause
  exit /b 1
)
echo DevForge: тестирование до 8 часов. Остановка: STOP-DEVFORGE-TESTS.cmd или Ctrl+C.
node desktop\soak\run.cjs %*
echo.
echo Отчёты: %%USERPROFILE%%\DevForgeTests
pause
