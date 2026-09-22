/**
 * Simulated vitals, used only when there is no live feed.
 *
 * The dashboard is unreadable with an empty database -- flat charts, dashes
 * everywhere, no alerts -- which makes it impossible to show the system to
 * anyone before the ESP8266 is wired up. So when the API is unreachable, or
 * reachable but has no readings for the device, the UI falls back to the data
 * generated here and says so in a banner.
 *
 * Two rules this module keeps:
 *   1. Every object it returns carries `demo: true`, so nothing downstream can
 *      mistake a simulated reading for a patient one.
 *   2. The moment a real reading arrives, MonitorContext drops all of this.
 *      Demo data is never merged into live data.
 *
 * The waveforms are pure functions of wall-clock time rather than a random
 * walk, so a backfilled window joins seamlessly onto the points generated a
 * second later, and a reload does not teleport the patient to new vitals.
 */

export const DEMO_PATIENT_NAME = 'Demo Patient (simulated)'
export const DEMO_STEP_MS = 2000
export const DEMO_WINDOW_MINUTES = 15

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

const wave = (t, periodSec, amp, phase = 0) =>
  amp * Math.sin((2 * Math.PI * t) / periodSec + phase)

/** Deterministic per-sample jitter, so the same instant always looks the same. */
function jitter(seed, amp) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return (x - Math.floor(x) - 0.5) * 2 * amp
}

// --------------------------------------------------------------------------- //
// Thresholds -- deliberately mirroring backend/app/rules.py BANDS so a demo
// card never contradicts what the real rule engine would have said.
// --------------------------------------------------------------------------- //
const BANDS = {
  heart_rate: {
    label: 'Heart rate',
    unit: 'BPM',
    warnLow: 60, warnHigh: 100, critLow: 50, critHigh: 120,
    range: '60-100 BPM',
    epsilon: 5,
    decimals: 0,
  },
  spo2: {
    label: 'Blood oxygen (SpO2)',
    unit: '%',
    warnLow: 95, warnHigh: null, critLow: 90, critHigh: null,
    range: '95 % or above',
    epsilon: 2,
    decimals: 1,
  },
  temperature_c: {
    label: 'Body temperature',
    unit: '°C',
    warnLow: 36.1, warnHigh: 37.5, critLow: 35, critHigh: 38.5,
    range: '36.1-37.5 °C',
    epsilon: 0.3,
    decimals: 1,
  },
}

const RANK = { normal: 0, warning: 1, critical: 2 }

function classify(metric, value) {
  const b = BANDS[metric]
  if (b.critLow !== null && value < b.critLow)
    return { severity: 'critical', rule: `${metric}_critical_low` }
  if (b.critHigh !== null && value > b.critHigh)
    return { severity: 'critical', rule: `${metric}_critical_high` }
  if (b.warnLow !== null && value < b.warnLow)
    return { severity: 'warning', rule: `${metric}_low` }
  if (b.warnHigh !== null && value > b.warnHigh)
    return { severity: 'warning', rule: `${metric}_high` }
  return { severity: 'normal', rule: `${metric}_normal` }
}

// --------------------------------------------------------------------------- //
// Readings
// --------------------------------------------------------------------------- //
/**
 * One simulated reading for a given instant.
 *
 * A resting adult at ~77 BPM with a slow drift, SpO2 hovering in the high
 * nineties, and a body temperature that wanders a few tenths. The slow
 * heart-rate term reaches into the low sixties and the low nineties, so the
 * demo shows trend arrows moving without constantly firing alarms.
 */
export function demoReadingAt(ms) {
  const t = ms / 1000
  const k = Math.floor(ms / DEMO_STEP_MS)

  const hr = 77 + wave(t, 420, 10) + wave(t, 47, 3) + jitter(k, 1.5)
  const spo2 = 97.4 + wave(t, 610, 1.3) + jitter(k + 7, 0.35)
  const temp = 36.8 + wave(t, 900, 0.32) + jitter(k + 13, 0.04)
  const accel = 1 + Math.abs(wave(t, 73, 0.3)) + jitter(k + 29, 0.04)

  return {
    id: `demo-${k}`,
    recorded_at: new Date(ms).toISOString(),
    heart_rate: Math.round(clamp(hr, 40, 150)),
    spo2: Number(clamp(spo2, 88, 100).toFixed(1)),
    temperature_c: Number(clamp(temp, 34, 41).toFixed(2)),
    movement: accel > 1.2,
    accel_magnitude: Number(accel.toFixed(3)),
    demo: true,
  }
}

/** A window of readings ending at `endMs`, aligned to the demo sample clock. */
export function demoSeries(
  endMs = Date.now(),
  minutes = DEMO_WINDOW_MINUTES,
  stepMs = DEMO_STEP_MS,
) {
  const last = Math.floor(endMs / stepMs) * stepMs
  const count = clamp(Math.floor((minutes * 60000) / stepMs), 1, 2000)
  const points = []
  for (let i = count - 1; i >= 0; i -= 1) points.push(demoReadingAt(last - i * stepMs))
  return points
}

