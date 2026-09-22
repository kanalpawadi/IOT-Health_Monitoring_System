const BASE = import.meta.env.VITE_API_BASE || '/api'

export const DEFAULT_DEVICE_ID =
  import.meta.env.VITE_DEFAULT_DEVICE_ID || 'esp8266-01'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// A dead backend behind a dev proxy does not refuse the connection -- it just
// never answers. Without a deadline the dashboard would sit on a spinner
// forever instead of falling back to demo data, so every request gets one.
const TIMEOUT_MS = 6000

async function request(path, { params, signal, timeout = TIMEOUT_MS, ...init } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  })

  // One controller for both deadlines: ours and the caller's.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  const relayAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) relayAbort()
    else signal.addEventListener('abort', relayAbort, { once: true })
  }

  let res
  try {
    res = await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (timedOut) {
      throw new ApiError(
        `The API did not respond within ${Math.round(timeout / 1000)} s.`,
        0,
      )
    }
    // A caller-initiated abort is not an error worth reporting.
    if (err.name === 'AbortError') throw err
    throw new ApiError(
      'Cannot reach the API. Is the FastAPI backend running on port 8000?',
      0,
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', relayAbort)
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) detail = body.detail
    } catch {
      /* response wasn't JSON; keep the generic message */
    }
    throw new ApiError(detail, res.status)
  }

  return res.status === 204 ? null : res.json()
}

const iso = (d) => (d instanceof Date ? d.toISOString() : d)

export const api = {
  health: (opts) => request('/health', opts),

  devices: (opts) => request('/devices', opts),

  status: (deviceId, opts) =>
    request('/status', { params: { device_id: deviceId }, ...opts }),

  latest: (deviceId, opts) =>
    request('/latest', { params: { device_id: deviceId }, ...opts }),

  series: (deviceId, minutes = 15, downsample = false, opts) =>
    request('/series', {
      params: { device_id: deviceId, minutes, downsample },
      ...opts,
    }),

  history: (deviceId, start, end, buckets = 300, opts) =>
    request('/history', {
      params: { device_id: deviceId, start: iso(start), end: iso(end), buckets },
      ...opts,
    }),

  alerts: (deviceId, { limit = 100, severity, onlyOpen, start, end } = {}, opts) =>
    request('/alerts', {
      params: {
        device_id: deviceId,
        limit,
        severity,
        only_open: onlyOpen || undefined,
        start: iso(start),
        end: iso(end),
      },
      ...opts,
    }),

  acknowledgeAlert: (id) =>
    request(`/alerts/${id}/acknowledge`, { method: 'POST' }),

  acknowledgeAll: (deviceId) =>
    request('/alerts/acknowledge-all', {
      method: 'POST',
      params: { device_id: deviceId },
    }),

  aiSummary: (deviceId, refresh = false, opts) =>
    request('/ai/summary', {
      params: { device_id: deviceId, refresh },
      ...opts,
    }),

  aiHistory: (deviceId, limit = 20, opts) =>
    request('/ai/history', { params: { device_id: deviceId, limit }, ...opts }),

  reportUrl: (deviceId, start, end, includeAi = true) => {
    const url = new URL(`${BASE}/reports/pdf`, window.location.origin)
    url.searchParams.set('device_id', deviceId)
    url.searchParams.set('start', iso(start))
    url.searchParams.set('end', iso(end))
    url.searchParams.set('include_ai', includeAi)
    return url.toString()
  },
}
