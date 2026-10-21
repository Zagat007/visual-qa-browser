@echo off
setlocal
cd /d "%~dp0"
set "PID_FILE=%~dp0checkpoints\vqb-server.pid"
set "VQB_PID_FILE=%PID_FILE%"
set "VQB_ROOT=%CD%"
if not exist "%PID_FILE%" (
  echo Visual QA Browser is not running or its PID file is missing.
  exit /b 0
)
powershell -NoProfile -Command "$raw=(Get-Content -LiteralPath $env:VQB_PID_FILE -Raw -ErrorAction SilentlyContinue).Trim(); if($raw -notmatch '^\d+$'){exit 4}; $id=[int]$raw; $p=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -ErrorAction SilentlyContinue; if(-not $p){exit 2}; if($p.CommandLine -notmatch 'dist[\\/]server[\\/]index\.js'){exit 3}; $root=[IO.Path]::GetFullPath($env:VQB_ROOT).TrimEnd([char[]]'\\/').ToLowerInvariant(); $sha=[Security.Cryptography.SHA256]::Create(); try{$expected=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root))).Replace('-','').ToLowerInvariant()).Substring(0,24)}finally{$sha.Dispose()}; if($p.CommandLine -notmatch ('--vqb-instance=' + [regex]::Escape($expected))){exit 5}; $tk=Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID',[string]$id,'/T','/F') -WindowStyle Hidden -Wait -PassThru; if($tk.ExitCode -ne 0){$still=Get-Process -Id $id -ErrorAction SilentlyContinue; if($still){exit 6}}; exit 0"
set "STOP_CODE=%ERRORLEVEL%"
if "%STOP_CODE%"=="0" (
  del /q "%PID_FILE%" >nul 2>nul
  echo Visual QA Browser stopped.
  exit /b 0
)
if "%STOP_CODE%"=="2" (
  del /q "%PID_FILE%" >nul 2>nul
  echo Visual QA Browser process no longer exists. Stale PID file removed.
  exit /b 0
)
if "%STOP_CODE%"=="4" (
  del /q "%PID_FILE%" >nul 2>nul
  echo [ERROR] Invalid PID file. No process was terminated. PID file removed.
  exit /b 1
)
if "%STOP_CODE%"=="5" (
  echo [ERROR] PID exists, but process instance identity does not match this installation. No process was terminated.
  echo Run DIAGNOSE.bat to identify the process owning port 4210.
  exit /b 1
)
if "%STOP_CODE%"=="6" (
  echo [ERROR] Owned Visual QA Browser process tree could not be stopped.
  echo Run DIAGNOSE.bat and retry STOP.bat.
  exit /b 1
)
echo [ERROR] PID file does not identify the Visual QA Browser server. No process was terminated.
exit /b 1