/** The next reading after `lastMs`, or null if the sample clock has not ticked. */
export function demoNextReading(lastMs, now = Date.now()) {
  const next = Math.floor(lastMs / DEMO_STEP_MS) * DEMO_STEP_MS + DEMO_STEP_MS
  return next <= now ? demoReadingAt(next) : null
}

// --------------------------------------------------------------------------- //
// Rule-engine verdict
// --------------------------------------------------------------------------- //
function trendOf(points, metric) {
  const b = BANDS[metric]
  const usable = points
    .map((p) => [new Date(p.recorded_at).getTime(), p[metric]])
    .filter(([, v]) => v !== null && v !== undefined)

  if (usable.length < 3)
    return { direction: 'unknown', change: 0, slope_per_min: 0, samples: usable.length }

  const t0 = usable[0][0]
  const xs = usable.map(([t]) => (t - t0) / 60000)
  const ys = usable.map(([, v]) => v)
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length
  const my = ys.reduce((a, y) => a + y, 0) / ys.length
  const denom = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  const slope = denom
    ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / denom
    : 0
  const change = ys[ys.length - 1] - ys[0]

  return {
    direction:
      Math.abs(change) < b.epsilon ? 'stable' : change > 0 ? 'rising' : 'falling',
    change: Number(change.toFixed(2)),
    slope_per_min: Number(slope.toFixed(4)),
    samples: ys.length,
  }
}

function vitalFor(points, metric) {
  const b = BANDS[metric]
  const values = points.map((p) => p[metric]).filter((v) => v !== null && v !== undefined)
  const value = values.length ? values[values.length - 1] : null

  if (value === null) {
    return {
      metric, label: b.label, unit: b.unit, value: null,
      severity: 'normal', rule: `${metric}_no_data`,
      message: `${b.label} has not been measured recently.`,
      normal_range: b.range, breaching_streak: 0,
      sensor_fault: false, discarded: 0,
      trend: { direction: 'unknown', change: 0, slope_per_min: 0, samples: 0 },
    }
  }

  const { severity, rule } = classify(metric, value)

  // Persistence: how many of the most recent readings agree with this verdict.
  let streak = 0
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (classify(metric, values[i]).severity !== severity) break
    streak += 1
  }

  const shown = value.toFixed(b.decimals)
  const message =
    severity === 'normal'
      ? `${b.label} ${shown} ${b.unit} is within the expected range.`
      : `${b.label} ${shown} ${b.unit} is ${
          severity === 'critical' ? 'critically ' : ''
        }outside the expected range (${b.range}) across ${streak} consecutive readings.`

  return {
    metric, label: b.label, unit: b.unit, value,
    severity, rule, message,
    normal_range: b.range,
    breaching_streak: streak,
    sensor_fault: false,
    discarded: 0,
    trend: trendOf(points, metric),
  }
}

/** The same payload shape FastAPI's /api/status returns, built client-side. */
export function demoStatus(points, deviceId) {
  const vitals = Object.keys(BANDS).map((m) => vitalFor(points, m))
  const status = vitals.reduce(
    (worst, v) => (RANK[v.severity] > RANK[worst] ? v.severity : worst),
    'normal',
  )
  const first = points[0]
  const last = points[points.length - 1]
  const movingSamples = points.filter((p) => p.movement).length

  return {
    device_id: deviceId,
    status,
    evaluated_at: new Date().toISOString(),
    online: true,
    seconds_since_reading: last
      ? Math.max(0, (Date.now() - new Date(last.recorded_at).getTime()) / 1000)
      : null,
    window_start: first?.recorded_at ?? null,
    window_end: last?.recorded_at ?? null,
    vitals,
    fall: {
      detected: false,
      monitored: true,
      activity: movingSamples > points.length * 0.4 ? 'active' : 'resting',
      latest_magnitude: last?.accel_magnitude ?? null,
      reason: 'No free-fall-then-impact pattern in this window.',
    },
    new_alerts: [],
    window_minutes: DEMO_WINDOW_MINUTES,
    sample_count: points.length,
    patient_name: DEMO_PATIENT_NAME,
    demo: true,
  }
}

// --------------------------------------------------------------------------- //
// Alerts
// --------------------------------------------------------------------------- //
/**
 * A short, fixed alert history so the Alerts page has something to show.
 *
 * Offsets are relative to now, so the list always looks recent without the
 * entries reshuffling on every poll.
 */
const DEMO_ALERT_SEEDS = [
  {
    minutesAgo: 14, severity: 'warning', metric: 'heart_rate', value: 104,
    rule: 'heart_rate_high', acknowledged: false,
    message:
      'Heart rate 104 BPM is above the expected range (60-100 BPM) across 3 consecutive readings.',
  },
  {
    minutesAgo: 62, severity: 'warning', metric: 'spo2', value: 94,
    rule: 'spo2_low', acknowledged: true,
    message:
      'Blood oxygen (SpO2) 94 % is below the expected range (95 % or above) across 4 consecutive readings.',
  },
  {
    minutesAgo: 175, severity: 'critical', metric: 'temperature_c', value: 38.7,
    rule: 'temperature_c_critical_high', acknowledged: true,
    message:
      'Body temperature 38.7 °C is critically above the expected range (36.1-37.5 °C) across 5 consecutive readings.',
  },
  {
    minutesAgo: 320, severity: 'warning', metric: 'heart_rate', value: 57,
    rule: 'heart_rate_low', acknowledged: true,
    message:
      'Heart rate 57 BPM is below the expected range (60-100 BPM) across 3 consecutive readings.',
  },
]

