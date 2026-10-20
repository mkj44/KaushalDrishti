"""
Discrepancy and Compliance Rules Engine for KaushalDrishti API.

Handles:
- Processing edge observations into auditable alerts.
- Dynamic compliance score calculation per centre.
- Alert lifecycle management: open -> acknowledged -> resolved.
- Strict audit logging for human-in-the-loop review.
"""

import json
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from api.models import Centre, Alert, Camera, SessionRecord, InventoryItem

class DiscrepancyEngine:
    """Core rules and alert processing engine."""

    @staticmethod
    def calculate_compliance_score(db: Session, centre_id: str) -> float:
        """
        Compute compliance score (0 - 100) based on active alerts and attendance match rate.
        Penalty weights:
          - High severity open alert: -20 pts
          - Medium severity open alert: -10 pts
          - Low severity open alert: -5 pts
          - Acknowledged alert: 50% penalty relief
          - Resolved alert: 0 penalty
        """
        alerts = db.query(Alert).filter(Alert.centre_id == centre_id).all()
        penalty = 0.0

        for a in alerts:
            if a.status == "resolved":
                continue
            weight = 20.0 if a.severity == "high" else (10.0 if a.severity == "medium" else 5.0)
            if a.status == "acknowledged":
                weight *= 0.5  # Under active human review
            penalty += weight

        score = max(0.0, min(100.0, 100.0 - penalty))
        centre = db.query(Centre).filter(Centre.id == centre_id).first()
        if centre:
            centre.compliance_score = round(score, 1)
            db.commit()

        return round(score, 1)

    @classmethod
    def process_edge_event(cls, db: Session, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process an incoming session or inventory event from edge agent.
        """
        centre_id = event_data["centre_id"]
        camera_id = event_data.get("camera_id", "cam1")
        session_id = event_data.get("session_id", "SESS_UNKNOWN")
        date_str = event_data.get("date") or datetime.utcnow().strftime("%Y-%m-%d")

        # 1. Ensure Centre exists
        centre = db.query(Centre).filter(Centre.id == centre_id).first()
        if not centre:
            centre = Centre(
                id=centre_id,
                name=event_data.get("centre_name", f"Training Centre {centre_id}"),
                scheme=event_data.get("scheme", "PMKVY"),
                district=event_data.get("district", "Raipur"),
                state=event_data.get("state", "Chhattisgarh"),
                compliance_score=100.0
            )
            db.add(centre)
            db.commit()

        # 2. Update Camera status & last_seen
        camera = db.query(Camera).filter(Camera.id == camera_id).first()
        if not camera:
            camera = Camera(
                id=camera_id,
                centre_id=centre_id,
                name=f"Camera {camera_id}",
                status="online",
                last_seen=datetime.utcnow()
            )
            db.add(camera)
        else:
            camera.last_seen = datetime.utcnow()
            if any(f.get("rule") == "CAMERA_OFFLINE" for f in event_data.get("flags", [])):
                camera.status = "obstructed"
            else:
                camera.status = "online"
        db.commit()

        # 3. Store Session Record if attendance metrics present
        record_id = f"{centre_id}_{session_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:6]}"
        if "submitted_count" in event_data or "estimated_count" in event_data:
            session_rec = SessionRecord(
                id=record_id,
                centre_id=centre_id,
                camera_id=camera_id,
                session_id=session_id,
                date=date_str,
                submitted_count=event_data.get("submitted_count", 0),
                estimated_count=event_data.get("estimated_count", 0),
                count_median=event_data.get("count_median", 0),
                count_p90=event_data.get("count_p90", 0),
                unique_tracks=event_data.get("unique_tracks", 0),
                confidence=event_data.get("confidence", 0.0),
                frames_used=event_data.get("frames_used", 0)
            )
            db.add(session_rec)
            db.commit()

        # 4. Ingest and create Alerts
        created_alerts = []
        flags = event_data.get("flags", [])
        thumbnails = event_data.get("thumbnails", [])
        thumbs_json = json.dumps(thumbnails)

        for flag in flags:
            rule_name = flag["rule"]
            item_id = flag.get("item_id")
            
            # Check for existing open alert for the same session/item to prevent duplicate spam
            existing = db.query(Alert).filter(
                Alert.centre_id == centre_id,
                Alert.rule == rule_name,
                Alert.status == "open",
                Alert.session_id == session_id
            ).first()

            if existing:
                continue

            alert_id = f"ALT_{datetime.utcnow().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8].upper()}"
            init_audit = [{
                "timestamp": datetime.utcnow().isoformat(),
                "action": "created",
                "user": "edge_agent_system",
                "note": f"Rule {rule_name} triggered by automated vision analysis."
            }]

            alert = Alert(
                id=alert_id,
                centre_id=centre_id,
                camera_id=camera_id,
                session_id=session_id,
                item_id=item_id,
                rule=rule_name,
                severity=flag.get("severity", "medium"),
                status="open",
                threshold=str(flag.get("threshold", "")),
                measured=str(flag.get("measured", "")),
                confidence=float(flag.get("confidence", 0.8)),
                message=flag["message"],
                thumbnails_json=thumbs_json,
                audit_trail_json=json.dumps(init_audit)
            )
            db.add(alert)
            created_alerts.append(alert_id)

            # Update inventory status if item flag
            if item_id:
                inv = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
                if inv:
                    inv.status = "missing" if rule_name == "ITEM_MISSING" else ("idle" if rule_name == "EQUIPMENT_POSSIBLY_NONFUNCTIONAL" else "present")
                    inv.last_checked = datetime.utcnow()

        db.commit()

        # 5. Recompute dynamic compliance score
        new_score = cls.calculate_compliance_score(db, centre_id)

        return {
            "centre_id": centre_id,
            "session_id": session_id,
            "created_alerts": created_alerts,
            "compliance_score": new_score,
            "status": "processed"
        }

    @classmethod
    def update_alert_status(
        cls,
        db: Session,
        alert_id: str,
        new_status: str,
        user: str,
        note: str
    ) -> Optional[Alert]:
        """Acknowledge or resolve an alert with audit trail."""
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if not alert:
            return None

        alert.status = new_status
        audit_trail = json.loads(alert.audit_trail_json or "[]")
        audit_trail.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": new_status,
            "user": user,
            "note": note
        })
        alert.audit_trail_json = json.dumps(audit_trail)
        db.commit()

        # Recalculate centre compliance score
        cls.calculate_compliance_score(db, alert.centre_id)
        return alert
