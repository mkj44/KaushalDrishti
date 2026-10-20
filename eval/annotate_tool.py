"""
Lightweight Ground Truth Annotation and Verification Tool for KaushalDrishti.

Supports:
- Generating or updating ground truth annotations for video test clips.
- Storing true headcount per frame/session, instructor presence, and inventory status.
- Verification CLI flag (`--verify`) to audit dataset annotation integrity.
"""

import os
import json
import argparse
from typing import Dict, Any

DEFAULT_GROUND_TRUTH_PATH = "data/annotations/ground_truth.json"

def verify_annotations(file_path: str = DEFAULT_GROUND_TRUTH_PATH) -> bool:
    """Verify that all scenarios have valid ground truth labels."""
    if not os.path.exists(file_path):
        print(f"Error: {file_path} does not exist.")
        return False

    with open(file_path, "r") as f:
        data = json.load(f)

    required_keys = ["scenario", "video", "expected_headcount", "submitted_count", "expected_alerts"]
    all_valid = True

    print(f"Auditing annotations in {file_path}:")
    for scn, entry in data.items():
        missing = [k for k in required_keys if k not in entry]
        if missing:
            print(f"  [INVALID] Scenario '{scn}' missing keys: {missing}")
            all_valid = False
        else:
            print(f"  [VALID] Scenario: {scn:<20} Headcount: {entry['expected_headcount']:<4} Alerts: {entry['expected_alerts']}")

    return all_valid

def update_annotation(
    scenario: str,
    headcount: int,
    submitted: int,
    expected_alerts: list,
    file_path: str = DEFAULT_GROUND_TRUTH_PATH
):
    """Programmatically record or update scenario ground truth."""
    data = {}
    if os.path.exists(file_path):
        with open(file_path, "r") as f:
            data = json.load(f)

    if scenario not in data:
        data[scenario] = {
            "scenario": scenario,
            "video": f"data/sample_videos/{scenario}.mp4",
        }

    data[scenario]["expected_headcount"] = headcount
    data[scenario]["submitted_count"] = submitted
    data[scenario]["expected_alerts"] = expected_alerts

    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Updated annotation for {scenario} in {file_path}")

def main():
    parser = argparse.ArgumentParser(description="KaushalDrishti Annotation & Ground Truth Tool")
    parser.add_argument("--verify", action="store_true", help="Audit ground truth dataset")
    parser.add_argument("--path", default=DEFAULT_GROUND_TRUTH_PATH, help="Path to ground truth JSON")
    args = parser.parse_args()

    if args.verify or True:
        verify_annotations(args.path)

if __name__ == "__main__":
    main()
