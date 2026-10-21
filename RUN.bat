@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo Visual QA Browser - verified one-click startup
rem Stop only this owned instance before rebuilding; an old backend holds old code in memory.
call STOP.bat
if errorlevel 1 goto failed
if not exist node_modules\typescript\bin\tsc goto install
set "VQB_NO_PAUSE=1"
call VERIFY.bat
if errorlevel 1 goto failed
goto start
:install
call INSTALL.bat
if errorlevel 1 exit /b 1
:start
call START.bat
exit /b %ERRORLEVEL%
:failed
echo [FAIL] Verification failed. Application was not started.
echo Send final-verification.log for diagnosis.
pause
exit /b 1
