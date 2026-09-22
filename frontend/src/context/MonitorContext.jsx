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

  // Tracks whether a realtime INSERT has actually arrived, so the UI can say
  // "Live" honestly rather than just because a channel was opened.
  const [realtimeActive, setRealtimeActive] = useState(false)
  const realtimeTimer = useRef(null)

  useEffect(() => {
    localStorage.setItem('deviceId', deviceId)
  }, [deviceId])

  // ---------------------------------------------------------------- polling
  const refreshStatus = useCallback(
    async (signal) => {
      try {
        const data = await api.status(deviceId, { signal })
        setStatus(data)
        setError(null)
      } catch (err) {
        if (err.name !== 'AbortError') setError(err)
      } finally {
        setLoading(false)
      }
    },
    [deviceId],
  )

  const refreshSeries = useCallback(
    async (signal) => {
      try {
        const data = await api.series(deviceId, LIVE_WINDOW_MINUTES, false, { signal })
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
      .catch(() => {})
    api
      .devices({ signal: controller.signal })
      .then((d) => setDevices(d.devices || []))
      .catch(() => {})
    return () => controller.abort()
  }, [deviceId])

  // --------------------------------------------------------------- realtime
  useEffect(() => {
    if (!realtimeAvailable) return undefined

    const unsubscribe = subscribeToReadings(deviceId, (row) => {
      setRealtimeActive(true)
      clearTimeout(realtimeTimer.current)
      // If inserts stop arriving, stop claiming the feed is live.
      realtimeTimer.current = setTimeout(() => setRealtimeActive(false), 30000)

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
  }, [deviceId])

  // ---------------------------------------------------------------- actions
  const acknowledge = useCallback(
    async (id) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
      )
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
      error, loading, liveTick, realtimeActive, acknowledge, acknowledgeAll,
      refreshStatus, refreshSeries, refreshAlerts,
    ],
  )

  return <MonitorContext.Provider value={value}>{children}</MonitorContext.Provider>
}

export function useMonitor() {
  const ctx = useContext(MonitorContext)
  if (!ctx) throw new Error('useMonitor must be used inside <MonitorProvider>')
  return ctx
}
