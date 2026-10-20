"""
FastAPI Backend Application for KaushalDrishit Compliance Monitoring.

Exposes REST APIs for:
- Edge agent uplink ingestion (single & batch store-and-forward).
- Dashboard overview, centre detail, and live alerts.
- Human-in-the-loop alert review (acknowledge, resolve with notes).
- Ministry compliance report CSV export.
"""

import io
import csv
import json
import yaml
from datetime import datetime
from typing import List, Optional, Dict, Any
import os
import shutil
from fastapi import FastAPI, Depends, HTTPException, Query, Header, status, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.models import init_db, SessionLocal, Centre, Camera, SessionRecord, Alert, InventoryItem
from api.rules import DiscrepancyEngine
from api import video_analysis

# Initialize database tables
init_db()

app = FastAPI(
    title="KaushalDrishit Compliance API",
    version="1.0.0",
    description="Automated Computer Vision Compliance Pipeline for National Skilling Schemes (कौशल दृष्टि)"
)

# Enable CORS for Vite React dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# In-memory store for real-time edge camera feeds
LATEST_LIVE_FEEDS: Dict[str, Any] = {}

# Pydantic Schemas
class UplinkEvent(BaseModel):
    centre_id: str
    camera_id: str = "cam1"
    session_id: str = "SESS_101"
    date: Optional[str] = None
    centre_name: Optional[str] = None
    submitted_count: Optional[int] = None
    estimated_count: Optional[int] = None
    count_median: Optional[int] = None
    count_p90: Optional[int] = None
    unique_tracks: Optional[int] = 0
    confidence: Optional[float] = 0.0
    frames_used: Optional[int] = 0
    flags: List[Dict[str, Any]] = []
    thumbnails: List[str] = []

class BatchUplink(BaseModel):
    events: List[UplinkEvent]

class AlertActionRequest(BaseModel):
    note: str = Field(..., min_length=2, description="Reason or note for review action")
    user: Optional[str] = "compliance_officer"

# Seed default centre and inventory from configs/centre_TC001.yaml if empty
@app.on_event("startup")
def startup_seed():
    db = SessionLocal()
    try:
        centre = db.query(Centre).filter(Centre.id == "TC001").first()
        if not centre:
            with open("configs/centre_TC001.yaml", "r") as f:
                cfg = yaml.safe_load(f)
            c_info = cfg["centre"]
            centre = Centre(
                id=c_info["centre_id"],
                name=c_info["centre_name"],
                scheme=c_info.get("scheme", "PMKVY"),
                district=c_info.get("district", "Raipur"),
                state=c_info.get("state", "Chhattisgarh"),
                contact_email=c_info.get("contact_email", "compliance@tc001.skillsight.gov.in"),
                compliance_score=100.0
            )
            db.add(centre)

            for cam in cfg.get("cameras", []):
                camera = Camera(
                    id=cam["id"],
                    centre_id=centre.id,
                    name=cam["name"],
                    resolution=f"{cam['resolution'][0]}x{cam['resolution'][1]}",
                    fps=cam.get("fps", 25),
                    status="online"
                )
                db.add(camera)

            for inv in cfg.get("inventory", []):
                item = InventoryItem(
                    id=inv["id"],
                    centre_id=centre.id,
                    camera_id=inv["camera"],
                    name=inv["name"],
                    type=inv["type"],
                    expected_count=inv.get("expected_count", 1),
                    status="present",
                    operability_mode=",".join(inv.get("operability", []))
                )
                db.add(item)

            db.commit()
    except Exception as e:
        print("Startup seed warning:", e)
    finally:
        db.close()

# API Endpoints

@app.get("/api/v1/health")
def health_check():
    return {"status": "healthy", "service": "KaushalDrishit Compliance API", "timestamp": datetime.utcnow().isoformat()}

@app.post("/api/v1/uplink/event")
def ingest_event(event: UplinkEvent, db: Session = Depends(get_db)):
    """Ingest real-time event from edge agent."""
    if event.thumbnails:
        LATEST_LIVE_FEEDS[f"{event.centre_id}_{event.camera_id}"] = {
            "active": True,
            "centre_id": event.centre_id,
            "camera_id": event.camera_id,
            "session_id": event.session_id,
            "image": event.thumbnails[-1],
            "estimated_count": event.estimated_count,
            "submitted_count": event.submitted_count,
            "confidence": event.confidence,
            "updated_at": datetime.utcnow().isoformat()
        }
    res = DiscrepancyEngine.process_edge_event(db, event.dict())
    return {"status": "success", "result": res}

