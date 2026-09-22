import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns'

export const SEVERITY = {
  normal: {
    label: 'Normal',
    text: 'text-status-normal',
    bg: 'bg-status-normal/[0.12]',
    border: 'border-status-normal/30',
    ring: 'ring-status-normal/30',
    dot: 'bg-status-normal',
    key: 'normal',
  },
  warning: {
    label: 'Warning',
    text: 'text-status-warning',
    bg: 'bg-status-warning/[0.12]',
    border: 'border-status-warning/30',
    ring: 'ring-status-warning/30',
    dot: 'bg-status-warning',
    key: 'warning',
  },
  critical: {
    label: 'Critical',
    text: 'text-status-critical',
    bg: 'bg-status-critical/[0.12]',
    border: 'border-status-critical/30',
    ring: 'ring-status-critical/30',
    dot: 'bg-status-critical',
    key: 'critical',
  },
}

export const severity = (s) => SEVERITY[s] || SEVERITY.normal

export const VITALS = {
  heart_rate: { label: 'Heart Rate', short: 'HR', unit: 'BPM', color: 'hr', domain: [40, 140] },
  spo2: { label: 'Blood Oxygen', short: 'SpO₂', unit: '%', color: 'spo2', domain: [85, 100] },
  temperature_c: { label: 'Temperature', short: 'Temp', unit: '°C', color: 'temp', domain: [34, 40] },
}

const toDate = (value) => {
  if (value === null || value === undefined || value === '') return null
  // Charts pass epoch milliseconds (a number) to tick formatters, while the
  // API passes ISO strings. parseISO only accepts strings, so branch on type
  // rather than letting it throw inside a render.
  let d
  if (value instanceof Date) d = value
  else if (typeof value === 'number') d = new Date(value)
  else if (typeof value === 'string') d = parseISO(value)
  else return null
  return isValid(d) ? d : null
}

export function fmtTime(value, pattern = 'HH:mm:ss') {
  const d = toDate(value)
  return d ? format(d, pattern) : '—'
}

export function fmtDateTime(value) {
  const d = toDate(value)
  return d ? format(d, 'd MMM yyyy, HH:mm') : '—'
}

export function fmtAgo(value) {
  const d = toDate(value)
  if (!d) return 'never'
  const seconds = (Date.now() - d.getTime()) / 1000
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${Math.floor(seconds)}s ago`
  return `${formatDistanceToNowStrict(d)} ago`
}

/** Format a vital for display, never printing "null" or "NaN" at a caregiver. */
export function fmtValue(value, metric) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (metric === 'temperature_c') return Number(value).toFixed(1)
  if (metric === 'spo2') return Number(value).toFixed(0)
  return Math.round(Number(value)).toString()
}

export function fmtDuration(seconds) {
  if (seconds == null) return '—'
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export const TREND_ICON = {
  rising: '↗',
  falling: '↘',
  stable: '→',
  unknown: '·',
}

/** Chart tick formatter that adapts to the span being displayed. */
export function timeTickFormatter(spanMinutes) {
  if (spanMinutes > 60 * 24 * 2) return (v) => fmtTime(v, 'd MMM')
  if (spanMinutes > 60 * 6) return (v) => fmtTime(v, 'd MMM HH:mm')
  if (spanMinutes > 60) return (v) => fmtTime(v, 'HH:mm')
  return (v) => fmtTime(v, 'HH:mm:ss')
}

export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)
