@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul || goto missingnode
where npm >nul 2>nul || goto missingnpm
call node scripts\check-runtime.mjs
if errorlevel 1 goto failed
if not exist package-lock.json (
  echo [ERROR] package-lock.json is missing. Refusing a non-reproducible install.
  echo Re-extract the official release archive and run INSTALL.bat again.
  goto failed
)
if exist PACKAGE_MANIFEST.sha256 goto integritycheck
if exist PACKAGE_PROVENANCE.json goto integritycheck
echo [NOT_RUN] No release integrity artifacts found; continuing with a source checkout install.
goto depsinstall
:integritycheck
call node scripts\verify-package-integrity.mjs
if errorlevel 1 (
  echo [ERROR] Release integrity check failed before dependency installation.
  goto failed
)
:depsinstall
call npm.cmd ci --ignore-scripts
if errorlevel 1 goto failed
call node_modules\.bin\playwright.cmd install chromium
if errorlevel 1 goto failed
set "VQB_NO_PAUSE=1"
call VERIFY.bat
if errorlevel 1 goto failed
echo [PASS] Installation and full verification completed.
exit /b 0
:missingnode
echo [ERROR] Node.js 22.19+ is required.
goto failed
:missingnpm
echo [ERROR] npm is required.
:failed
echo [FAIL] Installation failed. Read the error above; START will not be called.
pause
exit /b 1
