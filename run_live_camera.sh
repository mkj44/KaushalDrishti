#!/bin/bash
# KaushalDrishit (कौशल दृष्टि) — Live Camera Stream & Edge Agent
set -e
cd "$(dirname "$0")"

# 0. Ensure .env exists from template if missing
if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
fi

# Load environment variables if available
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

CAM_SOURCE="${CAMERA_SOURCE:-0}"
API_ENDPOINT="${API_URL:-http://127.0.0.1:8000}"

# Locate Python executable
PYTHON_BIN=""
if [ -f "./venv/bin/python" ]; then
    PYTHON_BIN="./venv/bin/python"
elif [ -f "./.venv/bin/python" ]; then
    PYTHON_BIN="./.venv/bin/python"
elif [ -f "./venv/Scripts/python.exe" ]; then
    PYTHON_BIN="./venv/Scripts/python.exe"
elif command -v python3 &>/dev/null; then
    PYTHON_BIN="python3"
else
    PYTHON_BIN="python"
fi

echo "=========================================================="
echo " Starting KaushalDrishit Edge Agent with Live Camera"
echo "=========================================================="
echo " - Camera Source: $CAM_SOURCE"
echo " - Telemetry API: $API_ENDPOINT"
echo " - Dashboard    : http://localhost:3000"
echo " - Privacy      : DPDP Act 2023 Real-time Face Blurring"
echo " - Controls     : Press 'q' in the camera window to stop"
echo "=========================================================="

PYTHONPATH=. $PYTHON_BIN -m edge_agent --source "$CAM_SOURCE" --api "$API_ENDPOINT" --live
