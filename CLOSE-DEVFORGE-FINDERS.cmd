@echo off
setlocal
node "%~dp0desktop\soak\dashboard-launch.cjs" --shutdown %*
set "panelExit=%ERRORLEVEL%"
if not "%panelExit%"=="0" if not defined DEVFORGE_TEST_NO_PAUSE pause
exit /b %panelExit%
