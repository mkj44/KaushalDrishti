"""
Attendance estimation and discrepancy detection module for SkillSight edge agent.

Aggregates per-frame person detections over a session window:
- Computes rolling median count, 90th percentile count, and unique ByteTrack track estimate.
- Excludes instructor via configurable polygon or subtraction.
- Compares against submitted attendance CSV or API record.
- Flags:
  * ATTENDANCE_OVERREPORT: submitted - estimated > max(3, 15% of submitted)
  * ATTENDANCE_UNDERREPORT: estimated - submitted > max(3, 15% of submitted)
  * SESSION_EMPTY: estimated <= 2 during scheduled session
  * CAMERA_OFFLINE / OBSTRUCTED: low frame variance or missing frames
- Pairs each flag with confidence, rule details, and anonymized evidence thumbnails.
"""

import base64
import numpy as np
from typing import List, Dict, Any, Optional

class SessionAttendanceAggregator:
    """Aggregates frame detections and computes robust session compliance metrics."""

    def __init__(
        self,
        centre_id: str,
        camera_id: str,
        session_id: str,
        overreport_min_diff: int = 3,
        overreport_ratio: float = 0.15,
        empty_session_max: int = 2
    ):
        self.centre_id = centre_id
        self.camera_id = camera_id
        self.session_id = session_id
        self.overreport_min_diff = overreport_min_diff
        self.overreport_ratio = overreport_ratio
        self.empty_session_max = empty_session_max

        # Collected frame-level metrics
        self.frame_counts: List[int] = []
        self.confidences: List[float] = []
        self.unique_track_ids: set = set()
        self.instructor_detected_count: int = 0
        self.obstructed_frame_count: int = 0
        self.total_sampled_frames: int = 0
        self.evidence_thumbnails: List[str] = []  # Base64-encoded strings (<= 3 thumbnails)

    def add_frame_observation(
        self,
        trainee_count: int,
        instructor_present: bool,
        detections: List[Any],
        is_obstructed: bool,
        thumbnail_bytes: Optional[bytes] = None
    ):
        """Record observation from a single sampled frame."""
        self.total_sampled_frames += 1

        if is_obstructed:
            self.obstructed_frame_count += 1
            if thumbnail_bytes and len(self.evidence_thumbnails) < 3:
                self.evidence_thumbnails.append(base64.b64encode(thumbnail_bytes).decode("utf-8"))
            return

        self.frame_counts.append(trainee_count)
        if instructor_present:
            self.instructor_detected_count += 1

        # Track IDs and confidences for people in ROI
        for d in detections:
            if hasattr(d, "class_id") and d.class_id == 0 and getattr(d, "in_classroom_roi", True):
                if not getattr(d, "in_instructor_zone", False):
                    self.confidences.append(d.confidence)
                    if d.track_id is not None:
                        self.unique_track_ids.add(d.track_id)

        # Retain up to 3 evidence thumbnails across the session (e.g. beginning, middle, peak)
        if thumbnail_bytes:
            b64_str = base64.b64encode(thumbnail_bytes).decode("utf-8")
            self.latest_thumbnail = b64_str
            if len(self.evidence_thumbnails) < 3:
                self.evidence_thumbnails.append(b64_str)

    def compute_session_headcount(self) -> Dict[str, Any]:
        """Compute statistical estimates for the session."""
        if not self.frame_counts:
            return {
                "estimated_count": 0,
                "count_p90": 0,
                "count_median": 0,
                "unique_tracks": 0,
                "confidence": 0.0,
                "frames_used": 0,
                "is_obstructed": self.obstructed_frame_count > (self.total_sampled_frames * 0.5)
            }

        counts = np.array(self.frame_counts)
        median_val = int(round(float(np.median(counts))))
        p90_val = int(round(float(np.percentile(counts, 90))))
        avg_conf = float(np.mean(self.confidences)) if self.confidences else 0.75

        # Weight confidence by sample size and detector confidence
        sample_reliability = min(1.0, len(self.frame_counts) / 5.0)
        final_conf = round(avg_conf * sample_reliability, 2)

        return {
            "estimated_count": median_val,
            "count_median": median_val,
            "count_p90": p90_val,
            "unique_tracks": len(self.unique_track_ids),
            "confidence": final_conf,
            "frames_used": len(self.frame_counts),
            "is_obstructed": self.obstructed_frame_count > (self.total_sampled_frames * 0.5)
        }

    def evaluate_compliance(self, submitted_count: int) -> Dict[str, Any]:
        """
        Compare estimated headcount with submitted attendance and generate alerts.

        Returns:
            Dict containing session metrics, discrepancy, and raised flags.
        """
        metrics = self.compute_session_headcount()
        estimated = metrics["estimated_count"]
        flags = []

        # 1. Camera Obstructed / Offline Check
        if metrics["is_obstructed"] or (self.total_sampled_frames > 0 and metrics["frames_used"] == 0):
            flags.append({
                "rule": "CAMERA_OFFLINE",
                "severity": "high",
                "threshold": f"Variance < min_variance on >50% frames ({self.obstructed_frame_count}/{self.total_sampled_frames})",
                "measured": f"{self.obstructed_frame_count} obstructed frames",
                "confidence": 0.95,
                "message": f"Camera {self.camera_id} feed is obstructed, dark, or offline during scheduled session."
            })

        # 2. Empty Session Check (Room empty when session was scheduled and claimed)
        elif estimated <= self.empty_session_max and submitted_count > self.empty_session_max:
            flags.append({
                "rule": "SESSION_EMPTY",
                "severity": "high",
                "threshold": f"estimated <= {self.empty_session_max} (claimed {submitted_count})",
                "measured": f"estimated={estimated}, p90={metrics['count_p90']}",
                "confidence": metrics["confidence"],
                "message": f"Session marked as attended ({submitted_count} claimed) but classroom appears empty (estimated: {estimated})."
            })

        # 3. Attendance Over-reporting Check
        else:
            diff = submitted_count - estimated
            overreport_threshold = max(self.overreport_min_diff, int(round(self.overreport_ratio * submitted_count)))
            if diff > overreport_threshold:
                flags.append({
                    "rule": "ATTENDANCE_OVERREPORT",
                    "severity": "high",
                    "threshold": f"diff > {overreport_threshold} (submitted {submitted_count} vs estimated {estimated})",
                    "measured": f"discrepancy={diff} trainees ({round((diff / submitted_count) * 100, 1)}% overreported)",
                    "confidence": metrics["confidence"],
                    "message": f"Submitted attendance ({submitted_count}) significantly exceeds visual headcount ({estimated}). Discrepancy: {diff}."
                })
            elif estimated - submitted_count > overreport_threshold:
                flags.append({
                    "rule": "ATTENDANCE_UNDERREPORT",
                    "severity": "low",
                    "threshold": f"estimated - submitted > {overreport_threshold}",
                    "measured": f"extra={estimated - submitted_count} trainees",
                    "confidence": metrics["confidence"],
                    "message": f"Visual headcount ({estimated}) exceeds submitted attendance ({submitted_count}). Informational flag."
                })

        thumbs = list(self.evidence_thumbnails)
        if hasattr(self, "latest_thumbnail") and self.latest_thumbnail:
            if not thumbs or thumbs[-1] != self.latest_thumbnail:
                thumbs = thumbs[:2] + [self.latest_thumbnail]

        return {
            "centre_id": self.centre_id,
            "camera_id": self.camera_id,
            "session_id": self.session_id,
            "submitted_count": submitted_count,
            "estimated_count": estimated,
            "count_median": metrics["count_median"],
            "count_p90": metrics["count_p90"],
            "unique_tracks": metrics["unique_tracks"],
            "confidence": metrics["confidence"],
            "frames_used": metrics["frames_used"],
            "flags": flags,
            "thumbnails": thumbs
        }
