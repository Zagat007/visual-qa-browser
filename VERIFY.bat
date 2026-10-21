@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
> final-verification.log echo Visual QA Browser verification preflight started.
call :log [INFO] Verification folder: %CD%
where node >nul 2>nul || goto missingnode
where npm >nul 2>nul || goto missingnpm
for /f "delims=" %%V in ('node -v 2^>nul') do call :log [INFO] Node %%V
call node scripts\check-runtime.mjs >> final-verification.log 2>&1
if errorlevel 1 (
  type final-verification.log
  goto failed
)
if not exist package-lock.json (
  call :log [ERROR] package-lock.json is missing. Run INSTALL.bat first.
  goto failed
)
if not exist node_modules\typescript\bin\tsc (
  call :log [ERROR] Dependencies are missing. Run INSTALL.bat first.
  goto failed
)
rem npm run verify executes immutable package-integrity checks, selftest and runtime smoke with live output.
call npm.cmd run verify
set "VERIFY_CODE=%ERRORLEVEL%"
if not defined VQB_NO_PAUSE pause
exit /b %VERIFY_CODE%

:missingnode
call :log [ERROR] Node.js 22.19+ is required.
goto failed
:missingnpm
call :log [ERROR] npm is required.
goto failed
:failed
call :log [FAIL] Verification preflight failed. See final-verification.log.
if not defined VQB_NO_PAUSE pause
exit /b 1

:log
echo %*
>> final-verification.log echo %*
exit /b 0
