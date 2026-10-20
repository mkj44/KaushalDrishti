"""
YOLOv8 & ByteTrack object detection and tracking module for KaushalDrishti edge agent.

Provides:
- Person and object detection using Ultralytics YOLOv8.
- ByteTrack integration for temporal consistency and session de-duplication.
- Configurable classroom ROI polygon inclusion.
- Instructor zone exclusion.
"""

from typing import List, Dict, Any, Optional, Tuple
import cv2
import numpy as np
from ultralytics import YOLO

class DetectionResult:
    """Represents a single detected and tracked object."""
    def __init__(
        self,
        box: List[int],
        confidence: float,
        class_id: int,
        class_name: str,
        track_id: Optional[int] = None,
        in_classroom_roi: bool = True,
        in_instructor_zone: bool = False
    ):
        self.box = box  # [x1, y1, x2, y2]
        self.confidence = confidence
        self.class_id = class_id
        self.class_name = class_name
        self.track_id = track_id
        self.in_classroom_roi = in_classroom_roi
        self.in_instructor_zone = in_instructor_zone

    @property
    def center(self) -> Tuple[int, int]:
        return (int((self.box[0] + self.box[2]) / 2), int((self.box[1] + self.box[3]) / 2))

    @property
    def bottom_center(self) -> Tuple[int, int]:
        """Feet/base coordinate of the person, ideal for ground-plane ROI testing."""
        return (int((self.box[0] + self.box[2]) / 2), int(self.box[3]))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "box": self.box,
            "confidence": round(self.confidence, 3),
            "class_id": self.class_id,
            "class_name": self.class_name,
            "track_id": self.track_id,
            "in_classroom_roi": self.in_classroom_roi,
            "in_instructor_zone": self.in_instructor_zone
        }

class ObjectDetector:
    """YOLOv8 detector with ByteTrack tracking and polygon ROI filtering."""

    def __init__(
        self,
        model_name: str = "yolov8n.pt",
        conf_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        use_tracking: bool = True
    ):
        self.model = YOLO(model_name)
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.use_tracking = use_tracking

    @staticmethod
    def point_in_polygon(point: Tuple[int, int], polygon: List[List[int]]) -> bool:
        """Check if a 2D point lies inside or on the boundary of a polygon."""
        if not polygon or len(polygon) < 3:
            return True
        pts = np.array(polygon, dtype=np.int32)
        # cv2.pointPolygonTest returns positive if inside, 0 if on edge, negative if outside
        dist = cv2.pointPolygonTest(pts, (float(point[0]), float(point[1])), measureDist=False)
        return dist >= 0

    def detect(
        self,
        frame: np.ndarray,
        classroom_roi: Optional[List[List[int]]] = None,
        instructor_zone: Optional[List[List[int]]] = None,
        exclude_instructor: bool = True,
        target_classes: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """
        Execute detection / tracking on a single frame.

        Args:
            frame: BGR image.
            classroom_roi: Polygon [[x, y], ...] defining classroom boundary.
            instructor_zone: Polygon [[x, y], ...] defining instructor podium.
            exclude_instructor: Whether to separate instructor from trainee count.
            target_classes: List of COCO class IDs (default: person=0, chair=56, bench=13, table=60).

        Returns:
            Dict containing:
                - trainees_count: Headcount of trainees in ROI
                - instructor_detected: bool
                - total_persons_in_roi: Total people in ROI (including instructor)
                - detections: List[DetectionResult]
                - unique_tracks_in_frame: Set of track IDs in this frame
        """
        if target_classes is None:
            # 0: person, 13: bench, 56: chair, 60: dining table (used for workbenches)
            target_classes = [0, 13, 56, 60]

        # Run ByteTrack or standard YOLO inference
        if self.use_tracking:
            results = self.model.track(
                source=frame,
                conf=self.conf_threshold,
                iou=self.iou_threshold,
                persist=True,
                tracker="bytetrack.yaml",
                classes=target_classes,
                verbose=False
            )[0]
        else:
            results = self.model.predict(
                source=frame,
                conf=self.conf_threshold,
                iou=self.iou_threshold,
                classes=target_classes,
                verbose=False
            )[0]

        all_detections: List[DetectionResult] = []
        trainees_count = 0
        instructor_detected = False
        persons_in_roi = 0

        boxes = results.boxes
        if boxes is not None and len(boxes) > 0:
            for i, box in enumerate(boxes):
                coords = [int(v) for v in box.xyxy[0].tolist()]
                conf = float(box.conf[0])
                cls_id = int(box.cls[0])
                cls_name = self.model.names[cls_id]
                track_id = int(box.id[0]) if box.id is not None else None

                # Calculate representative reference point for ROI check
                # For a person, use either base feet or center point
                pt_center = (int((coords[0] + coords[2]) / 2), int((coords[1] + coords[3]) / 2))
                pt_base = (int((coords[0] + coords[2]) / 2), int(coords[3] * 0.95))

                in_roi = True
                if classroom_roi and len(classroom_roi) >= 3:
                    in_roi = self.point_in_polygon(pt_base, classroom_roi) or self.point_in_polygon(pt_center, classroom_roi)

                in_instructor = False
                if cls_id == 0 and instructor_zone and len(instructor_zone) >= 3:
                    in_instructor = self.point_in_polygon(pt_center, instructor_zone) or self.point_in_polygon(pt_base, instructor_zone)

                det = DetectionResult(
                    box=coords,
                    confidence=conf,
                    class_id=cls_id,
                    class_name=cls_name,
                    track_id=track_id,
                    in_classroom_roi=in_roi,
                    in_instructor_zone=in_instructor
                )
                all_detections.append(det)

                # Count statistics for people
                if cls_id == 0 and in_roi:
                    persons_in_roi += 1
                    if in_instructor:
                        instructor_detected = True
                    else:
                        trainees_count += 1

        # Fallback if no instructor zone defined but exclude_instructor is requested:
        # Subtract 1 if persons_in_roi > 0 and exclude_instructor is True
        if exclude_instructor and (not instructor_zone or len(instructor_zone) < 3):
            if persons_in_roi > 0:
                instructor_detected = True
                trainees_count = max(0, persons_in_roi - 1)

        return {
            "trainees_count": trainees_count,
            "instructor_detected": instructor_detected,
            "total_persons_in_roi": persons_in_roi,
            "detections": all_detections
        }
