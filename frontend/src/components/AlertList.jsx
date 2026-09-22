import { AnimatePresence, motion } from 'framer-motion'
import { Check, HeartPulse, PersonStanding, Thermometer, Wind } from 'lucide-react'
import { AllClearArt } from './Illustrations'
import { fmtAgo, fmtDateTime, severity } from '../lib/format'

const METRIC_ICON = {
  heart_rate: HeartPulse,
  spo2: Wind,
  temperature_c: Thermometer,
  fall: PersonStanding,
}

const METRIC_LABEL = {
  heart_rate: 'Heart rate',
  spo2: 'Blood oxygen',
  temperature_c: 'Temperature',
  fall: 'Movement',
}

function AlertRow({ alert, onAcknowledge, index }) {
  const sev = severity(alert.severity)
  const Icon = METRIC_ICON[alert.metric] || HeartPulse

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.28 }}
      className={`group flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
        alert.acknowledged
          ? 'border-white/[0.05] bg-white/[0.015] opacity-55'
          : `${sev.border} ${sev.bg}`
      }`}
    >
      <div
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${sev.bg} ${sev.text}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`text-xs font-bold uppercase tracking-wide ${sev.text}`}>
            {sev.label}
          </span>
          <span className="text-xs font-semibold text-slate-300">
            {METRIC_LABEL[alert.metric] || alert.metric}
          </span>
          {alert.value !== null && alert.value !== undefined && (
            <span className="readout rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-bold text-slate-200">
              {Number(alert.value).toFixed(
                alert.metric === 'temperature_c' ? 1 : 0,
              )}
            </span>
          )}
          <span
            className="ml-auto text-[11px] text-slate-500"
            title={fmtDateTime(alert.created_at)}
          >
            {fmtAgo(alert.created_at)}
          </span>
        </div>

        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-400">
          {alert.message}
        </p>
        <p className="mt-1 font-mono text-[10px] text-slate-600">{alert.rule}</p>
      </div>

      {!alert.acknowledged && onAcknowledge && (
        <button
          onClick={() => onAcknowledge(alert.id)}
          className="btn-ghost !px-2 !py-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
          title="Acknowledge"
          aria-label={`Acknowledge ${alert.rule}`}
        >
          <Check className="h-4 w-4" />
        </button>
      )}
    </motion.li>
  )
}

export default function AlertList({ alerts = [], onAcknowledge, emptyHint }) {
  if (!alerts.length) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-white/[0.08] px-6 py-12 text-center">
        <AllClearArt className="mb-2 h-24 w-32" />
        <p className="text-sm font-semibold text-slate-400">No alerts</p>
        <p className="mt-1 max-w-sm text-[12px] text-slate-600">
          {emptyHint ||
            'The rule engine has not flagged anything. Alerts appear here the moment a vital breaches its threshold for long enough to be confirmed.'}
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-2.5">
      <AnimatePresence initial={false}>
        {alerts.map((a, i) => (
          <AlertRow
            key={a.id}
            alert={a}
            index={i}
            onAcknowledge={onAcknowledge}
          />
        ))}
      </AnimatePresence>
    </ul>
  )
}
