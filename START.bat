@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (
  echo [ERROR] Node.js 22.19+ is required.
  pause
  exit /b 1
)
node scripts\check-runtime.mjs
if errorlevel 1 (
  pause
  exit /b 1
)

rem START.bat is also a supported first-run entry point. If the release has not
rem been installed/built yet, delegate to the verified one-click pipeline once.
if not exist "dist\server\index.js" (
  if defined VQB_START_BOOTSTRAP (
    echo [ERROR] Automatic preparation finished without creating dist\server\index.js.
    echo Run DIAGNOSE.bat and send final-verification.log.
    pause
    exit /b 1
  )
  echo [INFO] First launch detected: dependencies/build are not ready.
  echo [INFO] Running the verified installation/build pipeline automatically...
  set "VQB_START_BOOTSTRAP=1"
  call RUN.bat
  exit /b %ERRORLEVEL%
)

set "PID_FILE=%~dp0checkpoints\vqb-server.pid"
set "VQB_PID_FILE=%PID_FILE%"
set "VQB_ROOT=%CD%"
set "START_LOG=%~dp0start.log"
set "SERVER_OUT=%~dp0server-output.log"
set "SERVER_ERR=%~dp0server-error.log"

if not exist "checkpoints" mkdir "checkpoints" >nul 2>nul
> "%START_LOG%" echo Visual QA Browser start
>> "%START_LOG%" echo Started: %date% %time%
>> "%START_LOG%" echo Root: %VQB_ROOT%

if not exist "dist\server\index.js" (
  echo [ERROR] Application build is still missing after automatic preparation.
  >> "%START_LOG%" echo [ERROR] dist\server\index.js is missing after automatic preparation.
  echo Log: "%START_LOG%"
  pause
  exit /b 1
)

if exist "%PID_FILE%" (
  powershell -NoProfile -Command "$raw=(Get-Content -LiteralPath $env:VQB_PID_FILE -Raw -ErrorAction SilentlyContinue).Trim(); if($raw -notmatch '^\d+$'){exit 2}; $id=[int]$raw; $p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction SilentlyContinue; if(-not $p -or $p.CommandLine -notmatch 'dist[\\/]server[\\/]index\.js'){exit 1}; $root=[IO.Path]::GetFullPath($env:VQB_ROOT).TrimEnd([char[]]'\\/').ToLowerInvariant(); $sha=[Security.Cryptography.SHA256]::Create(); try{$expected=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root))).Replace('-','').ToLowerInvariant()).Substring(0,24)}finally{$sha.Dispose()}; if($p.CommandLine -notmatch ('--vqb-instance=' + [regex]::Escape($expected))){exit 3}; try{$h=Invoke-RestMethod -Uri 'http://127.0.0.1:4210/api/health' -TimeoutSec 1;if($h.ok -eq $true -and [int]$h.pid -eq $id -and [string]$h.instanceId -eq $expected){exit 0}}catch{}; exit 6"
  if not errorlevel 1 (
    >> "%START_LOG%" echo [PASS] Existing owned server process matched PID and instance identity.
    echo Visual QA Browser is already running.
    start "" "http://127.0.0.1:4210"
    exit /b 0
  )
  if errorlevel 6 (
    echo [WARN] Owned Visual QA Browser process is unhealthy. Restarting it safely...
    >> "%START_LOG%" echo [WARN] Owned process exists but health check failed. STOP.bat will terminate only the matching instance.
    call STOP.bat >nul 2>nul
    if errorlevel 1 (
      echo [ERROR] Could not stop the unhealthy owned process. Run DIAGNOSE.bat.
      >> "%START_LOG%" echo [ERROR] Safe restart failed because STOP.bat could not terminate the owned process.
      pause
      exit /b 1
    )
  ) else (
    del /q "%PID_FILE%" >nul 2>nul
  )
)

powershell -NoProfile -Command "try{$c=Get-NetTCPConnection -LocalPort 4210 -State Listen -ErrorAction Stop | Select-Object -First 1; if($c){Write-Output $c.OwningProcess; exit 2}}catch{}; exit 0" > "%TEMP%\vqb-port-owner.txt"
if errorlevel 2 (
  for /f "usebackq delims=" %%P in ("%TEMP%\vqb-port-owner.txt") do (
    echo [ERROR] Port 4210 is already used by PID %%P.
    >> "%START_LOG%" echo [ERROR] Port 4210 already occupied by PID %%P.
  )
  echo Stop the other Visual QA Browser instance first or run DIAGNOSE.bat.
  del /q "%TEMP%\vqb-port-owner.txt" >nul 2>nul
  pause
  exit /b 1
)
del /q "%TEMP%\vqb-port-owner.txt" >nul 2>nul

powershell -NoProfile -Command "$root=[IO.Path]::GetFullPath($env:VQB_ROOT).TrimEnd([char[]]'\/').ToLowerInvariant(); $sha=[Security.Cryptography.SHA256]::Create(); try{$expected=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root))).Replace('-','').ToLowerInvariant()).Substring(0,24)}finally{$sha.Dispose()}; $p=Start-Process -FilePath 'node' -ArgumentList @('dist/server/index.js',('--vqb-instance=' + $expected)) -WorkingDirectory $env:VQB_ROOT -WindowStyle Hidden -RedirectStandardOutput $env:SERVER_OUT -RedirectStandardError $env:SERVER_ERR -PassThru; Set-Content -LiteralPath $env:VQB_PID_FILE -Value $p.Id -NoNewline"
if errorlevel 1 (
  echo [ERROR] Failed to start Visual QA Browser.
  >> "%START_LOG%" echo [ERROR] Start-Process failed.
  echo Log: "%START_LOG%"
  pause
  exit /b 1
)

powershell -NoProfile -Command "$raw=(Get-Content -LiteralPath $env:VQB_PID_FILE -Raw -ErrorAction SilentlyContinue).Trim(); if($raw -notmatch '^\d+$'){exit 2}; $id=[int]$raw; $root=[IO.Path]::GetFullPath($env:VQB_ROOT).TrimEnd([char[]]'\\/').ToLowerInvariant(); $sha=[Security.Cryptography.SHA256]::Create(); try{$expected=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root))).Replace('-','').ToLowerInvariant()).Substring(0,24)}finally{$sha.Dispose()}; $ok=$false; 1..30 | ForEach-Object { $p=Get-Process -Id $id -ErrorAction SilentlyContinue; if(-not $p){break}; try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:4210/api/health' -TimeoutSec 1; if($r.ok -eq $true -and [int]$r.pid -eq $id -and [string]$r.instanceId -eq $expected){$ok=$true; break} } catch {}; Start-Sleep -Milliseconds 500 }; if($ok){exit 0}else{exit 1}"
if errorlevel 1 (
  echo [ERROR] Server did not pass the PID + instance-bound health check.
  >> "%START_LOG%" echo [ERROR] PID + instance-bound health check failed.
  if exist "%SERVER_ERR%" (
    echo.
    echo --- server-error.log ---
    type "%SERVER_ERR%"
  )
  echo.
  echo Logs:
  echo   "%START_LOG%"
  echo   "%SERVER_OUT%"
  echo   "%SERVER_ERR%"
  call STOP.bat >nul 2>nul
  pause
  exit /b 1
)

>> "%START_LOG%" echo [PASS] PID + instance-bound health check succeeded.
echo [PASS] Visual QA Browser started.
echo Opening http://127.0.0.1:4210
start "" "http://127.0.0.1:4210"
endlocal
