import { motion } from 'framer-motion'
import { FlaskConical, RefreshCw } from 'lucide-react'
import { useMonitor } from '../context/MonitorContext'

/**
 * Says, on every page, that the numbers on screen are simulated.
 *
 * A monitoring dashboard that silently invents vitals would be dangerous, so
 * demo mode is never quiet about itself. It disappears on its own the moment
 * the device sends a reading.
 */
export default function DemoBanner() {
  const { demoMode, demoReason, refresh, error } = useMonitor()

  if (!demoMode) return null

  const offline = demoReason === 'offline'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-3 border-b border-status-warning/25 bg-status-warning/[0.08] px-4 py-2.5 sm:px-6"
    >
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-status-warning/15 text-status-warning">
        <FlaskConical className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[12.5px] font-bold text-status-warning">
          Demo data — these vitals are simulated, not from a patient
        </div>
        <div className="truncate text-[11px] text-slate-400">
          {offline
            ? `The API could not be reached${error?.message ? ` (${error.message})` : ''}. `
            : 'The backend is up but this device has not sent any readings yet. '}
          Connect the ESP8266 and the dashboard switches to live data on its own.
        </div>
      </div>

      <button onClick={refresh} className="btn-ghost shrink-0 !py-1.5 text-[11.5px]">
        <RefreshCw className="h-3.5 w-3.5" />
        Retry live
      </button>
    </motion.div>
  )
}
