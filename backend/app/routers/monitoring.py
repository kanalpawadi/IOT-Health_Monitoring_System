"""Live monitoring: devices, latest reading, and the rule-engine assessment."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from .. import repo
from ..config import settings
from ..fall import detect_fall
from ..rules import assess_patient

router = APIRouter(prefix="/api", tags=["monitoring"])


@router.get("/devices")
async def get_devices():
    devices = await repo.list_devices()
    now = datetime.now(timezone.utc)
    for d in devices:
        last = d.get("last_seen_at")
        d["last_seen_at"] = last.isoformat() if last else None
        d["online"] = bool(
            last and (now - last).total_seconds() <= settings.offline_after_seconds
        )
    return {"devices": devices, "default_device_id": settings.default_device_id}


@router.get("/latest")
async def get_latest(device_id: str = Query(default=settings.default_device_id)):
    reading = await repo.latest_reading(device_id)
    if not reading:
        raise HTTPException(404, f"No readings yet for device '{device_id}'.")
    reading["recorded_at"] = reading["recorded_at"].isoformat()
    return reading


@router.get("/status")
async def get_status(
    device_id: str = Query(default=settings.default_device_id),
    window_minutes: int = Query(default=0, ge=0, le=1440),
):
    """The full rule-engine verdict: per-vital severity, trends, fall state.

    This is the endpoint the dashboard polls. It also persists any newly
    tripped alert, so alerting happens as a side effect of someone watching --
    which is the right trade-off for a prototype with no always-on worker.
    """
    minutes = window_minutes or settings.trend_window_minutes
    rows = await repo.reading_window(device_id, minutes)

    fall_event = detect_fall(rows)
    assessment = assess_patient(
        device_id,
        rows,
        persistence_samples=settings.persistence_samples,
        now=datetime.now(timezone.utc),
        offline_after_seconds=settings.offline_after_seconds,
        fall_event=fall_event,
    )

    new_alerts = await repo.persist_alerts(assessment)

    payload = assessment.to_dict()
    payload["new_alerts"] = new_alerts
    payload["window_minutes"] = minutes
    payload["sample_count"] = len(rows)
    payload["patient_name"] = await repo.get_patient_name(device_id)
    return payload


@router.get("/series")
async def get_series(
    device_id: str = Query(default=settings.default_device_id),
    minutes: int = Query(default=15, ge=1, le=10080),
    downsample: bool = Query(default=False),
):
    """Recent readings for the live charts."""
    end = datetime.now(timezone.utc)
    start = end.fromtimestamp(end.timestamp() - minutes * 60, tz=timezone.utc)

    if downsample:
        rows = await repo.downsampled_range(device_id, start, end)
    else:
        rows = await repo.reading_range(device_id, start, end)

    for r in rows:
        r["recorded_at"] = r["recorded_at"].isoformat()
    return {"device_id": device_id, "points": rows, "count": len(rows)}


@router.get("/history")
async def get_history(
    device_id: str = Query(default=settings.default_device_id),
    start: datetime = Query(...),
    end: datetime = Query(...),
    buckets: int = Query(default=300, ge=20, le=2000),
):
    """Downsampled history plus statistics for an arbitrary date range."""
    start, end = _normalise(start, end)

    rows = await repo.downsampled_range(device_id, start, end, buckets)
    for r in rows:
        r["recorded_at"] = r["recorded_at"].isoformat()

    return {
        "device_id": device_id,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "points": rows,
        "stats": await repo.stats_for_range(device_id, start, end),
        "alert_counts": await repo.alert_counts(device_id, start, end),
    }


def _normalise(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if start >= end:
        raise HTTPException(400, "`start` must be earlier than `end`.")
    return start, end
