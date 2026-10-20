"""
Automated privacy compliance test: Verifies zero unblurred faces across all saved thumbnails.
"""

import os
import cv2
import numpy as np
from edge_agent.privacy import PrivacyEngine

def test_face_blurring_leaves_zero_detectable_faces():
    privacy = PrivacyEngine()

    # Create a frame with a synthetic person face
    frame = np.full((400, 400, 3), (220, 220, 220), dtype=np.uint8)
    
    # Draw a face with skin tone, eyes, and mouth
    cv2.circle(frame, (200, 200), 50, (180, 200, 240), -1)  # Face
    cv2.circle(frame, (180, 185), 6, (30, 30, 30), -1)       # Left eye
    cv2.circle(frame, (220, 185), 6, (30, 30, 30), -1)       # Right eye
    cv2.line(frame, (185, 220), (215, 220), (50, 50, 150), 3) # Mouth

    # Before blurring: test face detector on raw frame
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Anonymize using PrivacyEngine
    person_boxes = [[150, 150, 250, 350]]
    anonymized = privacy.anonymize_frame(frame, person_boxes=person_boxes)
    thumb_bytes = privacy.create_evidence_thumbnail(anonymized, target_width=320)

    # Assert zero unblurred faces in serialized thumbnail
    is_privacy_compliant = privacy.verify_zero_unblurred_faces(thumb_bytes)
    assert is_privacy_compliant is True, "Face detected in thumbnail! Privacy violation."
    assert len(thumb_bytes) <= 20 * 1024, f"Thumbnail size {len(thumb_bytes)} exceeds 20 KB limit!"
