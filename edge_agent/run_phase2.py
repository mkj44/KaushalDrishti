"""
Phase 2 verification script: Session Attendance Estimation, Face Blurring, and Compliance Alert Generation.
"""

import os
import csv
import json
import yaml
from edge_agent.capture import VideoCaptureSource
from edge_agent.detector import ObjectDetector
from edge_agent.privacy import PrivacyEngine
from edge_agent.attendance import SessionAttendanceAggregator

def run_phase2():
    print("=" * 75)
    print("SkillSight Phase 2: Session Attendance, Privacy Blur & Alert Generation")
    print("=" * 75)

    with open("configs/centre_TC001.yaml", "r") as f:
        config = yaml.safe_load(f)

    cam_cfg = config["cameras"][0]
    classroom_roi = cam_cfg.get("classroom_roi")
    instructor_zone = cam_cfg.get("instructor_zone")
    exclude_instructor = cam_cfg.get("exclude_instructor", True)

    # Load submitted attendance mapping
    submitted_map = {}
    with open("data/submitted_attendance.csv", "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            submitted_map[row["scenario"]] = int(row["submitted_count"])

    scenarios = [
        ("normal", "data/sample_videos/normal.mp4", "SESS_NORMAL"),
        ("overreported", "data/sample_videos/overreported.mp4", "SESS_OVERREPORT"),
        ("empty_session", "data/sample_videos/empty_session.mp4", "SESS_EMPTY"),
        ("low_light", "data/sample_videos/low_light.mp4", "SESS_LOW_LIGHT"),
        ("camera_obstructed", "data/sample_videos/camera_obstructed.mp4", "SESS_OBSTRUCTED"),
    ]

    detector = ObjectDetector(model_name="yolov8n.pt", conf_threshold=0.25)
    privacy = PrivacyEngine()

    all_results = []
    face_leak_detected = False

    for scenario_name, video_path, sess_id in scenarios:
        submitted_val = submitted_map.get(scenario_name, 15)
        print(f"\nProcessing Scenario: [{scenario_name.upper()}] (Video: {video_path}, Submitted: {submitted_val})")
        
        cap_source = VideoCaptureSource(video_path, sample_interval_sec=0.2, enable_clahe=True)
        if not cap_source.open():
            print(f"Error opening {video_path}")
            continue

        aggregator = SessionAttendanceAggregator(
            centre_id="TC001",
            camera_id="cam1",
            session_id=sess_id,
            overreport_min_diff=config["thresholds"]["overreport_min_diff"],
            overreport_ratio=config["thresholds"]["overreport_ratio"],
            empty_session_max=config["thresholds"]["empty_session_max"]
        )

        for frame_idx, timestamp, frame, health in cap_source.frames():
            if health["is_obstructed"]:
                # Still anonymize frame even if dark/obstructed before creating thumbnail
                anon_frame = privacy.anonymize_frame(frame)
                thumb_bytes = privacy.create_evidence_thumbnail(anon_frame)
                aggregator.add_frame_observation(0, False, [], is_obstructed=True, thumbnail_bytes=thumb_bytes)
                continue

            res = detector.detect(
                frame=frame,
                classroom_roi=classroom_roi,
                instructor_zone=instructor_zone,
                exclude_instructor=exclude_instructor,
                target_classes=[0]
            )

            # Extract person boxes for edge privacy anonymization
            person_boxes = [d.box for d in res["detections"]]
            anonymized_frame = privacy.anonymize_frame(frame, person_boxes=person_boxes)
            
            # Generate WebP thumbnail (<= 20 KB)
            thumb_bytes = privacy.create_evidence_thumbnail(anonymized_frame)

            # Automated compliance verification: zero unblurred faces
            if not privacy.verify_zero_unblurred_faces(thumb_bytes):
                face_leak_detected = True
                print(f"  [PRIVACY ALERT] Face detection found in thumbnail at frame {frame_idx}!")

            aggregator.add_frame_observation(
                trainee_count=res["trainees_count"],
                instructor_present=res["instructor_detected"],
                detections=res["detections"],
                is_obstructed=False,
                thumbnail_bytes=thumb_bytes
            )

        # Evaluate compliance against submitted attendance
        eval_result = aggregator.evaluate_compliance(submitted_count=submitted_val)
        all_results.append(eval_result)

        print(f"  Estimated Count: {eval_result['estimated_count']} (Median: {eval_result['count_median']}, P90: {eval_result['count_p90']})")
        print(f"  Confidence: {eval_result['confidence']} | Frames: {eval_result['frames_used']} | Thumbnails: {len(eval_result['thumbnails'])}")
        if eval_result["flags"]:
            for fl in eval_result["flags"]:
                print(f"  --> ALERT RAISED: [{fl['rule']}] (Severity: {fl['severity']}, Conf: {fl['confidence']})")
                print(f"      Threshold: {fl['threshold']}")
                print(f"      Measured : {fl['measured']}")
                print(f"      Message  : {fl['message']}")
        else:
            print("  --> NO ALERTS: Session is fully compliant.")

    print("\n" + "=" * 75)
    print("PHASE 2 SUMMARY & VERIFICATION:")
    print(f"  Scenarios Tested: {len(scenarios)}")
    print(f"  Face Privacy Test: {'PASSED (Zero unblurred faces found)' if not face_leak_detected else 'FAILED (Face detected!)'}")
    
    # Save output alerts JSON
    output_path = "data/annotations/phase2_alerts.json"
    with open(output_path, "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"  Output Alerts Saved: {output_path}")
    print("=" * 75)

if __name__ == "__main__":
    run_phase2()
