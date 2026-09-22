"""Data access helpers: reading windows, alert persistence, device lookup.

Reads go through the ``readings_v`` view (see db/schema.sql), which renames the
physical columns of ``health_data`` to clinical names and maps the firmware's
``bpm = 0`` sentinel to NULL. Writes go to ``health_data`` directly.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from . import db
from .config import settings
from .rules import PatientAssessment, Severity

READING_COLUMNS = """
    id, device_id, recorded_at,
    heart_rate, spo2, temperature_c, movement,
    accel_x, accel_y, accel_z,
    gyro_x, gyro_y, gyro_z,
    accel_magnitude, hr_valid, spo2_valid
"""

_FLOAT_COLUMNS = (
    "spo2", "temperature_c", "accel_x", "accel_y", "accel_z",
    "gyro_x", "gyro_y", "gyro_z", "accel_magnitude",
)


def _to_dict(row) -> dict[str, Any]:
    d = dict(row)
    for key in _FLOAT_COLUMNS:
        if d.get(key) is not None:
            d[key] = float(d[key])
    return d


# --------------------------------------------------------------------------- #
# Devices
# --------------------------------------------------------------------------- #
async def list_devices() -> list[dict[str, Any]]:
    rows = await db.fetch(
        """
        select d.device_id, d.patient_name, d.patient_age, d.ward,
               max(r.recorded_at) as last_seen_at,
               count(r.id)        as reading_count
        from devices d
        left join readings_v r on r.device_id = d.device_id
        group by d.device_id, d.patient_name, d.patient_age, d.ward
        order by d.device_id
        """
    )
    known = {r["device_id"] for r in rows}

    # Also surface any device that is streaming but was never registered, so a
    # freshly flashed board shows up without anyone touching the devices table.
    extra = await db.fetch(
        """
        select device_id,
               null::text as patient_name,
               null::int  as patient_age,
               null::text as ward,
               max(recorded_at) as last_seen_at,
               count(*)         as reading_count
        from readings_v
        group by device_id
        order by device_id
        """
    )

    out = [dict(r) for r in rows]
    out.extend(dict(r) for r in extra if r["device_id"] not in known)
    return out


async def get_patient_name(device_id: str) -> str | None:
    return await db.fetchval(
        "select patient_name from devices where device_id = $1", device_id
    )


# --------------------------------------------------------------------------- #
# Readings
# --------------------------------------------------------------------------- #
async def latest_reading(device_id: str) -> dict[str, Any] | None:
    row = await db.fetchrow(
        f"select {READING_COLUMNS} from readings_v where device_id = $1 "
        "order by recorded_at desc limit 1",
        device_id,
    )
    return _to_dict(row) if row else None


async def reading_window(
    device_id: str,
    minutes: int | None = None,
    limit: int = 2000,
) -> list[dict[str, Any]]:
    """The most recent ``minutes`` of readings, returned oldest-first."""
    minutes = minutes or settings.trend_window_minutes
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    rows = await db.fetch(
        f"""
        select {READING_COLUMNS} from readings_v
        where device_id = $1 and recorded_at >= $2
        order by recorded_at desc
        limit $3
        """,
        device_id, since, limit,
    )
    return [_to_dict(r) for r in reversed(rows)]


async def reading_range(
    device_id: str,
    start: datetime,
    end: datetime,
    limit: int = 5000,
) -> list[dict[str, Any]]:
    rows = await db.fetch(
        f"""
        select {READING_COLUMNS} from readings_v
        where device_id = $1 and recorded_at between $2 and $3
        order by recorded_at asc
        limit $4
        """,
        device_id, start, end, limit,
    )
    return [_to_dict(r) for r in rows]


async def downsampled_range(
    device_id: str,
    start: datetime,
    end: datetime,
    buckets: int = 300,
) -> list[dict[str, Any]]:
    """Average vitals into ~``buckets`` time buckets.

    A day of 10-second readings is ~8600 rows and a week is ~60k; the browser
    does not need them all to draw a trend line, and shipping them would stall
    the chart.
    """
    span = max((end - start).total_seconds(), 1.0)
    bucket_seconds = max(int(span / max(buckets, 1)), 1)

    rows = await db.fetch(
        """
        select
            to_timestamp(floor(extract(epoch from recorded_at) / $4) * $4) as bucket,
            avg(heart_rate)     as heart_rate,
            avg(spo2)           as spo2,
            avg(temperature_c)  as temperature_c,
            max(accel_magnitude) as accel_peak,
            bool_or(movement)   as movement,
            count(*)            as samples
        from readings_v
        where device_id = $1 and recorded_at between $2 and $3
        group by 1
        order by 1 asc
        """,
        device_id, start, end, bucket_seconds,
    )

    def num(v, places=2):
        return round(float(v), places) if v is not None else None

    return [
        {
            "recorded_at": r["bucket"],
            "heart_rate": num(r["heart_rate"], 1),
            "spo2": num(r["spo2"], 1),
            "temperature_c": num(r["temperature_c"], 2),
            "accel_peak": num(r["accel_peak"], 3),
            "movement": r["movement"],
            "samples": r["samples"],
        }
        for r in rows
    ]


async def stats_for_range(
    device_id: str, start: datetime, end: datetime
) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        select
            count(*)             as total,
            min(recorded_at)     as first_at,
            max(recorded_at)     as last_at,
            count(heart_rate)    as hr_valid_count,
            avg(heart_rate)      as hr_avg,
            min(heart_rate)      as hr_min,
            max(heart_rate)      as hr_max,
            count(spo2)          as spo2_valid_count,
            avg(spo2)            as spo2_avg,
            min(spo2)            as spo2_min,
            max(spo2)            as spo2_max,
            avg(temperature_c)   as temp_avg,
            min(temperature_c)   as temp_min,
            max(temperature_c)   as temp_max,
            count(*) filter (where movement) as movement_count
        from readings_v
        where device_id = $1 and recorded_at between $2 and $3
        """,
        device_id, start, end,
    )
    if not row:
        return {}

    def num(v, places=1):
        return round(float(v), places) if v is not None else None

    return {
        "total_readings": row["total"],
        "first_at": row["first_at"].isoformat() if row["first_at"] else None,
        "last_at": row["last_at"].isoformat() if row["last_at"] else None,
        "movement_count": row["movement_count"],
        "heart_rate": {
            "avg": num(row["hr_avg"]), "min": num(row["hr_min"]),
            "max": num(row["hr_max"]), "valid_samples": row["hr_valid_count"],
        },
        "spo2": {
            "avg": num(row["spo2_avg"]), "min": num(row["spo2_min"]),
            "max": num(row["spo2_max"]), "valid_samples": row["spo2_valid_count"],
        },
        "temperature_c": {
            "avg": num(row["temp_avg"], 2), "min": num(row["temp_min"], 2),
            "max": num(row["temp_max"], 2), "valid_samples": row["total"],
        },
    }


