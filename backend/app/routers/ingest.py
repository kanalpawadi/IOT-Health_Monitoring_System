"""Optional ingest endpoint for the ESP8266.

Your board currently writes to Supabase directly, which is fine. This endpoint
exists so the firmware can instead POST to the backend (matching the block
diagram's "ESP8266 -> backend -> database" arrow) and get rule evaluation on
the same round trip -- handy if you later want the board to buzz on a critical
reading without waiting for the dashboard to poll.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .. import db, repo
from ..config import settings
from ..fall import detect_fall
from ..rules import assess_patient

router = APIRouter(prefix="/api/ingest", tags=["ingest"])


class ReadingIn(BaseModel):
    device_id: str = Field(default=settings.default_device_id, max_length=64)
    recorded_at: datetime | None = None

    heart_rate: int | None = Field(default=None, ge=0, le=300)
    spo2: int | None = Field(default=None, ge=0, le=100)
    temperature_c: float | None = Field(default=None, ge=0, le=60)
    movement: bool | None = None

    accel_x: float | None = None
    accel_y: float | None = None
    accel_z: float | None = None
    gyro_x: float | None = None
    gyro_y: float | None = None
    gyro_z: float | None = None

    hr_valid: bool | None = None
    spo2_valid: bool | None = None


@router.post("")
async def ingest(reading: ReadingIn, x_device_key: str | None = Header(default=None)):
    """Insert one reading and return the resulting status.

    If ``INGEST_KEY`` is configured, the board must send it as the
    ``X-Device-Key`` header. Left unset the endpoint is open, which is
    acceptable on a lab network but should be set before any public deployment.
    """
    expected = getattr(settings, "ingest_key", "")
    if expected and x_device_key != expected:
        raise HTTPException(401, "Invalid or missing X-Device-Key header.")

    recorded_at = reading.recorded_at or datetime.now(timezone.utc)
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)

    # Physical column names: health_data uses bpm / temperature / created_at.
    row = await db.fetchrow(
        """
        insert into health_data
            (device_id, created_at, bpm, spo2, temperature, movement,
             accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z,
             hr_valid, spo2_valid)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        returning id
        """,
        reading.device_id, recorded_at, reading.heart_rate, reading.spo2,
        reading.temperature_c, reading.movement,
        reading.accel_x, reading.accel_y, reading.accel_z,
        reading.gyro_x, reading.gyro_y, reading.gyro_z,
        reading.hr_valid, reading.spo2_valid,
    )

    await db.execute(
        """
        insert into devices (device_id, last_seen_at) values ($1, $2)
        on conflict (device_id) do update set last_seen_at = excluded.last_seen_at
        """,
        reading.device_id, recorded_at,
    )

    window = await repo.reading_window(reading.device_id, settings.trend_window_minutes)
    assessment = assess_patient(
        reading.device_id,
        window,
        persistence_samples=settings.persistence_samples,
        now=datetime.now(timezone.utc),
        offline_after_seconds=settings.offline_after_seconds,
        fall_event=detect_fall(window),
    )
    new_alerts = await repo.persist_alerts(assessment)

    return {
        "id": row["id"],
        "status": assessment.status.value,
        "new_alerts": len(new_alerts),
    }
