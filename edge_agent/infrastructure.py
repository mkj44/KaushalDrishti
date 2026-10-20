"""
Infrastructure compliance, zone inventory tracking, and apparent operability heuristics for SkillSight.

Capabilities:
1. Zone-based presence checks:
   - Countable items (chairs, workbenches): counts objects inside configured polygon.
   - Fixed equipment / structural verification: SSIM (Structural Similarity Index) comparison against baseline snapshots.
2. Apparent operability heuristics (strictly labeled as 'apparent'):
   - `activity`: presence of person in machine zone + pixel motion (frame differencing).
   - `indicator_light`: color/luminance analysis in sub-ROI (e.g. green power LED vs red/off).
   - `unused_for_N_sessions`: consecutive inactivity triggers `EQUIPMENT_POSSIBLY_NONFUNCTIONAL`.
3. Persistence filter:
   - Condition must hold across >= K consecutive observations before firing an alert.
"""

import os
from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim

class InfrastructureEngine:
    """Monitors sanctioned inventory presence and apparent operability."""

    def __init__(
        self,
        inventory_config: List[Dict[str, Any]],
        persistence_k: int = 3,
        ssim_threshold: float = 0.70,
        motion_threshold: float = 12.0
    ):
        """
        Args:
            inventory_config: List of sanctioned item dicts from centre YAML.
            persistence_k: Number of consecutive checks a shortfall must persist before alerting.
            ssim_threshold: Minimum SSIM similarity with baseline before flagging ZONE_CHANGED/ITEM_MISSING.
            motion_threshold: Average pixel delta to qualify as physical motion.
        """
        self.inventory_config = inventory_config
        self.persistence_k = persistence_k
        self.ssim_threshold = ssim_threshold
        self.motion_threshold = motion_threshold

        # Load baseline images into memory
        self.baselines: Dict[str, Optional[np.ndarray]] = {}
        for item in inventory_config:
            item_id = item["id"]
            base_path = item.get("baseline_image")
            if base_path and os.path.exists(base_path):
                base_img = cv2.imread(base_path)
                self.baselines[item_id] = base_img
            else:
                self.baselines[item_id] = None

        # State tracking for persistence rule: {item_id: consecutive_fail_count}
        self.fail_counters: Dict[str, int] = {item["id"]: 0 for item in inventory_config}
        # Inactivity session counters: {item_id: consecutive_inactive_sessions}
        self.inactivity_counters: Dict[str, int] = {item["id"]: 0 for item in inventory_config}

        # Cache of previous frame for frame differencing
        self.prev_frame_gray: Optional[np.ndarray] = None

    @staticmethod
    def get_zone_bounding_box(zone_polygon: List[List[int]], img_shape: Tuple[int, int]) -> Tuple[int, int, int, int]:
        """Convert polygon vertices to bounding box [x1, y1, x2, y2] clamped to image dimensions."""
        pts = np.array(zone_polygon, dtype=np.int32)
        x1 = max(0, int(np.min(pts[:, 0])))
        y1 = max(0, int(np.min(pts[:, 1])))
        x2 = min(img_shape[1], int(np.max(pts[:, 0])))
        y2 = min(img_shape[0], int(np.max(pts[:, 1])))
        return x1, y1, x2, y2

    def check_indicator_light(self, frame: np.ndarray, sub_roi: List[List[int]]) -> Dict[str, Any]:
        """
        Check status of power/status indicator light in sub-ROI.
        Returns whether green/active LED is detected.
        """
        if not sub_roi or len(sub_roi) < 2:
            return {"active": False, "color": "unknown", "luminance": 0.0}

        pts = np.array(sub_roi, dtype=np.int32)
        x1 = max(0, int(np.min(pts[:, 0])))
        y1 = max(0, int(np.min(pts[:, 1])))
        x2 = min(frame.shape[1], int(np.max(pts[:, 0])))
        y2 = min(frame.shape[0], int(np.max(pts[:, 1])))

        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return {"active": False, "color": "empty", "luminance": 0.0}

        # Analyze in HSV
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        # Green mask (operational LED): H: 35-85, S: 70-255, V: 70-255
        lower_green = np.array([35, 70, 70])
        upper_green = np.array([85, 255, 255])
        green_mask = cv2.inRange(hsv, lower_green, upper_green)
        green_ratio = float(np.count_nonzero(green_mask)) / (crop.shape[0] * crop.shape[1])

        # Red mask (error/standby/off): H: 0-10 or 170-180
        lower_red1 = np.array([0, 70, 70])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([170, 70, 70])
        upper_red2 = np.array([180, 255, 255])
        red_mask = cv2.inRange(hsv, lower_red1, upper_red1) | cv2.inRange(hsv, lower_red2, upper_red2)
        red_ratio = float(np.count_nonzero(red_mask)) / (crop.shape[0] * crop.shape[1])

        is_green = green_ratio > 0.08
        return {
            "active": is_green,
            "green_ratio": round(green_ratio, 3),
            "red_ratio": round(red_ratio, 3),
            "dominant_color": "green" if is_green else ("red" if red_ratio > 0.08 else "dark")
        }

    def compute_zone_motion(self, current_frame_gray: np.ndarray, zone_bbox: Tuple[int, int, int, int]) -> float:
        """Calculate average pixel motion within zone using frame differencing."""
        if self.prev_frame_gray is None:
            return 0.0
        x1, y1, x2, y2 = zone_bbox
        curr_crop = current_frame_gray[y1:y2, x1:x2]
        prev_crop = self.prev_frame_gray[y1:y2, x1:x2]
        if curr_crop.shape != prev_crop.shape or curr_crop.size == 0:
            return 0.0
        diff = cv2.absdiff(curr_crop, prev_crop)
        return float(np.mean(diff))

    def compute_ssim_similarity(self, current_crop: np.ndarray, baseline_img: np.ndarray) -> float:
        """Compute Structural Similarity Index (SSIM) between current zone crop and baseline."""
        if current_crop.size == 0 or baseline_img.size == 0:
            return 0.0
        # Resize current crop to baseline size if dimensions differ slightly
        if current_crop.shape != baseline_img.shape:
            current_crop = cv2.resize(current_crop, (baseline_img.shape[1], baseline_img.shape[0]))

        gray_curr = cv2.cvtColor(current_crop, cv2.COLOR_BGR2GRAY)
        gray_base = cv2.cvtColor(baseline_img, cv2.COLOR_BGR2GRAY)
        score, _ = ssim(gray_curr, gray_base, full=True)
        return float(score)

    def evaluate_frame(
        self,
        frame: np.ndarray,
        camera_id: str,
        detected_objects: List[Any],
        persons_in_zones: Optional[Dict[str, int]] = None
    ) -> List[Dict[str, Any]]:
        """
        Evaluate all inventory items for a camera in the current frame.
        Applies persistence check before raising an alert.

        Returns:
            List of generated alerts (if persistence threshold K is reached).
        """
        h, w = frame.shape[:2]
        frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        alerts: List[Dict[str, Any]] = []

        relevant_items = [it for it in self.inventory_config if it.get("camera") == camera_id]

        for item in relevant_items:
            item_id = item["id"]
            item_type = item["type"]
            zone_poly = item["zone"]
            x1, y1, x2, y2 = self.get_zone_bounding_box(zone_poly, (h, w))
            current_crop = frame[y1:y2, x1:x2]

            issue_detected = False
            issue_rule = ""
            issue_msg = ""
            issue_severity = "medium"
            issue_threshold = ""
            issue_measured = ""
            confidence = 0.85

            # 1. Fixed Machinery & Operability Check
            if item_type == "machine":
                operability_modes = item.get("operability", [])
                
                # Baseline SSIM check for physical presence
                baseline = self.baselines.get(item_id)
                ssim_score = 1.0
                if baseline is not None:
                    ssim_score = self.compute_ssim_similarity(current_crop, baseline)
                    if ssim_score < self.ssim_threshold:
                        issue_detected = True
                        issue_rule = "ITEM_MISSING"
                        issue_severity = "high"
                        issue_threshold = f"SSIM < {self.ssim_threshold}"
                        issue_measured = f"SSIM={round(ssim_score, 2)}"
                        issue_msg = f"Sanctioned machine {item['name']} ({item_id}) appears missing or altered from zone."

                # Operability check (activity + indicator light)
                if not issue_detected:
                    motion_val = self.compute_zone_motion(frame_gray, (x1, y1, x2, y2))
                    indicator_res = self.check_indicator_light(frame, item.get("indicator_sub_roi", []))
                    
                    person_near = False
                    if persons_in_zones and persons_in_zones.get(item_id, 0) > 0:
                        person_near = True

                    # Apparent operability heuristic
                    apparent_active = person_near and (motion_val > self.motion_threshold or indicator_res["active"])
                    if not apparent_active and not indicator_res["active"] and motion_val < 3.0:
                        self.inactivity_counters[item_id] += 1
                    else:
                        self.inactivity_counters[item_id] = 0

                    if self.inactivity_counters[item_id] >= self.persistence_k:
                        issue_detected = True
                        issue_rule = "EQUIPMENT_POSSIBLY_NONFUNCTIONAL"
                        issue_severity = "medium"
                        issue_threshold = f"Inactivity across >= {self.persistence_k} consecutive checks"
                        issue_measured = f"Motion={round(motion_val, 1)}, Indicator={indicator_res['dominant_color']}, PersonNear={'Yes' if person_near else 'No'}"
                        issue_msg = f"Apparent operability check: Equipment {item['name']} ({item_id}) appears idle/non-functional (no operator activity or active indicator observed)."

            # 2. Countable Workbench / Seating Inventory Check
            elif item.get("countable", False):
                expected = item.get("expected_count", 1)
                # Count matching objects or people occupying this zone
                zone_objects_count = 0
                for obj in detected_objects:
                    bx1, by1, bx2, by2 = obj.box
                    cx = (bx1 + bx2) // 2
                    cy = (by1 + by2) // 2
                    if x1 <= cx <= x2 and y1 <= cy <= y2:
                        zone_objects_count += 1

                # Baseline comparison for physical presence of workbench / furniture
                baseline = self.baselines.get(item_id)
                ssim_score = 1.0
                mean_diff = 0.0
                if baseline is not None:
                    ssim_score = self.compute_ssim_similarity(current_crop, baseline)
                    diff = cv2.absdiff(current_crop, cv2.resize(baseline, (current_crop.shape[1], current_crop.shape[0])))
                    mean_diff = float(np.mean(diff))

                # If zone is completely empty of people/objects and differs from baseline workbench
                if zone_objects_count == 0:
                    if mean_diff > 35.0 or ssim_score < 0.80:
                        issue_detected = True
                        issue_rule = "ITEM_MISSING"
                        issue_severity = "high"
                        issue_threshold = f"zone empty & baseline pixel delta > 35.0 (or SSIM < 0.80)"
                        issue_measured = f"mean_diff={round(mean_diff, 1)}, SSIM={round(ssim_score, 2)}, count={zone_objects_count}"
                        issue_msg = f"Sanctioned inventory {item['name']} ({item_id}) appears missing from designated zone."
                    elif expected > 0:
                        issue_detected = True
                        issue_rule = "COUNT_SHORTFALL"
                        issue_severity = "medium"
                        issue_threshold = f"count < expected ({expected})"
                        issue_measured = f"detected={zone_objects_count}"
                        issue_msg = f"Observed capacity ({zone_objects_count}) is below sanctioned capacity ({expected}) for {item['name']}."

                elif zone_objects_count < (expected // 2):
                    issue_detected = True
                    issue_rule = "COUNT_SHORTFALL"
                    issue_severity = "low"
                    issue_threshold = f"count < {expected // 2}"
                    issue_measured = f"detected={zone_objects_count}"
                    issue_msg = f"Zone {item['name']} capacity shortfall: {zone_objects_count} observed vs {expected} expected."

            # Apply Persistence Rule: Condition must hold for >= K consecutive checks
            if issue_detected:
                self.fail_counters[item_id] += 1
                if self.fail_counters[item_id] >= self.persistence_k:
                    alerts.append({
                        "rule": issue_rule,
                        "item_id": item_id,
                        "item_name": item["name"],
                        "camera_id": camera_id,
                        "severity": issue_severity,
                        "threshold": issue_threshold,
                        "measured": issue_measured,
                        "confidence": confidence,
                        "consecutive_fails": self.fail_counters[item_id],
                        "message": issue_msg
                    })
            else:
                # Reset failure counter on recovery/clean observation
                self.fail_counters[item_id] = 0

        self.prev_frame_gray = frame_gray
        return alerts
