@echo off
setlocal
cd /d "%~dp0"
set "VQB_ROOT=%CD%"
echo Visual QA Browser diagnostics
echo Root: %VQB_ROOT%
echo.
powershell -NoProfile -Command "$root=[IO.Path]::GetFullPath($env:VQB_ROOT).TrimEnd([char[]]'\\/').ToLowerInvariant(); $sha=[Security.Cryptography.SHA256]::Create(); try{$expected=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($root))).Replace('-','').ToLowerInvariant()).Substring(0,24)}finally{$sha.Dispose()}; Write-Host ('Expected instanceId: ' + $expected); Write-Host ''; try{$h=Invoke-RestMethod -Uri 'http://127.0.0.1:4210/api/health' -TimeoutSec 2; Write-Host 'HEALTH:'; $h | ConvertTo-Json -Depth 6; Write-Host ('Instance match: ' + ([string]$h.instanceId -eq $expected))}catch{Write-Host ('HEALTH ERROR: ' + $_.Exception.Message)}; Write-Host ''; try{$j=Invoke-RestMethod -Uri 'http://127.0.0.1:4210/api/diagnostics/jobs' -TimeoutSec 2; Write-Host 'JOBS:'; $j | ConvertTo-Json -Depth 8}catch{Write-Host ('JOBS ERROR: ' + $_.Exception.Message)}; Write-Host ''; Write-Host 'PORT 4210:'; try{Get-NetTCPConnection -LocalPort 4210 -State Listen -ErrorAction Stop | Select-Object LocalAddress,LocalPort,OwningProcess | Format-List}catch{Write-Host 'No listener.'}; Write-Host ''; Write-Host 'NODE PROCESSES:'; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | Format-List"
echo.
echo Logs:
if exist "start.log" echo   %CD%\start.log
if exist "server-output.log" echo   %CD%\server-output.log
if exist "server-error.log" echo   %CD%\server-error.log
endlocal
