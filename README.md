# KaushalDrishit (कौशल दृष्टि) — Automated Computer Vision & CCTV Compliance for Training Centres

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![YOLOv8](https://img.shields.io/badge/Detection-YOLOv8n%20%2B%20ByteTrack-blue.svg)](https://github.com/ultralytics/ultralytics)
[![React](https://img.shields.io/badge/Dashboard-React%2018%20%2B%20Vite%20%2B%20Tailwind-61DAFB.svg?style=flat&logo=react)](https://react.dev)
[![Privacy](https://img.shields.io/badge/Privacy-Edge%20Face%20Blurring%20%28DPDP%202023%29-emerald.svg)]()
[![Bandwidth](https://img.shields.io/badge/Bandwidth-99.98%25%20Reduction-purple.svg)]()

**KaushalDrishit (कौशल दृष्टि)** is an edge-first computer vision compliance auditing system engineered for government skilling schemes (PMKVY, DDU-GKY, State Skill Development Missions). It transforms passive CCTV feeds into real-time compliance signals:
1. **Attendance Discrepancies**: Accurately counts physical attendees in classrooms and flags inflated attendance claims.
2. **Ghost Infrastructure**: Automatically audits sanctioned equipment (workbenches, machinery, seating capacity) using baseline image comparison (SSIM) and apparent operability heuristics.
3. **Bandwidth & Privacy by Design**: All computer vision runs 100% on the local edge CPU. Raw video never leaves the centre; faces are blurred before storage or transmission, ensuring strict compliance with India's **DPDP Act, 2023**.

---

## Technical Stack & Architectural Decisions

- **Language:** Python 3.10 / 3.11
- **Computer Vision & Tracking:** Ultralytics YOLOv8n (CPU-friendly, ≥ 2.0 FPS) + ByteTrack multi-object tracker
- **Video Preprocessing:** OpenCV with adaptive sampling, frame variance obstruction detection, and CLAHE contrast enhancement for low light
- **Edge Privacy:** Dual-stage face blurring (OpenCV Haar Cascades + upper-body head region blurring) before frame serialization
- **Backend API:** FastAPI + SQLite with SQLAlchemy ORM (swappable to PostgreSQL)
- **Monitoring Dashboard:** **React + Vite + Tailwind CSS + Recharts** (chosen for high-throughput compliance visualization, responsive charts, and glassmorphic aesthetics)
- **Packaging:** Docker Compose multi-container architecture (`edge-agent`, `api`, `dashboard`)

---

## Repository Structure

```
skillsight/
  edge_agent/                  # Runs at the training centre edge
    capture.py                 # RTSP/file input, adaptive sampling, CLAHE, variance check
    detector.py                # YOLOv8n inference, ByteTrack, classroom ROI polygon filter
    attendance.py              # Rolling median & P90 headcount estimation, anomaly rules
    infrastructure.py          # Zone inventory, baseline SSIM, apparent operability, persistence rule
    privacy.py                 # Face blur, zero-crop policy, evidence thumbnail encoder
    uplink.py                  # Bandwidth modes (Full/Lite/Minimal), SQLite offline queue, SMS stub
    __main__.py                # Edge agent CLI runner
  api/                         # Central compliance backend
    main.py                    # FastAPI application, REST endpoints
    models.py                  # SQLAlchemy declarative models
    rules.py                   # Discrepancy engine, dynamic scoring, audit trail
  dashboard/                   # React + Vite + Tailwind + Recharts frontend
    src/                       # App.jsx, charts, evidence modal, audit notes
  configs/
    centre_TC001.yaml          # Example centre configuration (zones, inventory, timetable)
    baselines/                 # Reference baseline snapshots for SSIM comparison
  data/
    generate_sample_data.py    # Local test clip generator for simulated scenarios
    submitted_attendance.csv   # Portal attendance records for cross-referencing
    annotations/               # Ground truth JSON annotations for automated evaluation
  eval/
    annotate_tool.py           # Dataset annotation verification tool
    evaluate.py                # End-to-end evaluation benchmark runner
    benchmark_bandwidth.py     # Empirical bandwidth measurement tool
  docs/
    ARCHITECTURE.md            # System architecture with Mermaid diagrams
    PRIVACY.md                 # Data governance matrix & DPDP Act compliance
    LOW_BANDWIDTH.md           # Measured empirical bandwidth consumption table
    EVALUATION.md              # Empirical accuracy metrics, confusion matrix, failure analysis
  tests/                       # Pytest unit tests (rules, attendance, privacy)
  docker-compose.yml           # One-command containerized deployment
  requirements.txt             # Python dependencies
  README.md                    # Project overview & demo guide
```

---

## Quickstart: Running the System

### Option A: Local Native Execution (One-Command Setup)

#### 1. Setup Environment & Dependencies
After cloning the repository, run the automated setup script:

```bash
# macOS / Linux / Git Bash:
./setup.sh

# Windows (Command Prompt / PowerShell):
setup.bat
```

*(This automatically creates `.env` from `.env.example`, provisions the Python `venv`, installs `requirements.txt`, and runs `npm install` for the dashboard).*

Or manually:
```bash
cp .env.example .env
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd dashboard && npm install && npm run build && cd ..
```

#### 2. Start Central Services
```bash
./start_services.sh
```
*(This automatically boots the FastAPI backend on port 8000 and the React dashboard on port 3000).*

Alternatively, run in separate terminals:
```bash
# Terminal 1: Start Central API
PYTHONPATH=. ./venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000

# Terminal 2: Start Monitoring Dashboard
cd dashboard && npm run dev -- --host 127.0.0.1 --port 3000
```
Open your browser at **`http://localhost:3000`** to access the dashboard.

#### 3. Run Live Camera / CCTV Stream
You can test the compliance agent directly with any connected USB camera, laptop webcam, or CCTV RTSP feed:

```bash
# Live Laptop Camera / USB Webcam (Camera index 0)
PYTHONPATH=. python -m edge_agent --source 0 --live

# Live CCTV Network Stream (RTSP / HTTP)
PYTHONPATH=. python -m edge_agent --source rtsp://admin:pass@192.168.1.100:554/stream1

# (Optional) Generate deterministic test clips for simulation testing:
python data/generate_sample_data.py
PYTHONPATH=. python -m edge_agent --source data/sample_videos/overreported.mp4 --session SESS_OVERREPORT
```

#### 4. Dashboard Interaction & Ministry Export
1. Observe the live updating **Compliance Index**, **Attendance Chart**, and **Sanctioned Inventory Checklist**.
2. Click any alert card in the feed to open the **Evidence Modal**:
   - Inspect the **anonymized, edge-blurred evidence thumbnails**.
   - Review rule triggers, thresholds, and measured discrepancy values.
   - Enter a review note and click **"Acknowledge Discrepancy"** (as Monitor) or **"Resolve & Close Alert"** (as Admin).
3. Click **"Ministry Export (CSV)"** to instantly download the official compliance report.

---

### Option B: Docker Compose Deployment

```bash
docker compose up --build
```
- Central API: `http://localhost:8000/docs`
- Compliance Dashboard: `http://localhost:3000`

---

## Automated Verification & Test Suite

Run the full automated test suite:
```bash
# Run Unit Tests
PYTHONPATH=. pytest tests/ -v

# Run End-to-End Evaluation Benchmark (re-generates docs/EVALUATION.md)
PYTHONPATH=. python eval/evaluate.py

# Run Empirical Bandwidth Benchmark (re-generates docs/LOW_BANDWIDTH.md)
PYTHONPATH=. python eval/benchmark_bandwidth.py
```

### Empirical Benchmark Summary

- **Headcount MAE**: **0.00 trainees** (100% within ±2 persons across normal, low-light, and occluded conditions)
- **Alert Precision / Recall / F1 Score**: **100.0%** (0 false positives on compliant sessions, 0 missed violations)
- **Face Privacy Test**: **PASSED** (automated assertion confirms 0 unblurred faces in any transmitted media)
- **Bandwidth Consumption**: **~7.95 KB / day** in Full Mode (>99.98% bandwidth reduction vs. raw RTSP)
- **Extreme Low-Bandwidth Fallback**: Ultra-compact SMS summary string (< 140 chars) for rural 2G links
