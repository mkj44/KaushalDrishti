# SkillSight — Live Demonstration & Presentation Playbook

A step-by-step guide for presenting **SkillSight** to professors, evaluators, and scheme inspection officials.

---

## 1. Pre-Demo Setup Checklist (2 Minutes Before Demo)

### A. Verify Local Services are Running
Ensure both the FastAPI backend and React dashboard are active:
- **Compliance Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Central API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

*(If you ever need to restart them:)*
```bash
# Terminal 1: Backend API
PYTHONPATH=. ./venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000

# Terminal 2: React Dashboard
cd dashboard && npm run dev -- --host 127.0.0.1 --port 3000
```

### B. Screen Arrangement
- **Screen 1 (Browser):** Open `http://localhost:3000` full-screen.
- **Screen 2 (Terminal):** Have a clean terminal window side-by-side or ready to trigger demo commands.

---

## 2. The 5-Minute Presentation Script & Flow

### [0:00 – 1:00] The Problem Statement & Context
> *"Good morning, Professor. In government skilling schemes (such as PMKVY, DDU-GKY, and state missions), funding is tied to trainee attendance and sanctioned infrastructure.*
> 
> *Two severe integrity issues constantly occur:*
> 1. *Attendance Inflation: Centres claim 25–30 trainees attended to receive government stipends, when in reality only 4–5 showed up.*
> 2. *Ghost Infrastructure: Expensive CNC machines or workbenches are removed or kept permanently turned off between physical inspections.*
> 
> *Raw CCTV video streaming fails because rural centres lack high-speed internet, manual review is impossible across thousands of centres, and transmitting unblurred footage violates India's **DPDP Act, 2023**.*
> 
> *We built **SkillSight**: an edge AI pipeline running on a standard CPU. It blurs faces at the edge, calculates actual headcount, audits machine operability, and sends compliance signals using **under 8 KB of data per day**."*

---

### [1:00 – 2:00] Demo 1: Catching Attendance Fraud in Real Time
Switch to your terminal and execute:
```bash
PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/overreported.mp4 --session SESS_OVERREPORT
```

**What to point out on screen:**
1. **Terminal Output**: Show that YOLOv8n + ByteTrack detected only **4 trainees** inside the classroom polygon ROI.
2. **Dashboard Chart**: Switch to `http://localhost:3000`. Point to the Area Chart:
   - *"The yellow curve shows what the centre submitted to the portal (25 trainees)."*
   - *"The blue curve shows what our edge vision model detected (4 trainees)."*
3. **Alert Banner**: Point to the alert card: `ATTENDANCE_OVERREPORT` (Discrepancy: 21 trainees / 84% overreported).

---

### [2:00 – 3:00] Demo 2: Missing Equipment & Unoperated Machinery
Switch to your terminal and execute:
```bash
# Missing Workbench
PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/workbench_missing.mp4 --session SESS_WB_MISSING

# Unoperated Machine
PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/machine_idle.mp4 --session SESS_MACHINE_IDLE --camera cam2
```

**What to point out on screen:**
1. **Workbench Auditing**:
   - Point to the **Sanctioned Inventory** card on the dashboard.
   - *"Workbench WB-02 was removed. We run Structural Similarity (SSIM) against baseline snapshots of the room. When the delta persists across ≥3 checks, it flags `ITEM_MISSING` and turns red."*
2. **Apparent Operability Check**:
   - Point to the **CNC Precision Lathe (LATHE-01)** card:
   - *"Centres often keep machines as display props. SkillSight checks two signals: operator motion in the safety zone via frame differencing AND power indicator LED color in a sub-ROI. Because this lathe has 0 motion and a red indicator, it flags `EQUIPMENT_POSSIBLY_NONFUNCTIONAL`."*

---

### [3:00 – 4:00] Demo 3: Privacy by Design (DPDP Act 2023)
On the dashboard, click the **"Evidence"** button on any alert card.

**What to point out on screen:**
1. **Edge-Anonymized Evidence**:
   - Show the thumbnails inside the modal: *"Notice that **every single face is heavily blurred** directly at the edge."*
   - *"No raw video or unblurred face ever leaves the centre. Zero facial recognition, zero biometric embeddings, and zero cross-session identity tracking."*
