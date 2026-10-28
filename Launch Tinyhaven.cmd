@echo off
rem Opens the city. dist\index.html is fully self-contained (no server, no internet needed).
rem With Node.js it is rebuilt first (a few seconds, so it always matches the code you have) and served locally.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto :nonode
if not exist "node_modules" (
  echo Installing once...
  call npm ci || (echo Install failed. & pause & exit /b 1)
)
echo Building the city...
call npm run build || (echo Build failed. & pause & exit /b 1)
start "Tinyhaven server" /min node scripts\serve.mjs
exit /b 0

:nonode
if exist "dist\index.html" (
  start "" "%~dp0dist\index.html"
) else (
  echo dist\index.html is missing and Node.js is not installed - install Node.js from https://nodejs.org
  pause
)
