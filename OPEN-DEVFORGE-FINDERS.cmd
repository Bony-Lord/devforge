@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
node --version >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  popd
  if not defined DEVFORGE_TEST_NO_PAUSE pause
  exit /b 1
)
node "%~dp0desktop\soak\dashboard-launch.cjs" %*
set "panelExit=%ERRORLEVEL%"
popd
if not "%panelExit%"=="0" if not defined DEVFORGE_TEST_NO_PAUSE pause
exit /b %panelExit%
