@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22 or newer is required to run this app.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  call npm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "" /b powershell.exe -NoProfile -Command "$url = 'http://localhost:3000'; for ($i = 0; $i -lt 30; $i++) { try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $url; exit } catch { Start-Sleep -Seconds 1 } }"
call npm.cmd start
