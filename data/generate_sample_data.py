"""
Sample Video & Ground Truth Generator for KaushalDrishti Demo

Generates deterministic, demo-ready video clips and ground-truth metadata
for all 7 compliance scenarios:
1. normal.mp4 - Standard compliant classroom session (16 trainees + 1 instructor)
2. overreported.mp4 - Under-attended session (6 trainees present vs 25 submitted)
3. empty_session.mp4 - Empty room during scheduled session (0 trainees vs 20 submitted)
4. workbench_missing.mp4 - Workbench WB-02 removed from sanctioned zone
5. machine_idle.mp4 - Lathe machine unoperated across session (0 activity, red light)
6. low_light.mp4 - Low-light 480p noisy feed to test edge CLAHE enhancement
7. camera_obstructed.mp4 - Covered/dark camera lens (low variance check)

Also generates:
- configs/baselines/*.png for zone image similarity (SSIM)
- data/submitted_attendance.csv for portal cross-checking
- data/annotations/ground_truth.json for automated evaluation
"""

import os
import json
import csv
import cv2
import numpy as np
import ultralytics
from ultralytics import YOLO

def ensure_dirs():
    os.makedirs("data/sample_videos", exist_ok=True)
    os.makedirs("data/annotations", exist_ok=True)
    os.makedirs("configs/baselines", exist_ok=True)

def extract_person_sprites():
    """Extract real human crops from bundled Ultralytics images for realistic YOLO detection."""
    assets_dir = os.path.join(os.path.dirname(ultralytics.__file__), "assets")
    model = YOLO("yolov8n.pt")
    sprites = []
    
    for filename in ["bus.jpg", "zidane.jpg"]:
        path = os.path.join(assets_dir, filename)
        if not os.path.exists(path):
            continue
        img = cv2.imread(path)
        res = model(img, verbose=False)[0]
        for box in res.boxes:
            if int(box.cls) == 0:  # Person class
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                crop = img[y1:y2, x1:x2]
                if crop.shape[0] > 60 and crop.shape[1] > 30:
                    sprites.append(crop)
    
    # If none found for any reason, create fallback textured crops
    if not sprites:
        fallback = np.full((120, 60, 3), (120, 150, 180), dtype=np.uint8)
        sprites.append(fallback)
        
    return sprites