@app.get("/api/v1/cameras/{centre_id}/{camera_id}/live")
def get_live_camera(centre_id: str, camera_id: str):
    """Retrieve the most recent anonymized frame and real-time metrics for a camera."""
    key = f"{centre_id}_{camera_id}"
    if key in LATEST_LIVE_FEEDS:
        return LATEST_LIVE_FEEDS[key]
    return {"active": False, "image": None}

@app.post("/api/v1/uplink/batch")
def ingest_batch(batch: BatchUplink, db: Session = Depends(get_db)):
    """Ingest batched events from edge offline store-and-forward queue."""
    processed = 0
    for evt in batch.events:
        DiscrepancyEngine.process_edge_event(db, evt.dict())
        processed += 1
    return {"status": "success", "processed_events": processed}

@app.get("/api/v1/centres")
def list_centres(db: Session = Depends(get_db)):
    """List all monitoring centres with compliance scores, alert counts, and status."""
    centres = db.query(Centre).all()
    results = []
    for c in centres:
        alerts = db.query(Alert).filter(Alert.centre_id == c.id).all()
        open_alerts = [a for a in alerts if a.status == "open"]
        high_alerts = [a for a in open_alerts if a.severity == "high"]
        cameras = db.query(Camera).filter(Camera.centre_id == c.id).all()

        results.append({
            "id": c.id,
            "name": c.name,
            "scheme": c.scheme,
            "district": c.district,
            "state": c.state,
            "compliance_score": c.compliance_score,
            "open_alerts_count": len(open_alerts),
            "high_severity_count": len(high_alerts),
            "total_alerts_count": len(alerts),
            "cameras_count": len(cameras),
            "cameras": [{"id": cam.id, "name": cam.name, "status": cam.status, "last_seen": cam.last_seen.isoformat() if cam.last_seen else None} for cam in cameras]
        })
    return {"centres": results}

@app.get("/api/v1/centres/{centre_id}")
def get_centre_detail(centre_id: str, db: Session = Depends(get_db)):
    """Get full details, attendance history, inventory checklist, and alert timeline for a centre."""
    centre = db.query(Centre).filter(Centre.id == centre_id).first()
    if not centre:
        raise HTTPException(status_code=404, detail="Centre not found")

    cameras = db.query(Camera).filter(Camera.centre_id == centre_id).all()
    sessions = db.query(SessionRecord).filter(SessionRecord.centre_id == centre_id).order_by(SessionRecord.created_at.desc()).limit(20).all()
    alerts = db.query(Alert).filter(Alert.centre_id == centre_id).order_by(Alert.created_at.desc()).all()
    inventory = db.query(InventoryItem).filter(InventoryItem.centre_id == centre_id).all()

    return {
        "centre": {
            "id": centre.id,
            "name": centre.name,
            "scheme": centre.scheme,
            "district": centre.district,
            "state": centre.state,
            "compliance_score": centre.compliance_score,
            "contact_email": centre.contact_email
        },
        "cameras": [{"id": c.id, "name": c.name, "status": c.status, "last_seen": c.last_seen.isoformat() if c.last_seen else None} for c in cameras],
        "attendance_sessions": [{
            "id": s.id,
            "session_id": s.session_id,
            "camera_id": s.camera_id,
            "date": s.date,
            "submitted_count": s.submitted_count,
            "estimated_count": s.estimated_count,
            "count_median": s.count_median,
            "count_p90": s.count_p90,
            "unique_tracks": s.unique_tracks,
            "confidence": s.confidence,
            "created_at": s.created_at.isoformat()
        } for s in reversed(sessions)],
        "inventory": [{
            "id": inv.id,
            "name": inv.name,
            "type": inv.type,
            "camera_id": inv.camera_id,
            "expected_count": inv.expected_count,
            "status": inv.status,
            "operability_mode": inv.operability_mode,
            "last_checked": inv.last_checked.isoformat() if inv.last_checked else None
        } for inv in inventory],
        "alerts": [{
            "id": a.id,
            "rule": a.rule,
            "severity": a.severity,
            "status": a.status,
            "message": a.message,
            "threshold": a.threshold,
            "measured": a.measured,
            "confidence": a.confidence,
            "item_id": a.item_id,
            "camera_id": a.camera_id,
            "session_id": a.session_id,
            "has_thumbnails": len(json.loads(a.thumbnails_json or "[]")) > 0,
            "created_at": a.created_at.isoformat()
        } for a in alerts],
        "live_feed": LATEST_LIVE_FEEDS.get(f"{centre_id}_cam1") or LATEST_LIVE_FEEDS.get(f"{centre_id}_cam2") or next((v for k, v in LATEST_LIVE_FEEDS.items() if k.startswith(centre_id)), None)
    }

