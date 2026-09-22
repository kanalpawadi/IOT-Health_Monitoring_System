import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarRange, Loader2 } from 'lucide-react'
import ErrorBoundary from '../components/ErrorBoundary'
import LiveChart from '../components/LiveChart'
import { useMonitor } from '../context/MonitorContext'
import { api } from '../lib/api'
import { demoHistory } from '../lib/demoData'
import { useThemeColors } from '../context/ThemeContext'
import { fmtDateTime, severity, VITALS } from '../lib/format'

const PRESETS = [
  { label: '1H', minutes: 60 },
  { label: '6H', minutes: 360 },
  { label: '24H', minutes: 1440 },
  { label: '7D', minutes: 10080 },
  { label: '30D', minutes: 43200 },
]

/** datetime-local wants "YYYY-MM-DDTHH:mm" in *local* time, not ISO/UTC. */
function toLocalInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function StatTile({ metric, stat }) {
  const meta = VITALS[metric]
  const c = useThemeColors()
  const hex = c[meta.color] || c.accent
  const has = stat?.avg !== null && stat?.avg !== undefined
  const decimals = metric === 'temperature_c' ? 1 : 0

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: hex }} />
        <span className="label">{meta.label}</span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className="readout text-3xl font-extrabold leading-none"
          style={{ color: has ? hex : c.muted }}
        >
          {has ? Number(stat.avg).toFixed(decimals) : '—'}
        </span>
        <span className="text-xs font-semibold text-slate-500">
          {meta.unit} avg
        </span>
      </div>

      <div className="mt-3 flex gap-4 border-t border-white/[0.06] pt-2.5 text-[11px]">
        <span className="text-slate-500">
          min{' '}
          <strong className="readout text-slate-300">
            {has ? Number(stat.min).toFixed(decimals) : '—'}
          </strong>
        </span>
        <span className="text-slate-500">
          max{' '}
          <strong className="readout text-slate-300">
            {has ? Number(stat.max).toFixed(decimals) : '—'}
          </strong>
        </span>
        {stat?.valid_samples !== undefined && (
          <span className="ml-auto text-slate-600">{stat.valid_samples} valid</span>
        )}
      </div>
    </div>
  )
}

export default function History() {
  const { deviceId, demoMode } = useMonitor()
  const [preset, setPreset] = useState(1440)
  const [custom, setCustom] = useState(false)
  const [start, setStart] = useState(() =>
    toLocalInput(new Date(Date.now() - 86400000)),
  )
  const [end, setEnd] = useState(() => toLocalInput(new Date()))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const range = useMemo(() => {
    if (custom) return { start: new Date(start), end: new Date(end) }
    const e = new Date()
    return { start: new Date(e.getTime() - preset * 60000), end: e }
  }, [custom, preset, start, end])

  const load = useCallback(
    async (signal) => {
      setLoading(true)
      setError(null)

      // Demo mode means there is no stored history to draw at all, so there is
      // nothing to fetch -- generate the range instead.
      if (demoMode) {
        setData(demoHistory(deviceId, range.start, range.end, 400))
        setLoading(false)
        return
      }

      try {
        setData(await api.history(deviceId, range.start, range.end, 400, { signal }))
      } catch (err) {
        if (err.name === 'AbortError') return
        // Only an unreachable API falls back to simulated trends -- anything
        // the server actually answered (a bad range, a missing device) is a
        // real complaint and belongs on screen.
        if (err.status === 0) {
          setData(demoHistory(deviceId, range.start, range.end, 400))
        } else {
          setError(err.message)
        }
      } finally {
        setLoading(false)
      }
    },
    [deviceId, demoMode, range.start, range.end],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const spanMinutes = (range.end - range.start) / 60000
  const counts = data?.alert_counts || {}

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {/* range picker */}
      <section className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <CalendarRange className="h-4 w-4" />
            <span className="text-sm font-bold text-white">Time range</span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setCustom(false)
                  setPreset(p.minutes)
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                  !custom && preset === p.minutes
                    ? 'border-accent/40 bg-accent/[0.15] text-accent'
                    : 'border-white/[0.07] text-slate-500 hover:border-white/15 hover:text-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setCustom(true)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                custom
                  ? 'border-accent/40 bg-accent/[0.15] text-accent'
                  : 'border-white/[0.07] text-slate-500 hover:border-white/15 hover:text-slate-300'
              }`}
            >
              Custom
            </button>
          </div>

          {loading && (
            <Loader2 className="ml-auto h-4 w-4 animate-spin text-accent" />
          )}
        </div>

        {custom && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 flex flex-wrap items-end gap-3 border-t border-white/[0.06] pt-3"
          >
            <label className="flex flex-col gap-1">
              <span className="label">From</span>
              <input
                type="datetime-local"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">To</span>
              <input
                type="datetime-local"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
                className="input"
              />
            </label>
          </motion.div>
        )}

        <p className="mt-3 text-[11px] text-slate-600">
          {fmtDateTime(range.start)} → {fmtDateTime(range.end)} ·{' '}
          {data?.points?.length ?? 0} plotted points from{' '}
          {data?.stats?.total_readings ?? 0} readings
          {data?.demo && (
            <span className="ml-1 font-semibold text-status-warning">
              · simulated
            </span>
          )}
        </p>
      </section>

      {error ? (
        <div className="card border-status-critical/25 bg-status-critical/[0.06] p-5 text-sm text-status-critical">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Object.keys(VITALS).map((m) => (
              <StatTile key={m} metric={m} stat={data?.stats?.[m]} />
            ))}
          </div>

          <ErrorBoundary label="The history chart">
          <LiveChart
            points={data?.points || []}
            spanMinutes={spanMinutes}
            height={420}
            title="Historical trends"
            subtitle="Readings are averaged into time buckets so long ranges stay readable"
          />
          </ErrorBoundary>

          <section className="card p-5">
            <h3 className="mb-3 text-sm font-bold text-white">
              Alerts raised in this period
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {['critical', 'warning', 'normal'].map((s) => {
                const sev = severity(s)
                return (
                  <div
                    key={s}
                    className={`rounded-xl border p-4 ${sev.border} ${sev.bg}`}
                  >
                    <div className={`readout text-3xl font-extrabold ${sev.text}`}>
                      {counts[s] ?? 0}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {sev.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
