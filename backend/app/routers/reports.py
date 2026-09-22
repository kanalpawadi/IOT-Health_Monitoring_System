"""Downloadable caregiver PDF reports."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from .. import db, repo
from ..ai import cached_summary
from ..config import settings
from ..fall import detect_fall
from ..report import build_report
from ..rules import assess_patient

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/pdf")
async def report_pdf(
    device_id: str = Query(default=settings.default_device_id),
    start: datetime = Query(...),
    end: datetime = Query(...),
    include_ai: bool = Query(default=True),
):
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if start >= end:
        raise HTTPException(400, "`start` must be earlier than `end`.")

    series = await repo.downsampled_range(device_id, start, end, buckets=500)
    stats = await repo.stats_for_range(device_id, start, end)
    alerts = await repo.list_alerts(device_id, limit=200, start=start, end=end)

    window = await repo.reading_window(device_id, settings.trend_window_minutes)
    assessment = assess_patient(
        device_id,
        window,
        persistence_samples=settings.persistence_samples,
        now=datetime.now(timezone.utc),
        offline_after_seconds=settings.offline_after_seconds,
        fall_event=detect_fall(window),
    )

    ai_summary = None
    if include_ai:
        patient_name = await repo.get_patient_name(device_id)
        ai_summary = await cached_summary(
            assessment, patient_name, db.fetchrow, db.execute
        )

    pdf = build_report(
        device_id=device_id,
        patient_name=await repo.get_patient_name(device_id),
        start=start,
        end=end,
        series=series,
        stats=stats,
        alerts=alerts,
        ai_summary=ai_summary,
        status=assessment.status.value,
    )

    filename = (
        f"health-report-{device_id}-{start:%Y%m%d}-{end:%Y%m%d}.pdf"
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
