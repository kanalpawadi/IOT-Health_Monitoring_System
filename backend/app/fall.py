"""Threshold-based fall detection from MPU6050 accelerometer data.

This implements the *threshold* stage of the two-step scheme described by Xu,
Se and Liu (reference [6] in the synopsis): a free-fall dip followed by an
impact spike followed by a period of near-stillness. Their second stage feeds
the triggered window to a CNN; that stage is left as the documented extension
point rather than pretended at here, because we have no labelled fall data to
train on.

Units: accelerometer values are expected in g (1.0 = gravity). If your firmware
publishes raw LSB counts, divide by the sensitivity (16384 for the default
+/-2g range) before inserting into the database.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Sequence

# --------------------------------------------------------------------------- #
# Tunables. These are the values commonly reported for waist/chest-mounted
# MPU6050 fall detection; widen FREE_FALL_G if your board is wrist-mounted,
# where ordinary arm swings produce deeper dips.
# --------------------------------------------------------------------------- #
FREE_FALL_G = 0.5        # magnitude below this = body is unsupported
IMPACT_G = 2.5           # magnitude above this = ground impact
STILLNESS_G = 0.25       # deviation from 1g that counts as "not moving"
IMPACT_WINDOW_S = 2.0    # impact must follow free-fall within this long
STILLNESS_WINDOW_S = 10.0  # how long after impact we look for stillness
STILLNESS_MIN_SAMPLES = 2


def _magnitude(row: dict[str, Any]) -> float | None:
    mag = row.get("accel_magnitude")
    if mag is not None:
        return float(mag)
    ax, ay, az = row.get("accel_x"), row.get("accel_y"), row.get("accel_z")
    if ax is None or ay is None or az is None:
        return None
    return float((float(ax) ** 2 + float(ay) ** 2 + float(az) ** 2) ** 0.5)


def detect_fall(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """Scan a window of readings (oldest-first) for a fall signature.

    Returns a dict that is always safe to serialise, with ``detected`` False
    when there is no accelerometer data at all -- an absent MPU6050 must read
    as "not monitored", never as "no fall occurred".
    """
    samples: list[tuple[datetime, float]] = []
    for row in rows:
        mag = _magnitude(row)
        if mag is not None:
            samples.append((row["recorded_at"], mag))

    if not samples:
        # No axis data. Fall back to the firmware's `movement` boolean, which
        # can describe activity but cannot describe a fall: a fall is a
        # *sequence* (free fall, impact, stillness) and a single bit per sample
        # cannot express one. So report activity and say falls are unmonitored
        # rather than implying none occurred.
        flags = [bool(r.get("movement")) for r in rows if r.get("movement") is not None]
        if flags:
            moving = sum(flags)
            ratio = moving / len(flags)
            activity = (
                "resting" if ratio < 0.1
                else "light movement" if ratio < 0.5
                else "active"
            )
            return {
                "detected": False,
                "monitored": False,
                "activity": activity,
                "movement_samples": moving,
                "total_samples": len(flags),
                "reason": (
                    "Activity is derived from the firmware's movement flag. "
                    "Fall detection needs MPU6050 accelerometer axes, which "
                    "this device is not sending yet."
                ),
            }

        return {
            "detected": False,
            "monitored": False,
            "reason": "No accelerometer or movement data in this window.",
            "activity": "unknown",
        }

    latest_mag = samples[-1][1]
    activity = _activity_label(samples)

    # --- stage 1: free fall ------------------------------------------------ #
    for i, (t_ff, mag_ff) in enumerate(samples):
        if mag_ff > FREE_FALL_G:
            continue

        # --- stage 2: impact within IMPACT_WINDOW_S ------------------------ #
        for t_imp, mag_imp in samples[i + 1:]:
            if (t_imp - t_ff).total_seconds() > IMPACT_WINDOW_S:
                break
            if mag_imp < IMPACT_G:
                continue

            # --- stage 3: post-impact stillness --------------------------- #
            still = [
                mag
                for t, mag in samples
                if t > t_imp
                and (t - t_imp) <= timedelta(seconds=STILLNESS_WINDOW_S)
                and abs(mag - 1.0) <= STILLNESS_G
            ]
            confirmed = len(still) >= STILLNESS_MIN_SAMPLES

            return {
                "detected": True,
                "monitored": True,
                "confirmed_by_stillness": confirmed,
                "detected_at": t_imp.isoformat(),
                "free_fall_g": round(mag_ff, 3),
                "impact_g": round(mag_imp, 3),
                "stillness_samples": len(still),
                "activity": "fallen" if confirmed else "possible fall",
                "reason": (
                    f"Free-fall dip to {mag_ff:.2f}g followed by a {mag_imp:.2f}g "
                    f"impact"
                    + (
                        f", then {len(still)} near-motionless readings."
                        if confirmed
                        else ", but the patient kept moving afterwards."
                    )
                ),
            }

    return {
        "detected": False,
        "monitored": True,
        "activity": activity,
        "latest_magnitude": round(latest_mag, 3),
        "reason": "No free-fall-then-impact pattern in this window.",
    }


def _activity_label(samples: Sequence[tuple[datetime, float]]) -> str:
    """Coarse activity state from recent accelerometer magnitude spread."""
    recent = [mag for _, mag in samples[-20:]]
    if len(recent) < 2:
        return "unknown"

    spread = max(recent) - min(recent)
    mean = sum(recent) / len(recent)

    if spread < 0.08 and abs(mean - 1.0) < 0.15:
        return "resting"
    if spread < 0.35:
        return "light movement"
    return "active"
