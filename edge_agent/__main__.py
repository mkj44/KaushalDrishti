"""
SkillSight Edge Agent CLI Entrypoint.

Usage:
  python -m edge_agent --config configs/centre_TC001.yaml --source data/sample_videos/normal.mp4
"""

import sys
import os
import csv
import argparse
import time
import yaml
from edge_agent.capture import VideoCaptureSource
from edge_agent.detector import ObjectDetector
from edge_agent.privacy import PrivacyEngine
from edge_agent.attendance import SessionAttendanceAggregator
from edge_agent.infrastructure import InfrastructureEngine
from edge_agent.uplink import UplinkManager

def parse_args():
    parser = argparse.ArgumentParser(description="SkillSight Edge Compliance Agent")
    parser.add_argument("--config", default="configs/centre_TC001.yaml", help="Path to centre configuration YAML")
    parser.add_argument("--source", default=None, help="Video file or RTSP stream URL (overrides config)")
    parser.add_argument("--camera", default="cam1", help="Camera ID to process (default: cam1)")
    parser.add_argument("--session", default="SESS_101", help="Session ID (default: SESS_101)")
    parser.add_argument("--submitted", type=int, default=None, help="Submitted attendance count (or looked up from CSV)")
    parser.add_argument("--api", default="http://127.0.0.1:8000", help="SkillSight central API base URL")
    parser.add_argument("--mode", choices=["full", "lite", "minimal"], default="full", help="Adaptive bandwidth mode")
    parser.add_argument("--sample-interval", type=float, default=0.2, help="Sampling interval in seconds")
    parser.add_argument("--live", action="store_true", help="Continuous live camera monitoring mode")
    parser.add_argument("--max-frames", type=int, default=None, help="Maximum number of frames to process")
    parser.add_argument("--duration", type=float, default=None, help="Stop after N seconds")
    return parser.parse_args()

