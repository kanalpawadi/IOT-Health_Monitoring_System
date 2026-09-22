import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { api, DEFAULT_DEVICE_ID } from '../lib/api'
import { normaliseRow, realtimeAvailable, subscribeToReadings } from '../lib/supabase'
import {
  DEMO_STEP_MS,
  demoAlerts,
  demoDevices,
  demoSeries,
  demoStatus,
} from '../lib/demoData'

const MonitorContext = createContext(null)

const STATUS_POLL_MS = 5000
const SERIES_POLL_MS = 10000
const ALERTS_POLL_MS = 15000
const LIVE_WINDOW_MINUTES = 15
const MAX_LIVE_POINTS = 900

export function MonitorProvider({ children }) {
  const [deviceId, setDeviceId] = useState(
    () => localStorage.getItem('deviceId') || DEFAULT_DEVICE_ID,
  )
  const [devices, setDevices] = useState([])
  const [status, setStatus] = useState(null)
  const [series, setSeries] = useState([])
  const [alerts, setAlerts] = useState([])
  const [health, setHealth] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [liveTick, setLiveTick] = useState(0)

  // Demo mode: the dashboard runs on locally generated vitals because there is
  // nothing live to show. Either the API cannot be reached ('offline') or it
  // answered but has no readings for this device yet ('no-data'). It ends the
  // instant a real reading appears -- see refreshStatus and the realtime
  // subscription below, which both flip it back off.
  const [demoReason, setDemoReason] = useState(null)
  const demoRef = useRef(false)

  // Tracks whether a realtime INSERT has actually arrived, so the UI can say
  // "Live" honestly rather than just because a channel was opened.
  const [realtimeActive, setRealtimeActive] = useState(false)
  const realtimeTimer = useRef(null)

  useEffect(() => {
    localStorage.setItem('deviceId', deviceId)
  }, [deviceId])

  const enterDemo = useCallback((reason) => {
    demoRef.current = true
    // Re-setting the same reason would restart the generator interval, so only
    // write when it actually changed (offline -> no-data, say).
    setDemoReason((prev) => (prev === reason ? prev : reason))
  }, [])

  const leaveDemo = useCallback(() => {
    if (!demoRef.current) return
    demoRef.current = false
    setDemoReason(null)
    // Never let a simulated point survive alongside a real one.
    setSeries([])
    setAlerts([])
  }, [])

  // ---------------------------------------------------------------- polling
  const refreshStatus = useCallback(
    async (signal) => {
      try {
        const data = await api.status(deviceId, { signal })
        setError(null)

        if (data.sample_count > 0) {
          leaveDemo()
          setStatus(data)
        } else {
          // The backend is healthy, the device just has not sent anything.
          enterDemo('no-data')
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        setError(err)
        enterDemo('offline')
      } finally {
        setLoading(false)
      }
    },
    [deviceId, enterDemo, leaveDemo],
  )

  const refreshSeries = useCallback(
    async (signal) => {
      try {
        const data = await api.series(deviceId, LIVE_WINDOW_MINUTES, false, { signal })
        // While demo mode is on, the generator below owns `series`.
        if (demoRef.current) return
        setSeries(data.points || [])
      } catch (err) {
        if (err.name !== 'AbortError' && err.status !== 404) {
          /* a stale series is better than an empty chart; keep what we have */
        }
      }
    },
    [deviceId],
  )

  const refreshAlerts = useCallback(
    async (signal) => {
      try {
        const data = await api.alerts(deviceId, { limit: 50 }, { signal })
        if (demoRef.current) return
        setAlerts(data.alerts || [])
      } catch {
        /* non-fatal */
      }
    },
    [deviceId],
  )

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setLoading(true)
    setStatus(null)
    setSeries([])

    const run = () => {
      if (cancelled) return
      refreshStatus(controller.signal)
    }
    run()
    const id = setInterval(run, STATUS_POLL_MS)
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(id)
    }
  }, [refreshStatus])

  useEffect(() => {
    const controller = new AbortController()
    refreshSeries(controller.signal)
    const id = setInterval(() => refreshSeries(controller.signal), SERIES_POLL_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [refreshSeries])

  useEffect(() => {
    const controller = new AbortController()
    refreshAlerts(controller.signal)
    const id = setInterval(() => refreshAlerts(controller.signal), ALERTS_POLL_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [refreshAlerts])

  useEffect(() => {
    const controller = new AbortController()
    api
      .health({ signal: controller.signal })
      .then(setHealth)
      .catch(() => setHealth(null))
    api
      .devices({ signal: controller.signal })
      .then((d) => setDevices(d.devices || []))
      .catch(() => {})
    return () => controller.abort()
  }, [deviceId])

  // ------------------------------------------------------------- demo feed
  // Redraws the whole window each tick. The waveforms are pure functions of
  // the clock, so a regenerated window is identical to the previous one plus
  // the new sample -- the chart scrolls instead of jumping.
  useEffect(() => {
    if (!demoReason) return undefined

    const paint = () => {
      const points = demoSeries(Date.now(), LIVE_WINDOW_MINUTES)
      setSeries(points)
      setStatus(demoStatus(points, deviceId))
      setLiveTick((t) => t + 1)
    }

    paint()
    setAlerts(demoAlerts(deviceId))
    setDevices((prev) => (prev.length ? prev : demoDevices(deviceId)))
    setLoading(false)

    const id = setInterval(paint, DEMO_STEP_MS)
    return () => clearInterval(id)
  }, [demoReason, deviceId])

  // --------------------------------------------------------------- realtime
  useEffect(() => {
    if (!realtimeAvailable) return undefined

    const unsubscribe = subscribeToReadings(deviceId, (row) => {
      setRealtimeActive(true)
      clearTimeout(realtimeTimer.current)
      // If inserts stop arriving, stop claiming the feed is live.
      realtimeTimer.current = setTimeout(() => setRealtimeActive(false), 30000)

      // A real reading beats anything simulated: drop the demo feed at once
      // rather than waiting for the next status poll.
      if (demoRef.current) {
        leaveDemo()
        setSeries([row])
        setLiveTick((t) => t + 1)
        return
      }

      setSeries((prev) => {
        if (prev.some((p) => p.id === row.id)) return prev
        return [...prev, row].slice(-MAX_LIVE_POINTS)
      })
      setLiveTick((t) => t + 1)
    })

    return () => {
      unsubscribe()
      clearTimeout(realtimeTimer.current)
    }
  }, [deviceId, leaveDemo])

  // ---------------------------------------------------------------- actions
  const acknowledge = useCallback(
    async (id) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
      )
      if (demoRef.current) return // nothing to persist for a simulated alert
      try {
        await api.acknowledgeAlert(id)
      } catch {
        refreshAlerts()
      }
    },
    [refreshAlerts],
  )

  const acknowledgeAll = useCallback(async () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })))
    if (demoRef.current) return
    try {
      await api.acknowledgeAll(deviceId)
    } catch {
      refreshAlerts()
    }
  }, [deviceId, refreshAlerts])

  const latest = useMemo(
    () => (series.length ? series[series.length - 1] : null),
    [series],
  )

  const openAlerts = useMemo(
    () => alerts.filter((a) => !a.acknowledged),
    [alerts],
  )

  const value = useMemo(
    () => ({
      deviceId,
      setDeviceId,
      devices,
      status,
      series,
      latest,
      alerts,
      openAlerts,
      health,
      error,
      loading,
      liveTick,
      realtimeActive,
      demoMode: Boolean(demoReason),
      demoReason,
      liveWindowMinutes: LIVE_WINDOW_MINUTES,
      acknowledge,
      acknowledgeAll,
      refresh: () => {
        refreshStatus()
        refreshSeries()
        refreshAlerts()
      },
    }),
    [
      deviceId, devices, status, series, latest, alerts, openAlerts, health,
      error, loading, liveTick, realtimeActive, demoReason, acknowledge,
      acknowledgeAll, refreshStatus, refreshSeries, refreshAlerts,
    ],
  )

  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>
}

export function useMonitor() {
  const ctx = useContext(MonitorContext)
  if (!ctx) throw new Error('useMonitor must be used inside <MonitorProvider>')
  return ctx
}
