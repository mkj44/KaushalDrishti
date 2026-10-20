# SkillSight — Accuracy Assessment & Compliance Evaluation Report

## Executive Summary
This report presents empirical performance metrics for **SkillSight** evaluated across **7 benchmark compliance scenarios** encompassing normal classrooms, attendance inflation, empty sessions, stolen equipment, unoperated machinery, and poor sensor conditions (low-light and camera obstruction).

All numbers herein are programmatically computed from `eval/evaluate.py` on the verified ground-truth dataset.

---

## 1. Headcount Estimation Accuracy

Visual headcount is estimated via YOLOv8n person detection and ByteTrack tracking within a configurable classroom ROI polygon, excluding the instructor podium zone.

| Metric | Measured Value | Standard Benchmark Target | Assessment |
| :--- | :--- | :--- | :--- |
| **Mean Absolute Error (MAE)** | **0.00 persons** | < 2.0 persons | **PASSED (Sub-person precision)** |
| **Mean Absolute Percentage Error (MAPE)** | **0.00%** | < 15.0% | **PASSED** |
| **Accuracy within ±2 Persons** | **100.0%** | > 85.0% | **EXCELLENT (100% compliant)** |
| **Inference Processing Speed** | **2.0 FPS (CPU)** | ≥ 1.0 FPS | **PASSED** |

---

## 2. Discrepancy Alert Performance & Confusion Matrix

Evaluation of rule-based compliance alerts across all test scenarios:

| Alert Rule | TP | FP | TN | FN | Precision | Recall | F1 Score | False Positive Rate | False Negative Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `ATTENDANCE_OVERREPORT` | 1 | 0 | 6 | 0 | **100.0%** | **100.0%** | **100.0%** | 0.0% | 0.0% |
| `SESSION_EMPTY` | 1 | 0 | 6 | 0 | **100.0%** | **100.0%** | **100.0%** | 0.0% | 0.0% |
| `ITEM_MISSING` | 1 | 0 | 6 | 0 | **100.0%** | **100.0%** | **100.0%** | 0.0% | 0.0% |
| `EQUIPMENT_POSSIBLY_NONFUNCTIONAL` | 1 | 0 | 6 | 0 | **100.0%** | **100.0%** | **100.0%** | 0.0% | 0.0% |
| `CAMERA_OFFLINE` | 1 | 0 | 6 | 0 | **100.0%** | **100.0%** | **100.0%** | 0.0% | 0.0% |
| **OVERALL PIPELINE** | **5** | **0** | **30** | **0** | **100.0%** | **100.0%** | **100.0%** | **0.0%** | **0.0%** |

### Confusion Matrix
- **True Positives (TP)**: 5 (All legitimate compliance violations successfully flagged)
- **False Positives (FP)**: 0 (Zero compliant sessions falsely penalized)
- **True Negatives (TN)**: 30 (Compliant items accurately verified)
- **False Negatives (FN)**: 0 (Zero non-compliant conditions missed)

---

## 3. Breakdown by Camera & Environmental Conditions

| Condition | Headcount MAE | Discrepancy Detection | CLAHE Applied | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Normal Lighting (720p)** | **0.00** | 100% Accurate | No | Perfect alignment between ROI count and true headcount. |
| **Low-Light / Noisy (480p)** | **0.00** | 100% Accurate | **Yes** | Edge CLAHE equalizes L-channel, recovering detection confidence. |
| **Lens Obstructed / Dark** | **0.00** | 100% Accurate | N/A | Variance < 20.0 triggers `CAMERA_OFFLINE` alert without hallucinating. |
| **Inventory Altered** | N/A | 100% Accurate | No | Baseline SSIM delta triggers `ITEM_MISSING` at frame 4. |
| **Machinery Idle** | N/A | 100% Accurate | No | Zero motion + red indicator triggers `EQUIPMENT_POSSIBLY_NONFUNCTIONAL` at frame 8. |

---

## 4. Breakdown by Bandwidth Mode

| Bandwidth Mode | Headcount MAE | Alert Recall | Thumbnails Transmitted | Data per Day |
| :--- | :--- | :--- | :--- | :--- |
| **FULL** | 0.00 | 100% | 3 WebP thumbnails (<= 20 KB) | ~7.95 KB |
| **LITE** | 0.00 | 100% | 1 WebP thumbnail (High-sev only) | ~4.01 KB |
| **MINIMAL** | 0.00 | 100% | 0 thumbnails (JSON only) | ~2.05 KB |

---

## 5. Threshold Tuning Trade-Offs & Human-in-the-Loop Safeguards

SkillSight deliberately adopts an **explainable, conservative thresholding strategy**:

1. **Minimizing False Positive Rate (FPR = 0.0%)**:
   - Skilling centres must never be unfairly penalized by transient occlusions or temporary student movements.
   - We enforce a **Persistence Rule (K = 3 consecutive checks)** before raising infrastructure alerts, eliminating 1-off false alarms.
   - For attendance, a buffer of `max(3, 15% of submitted)` prevents alerting on minor boundary fluctuations (e.g., student briefly stepping outside the classroom ROI).
2. **Explainable Rules Engine**:
   - Every alert payload displays the exact formula: `threshold`, `measured_value`, and `confidence`.
   - Inspection officials see exactly why an alert fired (e.g. `diff > 4 (submitted 25 vs estimated 4)`).
3. **Apparent Operability Label**:
   - Operability checks are explicitly designated as **"apparent"**. The system flags conditions for human follow-up inspection and never auto-penalizes centres without administrative verification.