def create_classroom_canvas(width=1280, height=720, include_wb1=True, include_wb2=True):
    """Render a realistic skilling centre classroom with walls, floor, whiteboard, and workbenches."""
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Wall (top half) - soft off-white/beige
    canvas[:300, :] = [225, 230, 235]
    # Whiteboard on front wall
    cv2.rectangle(canvas, (460, 40), (860, 200), (245, 248, 250), -1)
    cv2.rectangle(canvas, (460, 40), (860, 200), (120, 130, 140), 3)
    cv2.putText(canvas, "PMKVY SKILL CENTRE - BATCH B-2026-01", (480, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (40, 50, 60), 2)
    cv2.putText(canvas, "MODULE 4: CNC PROGRAMMING & SAFETY", (480, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (70, 80, 90), 1)

    # Floor (bottom half) - linoleum/epoxy skilling floor
    canvas[300:, :] = [180, 190, 200]
    # Perspective grid lines on floor
    for x in range(100, width, 150):
        cv2.line(canvas, (x, 300), (int(x * 1.3) - 150, height), (165, 175, 185), 1)
    for y in range(350, height, 80):
        cv2.line(canvas, (0, y), (width, y), (165, 175, 185), 1)

    # Instructor podium / lectern in instructor zone [80, 80] to [420, 360]
    cv2.rectangle(canvas, (240, 220), (360, 320), (100, 120, 140), -1)
    cv2.rectangle(canvas, (240, 220), (360, 320), (70, 80, 90), 2)
    cv2.putText(canvas, "INSTRUCTOR", (250, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (240, 240, 240), 1)

    # Workbench 1 (Left zone: [100, 360] to [620, 700])
    if include_wb1:
        cv2.rectangle(canvas, (120, 400), (600, 680), (130, 110, 90), -1)
        cv2.rectangle(canvas, (120, 400), (600, 430), (170, 150, 130), -1) # Table top
        cv2.rectangle(canvas, (120, 400), (600, 680), (60, 50, 40), 2)
        cv2.putText(canvas, "WORKBENCH WB-01", (140, 422), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 20, 10), 2)

    # Workbench 2 (Right zone: [660, 360] to [1180, 700])
    if include_wb2:
        cv2.rectangle(canvas, (680, 400), (1160, 680), (130, 110, 90), -1)
        cv2.rectangle(canvas, (680, 400), (1160, 430), (170, 150, 130), -1)
        cv2.rectangle(canvas, (680, 400), (1160, 680), (60, 50, 40), 2)
        cv2.putText(canvas, "WORKBENCH WB-02", (700, 422), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (30, 20, 10), 2)

    return canvas

def create_workshop_canvas(width=1280, height=720, machine_active=True, indicator_on=True):
    """Render a realistic CNC machining workshop lab."""
    canvas = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Concrete industrial workshop wall & floor
    canvas[:240, :] = [210, 215, 220]
    canvas[240:, :] = [150, 155, 160]
    # Safety boundary zone markings (yellow-black stripes)
    cv2.rectangle(canvas, (180, 160), (660, 660), (0, 215, 255), 4)
    cv2.putText(canvas, "SAFETY ZONE: CNC LATHE 01", (200, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1)

    # CNC Lathe machine body in zone [200, 180] to [640, 640]
    cv2.rectangle(canvas, (240, 240), (600, 600), (80, 90, 100), -1)
    cv2.rectangle(canvas, (260, 270), (580, 450), (40, 45, 50), -1) # Machine viewing window
    cv2.rectangle(canvas, (240, 240), (600, 600), (30, 35, 40), 3)
    cv2.putText(canvas, "PRECISION CNC LATHE-01", (280, 260), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 240, 250), 2)

    # Indicator light at [220, 200] to [260, 240]
    ind_color = (0, 255, 0) if indicator_on else (0, 0, 220)  # Green if operational/running, Red if idle/error
    cv2.circle(canvas, (235, 220), 12, ind_color, -1)
    cv2.circle(canvas, (235, 220), 12, (255, 255, 255), 2)
    cv2.putText(canvas, "PWR", (225, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 0), 1)

    # Workbench & tool cabinet on right
    cv2.rectangle(canvas, (750, 300), (1150, 650), (100, 110, 120), -1)
    cv2.rectangle(canvas, (750, 300), (1150, 650), (50, 55, 60), 2)
    cv2.putText(canvas, "TOOL CABINET & WORKSTATION", (770, 330), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 240, 240), 1)

    return canvas

def place_sprite(canvas, sprite, x, y, target_w=100, target_h=220, jitter=(0, 0)):
    """Place a resized person sprite at (x, y) with boundary clipping."""
    jx, jy = jitter
    px = max(0, min(canvas.shape[1] - target_w, x + jx))
    py = max(0, min(canvas.shape[0] - target_h, y + jy))
    
    resized = cv2.resize(sprite, (target_w, target_h))
    canvas[py:py+target_h, px:px+target_w] = resized

def generate_video(filename, frames, fps=10):
    """Write an array of BGR frames to an MP4 video file using standard avc1/mp4v codec."""
    h, w = frames[0].shape[:2]
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(filename, fourcc, fps, (w, h))
    for f in frames:
        out.write(f)
    out.release()
    print(f"Generated {filename} ({len(frames)} frames, {w}x{h} @ {fps} fps)")

def build_all_scenarios():
    ensure_dirs()
    sprites = extract_person_sprites()
    print(f"Extracted {len(sprites)} realistic human templates for synthesis.")

    num_frames = 20  # 20 frames @ 10 fps = 2 seconds test clip per scenario
    ground_truth = {}

    # 1. SCENARIO: normal.mp4
    # 16 trainees (8 at WB-01, 8 at WB-02) + 1 instructor
    frames_normal = []
    trainee_positions = []
    # 8 people at WB-01
    for r in range(2):
        for c in range(4):
            trainee_positions.append((140 + c * 110, 420 + r * 110, 75, 170))
    # 8 people at WB-02
    for r in range(2):
        for c in range(4):
            trainee_positions.append((700 + c * 110, 420 + r * 110, 75, 170))

    for f_idx in range(num_frames):
        bg = create_classroom_canvas(1280, 720, include_wb1=True, include_wb2=True)
        # Instructor in instructor zone [80, 80] - [420, 360]
        place_sprite(bg, sprites[0 % len(sprites)], 250, 140, 85, 190, jitter=((f_idx % 3) * 2, 0))
        # 16 trainees
        for i, (tx, ty, tw, th) in enumerate(trainee_positions):
            spr = sprites[(i + 1) % len(sprites)]
            jit = (((f_idx + i) % 3) - 1, ((f_idx * 2 + i) % 3) - 1)
            place_sprite(bg, spr, tx, ty, tw, th, jitter=jit)
        frames_normal.append(bg)

    generate_video("data/sample_videos/normal.mp4", frames_normal)
    ground_truth["normal"] = {
        "scenario": "normal",
        "video": "data/sample_videos/normal.mp4",
        "expected_headcount": 10,
        "instructor_present": True,
        "submitted_count": 10,
        "inventory": {"WB-01": True, "WB-02": True, "LATHE-01": True},
        "expected_alerts": []
    }

    # 2. SCENARIO: overreported.mp4
    # Only 6 trainees present + 1 instructor. Centre submitted 25.
    frames_over = []
    over_positions = [
        (160, 450, 75, 170),
        (300, 450, 75, 170),
        (440, 450, 75, 170),
        (720, 450, 75, 170),
        (860, 450, 75, 170),
        (1000, 450, 75, 170),
    ]
    for f_idx in range(num_frames):
        bg = create_classroom_canvas(1280, 720, include_wb1=True, include_wb2=True)
        # Instructor present
        place_sprite(bg, sprites[0 % len(sprites)], 250, 140, 85, 190, jitter=((f_idx % 2), 0))
        # 6 trainees only
        for i, (tx, ty, tw, th) in enumerate(over_positions):
            spr = sprites[(i + 1) % len(sprites)]
            place_sprite(bg, spr, tx, ty, tw, th)
        frames_over.append(bg)

    generate_video("data/sample_videos/overreported.mp4", frames_over)
    ground_truth["overreported"] = {
        "scenario": "overreported",
        "video": "data/sample_videos/overreported.mp4",
        "expected_headcount": 6,
        "instructor_present": True,
        "submitted_count": 25,
        "inventory": {"WB-01": True, "WB-02": True},
        "expected_alerts": ["ATTENDANCE_OVERREPORT"]
    }

    # 3. SCENARIO: empty_session.mp4
    # Classroom empty: 0 trainees, 0 instructor. Centre submitted 20.
    frames_empty = []
    for f_idx in range(num_frames):
        bg = create_classroom_canvas(1280, 720, include_wb1=True, include_wb2=True)
        frames_empty.append(bg)

    generate_video("data/sample_videos/empty_session.mp4", frames_empty)
    ground_truth["empty_session"] = {
        "scenario": "empty_session",
        "video": "data/sample_videos/empty_session.mp4",
        "expected_headcount": 0,
        "instructor_present": False,
        "submitted_count": 20,
        "inventory": {"WB-01": True, "WB-02": True},
        "expected_alerts": ["SESSION_EMPTY", "ATTENDANCE_OVERREPORT"]
    }

    # 4. SCENARIO: workbench_missing.mp4
    # Workbench WB-02 zone empty / workbench removed.
    frames_wb_missing = []
    for f_idx in range(num_frames):
        # Workbench 2 is removed (include_wb2=False)
        bg = create_classroom_canvas(1280, 720, include_wb1=True, include_wb2=False)
        # 8 trainees present at Workbench 1
        for i in range(8):
            spr = sprites[(i + 1) % len(sprites)]
            tx = 140 + (i % 4) * 110
            ty = 420 + (i // 4) * 110
            place_sprite(bg, spr, tx, ty, 75, 170)
        frames_wb_missing.append(bg)

    generate_video("data/sample_videos/workbench_missing.mp4", frames_wb_missing)
    ground_truth["workbench_missing"] = {
        "scenario": "workbench_missing",
        "video": "data/sample_videos/workbench_missing.mp4",
        "expected_headcount": 8,
        "instructor_present": False,
        "submitted_count": 8,
        "inventory": {"WB-01": True, "WB-02": False},
        "expected_alerts": ["ITEM_MISSING", "ZONE_CHANGED"]
    }

    # 5. SCENARIO: machine_idle.mp4
    # Workshop lathe present, but red indicator light and NO operator activity
    frames_machine_idle = []
    for f_idx in range(num_frames):
        # Machine idle, indicator off/red, 0 persons in workshop
        bg = create_workshop_canvas(1280, 720, machine_active=False, indicator_on=False)
        frames_machine_idle.append(bg)

    generate_video("data/sample_videos/machine_idle.mp4", frames_machine_idle)
    ground_truth["machine_idle"] = {
        "scenario": "machine_idle",
        "video": "data/sample_videos/machine_idle.mp4",
        "expected_headcount": 0,
        "instructor_present": False,
        "submitted_count": 10,
        "inventory": {"LATHE-01": True},
        "machine_operable": False,
        "expected_alerts": ["EQUIPMENT_POSSIBLY_NONFUNCTIONAL"]
    }

    # Also generate active machine video for normal workshop operation comparison
    frames_machine_active = []
    for f_idx in range(num_frames):
        bg = create_workshop_canvas(1280, 720, machine_active=True, indicator_on=True)
        # Operator moving at the lathe
        place_sprite(bg, sprites[0 % len(sprites)], 350 + (f_idx % 4) * 5, 300, 90, 210)
        frames_machine_active.append(bg)
    generate_video("data/sample_videos/machine_active.mp4", frames_machine_active)

    # 6. SCENARIO: low_light.mp4
    # Low-light, 480p, noisy classroom with 12 trainees
    frames_low_light = []
    for f_idx in range(num_frames):
        bg = create_classroom_canvas(1280, 720, include_wb1=True, include_wb2=True)
        # 12 trainees
        for i in range(12):
            spr = sprites[(i + 1) % len(sprites)]
            tx = 160 + (i % 6) * 150
            ty = 440 + (i // 6) * 110
            place_sprite(bg, spr, tx, ty, 75, 170)
        # Darken by 70% and add noise
        dark = (bg.astype(np.float32) * 0.28).astype(np.uint8)
        noise = np.random.normal(0, 8, dark.shape).astype(np.int16)
        noisy = np.clip(dark.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        # Downscale to 640x360 then upscale to 1280x720 (simulating low-res sensor)
        low_res = cv2.resize(noisy, (640, 360))
        final_f = cv2.resize(low_res, (1280, 720))
        frames_low_light.append(final_f)

    generate_video("data/sample_videos/low_light.mp4", frames_low_light)
    ground_truth["low_light"] = {
        "scenario": "low_light",
        "video": "data/sample_videos/low_light.mp4",
        "expected_headcount": 6,
        "instructor_present": False,
        "submitted_count": 6,
        "inventory": {"WB-01": True, "WB-02": True},
        "expected_alerts": []
    }

    # 7. SCENARIO: camera_obstructed.mp4
    # Obstructed camera lens: dark/uniform feed, variance < 10
    frames_obstructed = []
    for f_idx in range(num_frames):
        dark_frame = np.full((720, 1280, 3), (8, 9, 10), dtype=np.uint8)
        # Minimal sensor noise
        noise = np.random.randint(-2, 3, (720, 1280, 3), dtype=np.int8)
        dark_frame = np.clip(dark_frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        frames_obstructed.append(dark_frame)

    generate_video("data/sample_videos/camera_obstructed.mp4", frames_obstructed)
    ground_truth["camera_obstructed"] = {
        "scenario": "camera_obstructed",
        "video": "data/sample_videos/camera_obstructed.mp4",
        "expected_headcount": 0,
        "instructor_present": False,
        "submitted_count": 15,
        "expected_alerts": ["CAMERA_OFFLINE"]
    }

    # Generate baseline snapshots for SSIM comparisons
    # WB-01 baseline (crop from normal classroom)
    bg_base_class = create_classroom_canvas(1280, 720, include_wb1=True, include_wb2=True)
    cv2.imwrite("configs/baselines/cam1_WB-01.png", bg_base_class[360:700, 100:620])
    cv2.imwrite("configs/baselines/cam1_WB-02.png", bg_base_class[360:700, 660:1180])
    # Lathe baseline
    bg_base_work = create_workshop_canvas(1280, 720, machine_active=True, indicator_on=True)
    cv2.imwrite("configs/baselines/cam2_LATHE-01.png", bg_base_work[180:640, 200:640])
    print("Generated baseline images in configs/baselines/")

    # Generate submitted_attendance.csv
    with open("data/submitted_attendance.csv", "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["centre_id", "camera_id", "session_id", "date", "submitted_count", "scenario"])
        writer.writerow(["TC001", "cam1", "SESS_NORMAL", "2026-10-20", 10, "normal"])
        writer.writerow(["TC001", "cam1", "SESS_OVERREPORT", "2026-10-20", 25, "overreported"])
        writer.writerow(["TC001", "cam1", "SESS_EMPTY", "2026-10-20", 20, "empty_session"])
        writer.writerow(["TC001", "cam1", "SESS_WB_MISSING", "2026-10-20", 8, "workbench_missing"])
        writer.writerow(["TC001", "cam2", "SESS_MACHINE_IDLE", "2026-10-20", 10, "machine_idle"])
        writer.writerow(["TC001", "cam1", "SESS_LOW_LIGHT", "2026-10-20", 6, "low_light"])
        writer.writerow(["TC001", "cam1", "SESS_OBSTRUCTED", "2026-10-20", 15, "camera_obstructed"])
    print("Generated data/submitted_attendance.csv")

    # Save ground truth annotations
    with open("data/annotations/ground_truth.json", "w") as f:
        json.dump(ground_truth, f, indent=2)
    print("Generated data/annotations/ground_truth.json")

if __name__ == "__main__":
    build_all_scenarios()
