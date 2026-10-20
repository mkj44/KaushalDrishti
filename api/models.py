"""
SQLAlchemy database models for KaushalDrishti compliance monitoring.
"""

import os
from datetime import datetime
from typing import List, Optional
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey, create_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

Base = declarative_base()

class Centre(Base):
    __tablename__ = "centres"

    id = Column(String(50), primary_key=True)
    name = Column(String(150), nullable=False)
    scheme = Column(String(100), default="PMKVY")
    district = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    contact_email = Column(String(120), nullable=True)
    compliance_score = Column(Float, default=100.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    cameras = relationship("Camera", back_populates="centre", cascade="all, delete-orphan")
    sessions = relationship("SessionRecord", back_populates="centre", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="centre", cascade="all, delete-orphan")
    inventory = relationship("InventoryItem", back_populates="centre", cascade="all, delete-orphan")

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String(50), primary_key=True)
    centre_id = Column(String(50), ForeignKey("centres.id"), nullable=False)
    name = Column(String(100), nullable=False)
    resolution = Column(String(20), default="1280x720")
    fps = Column(Integer, default=25)
    status = Column(String(20), default="online")  # online, offline, obstructed
    last_seen = Column(DateTime, default=datetime.utcnow)

    centre = relationship("Centre", back_populates="cameras")

class SessionRecord(Base):
    __tablename__ = "session_records"

    id = Column(String(80), primary_key=True)  # centre_id + session_id + timestamp
    centre_id = Column(String(50), ForeignKey("centres.id"), nullable=False)
    camera_id = Column(String(50), nullable=False)
    session_id = Column(String(50), nullable=False)
    date = Column(String(20), default=lambda: datetime.utcnow().strftime("%Y-%m-%d"))
    submitted_count = Column(Integer, default=0)
    estimated_count = Column(Integer, default=0)
    count_median = Column(Integer, default=0)
    count_p90 = Column(Integer, default=0)
    unique_tracks = Column(Integer, default=0)
    confidence = Column(Float, default=0.0)
    frames_used = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    centre = relationship("Centre", back_populates="sessions")

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(80), primary_key=True)
    centre_id = Column(String(50), ForeignKey("centres.id"), nullable=False)
    camera_id = Column(String(50), nullable=True)
    session_id = Column(String(50), nullable=True)
    item_id = Column(String(50), nullable=True)
    rule = Column(String(60), nullable=False)
    severity = Column(String(20), default="medium")  # low, medium, high
    status = Column(String(20), default="open")      # open, acknowledged, resolved
    threshold = Column(String(200), nullable=True)
    measured = Column(String(200), nullable=True)
    confidence = Column(Float, default=0.0)
    message = Column(Text, nullable=False)
    thumbnails_json = Column(Text, default="[]")     # JSON list of base64 images
    audit_trail_json = Column(Text, default="[]")    # JSON list of {timestamp, action, user, note}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    centre = relationship("Centre", back_populates="alerts")

class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(String(50), primary_key=True)
    centre_id = Column(String(50), ForeignKey("centres.id"), nullable=False)
    camera_id = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    expected_count = Column(Integer, default=1)
    status = Column(String(30), default="present")  # present, missing, idle, active
    operability_mode = Column(String(100), nullable=True)
    last_checked = Column(DateTime, default=datetime.utcnow)

    centre = relationship("Centre", back_populates="inventory")

# Database initialization helper
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///skillsight.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)
