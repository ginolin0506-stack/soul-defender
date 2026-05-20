@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   靈魂防線 Soul Defender — Dev Server
echo ============================================
echo.
echo 啟動本地伺服器在 http://localhost:8080
echo 按 Ctrl+C 結束伺服器
echo.

where python >nul 2>nul
if %errorlevel% == 0 (
  start "" http://localhost:8080/
  python -m http.server 8080
  goto :eof
)

where py >nul 2>nul
if %errorlevel% == 0 (
  start "" http://localhost:8080/
  py -m http.server 8080
  goto :eof
)

where node >nul 2>nul
if %errorlevel% == 0 (
  start "" http://localhost:8080/
  npx --yes http-server -p 8080 -c-1
  goto :eof
)

echo [錯誤] 找不到 Python 或 Node。
echo.
echo 請安裝以下任一：
echo   Python: https://www.python.org/downloads/
echo   Node  : https://nodejs.org/
echo.
pause
