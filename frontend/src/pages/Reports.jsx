import { useMemo, useState } from 'react'
import { Download, FileText, FlaskConical, Loader2, Sparkles } from 'lucide-react'
import { useMonitor } from '../context/MonitorContext'
import { api } from '../lib/api'
import { fmtDateTime } from '../lib/format'

const PRESETS = [
  { label: 'Last 24 hours', minutes: 1440 },
  { label: 'Last 7 days', minutes: 10080 },
  { label: 'Last 30 days', minutes: 43200 },
]

function toLocalInput(date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function Reports() {
  const { deviceId, status, demoMode, demoReason } = useMonitor()
  const [preset, setPreset] = useState(1440)
  const [custom, setCustom] = useState(false)
  const [start, setStart] = useState(() =>
    toLocalInput(new Date(Date.now() - 86400000)),
  )
  const [end, setEnd] = useState(() => toLocalInput(new Date()))
  const [includeAi, setIncludeAi] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const range = useMemo(() => {
    if (custom) return { start: new Date(start), end: new Date(end) }
    const e = new Date()
    return { start: new Date(e.getTime() - preset * 60000), end: e }
  }, [custom, preset, start, end])

  const download = async () => {
    setBusy(true)
    setError(null)
    try {
      const url = api.reportUrl(deviceId, range.start, range.end, includeAi)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Report generation failed (${res.status})`)

      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `health-report-${deviceId}-${range.start
        .toISOString()
        .slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoke on the next tick so Firefox has started the download first.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-accent/[0.15] blur-3xl" />

        <header className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent shadow-glow">
            <FileText className="h-5 w-5 text-ink-950" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Caregiver report</h2>
            <p className="text-[12px] text-slate-500">
              A printable PDF with trend charts, statistics, the alert log and the AI
              summary.
            </p>
          </div>
        </header>

        <div className="relative mt-6 space-y-5">
          <div>
            <div className="label mb-2">Period</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setCustom(false)
                    setPreset(p.minutes)
                  }}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
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
                className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                  custom
                    ? 'border-accent/40 bg-accent/[0.15] text-accent'
                    : 'border-white/[0.07] text-slate-500 hover:border-white/15 hover:text-slate-300'
                }`}
              >
                Custom range
              </button>
            </div>
          </div>

          {custom && (
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="flex flex-col gap-1 w-full sm:w-auto">
                <span className="label">From</span>
                <input
                  type="datetime-local"
                  value={start}
                  max={end}
                  onChange={(e) => setStart(e.target.value)}
                  className="input w-full"
                />
              </label>
              <label className="flex flex-col gap-1 w-full sm:w-auto">
                <span className="label">To</span>
                <input
                  type="datetime-local"
                  value={end}
                  min={start}
                  onChange={(e) => setEnd(e.target.value)}
                  className="input w-full"
                />
              </label>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04]">
            <input
              type="checkbox"
              checked={includeAi}
              onChange={(e) => setIncludeAi(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]"
            />
            <span>
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-200">
                <Sparkles className="h-3.5 w-3.5 text-vital-move" />
                Include the AI monitoring summary
              </span>
              <span className="mt-0.5 block text-[11.5px] text-slate-500">
                Adds the plain-language explanation of the current status, with the
                model name and the not-a-diagnosis disclaimer printed beneath it.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5 text-[11.5px] leading-relaxed text-slate-500">
            <div className="font-semibold text-slate-400">Report preview</div>
            <div className="mt-1.5 space-y-0.5">
              <div>Patient: {status?.patient_name || 'Unnamed'} ({deviceId})</div>
              <div>
                Period: {fmtDateTime(range.start)} → {fmtDateTime(range.end)}
              </div>
              <div>Current status: {status?.status || '—'}</div>
            </div>
          </div>

          {demoMode && (
            <p className="flex items-start gap-2 rounded-lg border border-status-warning/25 bg-status-warning/[0.07] px-3 py-2 text-[12px] leading-relaxed text-status-warning">
              <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {demoReason === 'offline'
                ? 'The PDF is rendered by the backend, which is unreachable right now. The simulated vitals on the other pages cannot be exported — start the API or connect the device first.'
                : 'This device has no stored readings yet, so the report would come out empty. Connect the ESP8266 and try again.'}
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-status-critical/25 bg-status-critical/[0.07] px-3 py-2 text-[12px] text-status-critical">
              {error}
            </p>
          )}

          <button
            onClick={download}
            disabled={busy || range.start >= range.end || demoReason === 'offline'}
            className="btn-primary w-full !py-3"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Building your report…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download PDF report
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  )
}
