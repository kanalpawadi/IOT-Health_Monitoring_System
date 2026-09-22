import { motion } from 'framer-motion'
import { Activity, HeartPulse, PersonStanding, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useThemeColors } from '../context/ThemeContext'
import { MonitoringScene } from './Illustrations'
import { fmtAgo, fmtDuration, severity } from '../lib/format'

/** A repeating ECG waveform, drawn in SVG and swept by a CSS dash animation. */
function EcgTrace({ color, bpm }) {
  // One PQRST complex, tiled across the viewport width.
  const beat = 'l 10 0 l 3 -4 l 3 12 l 3 -22 l 3 18 l 3 -4 l 10 0'
  const path = `M 0 40 ${Array.from({ length: 12 }, () => beat).join(' ')}`
  const duration = bpm ? Math.max(60 / bpm, 0.4) * 6 : 3.4

  return (
    <svg
      viewBox="0 0 420 80"
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ecg-fade" x1="0" x2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0" />
          <stop offset="18%" stopColor={color} stopOpacity="0.9" />
          <stop offset="82%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="url(#ecg-fade)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{
          strokeDasharray: 1400,
          strokeDashoffset: 1400,
          animation: `sweep ${duration}s linear infinite`,
        }}
      />
    </svg>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="mt-1 truncate text-sm font-bold text-slate-200">{value}</div>
      {hint && <div className="truncate text-[11px] text-slate-600">{hint}</div>}
    </div>
  )
}

export default function PatientHero({ status }) {
  const sev = severity(status?.status)
  const c = useThemeColors()
  const sevHex = c[sev.key] || c.normal
  const critical = status?.status === 'critical'
  const warning = status?.status === 'warning'
  const Icon = critical ? TriangleAlert : warning ? Activity : ShieldCheck

  const hr = status?.vitals?.find((v) => v.metric === 'heart_rate')?.value
  const fall = status?.fall

  return (
    <motion.section
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`card relative overflow-hidden p-6 sm:p-7 ${critical ? 'ring-1 ' + sev.ring : ''}`}
    >
      {/* animated ECG backdrop */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.22]">
        <EcgTrace color={sevHex} bpm={hr} />
      </div>
      <div
        className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{ background: sevHex }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
        {/* status disc */}
        <div className="flex items-center gap-5">
          <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center">
            <span
              className={`absolute inset-0 rounded-full ${sev.bg} ring-1 ${sev.ring}`}
            />
            {status?.status !== 'normal' && (
              <span
                className="absolute inset-0 rounded-full animate-pulse-ring"
                style={{ background: sevHex, opacity: 0.2 }}
              />
            )}
            <Icon className={`relative h-8 w-8 ${sev.text}`} strokeWidth={2.2} />
          </div>

          <div className="min-w-0">
            <div className="label">Current status</div>
            <h2
              className={`mt-0.5 text-3xl font-extrabold tracking-tight sm:text-[34px] ${sev.text}`}
            >
              {sev.label}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {status?.demo ? (
                <span className="font-semibold text-status-warning">
                  Simulated · no device connected
                </span>
              ) : status?.online ? (
                <>
                  Live · last reading {fmtAgo(status?.window_end)}
                </>
              ) : (
                <>
                  Offline for {fmtDuration(status?.seconds_since_reading)} — values
                  below are the last received
                </>
              )}
            </p>
          </div>
        </div>

        {/* quick stats */}
        <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-4 border-white/[0.07] sm:grid-cols-3 lg:border-l lg:pl-7">
          <Stat
            label="Patient"
            value={status?.patient_name || 'Unnamed'}
            hint={status?.device_id}
          />
          <Stat
            label="Window"
            value={`${status?.window_minutes ?? 15} minutes`}
            hint={`${status?.sample_count ?? 0} readings`}
          />
          <Stat
            label="Activity"
            value={
              <span className="inline-flex items-center gap-1.5">
                <PersonStanding className="h-4 w-4" style={{ color: c.move }} />
                <span className="capitalize">{fall?.activity || 'unknown'}</span>
              </span>
            }
            hint={
              fall?.monitored === false
                ? 'Fall detection unavailable'
                : fall?.detected
                  ? 'Fall detected'
                  : 'No fall detected'
            }
          />
        </div>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <div className="relative group overflow-hidden rounded-2xl border border-white/10 shadow-lg transition-transform duration-300 hover:scale-[1.03]">
            <img
              src="/images/wearable_device.jpg"
              alt="IoT Telemetry Wearable"
              className="h-[84px] w-[130px] object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
            <span className="absolute bottom-1.5 left-2 font-mono text-[9px] font-bold text-accent">
              IOT SENSOR NODE
            </span>
          </div>
          <div className="relative group overflow-hidden rounded-2xl border border-white/10 shadow-lg transition-transform duration-300 hover:scale-[1.03]">
            <img
              src="/images/hero_monitoring.jpg"
              alt="Realtime Monitoring Hologram"
              className="h-[84px] w-[145px] object-cover opacity-90 transition-opacity duration-300 group-hover:opacity-100"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
            <span className="absolute bottom-1.5 left-2 font-mono text-[9px] font-bold text-vital-move">
              AI ECG ENGINE
            </span>
          </div>
        </div>

        {hr ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
            <motion.span
              animate={{ scale: [1, 1.22, 1] }}
              transition={{
                duration: Math.max(60 / hr, 0.4),
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <HeartPulse className="h-6 w-6" style={{ color: c.hr }} />
            </motion.span>
            <div className="leading-none">
              <div className="readout text-2xl font-extrabold text-slate-200">
                {Math.round(hr)}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                BPM
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </motion.section>
  )
}