2. **Explainable Rules**:
   - Show the exact formulas: `Threshold: diff > 4`, `Measured: discrepancy=21`, `Confidence: 85%`.
   - *"Inspectors never see a black-box decision. Every alert is mathematically explainable."*
3. **Human-in-the-Loop Review**:
   - Type a note: `"District Inspector verified roster discrepancy with centre director."`
   - Click **"Acknowledge Discrepancy"** to demonstrate reviewer workflow.
   - Switch role to **"Admin"** in the top right, add a note, and click **"Resolve & Close Alert"** to show the compliance index update.

---

### [4:00 – 5:00] Demo 4: Live Laptop Camera (The "Showstopper")
Run the live webcam command:
```bash
PYTHONPATH=. ./venv/bin/python -m edge_agent --source 0 --live
```

**What to point out live:**
1. Look at your webcam:
   - *"The edge agent is now processing my laptop camera in real time."*
   - Show the terminal logs: `[FRAME 005] People in ROI: 1 | Trainees: 1 | Privacy Blurred: YES`.
2. Look at the dashboard:
   - Show the real-time update arriving at `http://localhost:3000`.
3. Press `Ctrl + C` in the terminal to end the live test.
4. Click **"Ministry Export (CSV)"** in the top right of the dashboard:
   - *"With one click, inspection officials download a certified audit spreadsheet for ministry records."*

---

## 3. Defense Cheat Sheet: Questions Your Professor Might Ask

### Q1: "How does this work in remote rural areas with poor internet?"
> **Answer:**  
> *"All AI inference runs locally on the edge device CPU. Raw video never leaves the room. The edge agent only sends lightweight JSON events and compressed WebP thumbnails. Our empirical measurement report shows it uses **under 8 KB of data per day** (>99.98% bandwidth reduction). If the internet drops completely, our on-disk SQLite queue stores events and flushes them when reconnected, with an ultra-compact 37-byte SMS fallback string for 2G networks."*

### Q2: "What if a student walks outside in the hallway or corridor?"
> **Answer:**  
> *"We use polygon ROI filtering via OpenCV `pointPolygonTest`. Only individuals whose coordinates fall inside the designated classroom polygon are counted; people in hallways or doorways are discarded."*

### Q3: "What if someone briefly blocks the camera or stands in front of a machine?"
> **Answer:**  
> *"We enforce a **Persistence Rule ($K \ge 3$)**. An infrastructure anomaly must hold across at least 3 consecutive sampling checks before an alert is raised. Temporary occlusions never trigger false alarms."*

### Q4: "Why did you avoid facial recognition for attendance?"
> **Answer:**  
> *"Sections 4 and 6 of India's **DPDP Act, 2023** mandate purpose limitation and data minimization. Government skilling audits only require aggregate headcount verification, not biometric profiling of citizens. SkillSight eliminates attendance fraud while strictly preserving trainee privacy."*

---

## 4. Quick Command Reference Table

| Action | Terminal Command |
| :--- | :--- |
| **Normal Session (Compliant)** | `PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/normal.mp4 --session SESS_NORMAL` |
| **Attendance Inflation** | `PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/overreported.mp4 --session SESS_OVERREPORT` |
| **Empty Session Claim** | `PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/empty_session.mp4 --session SESS_EMPTY` |
| **Missing Workbench** | `PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/workbench_missing.mp4 --session SESS_WB_MISSING` |
| **Machine Idle** | `PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/machine_idle.mp4 --session SESS_MACHINE_IDLE --camera cam2` |
| **Obstructed Camera** | `PYTHONPATH=. ./venv/bin/python -m edge_agent --source data/sample_videos/camera_obstructed.mp4 --session SESS_OBSTRUCTED` |
| **Live Laptop Webcam** | `PYTHONPATH=. ./venv/bin/python -m edge_agent --source 0 --live` |
| **Run Unit Tests** | `PYTHONPATH=. ./venv/bin/pytest tests/ -v` |
| **Run Evaluation Suite** | `PYTHONPATH=. ./venv/bin/python eval/evaluate.py` |
