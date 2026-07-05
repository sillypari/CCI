@echo off
cd /d "%~dp0..\frontend"
set "VITE_API_URL=http://127.0.0.1:8000/api"
.\node_modules\.bin\vite.cmd --host 127.0.0.1 --port 5173 --strictPort