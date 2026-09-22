"""Sensor simulator -- stream believable vitals into Supabase without hardware.

Useful for building the dashboard, for rehearsing the demo, and for showing the
rule engine tripping on demand when you don't want to hold your breath at the
examiner's table.

Usage (from the backend/ directory, with backend/.env filled in):

    python tools/simulate.py                      # normal vitals, 1 Hz
    python tools/simulate.py --scenario desat     # SpO2 drops -> critical
    python tools/simulate.py --scenario fever     # temperature climbs
    python tools/simulate.py --scenario tachy     # heart rate climbs
    python tools/simulate.py --scenario fall      # injects a fall signature
    python tools/simulate.py --backfill 180       # 3h of history, then exit
"""

from __future__ import annotations

import argparse
import asyncio
import math
import random
import ssl
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import settings  # noqa: E402

INSERT = """
insert into health_data
    (device_id, created_at, bpm, spo2, temperature, movement,
     accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, hr_valid, spo2_valid)
values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true)
"""


class Patient:
    """A slowly drifting set of vitals with plausible noise."""

    def __init__(self, scenario: str):
        self.scenario = scenario
        self.hr = 76.0
        self.spo2 = 98.0
        self.temp = 36.8
        self.t = 0.0
        self.fall_at = 45 if scenario == "fall" else None

    def step(self, dt: float = 1.0):
        self.t += dt

        # Respiratory sinus arrhythmia: heart rate breathes with a ~15 s cycle.
        breath = 2.5 * math.sin(self.t / 15 * 2 * math.pi)

        if self.scenario == "tachy":
            self.hr += 0.22 + random.gauss(0, 0.3)
        elif self.scenario == "brady":
            self.hr -= 0.18 + random.gauss(0, 0.3)
        else:
            self.hr += random.gauss(0, 0.35) - (self.hr - 76) * 0.02

        if self.scenario == "desat":
            self.spo2 -= 0.07 + random.gauss(0, 0.05)
        else:
            self.spo2 += random.gauss(0, 0.15) - (self.spo2 - 98) * 0.05

        if self.scenario == "fever":
            self.temp += 0.004 + random.gauss(0, 0.005)
        else:
            self.temp += random.gauss(0, 0.01) - (self.temp - 36.8) * 0.03

        self.hr = max(35.0, min(180.0, self.hr))
        self.spo2 = max(70.0, min(100.0, self.spo2))
        self.temp = max(34.0, min(41.5, self.temp))

        return {
            "heart_rate": int(round(self.hr + breath)),
            "spo2": int(round(self.spo2)),
            "temperature_c": round(self.temp, 2),
            **self._accel(),
        }

    def _accel(self) -> dict:
        """Accelerometer in g. Resting body ~1g, with a fall signature on cue."""
        if self.fall_at is not None:
            elapsed = self.t - self.fall_at
            if 0 <= elapsed < 1:          # free fall
                mag = 0.25
            elif 1 <= elapsed < 2:        # impact
                mag = 3.1
            elif 2 <= elapsed < 14:       # motionless on the floor
                mag = 1.0
            else:
                mag = 1.0 + random.gauss(0, 0.04)
        else:
            mag = 1.0 + random.gauss(0, 0.05)
            if random.random() < 0.05:    # occasional movement
                mag += random.uniform(0.2, 0.6)

        # Distribute the magnitude across three axes, gravity mostly on z.
        az = mag * random.uniform(0.80, 0.98)
        remaining = max(mag * mag - az * az, 0.0)
        ax = math.sqrt(remaining) * random.uniform(-1, 1)
        ay = math.copysign(math.sqrt(max(remaining - ax * ax, 0.0)), random.uniform(-1, 1))

        return {
            "movement": abs(mag - 1.0) > 0.18,
            "accel_x": round(ax, 4),
            "accel_y": round(ay, 4),
            "accel_z": round(az, 4),
            "gyro_x": round(random.gauss(0, 2.5), 3),
            "gyro_y": round(random.gauss(0, 2.5), 3),
            "gyro_z": round(random.gauss(0, 2.5), 3),
        }


def _ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def connect() -> asyncpg.Connection:
    if not settings.database_url:
        sys.exit("DATABASE_URL is not set. Fill in backend/.env first.")
    return await asyncpg.connect(
        settings.database_url, ssl=_ssl_ctx(), statement_cache_size=0
    )


async def backfill(conn, device_id: str, minutes: int, scenario: str, every: float):
    patient = Patient(scenario)
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=minutes)
    steps = int(minutes * 60 / every)

    batch = []
    for i in range(steps):
        r = patient.step(every)
        ts = start + timedelta(seconds=i * every)
        batch.append((
            device_id, ts, r["heart_rate"], r["spo2"], r["temperature_c"],
            r["movement"],
            r["accel_x"], r["accel_y"], r["accel_z"],
            r["gyro_x"], r["gyro_y"], r["gyro_z"],
        ))

    await conn.executemany(INSERT, batch)
    print(f"Backfilled {len(batch)} readings covering the last {minutes} minutes.")


async def stream(conn, device_id: str, scenario: str, every: float):
    patient = Patient(scenario)
    print(f"Streaming '{scenario}' to device '{device_id}' every {every}s. Ctrl+C to stop.")
    n = 0
    try:
        while True:
            r = patient.step(every)
            await conn.execute(
                INSERT, device_id, datetime.now(timezone.utc),
                r["heart_rate"], r["spo2"], r["temperature_c"], r["movement"],
                r["accel_x"], r["accel_y"], r["accel_z"],
                r["gyro_x"], r["gyro_y"], r["gyro_z"],
            )
            n += 1
            print(
                f"\r#{n:<6} HR {r['heart_rate']:>3} BPM   "
                f"SpO2 {r['spo2']:>3}%   Temp {r['temperature_c']:>5.2f}C",
                end="", flush=True,
            )
            await asyncio.sleep(every)
    except KeyboardInterrupt:
        print(f"\nStopped after {n} readings.")


async def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--device-id", default=settings.default_device_id)
    ap.add_argument("--scenario", default="normal",
                    choices=["normal", "desat", "fever", "tachy", "brady", "fall"])
    ap.add_argument("--every", type=float, default=1.0, help="seconds between readings")
    ap.add_argument("--backfill", type=int, metavar="MINUTES",
                    help="insert this many minutes of history, then exit")
    args = ap.parse_args()

    conn = await connect()
    try:
        await conn.execute(
            """
            insert into devices (device_id, patient_name, ward)
            values ($1, 'Demo Patient', 'General Ward')
            on conflict (device_id) do nothing
            """,
            args.device_id,
        )
        if args.backfill:
            await backfill(conn, args.device_id, args.backfill, args.scenario, args.every)
        else:
            await stream(conn, args.device_id, args.scenario, args.every)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