@app.get("/api/v1/alerts")
def list_alerts(
    centre_id: Optional[str] = None,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """List alerts with optional query filters."""
    query = db.query(Alert)
    if centre_id:
        query = query.filter(Alert.centre_id == centre_id)
    if severity:
        query = query.filter(Alert.severity == severity)
    if status:
        query = query.filter(Alert.status == status)

    alerts = query.order_by(Alert.created_at.desc()).all()
    return {
        "alerts": [{
            "id": a.id,
            "centre_id": a.centre_id,
            "camera_id": a.camera_id,
            "session_id": a.session_id,
            "item_id": a.item_id,
            "rule": a.rule,
            "severity": a.severity,
            "status": a.status,
            "message": a.message,
            "threshold": a.threshold,
            "measured": a.measured,
            "confidence": a.confidence,
            "created_at": a.created_at.isoformat(),
            "updated_at": a.updated_at.isoformat(),
            "thumbnails_count": len(json.loads(a.thumbnails_json or "[]"))
        } for a in alerts]
    }

@app.get("/api/v1/alerts/{alert_id}")
def get_alert_detail(alert_id: str, db: Session = Depends(get_db)):
    """Get full alert details with anonymized evidence thumbnails and audit trail."""
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {
        "id": alert.id,
        "centre_id": alert.centre_id,
        "camera_id": alert.camera_id,
        "session_id": alert.session_id,
        "item_id": alert.item_id,
        "rule": alert.rule,
        "severity": alert.severity,
        "status": alert.status,
        "message": alert.message,
        "threshold": alert.threshold,
        "measured": alert.measured,
        "confidence": alert.confidence,
        "thumbnails": json.loads(alert.thumbnails_json or "[]"),
        "audit_trail": json.loads(alert.audit_trail_json or "[]"),
        "created_at": alert.created_at.isoformat(),
        "updated_at": alert.updated_at.isoformat()
    }

@app.post("/api/v1/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str, req: AlertActionRequest, db: Session = Depends(get_db)):
    """Acknowledge alert with monitor note."""
    alert = DiscrepancyEngine.update_alert_status(
        db=db,
        alert_id=alert_id,
        new_status="acknowledged",
        user=req.user or "monitor",
        note=req.note
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "success", "alert_id": alert.id, "new_status": "acknowledged"}

@app.post("/api/v1/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str, req: AlertActionRequest, db: Session = Depends(get_db)):
    """Resolve alert with admin resolution note."""
    alert = DiscrepancyEngine.update_alert_status(
        db=db,
        alert_id=alert_id,
        new_status="resolved",
        user=req.user or "admin",
        note=req.note
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "success", "alert_id": alert.id, "new_status": "resolved"}

@app.get("/api/v1/export/alerts")
def export_alerts_csv(centre_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Export alerts as CSV for Ministry / Directorate reporting."""
    query = db.query(Alert)
    if centre_id:
        query = query.filter(Alert.centre_id == centre_id)
    alerts = query.order_by(Alert.created_at.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Alert ID", "Centre ID", "Rule", "Severity", "Status",
        "Confidence", "Threshold", "Measured Value", "Message", "Timestamp"
    ])

    for a in alerts:
        writer.writerow([
            a.id, a.centre_id, a.rule, a.severity, a.status,
            a.confidence, a.threshold, a.measured, a.message, a.created_at.isoformat()
        ])

    output.seek(0)
    filename = f"kaushaldrishit_compliance_report_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ---------------------------------------------------------------------------
# On-demand video analysis (upload a recorded clip -> people / chairs / layout)
# ---------------------------------------------------------------------------

MAX_UPLOAD_MB = int(os.getenv("KD_MAX_UPLOAD_MB", "500"))


@app.post("/api/v1/analyze/video", status_code=202)
async def analyze_video_upload(file: UploadFile = File(...)):
    """Upload a classroom/workshop video. Returns a job id to poll."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in video_analysis.ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext}'. Use MP4, MOV, AVI, MKV or WEBM.")

    os.makedirs(video_analysis.UPLOAD_DIR, exist_ok=True)
    tmp_path = os.path.join(video_analysis.UPLOAD_DIR, f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}{ext}")
    written = 0
    with open(tmp_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            written += len(chunk)
            if written > MAX_UPLOAD_MB * 1024 * 1024:
                out.close()
                os.remove(tmp_path)
                raise HTTPException(status_code=413, detail=f"Video is larger than {MAX_UPLOAD_MB} MB.")
            out.write(chunk)

    job_id = video_analysis.create_job(tmp_path, file.filename or "upload", {})
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/v1/analyze/jobs")
def list_analysis_jobs():
    return {"jobs": video_analysis.list_jobs()}


@app.get("/api/v1/analyze/jobs/{job_id}")
def get_analysis_job(job_id: str):
    job = video_analysis.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return job


class AttachRequest(BaseModel):
    centre_id: str = "TC001"
    camera_id: str = "upload"
    session_id: Optional[str] = None
    submitted_count: int = Field(..., ge=0)


@app.post("/api/v1/analyze/jobs/{job_id}/attach")
def attach_analysis_to_centre(job_id: str, req: AttachRequest, db: Session = Depends(get_db)):
    """File a finished analysis as an attendance session for a centre, raising alerts on mismatch."""
    job = video_analysis.get_job(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(status_code=409, detail="Analysis is not finished yet")

    r = job["result"]
    s = r["summary"]
    estimated = s["people_median"]
    submitted = req.submitted_count
    session_id = req.session_id or f"VID_{job_id[:6].upper()}"
    flags = []
    threshold = max(2, int(round(0.15 * submitted)))
    measured = f"median={estimated}, peak={s['people_peak']}, unique={s['unique_people']}"
    if submitted > 0 and estimated <= 1:
        flags.append({"rule": "SESSION_EMPTY", "severity": "high", "threshold": f"estimated <= 1 (claimed {submitted})",
                      "measured": measured, "confidence": s["confidence"],
                      "message": f"Uploaded footage shows an almost empty room but {submitted} trainees were claimed."})
    elif submitted - estimated > threshold:
        flags.append({"rule": "ATTENDANCE_OVERREPORT", "severity": "high",
                      "threshold": f"diff > {threshold} (submitted {submitted} vs estimated {estimated})",
                      "measured": measured, "confidence": s["confidence"],
                      "message": f"Submitted attendance ({submitted}) exceeds the headcount in uploaded footage ({estimated})."})
    elif estimated - submitted > threshold:
        flags.append({"rule": "ATTENDANCE_UNDERREPORT", "severity": "low", "threshold": f"estimated - submitted > {threshold}",
                      "measured": measured, "confidence": s["confidence"],
                      "message": f"Uploaded footage shows {estimated} people, more than the {submitted} submitted."})
    if s["chairs"] and estimated > s["chairs"] + 2:
        flags.append({"rule": "SEATING_SHORTFALL", "severity": "medium", "threshold": f"people <= chairs ({s['chairs']})",
                      "measured": measured, "confidence": s["confidence"],
                      "message": f"{estimated} people but only {s['chairs']} chairs visible in uploaded footage."})

    event = {
        "centre_id": req.centre_id, "camera_id": req.camera_id, "session_id": session_id,
        "submitted_count": submitted, "estimated_count": estimated,
        "count_median": estimated, "count_p90": s["people_p90"], "unique_tracks": s["unique_people"],
        "confidence": s["confidence"], "frames_used": r["video"]["frames_analysed"],
        "flags": flags, "thumbnails": [k["image"] for k in r["keyframes"][:3]],
    }
    res = DiscrepancyEngine.process_edge_event(db, event)
    return {"status": "success", "session_id": session_id, "flags": [f["rule"] for f in flags], "result": res}
