"""Tests for real-time camera sessions."""

import os
import time
import cv2
import pytest
from fastapi.testclient import TestClient

from api import live


def test_resolve_source_rejects_paths():
    with pytest.raises(ValueError):
        live.resolve_source("/etc/passwd")
    with pytest.raises(ValueError):
        live.resolve_source("../api/main.py")
    assert live.resolve_source("0") == (0, True)
    assert live.resolve_source("rtsp://10.0.0.5/stream")[1] is True


def test_frame_without_session_is_rejected():
    from api.main import app
    live.stop()
    res = TestClient(app).post("/api/v1/live/frame", content=b"x", headers={"Content-Type": "image/jpeg"})
    assert res.status_code == 409


SAMPLE = "data/sample_videos/normal.mp4"


@pytest.mark.skipif(not os.path.exists(SAMPLE), reason="run data/generate_sample_data.py first")
def test_push_session_counts_and_stops_into_job():
    from api import video_analysis as va
    live.start("push", "test", "TC001", "live")
    cap = cv2.VideoCapture(SAMPLE)
    for _ in range(4):
        ok, frame = cap.read()
        live.push_frame(cv2.imencode(".jpg", frame)[1].tobytes())
    snap = live.current().snapshot()
    assert snap["frames"] == 4 and snap["people_now"] > 0 and snap["frame"]
    assert all(i["category"] for i in snap["layout"]["items"])
    job_id = live.stop()
    job = va.get_job(job_id)
    assert job["status"] == "completed" and job["result"]["summary"]["people_peak"] > 0


@pytest.mark.skipif(not os.path.exists(SAMPLE), reason="run data/generate_sample_data.py first")
def test_server_session_plays_sample_as_live():
    live.start("server", "normal.mp4", "TC001", "live")
    deadline = time.time() + 30
    while time.time() < deadline and live.current().frames < 2:
        time.sleep(0.2)
    assert live.current().frames >= 2
    assert live.stop()
