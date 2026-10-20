"""
On-demand video analysis for KaushalDrishti.

An inspector uploads a recorded classroom / workshop clip and the server runs the
same YOLOv8n + ByteTrack pipeline as the edge agent over sampled frames to report:

- People: peak, median, P90 and unique-track headcount, plus a per-second timeline
- Furniture & equipment: chairs, tables/workbenches, benches, monitors, laptops, ...
- Seat occupancy: how many detected chairs have a person on them
- A floor-plan layout + movement heatmap (normalised coordinates) for the 3D view
- Face-blurred, box-annotated keyframes as evidence

Privacy: the uploaded file is deleted as soon as processing ends, and every
keyframe passes through PrivacyEngine.anonymize_frame before it is encoded.
"""

from __future__ import annotations

import base64
import os
import threading
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

import cv2
import numpy as np

UPLOAD_DIR = os.path.join("data", "uploads")
MODEL_NAME = os.getenv("KD_VIDEO_MODEL", "yolov8n.pt")
MAX_SAMPLED_FRAMES = int(os.getenv("KD_VIDEO_MAX_FRAMES", "160"))
TARGET_SAMPLE_INTERVAL_SEC = 0.5
HEATMAP_COLS, HEATMAP_ROWS = 32, 20
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

# COCO class id -> (category key, display label)
TRACKED_CLASSES: Dict[int, tuple] = {
    0: ("person", "People"),
    56: ("chair", "Chairs"),
    60: ("table", "Tables / Workbenches"),
    13: ("bench", "Benches"),
    57: ("sofa", "Sofas"),
    62: ("monitor", "Monitors / TVs"),
    63: ("laptop", "Laptops"),
    66: ("keyboard", "Keyboards"),
    64: ("mouse", "Mice"),
    67: ("phone", "Phones"),
    73: ("book", "Books"),
    24: ("backpack", "Backpacks"),
    26: ("handbag", "Bags"),
    39: ("bottle", "Bottles"),
    74: ("clock", "Clocks"),
}

BOX_COLOURS = {  # OpenCV uses BGR; these match the dashboard palette
    "person": (176, 63, 90),    # #5a3fb0 violet
    "chair": (76, 122, 30),     # #1e7a4c green
    "table": (85, 138, 185),    # #b98a55 wood
    "bench": (85, 138, 185),
    "monitor": (61, 33, 20),    # #14213d ink
    "laptop": (61, 33, 20),
}

_JOBS: Dict[str, Dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()
_RUN_LOCK = threading.Lock()  # one CPU inference job at a time


# --------------------------------------------------------------------------- jobs

def create_job(path: str, filename: str, options: Dict[str, Any]) -> str:
    job_id = uuid.uuid4().hex[:12]
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "id": job_id,
            "filename": filename,
            "status": "queued",
            "stage": "Queued",
            "progress": 0.0,
            "created_at": datetime.utcnow().isoformat(),
            "options": options,
            "result": None,
            "error": None,
        }
    threading.Thread(target=_run_job, args=(job_id, path), daemon=True).start()
    return job_id


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None


def list_jobs(limit: int = 20) -> List[Dict[str, Any]]:
    with _JOBS_LOCK:
        jobs = sorted(_JOBS.values(), key=lambda j: j["created_at"], reverse=True)[:limit]
        out = []
        for j in jobs:
            summary = (j.get("result") or {}).get("summary")
            out.append({k: j[k] for k in ("id", "filename", "status", "progress", "created_at")} | {"summary": summary})
        return out


def register_completed_job(filename: str, result: Dict[str, Any], options: Optional[Dict[str, Any]] = None) -> str:
    """Store an already-computed result (e.g. a finished live session) as a completed job."""
    job_id = uuid.uuid4().hex[:12]
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "id": job_id, "filename": filename, "status": "completed", "stage": "Done", "progress": 1.0,
            "created_at": datetime.utcnow().isoformat(), "options": options or {}, "result": result, "error": None,
        }
    return job_id


