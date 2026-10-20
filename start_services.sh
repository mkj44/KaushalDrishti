#!/bin/bash
# KaushalDrishit (कौशल दृष्टि) — Start Central Backend API and Frontend Dashboard
set -e
cd "$(dirname "$0")"

echo "=========================================================="
echo " Starting KaushalDrishit Central Services"
echo "=========================================================="

# 1. Kill any existing instances on 8000 or 3000
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# 2. Start FastAPI Backend in background
echo "-> Starting Backend API on http://127.0.0.1:8000..."
PYTHONPATH=. ./venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload &
API_PID=$!

# Wait for backend to be ready
sleep 2

# 3. Start React Dashboard in background
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
