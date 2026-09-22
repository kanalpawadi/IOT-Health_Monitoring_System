"""Generative AI explanation layer (Groq).

Design rules, in priority order:

1. The LLM never decides status. It receives the rule engine's verdict as a
   fact and writes prose around it. If the model's text and the rule engine
   disagree, the dashboard shows the rule engine's badge -- the AI text is
   presented beside it, not in place of it.
2. The LLM sees only the structured digest built in ``build_digest``. No raw
   sensor arrays, no free-text passthrough from anywhere, so there is no
   channel for prompt injection from the data path.
3. Every call is stored with its input digest, so any summary a caregiver saw
   can be reconstructed and audited afterwards.
4. If the API key is missing or the call fails, we fall back to a deterministic
   template. A failed LLM call must degrade the prose, never the monitoring.
"""

from __future__ import annotations

import json
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .config import settings
from .rules import PatientAssessment, Severity

GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_PROMPT = """\
You are a monitoring assistant inside a remote patient health monitoring \
dashboard. You explain sensor data to caregivers and family members who have \
no medical training.

Hard rules:
- You do NOT diagnose. Never name a disease, condition, or cause.
- You do NOT prescribe. Never suggest medication, dosage, or treatment.
- The STATUS field is decided by a deterministic rule engine, not by you. \
Treat it as given and explain it. Never contradict it or invent a different \
severity.
- Use ONLY the numbers provided. Never invent a reading, a time, or a trend \
that is not in the data. If something was not measured, say it was not \
measured.
- A vital marked "sensor_fault": true is a BROKEN SENSOR, not a patient \
emergency. Tell the caregiver to check that sensor. Never describe its \
raw_value as the patient's real condition.
- For a critical status, the first sentence must tell the caregiver to seek \
medical help. Be calm and direct, not alarming.
- Plain language. No jargon. Short sentences. No bullet lists.

Respond with strict JSON only, no markdown fence, in this exact shape:
{"headline": "<max 12 words>", "summary": "<3 to 5 sentences>"}\
"""

DISCLAIMER = (
    "This summary is generated from sensor readings for monitoring assistance "
    "only. It is not a medical diagnosis."
)


# --------------------------------------------------------------------------- #
# Structured digest -- the ONLY thing the model ever sees
# --------------------------------------------------------------------------- #
def build_digest(assessment: PatientAssessment, patient_name: str | None = None) -> dict[str, Any]:
    vitals = []
    for v in assessment.vitals:
        if v.value is None:
            vitals.append({
                "name": v.label,
                "measured": False,
                "note": "sensor did not report a valid value in this window",
            })
            continue
        if v.sensor_fault:
            # Critical framing distinction: this is a broken measurement, not a
            # patient in danger. Say so explicitly, and withhold the expected
            # clinical range so the model has nothing to compare against and
            # cannot drift into narrating hypothermia or cardiac arrest.
            vitals.append({
                "name": v.label,
                "measured": False,
                "sensor_fault": True,
                "raw_value": v.value,
                "unit": v.unit,
                "note": (
                    "The sensor is reporting a value no correctly attached "
                    "sensor can produce, so this vital is NOT currently being "
                    "measured. Tell the caregiver to check the sensor. Do not "
                    "describe this as a patient condition."
                ),
                "how_to_fix": v.message,
            })
            continue

        vitals.append({
            "name": v.label,
            "measured": True,
            "value": v.value,
            "unit": v.unit,
            "expected_range": v.normal_range,
            "verdict": v.severity.value,
            "trend": v.trend.direction,
            "change_across_window": round(v.trend.change, 2),
            "readings_in_window": v.trend.samples,
            "artifacts_discarded": v.discarded,
        })

    digest: dict[str, Any] = {
        "patient": patient_name or "the patient",
        "status_decided_by_rule_engine": assessment.status.value,
        "device_online": assessment.online,
        "window_minutes": settings.trend_window_minutes,
        "vitals": vitals,
    }

    if assessment.fall:
        digest["movement"] = {
            "monitored": assessment.fall.get("monitored", False),
            "activity": assessment.fall.get("activity"),
            "fall_detected": assessment.fall.get("detected", False),
        }

    if not assessment.online and assessment.seconds_since_reading:
        digest["seconds_since_last_reading"] = int(assessment.seconds_since_reading)

    return digest


# --------------------------------------------------------------------------- #
# Deterministic fallback
# --------------------------------------------------------------------------- #
def fallback_summary(assessment: PatientAssessment) -> dict[str, str]:
    """Template summary used when the LLM is unavailable."""
    if not assessment.online:
        gap = int(assessment.seconds_since_reading or 0)
        return {
            "headline": "Device offline",
            "summary": (
                f"No new readings have arrived for about {gap} seconds, so the "
                "current condition cannot be confirmed. Check that the device "
                "is powered on and connected to Wi-Fi. The values shown are the "
                "last ones received."
            ),
        }

    problems = assessment.problems
    measured = [v for v in assessment.vitals if v.value is not None]

    parts = [
        f"{v.label} is {v.value:g} {v.unit} ({v.trend.direction})."
        if v.trend.direction != "unknown"
        else f"{v.label} is {v.value:g} {v.unit}."
        for v in measured
    ]
    body = " ".join(parts) if parts else "No vitals were measured in this window."

    if assessment.status is Severity.CRITICAL:
        head = "Critical reading - seek medical help"
        lead = (
            "Please contact a doctor or emergency services now. "
            + "; ".join(v.message for v in problems)
            + " "
        )
    elif assessment.status is Severity.WARNING:
        head = "Readings outside the expected range"
        lead = "Some readings need attention. " + " ".join(v.message for v in problems) + " "
    else:
        head = "All monitored vitals look normal"
        lead = "All measured readings are within their expected ranges. "

    if assessment.fall and assessment.fall.get("detected"):
        lead = "A possible fall was detected. " + lead

    return {"headline": head, "summary": (lead + body).strip()}


