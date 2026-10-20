#!/bin/bash
# ==============================================================================
# KaushalDrishti (कौशल दृष्टि) — One-Click Environment Setup Script
# ==============================================================================
set -e
cd "$(dirname "$0")"

echo "=========================================================="
echo " Setting up KaushalDrishti Compliance System"
echo "=========================================================="

# 1. Initialize .env file
if [ ! -f .env ]; then
    echo "-> Creating .env configuration from .env.example..."
    cp .env.example .env
else
    echo "-> .env already exists. Skipping copy."
fi

# 2. Check Python installation
echo "-> Checking Python installation..."
if command -v python3 &>/dev/null; then
    PYTHON_CMD="python3"
elif command -v python &>/dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ Error: Python 3 is not installed or not in your PATH."
    exit 1
fi

$PYTHON_CMD -c "import sys; print(f'Detected Python {sys.version}')"

# 3. Create Virtual Environment
if [ ! -d "venv" ]; then
    echo "-> Creating virtual environment in ./venv..."
    $PYTHON_CMD -m venv venv
else
    echo "-> ./venv directory already exists."
fi

# Detect venv python/pip binaries
if [ -f "./venv/bin/pip" ]; then
    VENV_PIP="./venv/bin/pip"
    VENV_PY="./venv/bin/python"
elif [ -f "./venv/Scripts/pip.exe" ]; then
    VENV_PIP="./venv/Scripts/pip.exe"
    VENV_PY="./venv/Scripts/python.exe"
else
    echo "❌ Error: Could not find pip inside ./venv."
    exit 1
fi

# 4. Install Python Dependencies
echo "-> Upgrading pip & installing Python requirements..."
$VENV_PIP install --upgrade pip
$VENV_PIP install -r requirements.txt

# 5. Check Node & Install Frontend Dependencies
echo "-> Checking Node.js & npm..."
if command -v npm &>/dev/null; then
    echo "-> Installing React dashboard dependencies (npm install)..."
    cd dashboard
    npm install
    cd ..
else
    echo "⚠️  Warning: npm is not installed. Please install Node.js 18+ to run the React dashboard."
fi

echo ""
echo "=========================================================="
echo " ✅ KaushalDrishti Setup Completed Successfully!"
echo "=========================================================="
echo "To start services:"
echo "  ./start_services.sh"
echo ""
echo "To run live webcam monitoring:"
echo "  ./run_live_camera.sh"
echo "=========================================================="
