"""
Video capture and preprocessing module for KaushalDrishti edge agent.

Supports:
- RTSP streams and local video files.
- Adaptive frame sampling intervals (default, low-bandwidth, minimal).
- Camera health checks (low variance / obstruction detection).
- Low-light contrast enhancement via CLAHE in LAB color space.
"""

import cv2
import numpy as np
from typing import Generator, Tuple, Optional, Dict, Any

class VideoCaptureSource:
    """Manages video acquisition, sampling, and preprocessing from RTSP or file."""

    def __init__(
        self,
        source: str,
        sample_interval_sec: float = 1.0,
        enable_clahe: bool = True,
        min_variance: float = 20.0
    ):
        """
        Args:
            source: File path or RTSP URL.
            sample_interval_sec: Seconds between sampled frames.
            enable_clahe: Whether to apply CLAHE to low-light frames.
            min_variance: Minimum grayscale pixel variance for dark/obstructed check.
        """
        self.source = source
        self.sample_interval_sec = sample_interval_sec
        self.enable_clahe = enable_clahe
        self.min_variance = min_variance
        self.cap: Optional[cv2.VideoCapture] = None
        self.fps: float = 25.0
        self.total_frames: int = 0

    def open(self) -> bool:
        """Open the video stream or file (supports integer camera indices, RTSP URLs, and files)."""
        src = self.source
        if isinstance(src, str) and src.isdigit():
            src = int(src)
        self.cap = cv2.VideoCapture(src)
        if not self.cap.isOpened():
            return False
        
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.fps = fps if (fps and fps > 0 and fps < 120) else 25.0
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        return True

    def close(self):
        """Release video resources."""
        if self.cap and self.cap.isOpened():
            self.cap.release()
            self.cap = None

    def check_frame_health(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Check if frame is dark, uniform, or obstructed using variance analysis.
        
        Returns:
            Dict containing mean_brightness, variance, is_obstructed, is_low_light.
        """
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_val = float(np.mean(gray))
        variance_val = float(np.var(gray))
        
        # Laplacian variance measures edge density/sharpness
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        
        is_obstructed = variance_val < self.min_variance or laplacian_var < 5.0
        is_low_light = mean_val < 50.0

        return {
            "mean_brightness": round(mean_val, 2),
            "variance": round(variance_val, 2),
            "laplacian_var": round(laplacian_var, 2),
            "is_obstructed": is_obstructed,
            "is_low_light": is_low_light
        }

    def apply_clahe(self, frame: np.ndarray) -> np.ndarray:
        """Apply Contrast Limited Adaptive Histogram Equalization on the L-channel."""
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        cl = clahe.apply(l)
        enhanced_lab = cv2.merge((cl, a, b))
        return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    def frames(self) -> Generator[Tuple[int, float, np.ndarray, Dict[str, Any]], None, None]:
        """
        Generator yielding sampled frames.
        
        Yields:
            (frame_index, timestamp_sec, processed_frame, health_info)
        """
        if self.cap is None and not self.open():
            raise RuntimeError(f"Cannot open video source: {self.source}")

        # Compute frame step based on interval
        step = max(1, int(round(self.fps * self.sample_interval_sec)))
        frame_idx = 0

        while True:
            ret, frame = self.cap.read()
            if not ret:
                break

            if frame_idx % step == 0:
                timestamp = frame_idx / self.fps
                health = self.check_frame_health(frame)

                # Preprocess: If low-light and CLAHE enabled, enhance frame for detection
                processed = frame
                if self.enable_clahe and health["is_low_light"] and not health["is_obstructed"]:
                    processed = self.apply_clahe(frame)

                yield frame_idx, timestamp, processed, health

            frame_idx += 1

        self.close()