# --------------------------------------------------------------------------- #
# Groq call
# --------------------------------------------------------------------------- #
def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
    return None


async def generate_summary(
    assessment: PatientAssessment,
    patient_name: str | None = None,
) -> dict[str, Any]:
    """Produce {headline, summary, model, latency_ms, digest, generated}."""
    digest = build_digest(assessment, patient_name)

    if not settings.groq_api_key:
        out = fallback_summary(assessment)
        return {**out, "model": "rule-based-fallback", "latency_ms": 0,
                "digest": digest, "generated": False,
                "note": "GROQ_API_KEY is not set; using the deterministic template."}

    base_payload = {
        "model": settings.groq_model,
        "temperature": 0.2,
        "max_tokens": 400,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(digest, default=str)},
        ],
    }

    started = time.perf_counter()
    content: str | None = None
    last_error: str | None = None

    # Attempt 1 uses strict JSON mode. Some Groq models (the reasoning ones)
    # reject it with json_validate_failed because they emit reasoning tokens
    # alongside the answer, so attempt 2 drops the constraint and relies on
    # _extract_json to pull the object out of whatever comes back.
    attempts = [
        {**base_payload, "response_format": {"type": "json_object"}},
        base_payload,
    ]

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            for payload in attempts:
                resp = await client.post(
                    GROQ_ENDPOINT,
                    headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                    json=payload,
                )
                if resp.status_code == 200:
                    content = resp.json()["choices"][0]["message"]["content"]
                    break
                last_error = f"HTTP {resp.status_code}"
                # Only the JSON-mode rejection is worth retrying; auth, rate
                # limit and bad-model errors will fail identically.
                if "json_validate_failed" not in resp.text:
                    break
    except Exception as exc:  # network, timeout, DNS
        last_error = type(exc).__name__

    if content is None:
        out = fallback_summary(assessment)
        return {**out, "model": "rule-based-fallback",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "digest": digest, "generated": False,
                "note": f"Groq call failed ({last_error}); used the template."}

    latency_ms = int((time.perf_counter() - started) * 1000)
    parsed = _extract_json(content)

    if not parsed or not parsed.get("summary"):
        out = fallback_summary(assessment)
        return {**out, "model": "rule-based-fallback", "latency_ms": latency_ms,
                "digest": digest, "generated": False,
                "note": "Model returned unparseable output; used the template."}

    return {
        "headline": str(parsed.get("headline") or "").strip()[:120]
                    or fallback_summary(assessment)["headline"],
        "summary": str(parsed["summary"]).strip(),
        "model": settings.groq_model,
        "latency_ms": latency_ms,
        "digest": digest,
        "generated": True,
    }


# --------------------------------------------------------------------------- #
# Caching
# --------------------------------------------------------------------------- #
async def cached_summary(
    assessment: PatientAssessment,
    patient_name: str | None,
    fetchrow,
    execute,
    force: bool = False,
) -> dict[str, Any]:
    """Return a recent cached summary, or generate and store a fresh one.

    ``fetchrow``/``execute`` are injected so this module does not import the DB
    layer directly and stays unit-testable.
    """
    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.ai_cache_seconds)
        row = await fetchrow(
            """
            select headline, summary, model, created_at, status, latency_ms
            from ai_summaries
            where device_id = $1 and created_at >= $2 and status = $3
            order by created_at desc
            limit 1
            """,
            assessment.device_id,
            cutoff,
            assessment.status.value,
        )
        if row:
            return {
                "headline": row["headline"],
                "summary": row["summary"],
                "model": row["model"],
                "latency_ms": row["latency_ms"],
                "generated_at": row["created_at"].isoformat(),
                "cached": True,
                "disclaimer": DISCLAIMER,
            }

    result = await generate_summary(assessment, patient_name)

    await execute(
        """
        insert into ai_summaries
            (device_id, window_start, window_end, status, summary, headline,
             model, input_digest, latency_ms)
        values ($1, $2, $3, $4::alert_severity, $5, $6, $7, $8::jsonb, $9)
        """,
        assessment.device_id,
        assessment.window_start or assessment.evaluated_at,
        assessment.window_end or assessment.evaluated_at,
        assessment.status.value,
        result["summary"],
        result["headline"],
        result["model"],
        json.dumps(result["digest"], default=str),
        result["latency_ms"],
    )

    return {
        "headline": result["headline"],
        "summary": result["summary"],
        "model": result["model"],
        "latency_ms": result["latency_ms"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cached": False,
        "ai_generated": result["generated"],
        "note": result.get("note"),
        "disclaimer": DISCLAIMER,
    }
