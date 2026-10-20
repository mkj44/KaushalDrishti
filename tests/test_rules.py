"""
Unit tests for SkillSight Discrepancy Rules Engine and Alert Lifecycle.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from api.models import Base, Centre, Alert, Camera
from api.rules import DiscrepancyEngine

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_attendance_overreport_alert(db_session):
    event = {
        "centre_id": "TC_TEST_01",
        "centre_name": "Test Centre",
        "camera_id": "cam1",
        "session_id": "SESS_TEST",
        "submitted_count": 25,
        "estimated_count": 5,
        "flags": [{
            "rule": "ATTENDANCE_OVERREPORT",
            "severity": "high",
            "threshold": "diff > 4",
            "measured": "discrepancy=20",
            "confidence": 0.88,
            "message": "Submitted attendance exceeds visual headcount."
        }]
    }

    res = DiscrepancyEngine.process_edge_event(db_session, event)
    assert res["status"] == "processed"
    assert len(res["created_alerts"]) == 1

    # Check alert stored in database
    alert = db_session.query(Alert).filter(Alert.centre_id == "TC_TEST_01").first()
    assert alert is not None
    assert alert.rule == "ATTENDANCE_OVERREPORT"
    assert alert.severity == "high"
    assert alert.status == "open"

    # High severity open alert drops compliance score from 100 to 80
    assert res["compliance_score"] == 80.0

def test_alert_lifecycle_and_audit_trail(db_session):
    event = {
        "centre_id": "TC_TEST_02",
        "camera_id": "cam1",
        "session_id": "SESS_TEST_2",
        "flags": [{
            "rule": "ITEM_MISSING",
            "item_id": "WB-01",
            "severity": "high",
            "confidence": 0.90,
            "message": "Workbench missing"
        }]
    }
    res = DiscrepancyEngine.process_edge_event(db_session, event)
    alert_id = res["created_alerts"][0]

    # Score should be 80.0
    assert res["compliance_score"] == 80.0

    # 1. Acknowledge alert
    ack_alert = DiscrepancyEngine.update_alert_status(
        db=db_session,
        alert_id=alert_id,
        new_status="acknowledged",
        user="monitor_officer",
        note="Calling centre director to verify workbench transfer."
    )
    assert ack_alert.status == "acknowledged"
    # Acknowledging gives 50% relief: penalty goes from -20 to -10 -> score 90.0
    centre = db_session.query(Centre).filter(Centre.id == "TC_TEST_02").first()
    assert centre.compliance_score == 90.0

    # 2. Resolve alert
    res_alert = DiscrepancyEngine.update_alert_status(
        db=db_session,
        alert_id=alert_id,
        new_status="resolved",
        user="state_admin",
        note="Physical verification complete; workbench returned."
    )
    assert res_alert.status == "resolved"
    # Score fully restored to 100.0
    assert centre.compliance_score == 100.0
