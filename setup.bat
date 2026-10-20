@echo off
REM ==============================================================================
REM KaushalDrishit (कौशल दृष्टि) — Windows Environment Setup Script
REM ==============================================================================
echo ==========================================================
echo  Setting up KaushalDrishit Compliance System (Windows)
echo ==========================================================

REM 1. Initialize .env
if not exist .env (
    echo -> Creating .env configuration from .env.example...
    copy .env.example .env
) else (
    echo -> .env already exists.
)

REM 2. Create Python virtual environment
if not exist venv (
    echo -> Creating virtual environment in .\venv...
    python -m venv venv
) else (
    echo -> .\venv already exists.
)

REM 3. Install Python dependencies
echo -> Upgrading pip and installing requirements...
venv\Scripts\python.exe -m pip install --upgrade pip
venv\Scripts\pip.exe install -r requirements.txt

REM 4. Install dashboard dependencies
echo -> Installing dashboard dependencies...
cd dashboard
call npm install
cd ..

echo ==========================================================
echo  [OK] Setup complete!
echo ==========================================================
echo To start backend API:
echo   venv\Scripts\uvicorn.exe api.main:app --host 127.0.0.1 --port 8000 --reload
echo To start dashboard:
echo   cd dashboard ^&^& npm run dev -- --host 127.0.0.1 --port 3000
echo To run live camera:
echo   venv\Scripts\python.exe -m edge_agent --source 0 --live
pause
