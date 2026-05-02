@echo off
title DeliveryBot — Simulation Launcher
color 0A

echo.
echo  ==========================================
echo   DELIVERYBOT — Starting Simulation
echo  ==========================================
echo.

:: Start Python backend in a new window
echo  [1/2] Starting Python simulation backend...
start "DeliveryBot Backend" cmd /k "cd /d %~dp0sim && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

:: Wait for backend to start
timeout /t 4 /nobreak >nul

:: Start ngrok tunnel in a new window
echo  [2/2] Starting ngrok tunnel...
start "DeliveryBot ngrok" cmd /k "ngrok http --domain=replace-detest-recycling.ngrok-free.dev 8000"

echo.
echo  ==========================================
echo   READY!
echo.
echo   Laptop dashboard:
echo   http://localhost:5500/dashboard.html
echo.
echo   Phone link (share this):
echo   https://dilip-ravichandra.github.io/del_robo_sim/dashboard.html
echo.
echo   Backend tunnel:
echo   https://replace-detest-recycling.ngrok-free.dev
echo  ==========================================
echo.

:: Launch pygame simulation viewer
echo  [3/3] Starting pygame simulation viewer...
start "DeliveryBot Viewer" cmd /k "cd /d %~dp0 && python sim_pygame.py"

pause
