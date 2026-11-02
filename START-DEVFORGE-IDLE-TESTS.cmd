@echo off
setlocal
call "%~dp0START-DEVFORGE-TESTS.cmd" --performance idle %*
exit /b %ERRORLEVEL%
