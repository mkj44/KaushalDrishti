# KaushalDrishti — Privacy by Design Specification

## 1. Core Privacy Principles

KaushalDrishti is engineered with strict **Privacy-by-Design** principles to comply with India's **Digital Personal Data Protection (DPDP) Act, 2023** and global data privacy standards. The platform enforces aggregate compliance verification rather than individual surveillance.

---

## 2. Data Governance Matrix

The table below explicitly defines data handling across all stages of the KaushalDrishti pipeline:

| What is Detected | What is Stored | What is Transmitted | What is NEVER Done |
| :--- | :--- | :--- | :--- |
| **Aggregate Presence**: Bounding boxes of persons within classroom and workshop polygon ROIs. | **Aggregate Headcount**: Numeric count of trainees (e.g., `estimated_count: 10`, `count_p90: 10`). | **Compliance JSON Payload**: Numerical headcount, discrepancy flags, measured values, confidence scores. | **Zero Facial Recognition**: No face identification, biometric matching, or facial template generation. |
| **Face Regions**: Dual-stage OpenCV Haar Cascade and upper-body head region detection for blurring. | **Anonymized Evidence**: 1–3 compressed, blurred thumbnails ($\le 20\text{ KB}$ WebP) stored with alerts for visual proof. | **Blurred Thumbnails Only**: Serialized base64 WebP images with 100% blurred facial regions. | **Zero Biometric Embeddings**: No face vectors, 128-d or 512-d embeddings are ever calculated or saved. |
| **Ephemeral Tracks**: ByteTrack IDs used solely to de-duplicate persons moving within a single session. | **Audit Trail**: Metadata log of human inspector review notes and status updates (`open`, `acknowledged`, `resolved`). | **Centres & Inventory Status**: Machine operability signals (`apparent_active`), workbench counts. | **Zero Cross-Session Tracking**: ByteTrack IDs reset to 0 at the start of every session; no re-identification across days. |
| **Object Categories**: COCO classes (`chair`, `bench`, `dining table`, `machine`) inside polygon zones. | **Local Log Retention**: Configurable local edge retention (default 7 days) with automated circular deletion. | **System Health**: Camera online/obstructed status, latency, and uplink mode. | **Zero Raw Video Upload**: Raw CCTV footage never leaves the training centre; unblurred frames are never transmitted. |

---

## 3. Dual-Stage Edge Anonymization Pipeline

To eliminate any risk of unblurred face leakage, `edge_agent/privacy.py` executes a mandatory dual-stage anonymization process on raw frames **prior to any disk serialization or network uplink**:

```text
[Raw CCTV Video Frame]
       │
       ▼
1. Haar Cascade Frontal Face Detector ──► [Heavy Gaussian Blur Applied]
       │
       ▼
2. Haar Cascade Profile Face Detector  ──► [Heavy Gaussian Blur Applied]
       │
       ▼
3. Person Bounding Box Upper 25% Fallback ──► [Head Region Guaranteed Blurred]
       │
       ▼
4. Compressed Thumbnail Generator (320px WebP, ≤ 20 KB)
       │
       ▼
5. Automated Zero-Face Detection Assert (`verify_zero_unblurred_faces()`)
       │
       ▼
[Anonymized Media Ready for Storage or Uplink]
```

### Automated Compliance Unit Test
KaushalDrishti incorporates an automated unit test in `tests/test_privacy.py` (`test_face_blurring_leaves_zero_detectable_faces`), which runs a face detector across generated evidence thumbnails and asserts **zero detected faces above confidence threshold**.

---

## 4. Legal Compliance & The DPDP Act, 2023

1. **Purpose Limitation**:
   KaushalDrishti processes optical data exclusively for scheme infrastructure compliance and attendance cross-verification under Section 4 of the DPDP Act. It does not construct behavioural profiles or track individual trainee attendance histories.
2. **Data Minimization (Section 6)**:
   Transmitted signals are restricted to mathematical counts and blurred thumbnails strictly required to verify compliance discrepancies.
3. **Storage Limitation (Section 8)**:
   Edge caches auto-prune after 7 days. Central alert thumbnails are archived in accordance with government scheme auditing guidelines.

---

## 5. Scope Boundary: When is Individual Identification Legitimate?

> [!IMPORTANT]
> **Formal Investigations are Strictly Out of Scope**
> 
> In rare instances involving alleged financial fraud, ghost beneficiary scams, or criminal forgery, scheme authorities may seek to verify the exact individual identity of specific trainees or instructors.
> 
> **KaushalDrishti does not and cannot perform this function.** 
> Individual identification is strictly out-of-scope for the KaushalDrishti system and architecture. Any legitimate individual verification:
> 1. Requires separate legal authorization, judicial warrant, or statutory notices under applicable government scheme bylaws and the **DPDP Act, 2023**.
> 2. Requires verifiable notice and explicit informed consent from the specific data principal (trainee/instructor).
> 3. Must be conducted through official manual physical inspections or certified statutory identity systems (e.g. Aadhaar AEPS / biometric terminals), completely independent of KaushalDrishti's passive compliance monitoring.