export function demoAlerts(deviceId, now = Date.now()) {
  return DEMO_ALERT_SEEDS.map((seed, i) => ({
    id: `demo-alert-${i}`,
    device_id: deviceId,
    created_at: new Date(now - seed.minutesAgo * 60000).toISOString(),
    severity: seed.severity,
    metric: seed.metric,
    value: seed.value,
    rule: seed.rule,
    message: seed.message,
    acknowledged: seed.acknowledged,
    acknowledged_at: seed.acknowledged
      ? new Date(now - (seed.minutesAgo - 2) * 60000).toISOString()
      : null,
    demo: true,
  }))
}

// --------------------------------------------------------------------------- //
// History
// --------------------------------------------------------------------------- //
function statsFor(points, metric) {
  const b = BANDS[metric]
  const values = points.map((p) => p[metric]).filter((v) => v !== null && v !== undefined)
  if (!values.length) return { avg: null, min: null, max: null, valid_samples: 0 }
  const round = (n) => Number(n.toFixed(b.decimals === 0 ? 1 : b.decimals))
  return {
    avg: round(values.reduce((a, v) => a + v, 0) / values.length),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    valid_samples: values.length,
  }
}

/** The /api/history payload shape, bucketed like the server would bucket it. */
export function demoHistory(deviceId, start, end, buckets = 400) {
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime()
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime()
  const span = Math.max(endMs - startMs, DEMO_STEP_MS)
  const step = Math.max(Math.floor(span / buckets), DEMO_STEP_MS)

  const points = []
  for (let t = startMs; t <= endMs; t += step) points.push(demoReadingAt(t))

  const counts = demoAlerts(deviceId, endMs).reduce(
    (acc, a) => {
      const at = new Date(a.created_at).getTime()
      if (at >= startMs && at <= endMs) acc[a.severity] += 1
      return acc
    },
    { normal: 0, warning: 0, critical: 0 },
  )

  return {
    device_id: deviceId,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    points,
    stats: {
      total_readings: points.length,
      first_at: points[0]?.recorded_at ?? null,
      last_at: points[points.length - 1]?.recorded_at ?? null,
      movement_count: points.filter((p) => p.movement).length,
      heart_rate: statsFor(points, 'heart_rate'),
      spo2: statsFor(points, 'spo2'),
      temperature_c: statsFor(points, 'temperature_c'),
    },
    alert_counts: counts,
    demo: true,
  }
}

// --------------------------------------------------------------------------- //
// AI summary
// --------------------------------------------------------------------------- //
/**
 * A template summary written from the demo verdict.
 *
 * No model is called: labelling this "AI generated" while the backend is
 * unreachable would be a lie, so the model name says template.
 */
export function demoAiSummary(status) {
  const by = Object.fromEntries((status?.vitals || []).map((v) => [v.metric, v]))
  const hr = by.heart_rate
  const spo2 = by.spo2
  const temp = by.temperature_c
  const problems = (status?.vitals || []).filter((v) => v.severity !== 'normal')

  const headline =
    problems.length === 0
      ? 'Simulated patient stable across all vitals'
      : `Simulated ${problems[0].label.toLowerCase()} outside range`

  const num = (v, d) => (v?.value == null ? '—' : v.value.toFixed(d))
  const summary = [
    'This is simulated data, not a patient. No device is streaming readings right now, so the dashboard is showing a generated waveform.',
    `Heart rate is ${num(hr, 0)} BPM (${hr?.trend?.direction ?? 'unknown'}), blood oxygen ${num(spo2, 0)} %, and body temperature ${num(temp, 1)} °C.`,
    problems.length === 0
      ? 'Every vital sits inside its expected band, so the rule engine would report Normal.'
      : `${problems.length} vital${problems.length > 1 ? 's are' : ' is'} outside the expected band and would be flagged.`,
    'Connect the ESP8266 (or run backend/tools/simulate.py) and this card switches to the real generated summary automatically.',
  ].join(' ')

  return {
    headline,
    summary,
    model: 'demo-template',
    latency_ms: 0,
    generated_at: new Date().toISOString(),
    cached: false,
    status: status?.status || 'normal',
    sample_count: status?.sample_count ?? 0,
    window_minutes: DEMO_WINDOW_MINUTES,
    note: 'Demo mode — generated locally from simulated vitals, not by the AI model.',
    demo: true,
  }
}

/** Device list entry, so the device picker is not empty in demo mode. */
export function demoDevices(deviceId) {
  return [
    {
      device_id: deviceId,
      patient_name: DEMO_PATIENT_NAME,
      last_seen_at: new Date().toISOString(),
      online: true,
      demo: true,
    },
  ]
}
