import { useMemo, useState } from 'react'
import { CheckCheck } from 'lucide-react'
import AlertList from '../components/AlertList'
import { useMonitor } from '../context/MonitorContext'
import { severity } from '../lib/format'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Unacknowledged' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
]

export default function Alerts() {
  const { alerts, acknowledge, acknowledgeAll, openAlerts } = useMonitor()
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'open') return alerts.filter((a) => !a.acknowledged)
    if (filter === 'all') return alerts
    return alerts.filter((a) => a.severity === filter)
  }, [alerts, filter])

  const counts = useMemo(
    () => ({
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      open: openAlerts.length,
    }),
    [alerts, openAlerts],
  )

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">Alert history</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">
              Every alert here was raised by the deterministic rule engine after a
              vital stayed outside its range for enough consecutive readings.
            </p>
          </div>
          <button
            onClick={acknowledgeAll}
            disabled={!counts.open}
            className="btn-ghost"
          >
            <CheckCheck className="h-4 w-4" />
            Acknowledge all
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 xs:grid-cols-3 gap-2.5 sm:gap-3">
          {[
            ['critical', counts.critical],
            ['warning', counts.warning],
          ].map(([s, n]) => {
            const sev = severity(s)
            return (
              <div key={s} className={`rounded-xl border p-3.5 ${sev.border} ${sev.bg}`}>
                <div className={`readout text-2xl font-extrabold ${sev.text}`}>{n}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {sev.label}
                </div>
              </div>
            )
          })}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
            <div className="readout text-2xl font-extrabold text-slate-200">
              {counts.open}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Open
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                filter === f.key
                  ? 'border-accent/40 bg-accent/[0.15] text-accent'
                  : 'border-white/[0.07] text-slate-500 hover:border-white/15 hover:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <AlertList
        alerts={filtered}
        onAcknowledge={acknowledge}
        emptyHint={
          filter === 'all'
            ? undefined
            : 'Nothing matches this filter. Try "All" to see the full history.'
        }
      />
    </div>
  )
}
