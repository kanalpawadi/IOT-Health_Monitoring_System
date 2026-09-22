"""Generative AI monitoring summaries."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query

from .. import db, repo
from ..ai import DISCLAIMER, cached_summary
from ..config import settings
from ..fall import detect_fall
from ..rules import assess_patient

router = APIRouter(prefix="/api/ai", tags=["generative-ai"])


@router.get("/summary")
async def summary(
    device_id: str = Query(default=settings.default_device_id),
    refresh: bool = Query(default=False, description="Bypass the cache"),
    window_minutes: int = Query(default=0, ge=0, le=1440),
):
    """Explain the current rule-engine verdict in plain language.

    The rule engine runs first and its verdict is passed to the model as a
    fixed fact. The model writes the prose; it never sets the status.
    """
    minutes = window_minutes or settings.trend_window_minutes
    rows = await repo.reading_window(device_id, minutes)

    assessment = assess_patient(
        device_id,
        rows,
        persistence_samples=settings.persistence_samples,
        now=datetime.now(timezone.utc),
        offline_after_seconds=settings.offline_after_seconds,
        fall_event=detect_fall(rows),
    )

    patient_name = await repo.get_patient_name(device_id)
    result = await cached_summary(
        assessment, patient_name, db.fetchrow, db.execute, force=refresh
    )

    # The badge the UI renders always comes from the rule engine, never from
    # anything the model wrote.
    result["status"] = assessment.status.value
    result["sample_count"] = len(rows)
    result["window_minutes"] = minutes
    return result


@router.get("/history")
async def history(
    device_id: str = Query(default=settings.default_device_id),
    limit: int = Query(default=20, ge=1, le=200),
):
    """Past AI summaries, for auditing what a caregiver was told and when."""
    rows = await db.fetch(
        """
        select id, created_at, window_start, window_end, status::text as status,
               headline, summary, model, latency_ms
        from ai_summaries
        where device_id = $1
        order by created_at desc
        limit $2
        """,
        device_id, limit,
    )
    return {
        "summaries": [
            {
                **dict(r),
                "created_at": r["created_at"].isoformat(),
                "window_start": r["window_start"].isoformat(),
                "window_end": r["window_end"].isoformat(),
            }
            for r in rows
        ],
        "disclaimer": DISCLAIMER,
    }