def _update(job_id: str, **fields):
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(fields)


def _run_job(job_id: str, path: str):
    try:
        with _RUN_LOCK:
            _update(job_id, status="processing", stage="Loading detection model", progress=0.02)
            result = analyze_video(path, progress_cb=lambda p, s: _update(job_id, progress=round(p, 3), stage=s))
        _update(job_id, status="completed", stage="Done", progress=1.0, result=result)
    except Exception as exc:  # surfaced to the UI
        _update(job_id, status="failed", stage="Failed", error=str(exc))
    finally:
        try:
            os.remove(path)  # raw footage is never retained
        except OSError:
            pass


# ------------------------------------------------------------------- analysis

def _percentile(values: List[int], q: float) -> int:
    return int(round(float(np.percentile(values, q)))) if values else 0


def _overlap_ratio(inner: List[float], outer: List[float]) -> float:
    """Fraction of `inner` box area covered by `outer`."""
    x1, y1 = max(inner[0], outer[0]), max(inner[1], outer[1])
    x2, y2 = min(inner[2], outer[2]), min(inner[3], outer[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area = max(1.0, (inner[2] - inner[0]) * (inner[3] - inner[1]))
    return inter / area


def _encode_jpeg_b64(frame: np.ndarray, width: int = 640, quality: int = 72) -> str:
    h, w = frame.shape[:2]
    if w > width:
        frame = cv2.resize(frame, (width, int(h * width / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return base64.b64encode(buf.tobytes()).decode("ascii") if ok else ""


def _annotate(frame: np.ndarray, dets: List[Dict[str, Any]]) -> np.ndarray:
    out = frame.copy()
    for d in dets:
        x1, y1, x2, y2 = [int(v) for v in d["box"]]
        colour = BOX_COLOURS.get(d["category"], (200, 200, 200))
        cv2.rectangle(out, (x1, y1), (x2, y2), colour, 2)
        label = d["category"] + (f" #{d['track_id']}" if d.get("track_id") is not None else "")
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        cv2.rectangle(out, (x1, max(0, y1 - th - 6)), (x1 + tw + 6, y1), colour, -1)
        cv2.putText(out, label, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    return out


def analyze_video(path: str, progress_cb=lambda p, s: None, conf: float = 0.30) -> Dict[str, Any]:
    from ultralytics import YOLO  # heavy import, deferred
    from edge_agent.privacy import PrivacyEngine

    started = time.time()
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise ValueError("Could not decode this video. Try MP4 (H.264) or MOV.")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    if fps <= 0 or fps > 240:
        fps = 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if total_frames else 0.0

    step = max(1, int(round(fps * TARGET_SAMPLE_INTERVAL_SEC)))
    if total_frames and total_frames / step > MAX_SAMPLED_FRAMES:
        step = int(np.ceil(total_frames / MAX_SAMPLED_FRAMES))
    planned = max(1, (total_frames // step) if total_frames else MAX_SAMPLED_FRAMES)

    model = YOLO(MODEL_NAME)  # fresh instance -> fresh ByteTrack state per upload
    privacy = PrivacyEngine()
    class_ids = list(TRACKED_CLASSES.keys())

    timeline: List[Dict[str, Any]] = []
    per_cat_counts: Dict[str, List[int]] = defaultdict(list)
    person_tracks: Dict[int, Dict[str, Any]] = {}
    heat = np.zeros((HEATMAP_ROWS, HEATMAP_COLS), dtype=np.float32)
    occupancy_series: List[float] = []
    brightness: List[float] = []
    confidences: List[float] = []
    frames: List[Dict[str, Any]] = []  # kept lightweight: detections only

    idx = sampled = 0
    while sampled < MAX_SAMPLED_FRAMES:
        ok = cap.grab()
        if not ok:
            break
        if idx % step:
            idx += 1
            continue
        ok, frame = cap.retrieve()
        if not ok:
            break
        t = idx / fps
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness.append(float(gray.mean()))

        res = model.track(frame, conf=conf, iou=0.45, persist=True, tracker="bytetrack.yaml",
                          classes=class_ids, verbose=False)[0]
        dets: List[Dict[str, Any]] = []
        if res.boxes is not None:
            for b in res.boxes:
                cid = int(b.cls[0])
                cat = TRACKED_CLASSES[cid][0]
                box = [float(v) for v in b.xyxy[0].tolist()]
                tid = int(b.id[0]) if b.id is not None else None
                c = float(b.conf[0])
                dets.append({"category": cat, "box": box, "conf": c, "track_id": tid})
                confidences.append(c)

        counts = Counter(d["category"] for d in dets)
        for cat, _label in TRACKED_CLASSES.values():
            per_cat_counts[cat].append(counts.get(cat, 0))

        people = [d for d in dets if d["category"] == "person"]
        chairs = [d for d in dets if d["category"] == "chair"]
        for p in people:
            fx = (p["box"][0] + p["box"][2]) / 2 / w
            fy = p["box"][3] / h
            heat[min(HEATMAP_ROWS - 1, int(fy * HEATMAP_ROWS)), min(HEATMAP_COLS - 1, int(fx * HEATMAP_COLS))] += 1
            if p["track_id"] is not None:
                tr = person_tracks.setdefault(p["track_id"], {"first": t, "last": t, "hits": 0})
                tr["last"] = t
                tr["hits"] += 1

        occupied = 0
        for ch in chairs:
            if any(_overlap_ratio(ch["box"], p["box"]) > 0.35 for p in people):
                occupied += 1
        if chairs:
            occupancy_series.append(occupied / len(chairs))

        timeline.append({"t": round(t, 2), "people": counts.get("person", 0),
                         "chairs": counts.get("chair", 0), "occupied": occupied})
        frames.append({"t": t, "frame_index": idx, "dets": dets, "w": w, "h": h})

        sampled += 1
        idx += 1
        progress_cb(0.05 + 0.85 * min(1.0, sampled / planned), f"Analysing frame {sampled} of ~{planned}")

    if not frames:
        cap.release()
        raise ValueError("No frames could be read from this video.")

    # ---------------- aggregate
    progress_cb(0.92, "Building 3D layout and evidence")
    people_counts = per_cat_counts["person"]
    min_hits = max(2, int(0.05 * len(frames)))  # ignore flickering tracks
    stable_tracks = {k: v for k, v in person_tracks.items() if v["hits"] >= min_hits}
    dwell = [v["last"] - v["first"] for v in stable_tracks.values()]

    objects = []
    for cid, (cat, label) in TRACKED_CLASSES.items():
        series = per_cat_counts[cat]
        if not any(series):
            continue
        # static objects get occluded, so P90 is a robust "how many are really there"
        est = _percentile(series, 50) if cat == "person" else _percentile(series, 90)
        objects.append({"key": cat, "label": label, "estimated": est, "max": int(max(series)),
                        "avg": round(float(np.mean(series)), 2)})
    objects.sort(key=lambda o: (o["key"] != "person", -o["estimated"]))

    # representative frame for the 3D floor plan: closest to P90 headcount, most furniture
    p90 = _percentile(people_counts, 90)
    rep = min(frames, key=lambda f: (abs(sum(d["category"] == "person" for d in f["dets"]) - p90),
                                     -len(f["dets"])))

    def layout_of(fr):
        items = []
        for d in fr["dets"]:
            x1, y1, x2, y2 = d["box"]
            items.append({
                "category": d["category"],
                "x": round(((x1 + x2) / 2) / fr["w"], 4),   # 0..1 across the image
                "y": round(y2 / fr["h"], 4),               # 0..1 floor contact point (depth proxy)
                "w": round((x2 - x1) / fr["w"], 4),
                "h": round((y2 - y1) / fr["h"], 4),
                "conf": round(d["conf"], 3),
            })
        return items

    if heat.max() > 0:
        heat = heat / heat.max()

    # keyframes: representative + spread across the clip, all anonymised
    key_idx = sorted({frames.index(rep)} | {int(i) for i in np.linspace(0, len(frames) - 1, 4)})[:5]
    keyframes = []
    for i in key_idx:
        fr = frames[i]
        cap.set(cv2.CAP_PROP_POS_FRAMES, fr["frame_index"])
        ok, img = cap.read()
        if not ok:
            continue
        person_boxes = [[int(v) for v in d["box"]] for d in fr["dets"] if d["category"] == "person"]
        safe = privacy.anonymize_frame(img, person_boxes=person_boxes)
        keyframes.append({
            "t": round(fr["t"], 2),
            "people": sum(d["category"] == "person" for d in fr["dets"]),
            "image": _encode_jpeg_b64(_annotate(safe, fr["dets"])),
            "representative": fr is rep,
        })
    cap.release()

    mean_brightness = float(np.mean(brightness)) if brightness else 0.0
    peak_idx = int(np.argmax(people_counts)) if people_counts else 0
    chairs_est = next((o["estimated"] for o in objects if o["key"] == "chair"), 0)
    tables_est = next((o["estimated"] for o in objects if o["key"] == "table"), 0)
    occupancy = round(float(np.median(occupancy_series)), 3) if occupancy_series else None
    avg_conf = round(float(np.mean(confidences)), 3) if confidences else 0.0

    insights = []
    median_people = _percentile(people_counts, 50)
    if chairs_est and median_people > chairs_est:
        insights.append({"level": "warn", "text": f"Median headcount ({median_people}) exceeds visible chairs ({chairs_est}) - possible overcrowding or chairs out of frame."})
    if chairs_est and occupancy is not None and occupancy < 0.4:
        insights.append({"level": "info", "text": f"Only {round(occupancy * 100)}% of visible seats are occupied on average."})
    if mean_brightness < 50:
        insights.append({"level": "warn", "text": "Footage is very dark; counts may be under-estimated."})
    if max(people_counts) - min(people_counts) >= max(3, median_people * 0.5):
        insights.append({"level": "info", "text": f"Headcount varies a lot (from {min(people_counts)} to {max(people_counts)}) - people entering or leaving during the clip."})
    if not insights:
        insights.append({"level": "ok", "text": "Headcount is stable and consistent with the visible seating."})

    return {
        "summary": {
            "people_median": median_people,
            "people_peak": int(max(people_counts)),
            "people_p90": p90,
            "unique_people": len(stable_tracks),
            "chairs": chairs_est,
            "tables": tables_est,
            "seat_occupancy": occupancy,
            "peak_at": round(frames[peak_idx]["t"], 2),
            "avg_dwell_sec": round(float(np.mean(dwell)), 1) if dwell else 0.0,
            "confidence": avg_conf,
        },
        "objects": objects,
        "timeline": timeline,
        "layout": {"items": layout_of(rep), "t": round(rep["t"], 2),
                   "aspect": round(rep["w"] / rep["h"], 4)},
        "heatmap": {"cols": HEATMAP_COLS, "rows": HEATMAP_ROWS,
                    "values": [round(float(v), 3) for v in heat.flatten()]},
        "keyframes": keyframes,
        "insights": insights,
        "video": {
            "width": width, "height": height, "fps": round(fps, 2),
            "duration_sec": round(duration, 2), "frames_total": total_frames,
            "frames_analysed": len(frames), "sample_every_n": step,
            "mean_brightness": round(mean_brightness, 1),
        },
        "processing_sec": round(time.time() - started, 2),
        "model": MODEL_NAME,
    }
