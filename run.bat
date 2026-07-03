@echo off
echo ===================================================
echo        Starting Pramaan IPDR Engine (Hackathon)
echo ===================================================

echo [1/2] Booting Backend API Service...
start "Pramaan Backend" cmd /k "cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo [2/2] Booting Frontend UI Service...
start "Pramaan Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Both services are starting in separate windows!
echo.
echo -> Backend API will be available at: http://localhost:8000
echo -> Frontend UI will be available at: http://localhost:5173
echo.
echo Keep the new windows open while testing the application.
echo You can close this window now.
echo ===================================================
pause
