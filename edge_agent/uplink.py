"""
Edge Uplink, Adaptive Bandwidth Mode, and SQLite Offline Store-and-Forward Queue for KaushalDrishti.

Guarantees:
1. Resilient transmission over intermittent/rural 2G/3G/4G connectivity.
2. Local SQLite queue store-and-forward when backend API is unreachable.
3. Adaptive bandwidth modes:
   - Full: JSON events + all compressed thumbnails (<= 20 KB WebP).
   - Lite: JSON events + thumbnails for high-severity alerts only.
   - Minimal: Hourly/session JSON summary only, zero thumbnails.
4. Generates ultra-compact SMS/USSD text fallback string (< 140 chars).
"""

import os
import json
import time
import sqlite3
import requests
from typing import Dict, Any, List, Optional

class UplinkManager:
    """Manages transmission of edge compliance signals to central API."""

    def __init__(
        self,
        api_base_url: str = "http://localhost:8000",
        bandwidth_mode: str = "full",  # full, lite, minimal
        db_path: str = "edge_agent/offline_queue.db",
        timeout: float = 4.0
    ):
        self.api_base_url = api_base_url.rstrip("/")
        self.bandwidth_mode = bandwidth_mode.lower()
        self.db_path = db_path
        self.timeout = timeout
        self.init_queue()

    def init_queue(self):
        """Initialize local SQLite store-and-forward queue."""
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS offline_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                retries INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        conn.close()

    def set_bandwidth_mode(self, mode: str):
        """Dynamically set bandwidth mode (full, lite, minimal)."""
        if mode in ["full", "lite", "minimal"]:
            self.bandwidth_mode = mode

    def filter_payload_for_bandwidth(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Strip thumbnails according to current bandwidth mode."""
        filtered = dict(payload)
        
        if self.bandwidth_mode == "minimal":
            # Zero thumbnails transmitted in minimal mode
            filtered["thumbnails"] = []
        elif self.bandwidth_mode == "lite":
            # Transmit thumbnails only if a high-severity alert is present
            has_high_sev = any(f.get("severity") == "high" for f in filtered.get("flags", []))
            if not has_high_sev:
                filtered["thumbnails"] = []
            elif len(filtered.get("thumbnails", [])) > 1:
                # Keep at most 1 thumbnail in lite mode
                filtered["thumbnails"] = filtered["thumbnails"][:1]

        return filtered

    @staticmethod
    def generate_sms_summary(payload: Dict[str, Any]) -> str:
        """
        Generate ultra-compact SMS/USSD string (< 140 chars) for extreme low-bandwidth/GSM fallback.
        Format: CID:TC001|SID:101|SUB:25|EST:4|ALERTS:ATT_OVERREPORT
        """
        cid = payload.get("centre_id", "TC")
        sid = payload.get("session_id", "S")[-6:]
        sub = payload.get("submitted_count", 0)
        est = payload.get("estimated_count", 0)
        flags = payload.get("flags", [])
        alert_str = ",".join([f["rule"][:10] for f in flags]) if flags else "OK"

        compact = f"SS|{cid}|{sid}|S:{sub}|E:{est}|A:{alert_str}"
        return compact[:139]

    def queue_offline(self, event_type: str, payload: Dict[str, Any]):
        """Persist event in local SQLite queue during network outages."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO offline_events (event_type, payload_json, retries) VALUES (?, ?, ?)",
            (event_type, json.dumps(payload), 0)
        )
        conn.commit()
        conn.close()

    def flush_offline_queue(self) -> int:
        """Attempt to transmit all queued offline events to API."""
        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()
        cur.execute("SELECT id, event_type, payload_json, retries FROM offline_events ORDER BY id ASC LIMIT 50")
        rows = cur.fetchall()
        
        if not rows:
            conn.close()
            return 0

        flushed = 0
        for row_id, event_type, payload_json, retries in rows:
            payload = json.loads(payload_json)
            try:
                endpoint = f"{self.api_base_url}/api/v1/uplink/event"
                resp = requests.post(endpoint, json=payload, timeout=self.timeout)
                if resp.status_code == 200:
                    cur.execute("DELETE FROM offline_events WHERE id = ?", (row_id,))
                    flushed += 1
                else:
                    cur.execute("UPDATE offline_events SET retries = retries + 1 WHERE id = ?", (row_id,))
            except Exception:
                cur.execute("UPDATE offline_events SET retries = retries + 1 WHERE id = ?", (row_id,))
                break  # Stop flushing if network still down

        conn.commit()
        conn.close()
        return flushed

    def send_event(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Transmit event to central API with offline queue fallback.
        """
        # First, try to flush any previously queued events
        self.flush_offline_queue()

        # Apply bandwidth mode filtering
        filtered_payload = self.filter_payload_for_bandwidth(payload)
        endpoint = f"{self.api_base_url}/api/v1/uplink/event"

        try:
            resp = requests.post(endpoint, json=filtered_payload, timeout=self.timeout)
            if resp.status_code == 200:
                return {"status": "transmitted", "mode": self.bandwidth_mode, "api_response": resp.json()}
            else:
                self.queue_offline("event", filtered_payload)
                return {"status": "queued_offline", "error": f"HTTP {resp.status_code}"}
        except Exception as e:
            self.queue_offline("event", filtered_payload)
            sms_text = self.generate_sms_summary(payload)
            return {"status": "queued_offline", "error": str(e), "sms_fallback": sms_text}
