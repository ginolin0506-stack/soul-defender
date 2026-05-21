@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Soul Defender Dev Server
echo ============================================
echo.
echo http://localhost:8080
echo Press Ctrl+C to stop.
echo.

REM Open browser 2s later so server has time to bind (avoids ERR_CONNECTION_REFUSED)
start "" /min cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:8080/"

where python >nul 2>nul
if %errorlevel% == 0 (
  python -m http.server 8080
  goto :eof
)

where py >nul 2>nul
if %errorlevel% == 0 (
  py -m http.server 8080
  goto :eof
)

where node >nul 2>nul
if %errorlevel% == 0 (
  npx --yes http-server -p 8080 -c-1
  goto :eof
)

echo Error: Python or Node not found.
echo   Python: https://www.python.org/downloads/
echo   Node  : https://nodejs.org/
pause
