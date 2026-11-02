@echo off
setlocal
node "%~dp0desktop\soak\vsx.cjs" --stop %*
set "testExit=%ERRORLEVEL%"
if not defined DEVFORGE_TEST_NO_PAUSE pause
exit /b %testExit%