def main():
    args = parse_args()
    if not os.path.exists(args.config):
        print(f"Error: Config file '{args.config}' not found.")
        sys.exit(1)

    with open(args.config, "r") as f:
        config = yaml.safe_load(f)

    centre_info = config["centre"]
    centre_id = centre_info["centre_id"]
    cam_cfg = next((c for c in config.get("cameras", []) if c["id"] == args.camera), config["cameras"][0])
    video_source = args.source or cam_cfg.get("source", "data/sample_videos/normal.mp4")

    # Submitted attendance lookup
    submitted_count = args.submitted
    if submitted_count is None:
        # Check CSV for session or scenario
        csv_path = "data/submitted_attendance.csv"
        if os.path.exists(csv_path):
            with open(csv_path, "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if row.get("session_id") == args.session or row.get("scenario") in video_source:
                        submitted_count = int(row["submitted_count"])
                        break
        if submitted_count is None:
            submitted_count = 10  # Default fallback

    print("=" * 70)
    print(f"SkillSight Edge Agent: {centre_info['centre_name']} ({centre_id})")
    print(f"Camera: {cam_cfg['name']} ({cam_cfg['id']}) | Source: {video_source}")
    print(f"Session: {args.session} | Submitted Attendance: {submitted_count} | Mode: {args.mode.upper()}")
    print("=" * 70)

    # Initialize modules
    cap_source = VideoCaptureSource(video_source, sample_interval_sec=args.sample_interval, enable_clahe=True)
    if not cap_source.open():
        print(f"Fatal: Could not open video source: {video_source}")
        sys.exit(1)

    detector = ObjectDetector(model_name="yolov8n.pt", conf_threshold=0.25)
    privacy = PrivacyEngine()
    uplink = UplinkManager(api_base_url=args.api, bandwidth_mode=args.mode)
    
    aggregator = SessionAttendanceAggregator(
        centre_id=centre_id,
        camera_id=cam_cfg["id"],
        session_id=args.session,
        overreport_min_diff=config["thresholds"]["overreport_min_diff"],
        overreport_ratio=config["thresholds"]["overreport_ratio"],
        empty_session_max=config["thresholds"]["empty_session_max"]
    )

    infra_engine = InfrastructureEngine(
        inventory_config=config.get("inventory", []),
        persistence_k=config["sampling"].get("persistence_k_consecutive", 3),
        ssim_threshold=config["thresholds"].get("ssim_similarity_min", 0.70)
    )

    classroom_roi = cam_cfg.get("classroom_roi")
    instructor_zone = cam_cfg.get("instructor_zone")
    exclude_instructor = cam_cfg.get("exclude_instructor", True)

    frame_idx = 0
    infra_alerts = []
    start_time = time.time()

    print(f"\n[SkillSight Edge] Beginning capture loop on '{video_source}'...")
    if args.live:
        print("[LIVE MODE ACTIVATED] Streaming periodic compliance events to dashboard every 5 sampled frames.")

    for f_idx, timestamp, frame, health in cap_source.frames():
        frame_idx += 1
        h, w = frame.shape[:2]

        # Auto-scale ROI if live webcam resolution differs from config (e.g. 640x480 webcam)
        active_roi = classroom_roi
        if active_roi and (w != 1280 or h != 720):
            scale_x = w / 1280.0
            scale_y = h / 720.0
            active_roi = [[int(pt[0] * scale_x), int(pt[1] * scale_y)] for pt in classroom_roi]

        if health["is_obstructed"]:
            anon_frame = privacy.anonymize_frame(frame)
            thumb = privacy.create_evidence_thumbnail(anon_frame)
            aggregator.add_frame_observation(0, False, [], is_obstructed=True, thumbnail_bytes=thumb)
            print(f"  [FRAME {frame_idx:03d}] CAMERA OBSTRUCTED / DARK (Variance: {health['variance']})")
            continue

        res = detector.detect(
            frame=frame,
            classroom_roi=active_roi,
            instructor_zone=instructor_zone,
            exclude_instructor=exclude_instructor,
            target_classes=[0, 13, 56, 60]
        )

        # Anonymize frame on edge
        person_boxes = [d.box for d in res["detections"] if d.class_id == 0]
        anon_frame = privacy.anonymize_frame(frame, person_boxes=person_boxes)
        thumb = privacy.create_evidence_thumbnail(anon_frame)

        aggregator.add_frame_observation(
            trainee_count=res["trainees_count"],
            instructor_present=res["instructor_detected"],
            detections=res["detections"],
            is_obstructed=False,
            thumbnail_bytes=thumb
        )

        # Evaluate infrastructure presence & operability
        curr_alerts = infra_engine.evaluate_frame(
            frame=frame,
            camera_id=cam_cfg["id"],
            detected_objects=res["detections"]
        )
        if curr_alerts:
            for a in curr_alerts:
                if (a["rule"], a["item_id"]) not in [(x["rule"], x["item_id"]) for x in infra_alerts]:
                    infra_alerts.append(a)

        # Real-time console log
        print(f"  [FRAME {frame_idx:03d}] People in ROI: {res['total_persons_in_roi']} | Trainees: {res['trainees_count']} | Instructor: {'YES' if res['instructor_detected'] else 'NO'} | Privacy Blurred: YES")

        # In live mode, emit periodic update to dashboard every 5 frames
        if args.live and frame_idx % 5 == 0:
            interim_eval = aggregator.evaluate_compliance(submitted_count=submitted_count)
            uplink.send_event({
                "centre_id": centre_id,
                "centre_name": centre_info["centre_name"],
                "camera_id": cam_cfg["id"],
                "session_id": args.session,
                "submitted_count": submitted_count,
                "estimated_count": interim_eval["estimated_count"],
                "count_median": interim_eval["count_median"],
                "count_p90": interim_eval["count_p90"],
                "unique_tracks": interim_eval["unique_tracks"],
                "confidence": interim_eval["confidence"],
                "frames_used": interim_eval["frames_used"],
                "flags": interim_eval["flags"] + infra_alerts,
                "thumbnails": interim_eval["thumbnails"]
            })
            print(f"  >>> [LIVE UPLINK] Sent real-time compliance update to dashboard ({interim_eval['estimated_count']} trainees detected)")

        # Check stopping criteria
        if args.max_frames and frame_idx >= args.max_frames:
            print(f"[LIVE MODE] Reached maximum requested frames ({args.max_frames}). Stopping capture.")
            break
        if args.duration and (time.time() - start_time) >= args.duration:
            print(f"[LIVE MODE] Reached duration limit ({args.duration}s). Stopping capture.")
            break

    # Compile session attendance evaluation
    eval_res = aggregator.evaluate_compliance(submitted_count=submitted_count)
    all_flags = eval_res["flags"] + infra_alerts

    # Construct uplink payload
    payload = {
        "centre_id": centre_id,
        "centre_name": centre_info["centre_name"],
        "camera_id": cam_cfg["id"],
        "session_id": args.session,
        "submitted_count": submitted_count,
        "estimated_count": eval_res["estimated_count"],
        "count_median": eval_res["count_median"],
        "count_p90": eval_res["count_p90"],
        "unique_tracks": eval_res["unique_tracks"],
        "confidence": eval_res["confidence"],
        "frames_used": eval_res["frames_used"],
        "flags": all_flags,
        "thumbnails": eval_res["thumbnails"]
    }

    # Transmit to API (or queue offline)
    status_res = uplink.send_event(payload)

    print("\n" + "-" * 70)
    print("SESSION SUMMARY & UPLINK STATUS:")
    print(f"  Frames Analyzed    : {frame_idx}")
    print(f"  Visual Headcount   : {eval_res['estimated_count']} (P90: {eval_res['count_p90']}, Median: {eval_res['count_median']})")
    print(f"  Submitted Count    : {submitted_count}")
    print(f"  Discrepancy Flags  : {len(all_flags)}")
    for fl in all_flags:
        print(f"    * [{fl['rule']}] (Severity: {fl['severity']}) -> {fl['message']}")
    print(f"  Uplink Transmission: {status_res.get('status')} (Mode: {args.mode.upper()})")
    if "sms_fallback" in status_res:
        print(f"  Offline SMS Stub   : {status_res['sms_fallback']}")
    print("=" * 70)

if __name__ == "__main__":
    main()
