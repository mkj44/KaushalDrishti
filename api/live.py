"""
Real-time camera analysis for KaushalDrishti.

One live session at a time. Frames come from either:

- "server": the API opens the source itself - a camera index ("0"), a CCTV
  stream (rtsp:// or http(s)://) or one of the sample clips, which is played
  back at its own frame rate and looped so it behaves like a live feed;
- "push": the dashboard captures the laptop webcam in the browser and posts
  JPEG frames to /api/v1/live/frame.

Every processed frame runs YOLOv8n + ByteTrack. The session keeps smoothed
counts, a rolling timeline, a movement heatmap and a face-blurred, annotated
preview. When the session stops it is stored as a normal completed analysis job
so it can be filed against a centre like an uploaded video.
"""

from __future__ import annotations

import os
import threading
import time
from collections import Counter, deque
from datetime import datetime
from typing import Any, Callable, Deque, Dict, List, Optional

import cv2
import numpy as np

from api import video_analysis as va

SAMPLE_DIR = os.path.join("data", "sample_videos")
TARGET_FPS = float(os.getenv("KD_LIVE_FPS", "6"))
PEOPLE_WINDOW_SEC = 30.0       # "typical" headcount window
FURNITURE_WINDOW_SEC = 15.0    # furniture counts/positions window
TIMELINE_SEC = 120.0           # what the dashboard chart shows
PERSON_LINGER_SEC = 1.0        # keep a briefly-missed person on screen
KEYFRAME_EVERY_SEC = 12.0
PREVIEW_WIDTH = 720
FACE_DETECT_WIDTH = int(os.getenv("KD_LIVE_FACE_WIDTH", "480"))


def list_samples() -> List[str]:
    if not os.path.isdir(SAMPLE_DIR):
        return []
    return sorted(f for f in os.listdir(SAMPLE_DIR) if f.lower().endswith(tuple(va.ALLOWED_EXTENSIONS)))


def resolve_source(source: str):
    """Only camera indices, network streams and bundled samples are accepted - never arbitrary paths."""
    s = (source or "").strip()
    if s.isdigit():
        return int(s), True
    if s.lower().startswith(("rtsp://", "rtmp://", "http://", "https://")):
        return s, True
    if s in list_samples():
        return os.path.join(SAMPLE_DIR, s), False
    raise ValueError("Use a camera number (0 is usually the built-in webcam), an rtsp:// or http:// stream, or one of the sample clips.")


