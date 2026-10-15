@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.x is required. Install it, then reopen this launcher.
  pause
  popd
  exit /b 1
)
node "scripts\launch.mjs"
set "result=%errorlevel%"
if not "%result%"=="0" pause
popd
exit /b %result%
