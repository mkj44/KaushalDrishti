"""
Unit tests for Session Attendance Aggregator.
"""

from edge_agent.attendance import SessionAttendanceAggregator
from edge_agent.detector import DetectionResult

def test_attendance_median_and_p90():
    aggregator = SessionAttendanceAggregator(
        centre_id="TC001",
        camera_id="cam1",
        session_id="SESS_TEST"
    )

    # Simulate 5 frames with trainee counts: 10, 10, 11, 10, 9
    for cnt in [10, 10, 11, 10, 9]:
        aggregator.add_frame_observation(
            trainee_count=cnt,
            instructor_present=True,
            detections=[DetectionResult(box=[100, 100, 200, 300], confidence=0.85, class_id=0, class_name="person", track_id=1)],
            is_obstructed=False
        )

    metrics = aggregator.compute_session_headcount()
    assert metrics["count_median"] == 10
    assert metrics["count_p90"] == 11
    assert metrics["estimated_count"] == 10
    assert metrics["frames_used"] == 5

def test_overreport_flag_trigger():
    aggregator = SessionAttendanceAggregator(
        centre_id="TC001",
        camera_id="cam1",
        session_id="SESS_TEST",
        overreport_min_diff=3,
        overreport_ratio=0.15
    )

    # 5 frames with 4 trainees
    for _ in range(5):
        aggregator.add_frame_observation(
            trainee_count=4,
            instructor_present=True,
            detections=[],
            is_obstructed=False
        )

    # Submitted attendance is 25 (claimed) vs 4 estimated
    eval_res = aggregator.evaluate_compliance(submitted_count=25)
    assert len(eval_res["flags"]) == 1
    flag = eval_res["flags"][0]
    assert flag["rule"] == "ATTENDANCE_OVERREPORT"
    assert flag["severity"] == "high"
    assert "21 trainees" in flag["measured"]

def test_empty_session_flag():
    aggregator = SessionAttendanceAggregator(
        centre_id="TC001",
        camera_id="cam1",
        session_id="SESS_TEST",
        empty_session_max=2
    )

    for _ in range(5):
        aggregator.add_frame_observation(
            trainee_count=0,
            instructor_present=False,
            detections=[],
            is_obstructed=False
        )

    eval_res = aggregator.evaluate_compliance(submitted_count=20)
    assert len(eval_res["flags"]) == 1
    assert eval_res["flags"][0]["rule"] == "SESSION_EMPTY"