class LiveSession:
    def __init__(self, mode: str, source: str, centre_id: str = "TC001", camera_id: str = "live",
                 on_update: Optional[Callable[[Dict[str, Any]], None]] = None):
        from ultralytics import YOLO
        from edge_agent.privacy import PrivacyEngine

        self.mode = mode
        self.source_label = source
        self.centre_id = centre_id
        self.camera_id = camera_id
        self.on_update = on_update
        self.model = YOLO(va.MODEL_NAME)
        self.privacy = PrivacyEngine()
        self.class_ids = list(va.TRACKED_CLASSES.keys())

        self.started = time.time()
        self.lock = threading.Lock()
        self.running = True
        self.error: Optional[str] = None

        self.frames = 0
        self.proc_times: Deque[float] = deque(maxlen=20)
        self.frame_times: Deque[float] = deque(maxlen=20)
        self.history: Deque[Dict[str, Any]] = deque()       # per-frame summary with dets, for windows
        self.timeline: List[Dict[str, Any]] = []
        self.person_tracks: Dict[int, Dict[str, Any]] = {}
        self.live_people: Dict[int, Dict[str, Any]] = {}
        self.heat = np.zeros((va.HEATMAP_ROWS, va.HEATMAP_COLS), dtype=np.float32)
        self.min_floor_y = 1.0
        self.confidences: Deque[float] = deque(maxlen=2000)
        self.keyframes: List[Dict[str, Any]] = []
        self.last_keyframe_t = -1e9
        self.preview_b64 = ""
        self.size = (0, 0)
        self.last_update_push = 0.0

        self._latest: Optional[np.ndarray] = None
        self._latest_id = 0
        self._cap = None
        if mode == "server":
            src, realtime = resolve_source(source)
            cap = cv2.VideoCapture(src)
            if not cap.isOpened():
                raise ValueError(f"Could not open '{source}'. Check the camera is connected and not used by another app, or that the stream URL is reachable.")
            self._cap = cap
            self._is_file = not realtime
            threading.Thread(target=self._grab_loop, daemon=True).start()
            threading.Thread(target=self._process_loop, daemon=True).start()

    # ------------------------------------------------------------ threads

    def _grab_loop(self):
        cap = self._cap
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        fps = fps if 0 < fps < 120 else 25.0
        fails = 0
        while self.running:
            ok, frame = cap.read()
            if not ok:
                if self._is_file:  # loop the sample so it behaves like a camera
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    continue
                fails += 1
                if fails > 50:
                    self.error = "The camera stopped sending frames."
                    break
                time.sleep(0.05)
                continue
            fails = 0
            with self.lock:
                self._latest = frame
                self._latest_id += 1
            if self._is_file:
                time.sleep(1.0 / fps)
        cap.release()

    def _process_loop(self):
        seen = 0
        while self.running:
            t0 = time.time()
            with self.lock:
                frame, fid = self._latest, self._latest_id
            if frame is None or fid == seen:
                time.sleep(0.01)
                continue
            seen = fid
            try:
                self.process(frame)
            except Exception as exc:  # keep the session alive, surface the problem
                self.error = f"Detection error: {exc}"
            spare = (1.0 / TARGET_FPS) - (time.time() - t0)
            if spare > 0:
                time.sleep(spare)

    # ----------------------------------------------------------- per frame

    def process(self, frame: np.ndarray) -> None:
        t_start = time.time()
        t = t_start - self.started
        h, w = frame.shape[:2]
        self.size = (w, h)

        res = self.model.track(frame, conf=0.30, iou=0.45, persist=True, tracker="bytetrack.yaml",
                               classes=self.class_ids, verbose=False)[0]
        dets: List[Dict[str, Any]] = []
        if res.boxes is not None:
            for b in res.boxes:
                cat = va.TRACKED_CLASSES[int(b.cls[0])][0]
                box = [float(v) for v in b.xyxy[0].tolist()]
                dets.append({"category": cat, "box": box, "conf": float(b.conf[0]),
                             "track_id": int(b.id[0]) if b.id is not None else None})
                self.confidences.append(float(b.conf[0]))

        people = [d for d in dets if d["category"] == "person"]
        chairs = [d for d in dets if d["category"] == "chair"]
        occupied = sum(1 for c in chairs if any(va._overlap_ratio(c["box"], p["box"]) > 0.35 for p in people))
        counts = Counter(d["category"] for d in dets)

        for d in dets:
            self.min_floor_y = min(self.min_floor_y, d["box"][3] / h)
        for i, p in enumerate(people):
            fx, fy = (p["box"][0] + p["box"][2]) / 2 / w, p["box"][3] / h
            self.heat[min(va.HEATMAP_ROWS - 1, int(fy * va.HEATMAP_ROWS)), min(va.HEATMAP_COLS - 1, int(fx * va.HEATMAP_COLS))] += 1
            key = p["track_id"] if p["track_id"] is not None else -(i + 1)
            if p["track_id"] is not None:
                tr = self.person_tracks.setdefault(p["track_id"], {"first": t, "last": t, "hits": 0})
                tr["last"], tr["hits"] = t, tr["hits"] + 1
            self.live_people[key] = {"x": fx, "y": fy, "w": (p["box"][2] - p["box"][0]) / w,
                                     "h": (p["box"][3] - p["box"][1]) / h, "seen": t}
        self.live_people = {k: v for k, v in self.live_people.items() if t - v["seen"] <= PERSON_LINGER_SEC}

        # preview at 720px wide; faces searched at 480px (people's heads are always blurred)
        k = min(1.0, PREVIEW_WIDTH / w)
        small = cv2.resize(frame, (int(w * k), int(h * k)), interpolation=cv2.INTER_AREA) if k < 1 else frame
        sdets = [dict(d, box=[v * k for v in d["box"]]) for d in dets]
        safe = self.privacy.anonymize_frame(
            small, person_boxes=[[int(v) for v in d["box"]] for d in sdets if d["category"] == "person"],
            detect_width=FACE_DETECT_WIDTH)
        annotated = va._annotate(safe, sdets)
        self.preview_b64 = va._encode_jpeg_b64(annotated, width=PREVIEW_WIDTH, quality=70)
        if t - self.last_keyframe_t >= KEYFRAME_EVERY_SEC:
            self.keyframes.append({"t": round(t, 2), "people": len(people), "image": va._encode_jpeg_b64(annotated)})
            self.keyframes = self.keyframes[-6:]
            self.last_keyframe_t = t

        furniture = [{"category": d["category"], "x": (d["box"][0] + d["box"][2]) / 2 / w, "y": d["box"][3] / h,
                      "w": (d["box"][2] - d["box"][0]) / w, "h": (d["box"][3] - d["box"][1]) / h}
                     for d in dets if d["category"] != "person"]
        entry = {"t": t, "counts": counts, "furniture": furniture, "occupied": occupied}
        self.history.append(entry)
        while self.history and t - self.history[0]["t"] > max(PEOPLE_WINDOW_SEC, FURNITURE_WINDOW_SEC):
            self.history.popleft()
        self.timeline.append({"t": round(t, 2), "people": counts.get("person", 0), "chairs": counts.get("chair", 0),
                              "occupied": occupied})

        self.frames += 1
        now = time.time()
        self.frame_times.append(now)
        self.proc_times.append(now - t_start)
        if self.on_update and now - self.last_update_push > 1.0:
            self.last_update_push = now
            try:
                self.on_update(self._feed_update())
            except Exception:
                pass

    # ------------------------------------------------------------- output

    def _window(self, seconds: float) -> List[Dict[str, Any]]:
        if not self.history:
            return []
        end = self.history[-1]["t"]
        return [e for e in self.history if end - e["t"] <= seconds]

    def _object_counts(self) -> List[Dict[str, Any]]:
        out = []
        pw, fw = self._window(PEOPLE_WINDOW_SEC), self._window(FURNITURE_WINDOW_SEC)
        for _cid, (cat, label) in va.TRACKED_CLASSES.items():
            win = pw if cat == "person" else fw
            series = [e["counts"].get(cat, 0) for e in win]
            if not any(series):
                continue
            est = va._percentile(series, 50) if cat == "person" else va._percentile(series, 90)
            out.append({"key": cat, "label": label, "estimated": est, "max": int(max(series)),
                        "avg": round(float(np.mean(series)), 2)})
        out.sort(key=lambda o: (o["key"] != "person", -o["estimated"]))
        return out

    def _layout_items(self) -> List[Dict[str, Any]]:
        # furniture from the recent frame that saw the most of it (stable, no flicker)
        fw = self._window(FURNITURE_WINDOW_SEC)
        best = max(fw, key=lambda e: len(e["furniture"]), default=None)
        items = [dict(f, key=f"{f['category']}-{i}") for i, f in enumerate(best["furniture"] if best else [])]
        for k, p in self.live_people.items():
            items.append({"category": "person", "key": f"p{k}", "x": p["x"], "y": p["y"], "w": p["w"], "h": p["h"]})
        return [dict(i, x=round(i["x"], 4), y=round(i["y"], 4), w=round(i["w"], 4), h=round(i["h"], 4)) for i in items]

    def _feed_update(self) -> Dict[str, Any]:
        objs = {o["key"]: o for o in self._object_counts()}
        return {"active": True, "centre_id": self.centre_id, "camera_id": self.camera_id, "session_id": "LIVE",
                "image": self.preview_b64, "estimated_count": objs.get("person", {}).get("estimated", 0),
                "submitted_count": None, "confidence": round(float(np.mean(self.confidences)), 3) if self.confidences else 0.0,
                "updated_at": datetime.utcnow().isoformat()}

    def snapshot(self) -> Dict[str, Any]:
        now_counts = self.history[-1]["counts"] if self.history else Counter()
        last = self.history[-1] if self.history else None
        chairs_now = now_counts.get("chair", 0)
        fps = 0.0
        if len(self.frame_times) >= 2:
            span = self.frame_times[-1] - self.frame_times[0]
            fps = (len(self.frame_times) - 1) / span if span > 0 else 0.0
        people_series = [p["people"] for p in self.timeline]
        cutoff = (self.timeline[-1]["t"] - TIMELINE_SEC) if self.timeline else 0
        objs = self._object_counts()
        return {
            "active": self.running,
            "mode": self.mode,
            "source": self.source_label,
            "centre_id": self.centre_id,
            "elapsed_sec": round(time.time() - self.started, 1),
            "frames": self.frames,
            "fps": round(fps, 1),
            "latency_ms": round(1000 * float(np.mean(self.proc_times)), 0) if self.proc_times else None,
            "error": self.error,
            "people_now": len(self.live_people),
            "people_typical": next((o["estimated"] for o in objs if o["key"] == "person"), 0),
            "people_peak": max(people_series) if people_series else 0,
            "unique_people": sum(1 for v in self.person_tracks.values() if v["hits"] >= 3),
            "chairs": next((o["estimated"] for o in objs if o["key"] == "chair"), 0),
            "seat_occupancy": round(last["occupied"] / chairs_now, 3) if last and chairs_now else None,
            "objects": objs,
            "layout": {"items": self._layout_items(), "horizon": round(max(0.0, min(0.45, self.min_floor_y - 0.06)), 4)},
            "timeline": [p for p in self.timeline if p["t"] >= cutoff][-400:],
            "frame": self.preview_b64,
            "size": self.size,
        }

    def stop(self) -> Optional[str]:
        self.running = False
        time.sleep(0.15)
        if not self.frames:
            return None
        people = [p["people"] for p in self.timeline]
        stable = {k: v for k, v in self.person_tracks.items() if v["hits"] >= max(3, int(0.05 * self.frames))}
        dwell = [v["last"] - v["first"] for v in stable.values()]
        objs = self._object_counts()
        median = va._percentile(people, 50)
        chairs = next((o["estimated"] for o in objs if o["key"] == "chair"), 0)
        occ = [p["occupied"] / p["chairs"] for p in self.timeline if p["chairs"]]
        heat = self.heat / self.heat.max() if self.heat.max() > 0 else self.heat
        insights = []
        if chairs and median > chairs:
            insights.append({"level": "warn", "text": f"Typical headcount ({median}) is above the chairs in view ({chairs})."})
        if people and max(people) - min(people) >= max(3, median * 0.5):
            insights.append({"level": "info", "text": f"Headcount moved between {min(people)} and {max(people)} during the session."})
        if not insights:
            insights.append({"level": "ok", "text": "Headcount stayed steady through the live session."})
        duration = self.timeline[-1]["t"] if self.timeline else 0.0
        w, h = self.size
        result = {
            "summary": {
                "people_median": median, "people_peak": max(people) if people else 0,
                "people_p90": va._percentile(people, 90), "unique_people": len(stable),
                "chairs": chairs, "tables": next((o["estimated"] for o in objs if o["key"] == "table"), 0),
                "seat_occupancy": round(float(np.median(occ)), 3) if occ else None,
                "peak_at": self.timeline[int(np.argmax(people))]["t"] if people else 0.0,
                "avg_dwell_sec": round(float(np.mean(dwell)), 1) if dwell else 0.0,
                "confidence": round(float(np.mean(self.confidences)), 3) if self.confidences else 0.0,
            },
            "objects": objs,
            "timeline": self.timeline[-600:],
            "layout": {"items": [{k: v for k, v in i.items() if k != "key"} for i in self._layout_items()],
                       "t": round(duration, 2), "aspect": round(w / h, 4) if h else 1.78},
            "heatmap": {"cols": va.HEATMAP_COLS, "rows": va.HEATMAP_ROWS, "values": [round(float(v), 3) for v in heat.flatten()]},
            "keyframes": [dict(k, representative=(i == len(self.keyframes) - 1)) for i, k in enumerate(self.keyframes)],
            "insights": insights,
            "video": {"width": w, "height": h, "fps": round(TARGET_FPS, 1), "duration_sec": round(duration, 1),
                      "frames_total": self.frames, "frames_analysed": self.frames, "sample_every_n": 1, "mean_brightness": None},
            "processing_sec": round(duration, 1),
            "model": va.MODEL_NAME,
            "live": True,
        }
        label = f"Live session ({self.source_label}) {datetime.now().strftime('%d %b %H:%M')}"
        return va.register_completed_job(label, result, {"live": True})


# ---------------------------------------------------------------- singleton

_SESSION: Optional[LiveSession] = None
_SESSION_LOCK = threading.Lock()


def start(mode: str, source: str, centre_id: str, camera_id: str, on_update=None) -> LiveSession:
    global _SESSION
    with _SESSION_LOCK:
        if _SESSION and _SESSION.running:
            _SESSION.stop()
        _SESSION = LiveSession(mode, source, centre_id, camera_id, on_update)
        return _SESSION


def current() -> Optional[LiveSession]:
    return _SESSION


def push_frame(jpeg: bytes) -> LiveSession:
    s = _SESSION
    if not s or not s.running or s.mode != "push":
        raise RuntimeError("No browser-camera session is running. Start one first.")
    frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("That frame could not be decoded as an image.")
    with s.lock:  # one inference at a time even if the browser sends faster
        s.process(frame)
    return s


def stop() -> Optional[str]:
    global _SESSION
    with _SESSION_LOCK:
        if not _SESSION:
            return None
        job_id = _SESSION.stop()
        _SESSION = None
        return job_id
