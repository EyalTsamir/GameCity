@echo off
rem Opens the finished city. dist\index.html is fully self-contained (no server, no internet needed).
rem If Node.js is installed it is served locally instead (slightly more robust across browsers).
cd /d "%~dp0"
if not exist "dist\index.html" (
  echo dist\index.html is missing. Building it now...
  call npm run build || (echo Build failed. & pause & exit /b 1)
)
where node >nul 2>nul
if %errorlevel%==0 (
  start "Tinyhaven server" /min node scripts\serve.mjs
) else (
  start "" "%~dp0dist\index.html"
)
