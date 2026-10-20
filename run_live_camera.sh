#!/bin/bash
# KaushalDrishit (कौशल दृष्टि) — Live Camera Stream & Edge Agent
set -e
cd "$(dirname "$0")"

echo "=========================================================="
echo " Starting KaushalDrishit Edge Agent with Live Camera"
echo "=========================================================="
echo " - Camera Index : 0 (Laptop Webcam)"
echo " - Telemetry API: http://127.0.0.1:8000"
echo " - Dashboard    : http://localhost:3000"
echo " - Privacy      : DPDP Act 2023 Real-time Face Blurring"
echo " - Controls     : Press 'q' in the camera window to stop"
echo "=========================================================="

PYTHONPATH=. ./venv/bin/python -m edge_agent --source 0 --live
