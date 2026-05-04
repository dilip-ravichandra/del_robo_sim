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
start "DeliveryBot Backend" cmd /k "cd /d %~dp0sim && uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

:: Wait for backend to start
timeout /t 4 /nobreak >nul

:: Reset robot state so the simulation always starts clean
echo  [1b/3] Resetting robot state...
powershell -NoProfile -Command "try { Invoke-RestMethod 'http://127.0.0.1:8001/robot/reset' -Method Post | Out-Null } catch { Start-Sleep -Seconds 2; Invoke-RestMethod 'http://127.0.0.1:8001/robot/reset' -Method Post | Out-Null }"

:: Start ngrok tunnel in a new window
echo  [2/3] Starting ngrok tunnel...
start "DeliveryBot ngrok" cmd /k "ngrok http --domain=replace-detest-recycling.ngrok-free.dev 8001"

:: Start frontend server
echo  [3/3] Starting frontend server...
start "DeliveryBot Frontend" cmd /k "cd /d %~dp0 && python -m http.server 5500"

:: Wait then open simulation viewer on laptop
timeout /t 3 /nobreak >nul
start "" "http://localhost:5500/sim_viewer.html"

echo.
echo  ==========================================
echo   READY!
echo.
echo   [LAPTOP] Watch simulation here:
echo   http://localhost:5500/sim_viewer.html
echo.
echo   [PHONE]  Order deliveries here:
echo   https://dilip-ravichandra.github.io/del_robo_sim/dashboard.html
echo.
echo   (Or on same Wi-Fi, phones can use:)
echo   http://localhost:5500/dashboard.html
echo.
echo   Backend API tunnel:
echo   https://replace-detest-recycling.ngrok-free.dev
echo  ==========================================
echo.

pause
