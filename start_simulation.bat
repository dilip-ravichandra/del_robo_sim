@echo off
title DeliveryBot — Simulation Launcher
color 0A

echo.
echo  ==========================================
echo   DELIVERYBOT — Starting Simulation
echo  ==========================================
echo.

:: Start Python backend in a new window
echo  [1/3] Starting Python simulation backend...
start "DeliveryBot Backend" cmd /k "cd /d %~dp0sim && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: Wait for backend to start
timeout /t 4 /nobreak >nul

:: Start ngrok tunnel in a new window
echo  [2/3] Starting ngrok tunnel...
start "DeliveryBot ngrok" cmd /k "ngrok http --domain=replace-detest-recycling.ngrok-free.dev 8000"

:: Start frontend server
echo  [3/3] Starting frontend server...
start "DeliveryBot Frontend" cmd /k "cd /d %~dp0 && python -m http.server 5500"

:: Wait then open browser
timeout /t 3 /nobreak >nul
start "" "http://localhost:5500/dashboard.html"

echo.
echo  ==========================================
echo   READY!
echo.
echo   Laptop simulation:
echo   http://localhost:5500/dashboard.html
echo.
echo   Phone link (share with both phones):
echo   https://dilip-ravichandra.github.io/del_robo_sim/dashboard.html
echo.
echo   Backend tunnel:
echo   https://replace-detest-recycling.ngrok-free.dev
echo  ==========================================
echo.

pause
