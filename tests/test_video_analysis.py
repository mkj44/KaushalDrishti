"""Tests for the upload-a-video analysis helpers and API validation."""

import os
import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from api import video_analysis as va


def test_overlap_ratio_full_and_none():
    assert va._overlap_ratio([0, 0, 10, 10], [0, 0, 20, 20]) == pytest.approx(1.0)
    assert va._overlap_ratio([0, 0, 10, 10], [20, 20, 30, 30]) == 0.0
    assert va._overlap_ratio([0, 0, 10, 10], [5, 0, 15, 10]) == pytest.approx(0.5)


def test_percentile_handles_empty():
    assert va._percentile([], 90) == 0
    assert va._percentile([1, 2, 3, 4, 10], 50) == 3


def test_jpeg_encoding_downscales():
    frame = np.full((720, 1280, 3), 128, dtype=np.uint8)
    b64 = va._encode_jpeg_b64(frame, width=320)
    import base64
    img = cv2.imdecode(np.frombuffer(base64.b64decode(b64), np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[1] == 320


def test_upload_rejects_non_video():
    from api.main import app
    client = TestClient(app)
    res = client.post("/api/v1/analyze/video", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert res.status_code == 415


def test_attach_requires_finished_job():
    from api.main import app
    client = TestClient(app)
    res = client.post("/api/v1/analyze/jobs/doesnotexist/attach", json={"submitted_count": 10})
    assert res.status_code == 409


@pytest.mark.skipif(not os.path.exists("data/sample_videos/normal.mp4"), reason="run data/generate_sample_data.py first")
def test_end_to_end_on_sample_clip():
    result = va.analyze_video("data/sample_videos/normal.mp4")
    s = result["summary"]
    assert s["people_peak"] >= s["people_median"] > 0
    assert result["keyframes"] and all(k["image"] for k in result["keyframes"])
    assert len(result["heatmap"]["values"]) == va.HEATMAP_COLS * va.HEATMAP_ROWS
    assert result["layout"]["items"]
