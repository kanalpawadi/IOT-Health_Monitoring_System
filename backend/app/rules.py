"""Deterministic rule and trend engine.

This module decides Normal / Warning / Critical. The Generative AI layer only
ever *explains* the verdict this module produces -- it never produces one. That
separation is the safety property the synopsis commits to, so keep it: nothing
in here may import from ``ai.py``.

Thresholds below are the conventional adult resting ranges used throughout the
low-cost monitoring literature. They are configurable rather than hard-coded
clinical truth, and the system is explicitly advisory, not diagnostic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from statistics import fmean
from typing import Any, Iterable, Sequence


class Severity(str, Enum):
    NORMAL = "normal"
    WARNING = "warning"
    CRITICAL = "critical"

    @property
    def rank(self) -> int:
        return {"normal": 0, "warning": 1, "critical": 2}[self.value]


def worst(severities: Iterable[Severity]) -> Severity:
    """The most severe of a set of verdicts (Normal if the set is empty)."""
    return max(severities, key=lambda s: s.rank, default=Severity.NORMAL)


# --------------------------------------------------------------------------- #
# Threshold bands
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Band:
    """A vital's acceptable bands.

    A value is CRITICAL outside [crit_low, crit_high], WARNING outside
    [warn_low, warn_high], and NORMAL otherwise. A None bound means that
    direction is unbounded (e.g. SpO2 has no dangerous upper limit).

    Outside [plaus_low, plaus_high] the value is treated as a SENSOR FAULT
    rather than as a patient emergency. This distinction matters: a MAX30102
    that reports 174 BPM because a finger shifted is a bad reading, and a
    DS18B20 reporting 30 degC is measuring room air, not a patient in profound
    hypothermia. Raising a critical patient alarm for either would train the
    caregiver to ignore the alarms that matter.
    """

    metric: str
    label: str
    unit: str
    warn_low: float | None
    warn_high: float | None
    crit_low: float | None
    crit_high: float | None
    # Physiologically possible range for a correctly-attached sensor.
    plaus_low: float | None = None
    plaus_high: float | None = None
    # What to tell the user when a reading falls outside the plausible range.
    fault_hint: str = "Check that the sensor is correctly attached."
    # A change of at least this much across the trend window is worth naming.
    trend_epsilon: float = 0.0

    def is_plausible(self, value: float) -> bool:
        if self.plaus_low is not None and value < self.plaus_low:
            return False
        if self.plaus_high is not None and value > self.plaus_high:
            return False
        return True

    def classify(self, value: float) -> tuple[Severity, str]:
        if self.crit_low is not None and value < self.crit_low:
            return Severity.CRITICAL, f"{self.metric}_critical_low"
        if self.crit_high is not None and value > self.crit_high:
            return Severity.CRITICAL, f"{self.metric}_critical_high"
        if self.warn_low is not None and value < self.warn_low:
            return Severity.WARNING, f"{self.metric}_low"
        if self.warn_high is not None and value > self.warn_high:
            return Severity.WARNING, f"{self.metric}_high"
        return Severity.NORMAL, f"{self.metric}_normal"

    def describe_range(self) -> str:
        if self.warn_low is not None and self.warn_high is not None:
            return f"{self.warn_low:g}-{self.warn_high:g} {self.unit}"
        if self.warn_low is not None:
            return f"{self.warn_low:g} {self.unit} or above"
        if self.warn_high is not None:
            return f"up to {self.warn_high:g} {self.unit}"
        return f"any {self.unit}"


BANDS: dict[str, Band] = {
    "heart_rate": Band(
        metric="heart_rate",
        label="Heart rate",
        unit="BPM",
        warn_low=60,
        warn_high=100,
        crit_low=50,
        crit_high=120,
        plaus_low=35,
        plaus_high=200,
        fault_hint=(
            "Keep the fingertip still and fully covering the MAX30102 window; "
            "readings outside 35-200 BPM are almost always motion artifacts."
        ),
        trend_epsilon=5.0,
    ),
    "spo2": Band(
        metric="spo2",
        label="Blood oxygen (SpO2)",
        unit="%",
        warn_low=95,
        warn_high=None,
        crit_low=90,
        crit_high=None,
        plaus_low=70,
        plaus_high=100,
        fault_hint="Keep the fingertip still and fully covering the MAX30102 window.",
        trend_epsilon=2.0,
    ),
    "temperature_c": Band(
        metric="temperature_c",
        label="Body temperature",
        unit="°C",
        warn_low=36.1,
        warn_high=37.5,
        crit_low=35.0,
        crit_high=38.5,
        plaus_low=32.0,
        plaus_high=45.0,
        fault_hint=(
            "A reading near room temperature means the DS18B20 is measuring "
            "air, not the patient. Tape the probe against the skin "
            "(armpit or forehead) and allow ~30 s to settle."
        ),
        trend_epsilon=0.3,
    ),
}


# --------------------------------------------------------------------------- #
# Trend detection
# --------------------------------------------------------------------------- #
@dataclass
class Trend:
    direction: str  # "rising" | "falling" | "stable" | "unknown"
    slope_per_min: float  # least-squares slope, units per minute
    change: float  # last value minus first value across the window
    samples: int

    def phrase(self, label: str) -> str:
        if self.direction == "unknown":
            return f"{label}: not enough data to judge a trend"
        if self.direction == "stable":
            return f"{label}: stable over the window"
        return f"{label}: {self.direction} ({self.change:+.1f} across the window)"


def compute_trend(
    points: Sequence[tuple[datetime, float]],
    epsilon: float,
) -> Trend:
    """Least-squares slope of a vital over time.

    ``points`` must be ordered oldest-first. A trend is only called rising or
    falling if the total change across the window clears ``epsilon``; this
    stops sensor jitter from being narrated as a clinical trend.
    """
    if len(points) < 3:
        return Trend("unknown", 0.0, 0.0, len(points))

    t0 = points[0][0]
    xs = [(t - t0).total_seconds() / 60.0 for t, _ in points]
    ys = [v for _, v in points]

    mx, my = fmean(xs), fmean(ys)
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return Trend("stable", 0.0, 0.0, len(points))

    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom
    change = ys[-1] - ys[0]

    if abs(change) < epsilon:
        direction = "stable"
    elif change > 0:
        direction = "rising"
    else:
        direction = "falling"

    return Trend(direction, slope, change, len(points))


# --------------------------------------------------------------------------- #
# Per-vital evaluation
# --------------------------------------------------------------------------- #
@dataclass
class VitalAssessment:
    metric: str
    label: str
    unit: str
    value: float | None
    severity: Severity
    rule: str
    message: str
    trend: Trend
    normal_range: str
    breaching_streak: int = 0
    # True when the sensor is reporting values no attached sensor could produce.
    sensor_fault: bool = False
    # Readings discarded as artifacts in this window.
    discarded: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "metric": self.metric,
            "label": self.label,
            "unit": self.unit,
            "value": self.value,
            "severity": self.severity.value,
            "rule": self.rule,
            "message": self.message,
            "normal_range": self.normal_range,
            "breaching_streak": self.breaching_streak,
            "sensor_fault": self.sensor_fault,
            "discarded": self.discarded,
            "trend": {
                "direction": self.trend.direction,
                "change": round(self.trend.change, 2),
                "slope_per_min": round(self.trend.slope_per_min, 4),
                "samples": self.trend.samples,
            },
        }


def _message_for(band: Band, value: float, severity: Severity, streak: int) -> str:
    if severity is Severity.NORMAL:
        return f"{band.label} {value:g} {band.unit} is within the expected range."
    direction = "below" if (
        (band.crit_low is not None and value < band.crit_low)
        or (band.warn_low is not None and value < band.warn_low)
    ) else "above"
    word = "critically " if severity is Severity.CRITICAL else ""
    return (
        f"{band.label} {value:g} {band.unit} is {word}{direction} the expected "
        f"range ({band.describe_range()}) across {streak} consecutive readings."
    )


def assess_vital(
    metric: str,
    history: Sequence[tuple[datetime, float]],
    persistence_samples: int,
) -> VitalAssessment:
    """Evaluate one vital against its band, with persistence and trend.

    ``history`` is oldest-first and must already be filtered to non-null values.
    Implausible values are discarded here rather than by the caller, so the
    count of discarded artifacts stays attached to the assessment and can be
    shown as a signal-quality indicator.
    """
    band = BANDS[metric]

    if not history:
        return VitalAssessment(
            metric=metric,
            label=band.label,
            unit=band.unit,
            value=None,
            severity=Severity.NORMAL,
            rule=f"{metric}_no_data",
            message=f"{band.label} has not been measured recently.",
            trend=Trend("unknown", 0.0, 0.0, 0),
            normal_range=band.describe_range(),
        )

    plausible = [(t, v) for t, v in history if band.is_plausible(v)]
    discarded = len(history) - len(plausible)

    if not plausible:
        # Every reading in the window was outside the physically possible
        # range. That is a sensor problem to fix, not a patient emergency.
        raw_latest = history[-1][1]
        return VitalAssessment(
            metric=metric,
            label=band.label,
            unit=band.unit,
            value=raw_latest,
            severity=Severity.WARNING,
            rule=f"{metric}_sensor_fault",
            message=(
                f"{band.label} is reading {raw_latest:g} {band.unit}, which is "
                f"outside the range a correctly attached sensor can produce. "
                f"{band.fault_hint}"
            ),
            trend=Trend("unknown", 0.0, 0.0, 0),
            normal_range=band.describe_range(),
            sensor_fault=True,
            discarded=discarded,
        )

    history = plausible
    latest = history[-1][1]
    instant_severity, rule = band.classify(latest)

    # Persistence: count how many of the most recent readings agree with the
    # latest verdict. A one-off spike is downgraded rather than alerted on.
    streak = 0
    for _, value in reversed(history):
        sev, _ = band.classify(value)
        if sev is instant_severity:
            streak += 1
        else:
            break

    severity = instant_severity
    if instant_severity is not Severity.NORMAL and streak < persistence_samples:
        # Not yet persistent. A critical value still deserves a warning
        # immediately -- silently swallowing it would be the wrong failure mode.
        severity = (
            Severity.WARNING if instant_severity is Severity.CRITICAL else Severity.NORMAL
        )
        rule = f"{rule}_unconfirmed"

    return VitalAssessment(
        metric=metric,
        label=band.label,
        unit=band.unit,
        value=latest,
        severity=severity,
        rule=rule,
        message=_message_for(band, latest, severity, streak),
        trend=compute_trend(history, band.trend_epsilon),
        normal_range=band.describe_range(),
        breaching_streak=streak,
        discarded=discarded,
    )


# --------------------------------------------------------------------------- #
# Whole-patient assessment
# --------------------------------------------------------------------------- #
@dataclass
class PatientAssessment:
    device_id: str
    status: Severity
    evaluated_at: datetime
    vitals: list[VitalAssessment] = field(default_factory=list)
    fall: dict[str, Any] | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    online: bool = True
    seconds_since_reading: float | None = None

    @property
    def problems(self) -> list[VitalAssessment]:
        return [v for v in self.vitals if v.severity is not Severity.NORMAL]

    def to_dict(self) -> dict[str, Any]:
        return {
            "device_id": self.device_id,
            "status": self.status.value,
            "evaluated_at": self.evaluated_at.isoformat(),
            "online": self.online,
            "seconds_since_reading": self.seconds_since_reading,
            "window_start": self.window_start.isoformat() if self.window_start else None,
            "window_end": self.window_end.isoformat() if self.window_end else None,
            "vitals": [v.to_dict() for v in self.vitals],
            "fall": self.fall,
        }


def assess_patient(
    device_id: str,
    rows: Sequence[dict[str, Any]],
    *,
    persistence_samples: int,
    now: datetime,
    offline_after_seconds: int,
    fall_event: dict[str, Any] | None = None,
) -> PatientAssessment:
    """Run every rule over a window of readings, oldest-first."""
    vitals: list[VitalAssessment] = []

    for metric in BANDS:
        history: list[tuple[datetime, float]] = []
        for row in rows:
            value = row.get(metric)
            if value is None:
                continue
            # Respect the firmware's own validity flags where present.
            if metric == "heart_rate" and row.get("hr_valid") is False:
                continue
            if metric == "spo2" and row.get("spo2_valid") is False:
                continue
            history.append((row["recorded_at"], float(value)))
        vitals.append(assess_vital(metric, history, persistence_samples))

    severities = [v.severity for v in vitals]
    if fall_event and fall_event.get("detected"):
        severities.append(Severity.CRITICAL)

    last_at = rows[-1]["recorded_at"] if rows else None
    gap = (now - last_at).total_seconds() if last_at else None
    online = gap is not None and gap <= offline_after_seconds

    return PatientAssessment(
        device_id=device_id,
        status=worst(severities),
        evaluated_at=now,
        vitals=vitals,
        fall=fall_event,
        window_start=rows[0]["recorded_at"] if rows else None,
        window_end=last_at,
        online=online,
        seconds_since_reading=gap,
    )
