"""
Phase 1 verification script: Run YOLO person counting on video with ROI polygon filtering.
"""

import sys
import time
import yaml
from edge_agent.capture import VideoCaptureSource
from edge_agent.detector import ObjectDetector

def run_phase1(config_path: str = "configs/centre_TC001.yaml", video_path: str = "data/sample_videos/normal.mp4"):
    print("=" * 65)
    print("SkillSight Phase 1: YOLOv8 Person Counting with Classroom ROI")
    print("=" * 65)

    with open(config_path, "r") as f:
        config = yaml.safe_load(f)

    cam_cfg = config["cameras"][0]
    classroom_roi = cam_cfg.get("classroom_roi")
    instructor_zone = cam_cfg.get("instructor_zone")
    exclude_instructor = cam_cfg.get("exclude_instructor", True)

    print(f"Centre: {config['centre']['centre_name']} ({config['centre']['centre_id']})")
    print(f"Camera: {cam_cfg['name']} ({cam_cfg['id']})")
    print(f"Source: {video_path}")
    print(f"Classroom ROI Polygon: {classroom_roi}")
    print(f"Instructor Zone Polygon: {instructor_zone}")
    print(f"Exclude Instructor: {exclude_instructor}")
    print("-" * 65)

    cap_source = VideoCaptureSource(video_path, sample_interval_sec=0.2, enable_clahe=True)
    if not cap_source.open():
        print(f"Failed to open video source: {video_path}")
        sys.exit(1)

    print(f"Video opened: {cap_source.total_frames} frames @ {cap_source.fps:.1f} fps")
    detector = ObjectDetector(model_name="yolov8n.pt", conf_threshold=0.25, use_tracking=True)
    print("YOLOv8n detector initialized with ByteTrack tracker.")
    print("-" * 65)
    print(f"{'Frame':<8} {'Time (s)':<10} {'ROI Total':<12} {'Instructor':<12} {'Trainees':<10} {'Avg Conf':<10}")
    print("-" * 65)

    counts = []
    t_start = time.time()
    frames_processed = 0

    for frame_idx, timestamp, frame, health in cap_source.frames():
        res = detector.detect(
            frame=frame,
            classroom_roi=classroom_roi,
            instructor_zone=instructor_zone,
            exclude_instructor=exclude_instructor,
            target_classes=[0]  # Persons
        )

        trainees = res["trainees_count"]
        inst_found = "YES" if res["instructor_detected"] else "NO"
        total_roi = res["total_persons_in_roi"]

        confs = [d.confidence for d in res["detections"] if d.in_classroom_roi]
        avg_conf = sum(confs) / len(confs) if confs else 0.0

        counts.append(trainees)
        frames_processed += 1

        print(f"{frame_idx:<8} {timestamp:<10.2f} {total_roi:<12} {inst_found:<12} {trainees:<10} {avg_conf:<10.2f}")

    elapsed = time.time() - t_start
    fps = frames_processed / elapsed if elapsed > 0 else 0

    print("-" * 65)
    print("PHASE 1 SUMMARY:")
    print(f"  Processed Frames : {frames_processed}")
    print(f"  Processing Time  : {elapsed:.2f} s ({fps:.1f} frames/sec)")
    print(f"  Min Trainee Count: {min(counts) if counts else 0}")
    print(f"  Max Trainee Count: {max(counts) if counts else 0}")
    print(f"  Median Trainees  : {int(sorted(counts)[len(counts)//2]) if counts else 0}")
    print("=" * 65)

if __name__ == "__main__":
    cfg = sys.argv[1] if len(sys.argv) > 1 else "configs/centre_TC001.yaml"
    vid = sys.argv[2] if len(sys.argv) > 2 else "data/sample_videos/normal.mp4"
    run_phase1(cfg, vid)
