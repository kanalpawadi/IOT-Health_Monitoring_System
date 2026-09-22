"""Alert history and acknowledgement."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from .. import repo
from ..config import settings

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(
    device_id: str = Query(default=settings.default_device_id),
    limit: int = Query(default=100, ge=1, le=1000),
    severity: str | None = Query(default=None, pattern="^(normal|warning|critical)$"),
    only_open: bool = Query(default=False),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
):
    if start and start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end and end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    alerts = await repo.list_alerts(
        device_id, limit=limit, severity=severity,
        only_open=only_open, start=start, end=end,
    )
    open_count = sum(1 for a in alerts if not a["acknowledged"])
    return {
        "alerts": alerts,
        "count": len(alerts),
        "open_count": open_count,
        "critical_open": sum(
            1 for a in alerts
            if not a["acknowledged"] and a["severity"] == "critical"
        ),
    }


@router.post("/{alert_id}/acknowledge")
async def acknowledge(alert_id: int):
    alert = await repo.acknowledge_alert(alert_id)
    if not alert:
        raise HTTPException(404, f"Alert {alert_id} not found.")
    return alert


@router.post("/acknowledge-all")
async def acknowledge_all(device_id: str = Query(default=settings.default_device_id)):
    return {"acknowledged": await repo.acknowledge_all(device_id)}
