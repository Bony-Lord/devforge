@echo off
setlocal
chcp 65001 >nul
pushd "%~dp0"
if errorlevel 1 exit /b 1
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  popd
  if not defined DEVFORGE_TEST_NO_PAUSE pause
  exit /b 1
)
echo DevForge tests: up to 8 hours. Stop: STOP-DEVFORGE-TESTS.cmd or Ctrl+C.
node "%~dp0desktop\soak\run.cjs" %*
set "testExit=%ERRORLEVEL%"
echo.
echo Reports: "%USERPROFILE%\DevForgeTests"
popd
if not defined DEVFORGE_TEST_NO_PAUSE pause
exit /b %testExit%
