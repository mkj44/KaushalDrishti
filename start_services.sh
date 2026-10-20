#!/bin/bash
# KaushalDrishit (कौशल दृष्टि) — Start Central Backend API and Frontend Dashboard
set -e
cd "$(dirname "$0")"

echo "=========================================================="
echo " Starting KaushalDrishit Central Services"
echo "=========================================================="

# 0. Ensure .env exists from template if missing
if [ ! -f .env ] && [ -f .env.example ]; then
    echo "-> Initializing .env from .env.example..."
    cp .env.example .env
fi

# 1. Kill any existing instances on 8000 or 3000
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# 2. Check / Locate Python Environment
UVICORN_BIN=""
if [ -f "./venv/bin/uvicorn" ]; then
    UVICORN_BIN="./venv/bin/uvicorn"
elif [ -f "./.venv/bin/uvicorn" ]; then
    UVICORN_BIN="./.venv/bin/uvicorn"
elif [ -f "./venv/Scripts/uvicorn.exe" ]; then
    UVICORN_BIN="./venv/Scripts/uvicorn.exe"
elif command -v uvicorn &>/dev/null; then
    UVICORN_BIN="uvicorn"
else
    echo "⚠️  Python environment not initialized in ./venv!"
    echo "-> Automatically bootstrapping virtual environment..."
    python3 -m venv venv || python -m venv venv
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r requirements.txt
    UVICORN_BIN="./venv/bin/uvicorn"
fi

# 3. Check Dashboard node_modules
if [ ! -d "dashboard/node_modules" ]; then
    echo "-> Installing dashboard frontend dependencies (npm install)..."
    (cd dashboard && npm install)
fi

# 4. Start FastAPI Backend in background
echo "-> Starting Backend API on http://127.0.0.1:8000..."
PYTHONPATH=. $UVICORN_BIN api.main:app --host 127.0.0.1 --port 8000 --reload &
API_PID=$!

# Wait for backend to be ready
sleep 2

# 5. Start React Dashboard in background
echo "-> Starting React Dashboard on http://localhost:3000..."
cd dashboard
npm run dev -- --host 127.0.0.1 --port 3000 &
DASH_PID=$!
cd ..

echo ""
echo "KaushalDrishit services are running!"
echo " - Dashboard : http://localhost:3000"
echo " - API Docs  : http://localhost:8000/docs"
echo " - Health    : http://127.0.0.1:8000/api/v1/health"
echo ""
echo "To run the camera edge agent, execute:"
echo " ./run_live_camera.sh"
echo "=========================================================="

wait