# --------------------------------------------------------------------------- #
# Alerts
# --------------------------------------------------------------------------- #
async def persist_alerts(assessment: PatientAssessment) -> list[dict[str, Any]]:
    """Log any newly-tripped rule, respecting the per-rule cooldown.

    Called on every assessment. The cooldown stops a patient who sits at 92%
    SpO2 for an hour from generating a thousand identical alert rows.
    """
    created: list[dict[str, Any]] = []
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.alert_cooldown_seconds)

    candidates: list[tuple[str, float | None, str, str]] = [
        (v.metric, v.value, v.rule, v.message)
        for v in assessment.vitals
        if v.severity is not Severity.NORMAL
    ]
    severities: dict[str, Severity] = {v.metric: v.severity for v in assessment.vitals}

    if assessment.fall and assessment.fall.get("detected"):
        candidates.append((
            "fall",
            assessment.fall.get("impact_g"),
            "fall_detected",
            assessment.fall.get("reason", "A possible fall was detected."),
        ))
        severities["fall"] = Severity.CRITICAL

    for metric, value, rule, message in candidates:
        recent = await db.fetchval(
            """
            select 1 from alerts
            where device_id = $1 and rule = $2 and created_at >= $3
            limit 1
            """,
            assessment.device_id, rule, cutoff,
        )
        if recent:
            continue

        severity = severities.get(metric, Severity.WARNING)
        row = await db.fetchrow(
            """
            insert into alerts (device_id, severity, metric, value, rule, message)
            values ($1, $2::alert_severity, $3, $4, $5, $6)
            returning id, device_id, created_at, severity::text as severity,
                      metric, value, rule, message, acknowledged, acknowledged_at
            """,
            assessment.device_id, severity.value, metric,
            float(value) if value is not None else None, rule, message,
        )
        created.append(_alert_dict(row))

    return created


def _alert_dict(row) -> dict[str, Any]:
    d = dict(row)
    if d.get("value") is not None:
        d["value"] = float(d["value"])
    d["created_at"] = d["created_at"].isoformat()
    if d.get("acknowledged_at"):
        d["acknowledged_at"] = d["acknowledged_at"].isoformat()
    return d


async def list_alerts(
    device_id: str,
    limit: int = 100,
    severity: str | None = None,
    only_open: bool = False,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[dict[str, Any]]:
    clauses = ["device_id = $1"]
    args: list[Any] = [device_id]

    if severity:
        args.append(severity)
        clauses.append(f"severity = ${len(args)}::alert_severity")
    if only_open:
        clauses.append("acknowledged = false")
    if start:
        args.append(start)
        clauses.append(f"created_at >= ${len(args)}")
    if end:
        args.append(end)
        clauses.append(f"created_at <= ${len(args)}")

    args.append(limit)
    rows = await db.fetch(
        f"""
        select id, device_id, created_at, severity::text as severity, metric,
               value, rule, message, acknowledged, acknowledged_at
        from alerts
        where {' and '.join(clauses)}
        order by created_at desc
        limit ${len(args)}
        """,
        *args,
    )
    return [_alert_dict(r) for r in rows]


async def acknowledge_alert(alert_id: int) -> dict[str, Any] | None:
    row = await db.fetchrow(
        """
        update alerts
        set acknowledged = true, acknowledged_at = now()
        where id = $1
        returning id, device_id, created_at, severity::text as severity, metric,
                  value, rule, message, acknowledged, acknowledged_at
        """,
        alert_id,
    )
    return _alert_dict(row) if row else None


async def acknowledge_all(device_id: str) -> int:
    result = await db.execute(
        """
        update alerts set acknowledged = true, acknowledged_at = now()
        where device_id = $1 and acknowledged = false
        """,
        device_id,
    )
    return int(result.split()[-1]) if result else 0


async def alert_counts(device_id: str, start: datetime, end: datetime) -> dict[str, int]:
    rows = await db.fetch(
        """
        select severity::text as severity, count(*) as n
        from alerts
        where device_id = $1 and created_at between $2 and $3
        group by severity
        """,
        device_id, start, end,
    )
    counts = {"normal": 0, "warning": 0, "critical": 0}
    for r in rows:
        counts[r["severity"]] = r["n"]
    return counts
