@echo off
setlocal
chcp 65001 >nul
node "%~dp0desktop\soak\run.cjs" --stop %*
set "testExit=%ERRORLEVEL%"
if not defined DEVFORGE_TEST_NO_PAUSE pause
exit /b %testExit%
