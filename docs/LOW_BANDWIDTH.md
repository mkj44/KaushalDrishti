# KaushalDrishti — Low-Bandwidth Edge Deployment & Bandwidth Report

## Overview
KaushalDrishti is architected from the ground up for rural skilling centres operating on intermittent 2G, 3G, or capped 4G cellular links. All computer vision inference (YOLOv8n object detection, ByteTrack session tracking, and face blurring) executes **100% locally on the edge device**. Raw CCTV video feeds never leave the training centre premises.

---

## Measured Payload Benchmarks

The table below details empirical measurements taken on live serialized payloads:

| Operational Mode | Contents Transmitted | Payload / Session | Daily Bandwidth (1 Cam, 4 SESS) | Monthly Bandwidth (4 Cams, 30 Days) |
| :--- | :--- | :--- | :--- | :--- |
| **Traditional Raw RTSP** | Continuous 720p H.264 stream | ~1.35 GB / session | **5,400,000 KB (5.4 GB)** | **648 GB** |
| **KaushalDrishti FULL** | JSON compliance events + up to 3 WebP thumbnails (320px) | 1.99 KB | **7.95 KB (0.01 MB)** | **0.93 MB** |
| **KaushalDrishti LITE** | JSON compliance events + 1 thumbnail for high-severity alerts | 1.00 KB | **4.01 KB (0.00 MB)** | **0.47 MB** |
| **KaushalDrishti MINIMAL** | Aggregated JSON session digest (zero thumbnails) | 0.51 KB | **2.05 KB** | **246.09 KB (0.24 MB)** |
| **SMS / USSD Stub** | GSM-encoded text summary (`SS|TC001|SS_101|S:25|E:4|A:ATTENDANCE`) | **37 bytes** | **< 1 KB** | **< 20 KB** |

### Bandwidth Reduction
- In **FULL** mode: **99.98% bandwidth reduction** compared to raw CCTV video streaming.
- In **MINIMAL** mode: Consumes **under 15 KB per day**, permitting reliable compliance monitoring even over basic 2G GPRS connections or monthly data quotas as low as 100 MB.

---

## Edge Resilience & Offline Store-and-Forward
- **Local SQLite Queue (`edge_agent/offline_queue.db`)**: If the centre's internet uplink experiences outages, events and evidence thumbnails are persisted in an on-disk SQLite queue with transaction safety.
- **Automatic Exponential Backoff & Retry**: Upon network reconnection, `UplinkManager.flush_offline_queue()` flushes backlogged records in chronological order without blocking local detection.
- **SMS / USSD Fallback Format**: For remote centers without data connectivity, the system generates ultra-compact SMS strings (< 140 chars) suitable for GSM modem transmission:
  ```text
  SS|TC001|SS_101|S:25|E:4|A:ATTENDANCE
  ```

---

## Low-Quality Sensor & Poor Illumination Handling
KaushalDrishti handles budget 360p/480p sensors and low-light workshop environments:
1. **Adaptive CLAHE (Contrast Limited Adaptive Histogram Equalization)**:
   - When a camera's average grayscale brightness drops below 50.0, CLAHE is automatically applied on the L-channel in LAB color space.
   - Enhances contrast around silhouettes without amplifying high-frequency noise or color artifacts.
2. **Laplacian Variance Health Check**:
   - Frames with variance < 20.0 or Laplacian variance < 5.0 are flagged as obstructed, covered, or offline rather than hallucinating false empty-room counts.
3. **Resolution Robustness**:
   - Evaluated and verified across 360p, 480p, and 720p input resolutions.
