import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity,
  BellRing,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Radio,
  RefreshCw,
  Sparkles,
  X,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useMonitor } from '../context/MonitorContext'
import DemoBanner from './DemoBanner'
import ThemeToggle from './ThemeToggle'
import { fmtAgo, severity } from '../lib/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/history', label: 'History', icon: Activity },
  { to: '/alerts', label: 'Alerts', icon: BellRing },
  { to: '/insights', label: 'AI Insights', icon: Sparkles },
  { to: '/reports', label: 'Reports', icon: FileText },
]

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-accent shadow-glow">
        <Activity className="h-5 w-5 text-ink-950" strokeWidth={2.6} />
        <span className="absolute inset-0 rounded-xl bg-accent/40 animate-pulse-ring" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-extrabold tracking-tight text-white">
          VitalStream
        </div>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Remote Monitoring
        </div>
      </div>
    </div>
  )
}

function NavItems({ onNavigate }) {
  const { openAlerts } = useMonitor()

  return (
    <nav className="mt-7 space-y-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
              isActive
                ? 'bg-white/[0.08] text-white'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon
                className={`h-[18px] w-[18px] transition-colors ${
                  isActive ? 'text-accent' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              />
              <span className="flex-1">{label}</span>
              {to === '/alerts' && openAlerts.length > 0 && (
                <span className="rounded-full bg-status-critical/20 px-2 py-0.5 text-[11px] font-bold text-status-critical ring-1 ring-status-critical/30">
                  {openAlerts.length}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function ConnectionPill() {
  const { status, realtimeActive, health, demoMode } = useMonitor()
  // In demo mode the assessment is generated locally, so its `online` flag
  // says nothing about the device. Report the simulation instead.
  const online = !demoMode && status?.online

  return (
    <div className="mt-auto space-y-2 pt-6">
      <div
        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-semibold ${
          demoMode
            ? 'border-status-warning/25 bg-status-warning/10 text-status-warning'
            : online
              ? 'border-status-normal/25 bg-status-normal/10 text-status-normal'
              : 'border-slate-600/40 bg-slate-600/10 text-slate-400'
        }`}
      >
        {demoMode ? (
          <FlaskConical className="h-4 w-4" />
        ) : online ? (
          <Wifi className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}
        <div className="flex-1 leading-tight">
          <div>
            {demoMode
              ? 'Simulated data'
              : online
                ? 'Device online'
                : 'Device offline'}
          </div>
          <div className="text-[10px] font-medium opacity-70">
            {demoMode
              ? 'Waiting for the sensor'
              : `Last reading ${fmtAgo(status?.window_end)}`}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 text-[10px] font-medium text-slate-600">
        <Radio
          className={`h-3 w-3 ${realtimeActive ? 'text-accent' : 'text-slate-600'}`}
        />
        {demoMode
          ? 'Demo feed · retrying live every 5s'
          : realtimeActive
            ? 'Realtime stream active'
            : 'Polling every 5s'}
        {health?.generative_ai === 'groq' && (
          <span className="ml-auto text-accent/80">Groq</span>
        )}
      </div>
    </div>
  )
}

function TopBar({ onMenu }) {
  const { status, refresh, loading } = useMonitor()
  const sev = severity(status?.status)

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <button
          onClick={onMenu}
          className="btn-ghost !px-2 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold text-white sm:text-base">
            {status?.patient_name || 'Patient monitor'}
          </h1>
          <p className="truncate text-[10.5px] text-slate-500 sm:text-[11px]">
            {status?.device_id || '—'} · {status?.sample_count ?? 0} readings in the
            last {status?.window_minutes ?? 15} min
          </p>
        </div>

        {status && (
          <div
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold sm:gap-2 sm:px-3 sm:py-1.5 sm:text-xs ${sev.bg} ${sev.border} ${sev.text}`}
          >
            <span className={`h-2 w-2 rounded-full ${sev.dot}`}>
              {status.status !== 'normal' && (
                <span
                  className={`block h-2 w-2 rounded-full ${sev.dot} animate-pulse-ring`}
                />
              )}
            </span>
            <span className="hidden xs:inline">{sev.label}</span>
          </div>
        )}

        <ThemeToggle />

        <button
          onClick={refresh}
          className="btn-ghost !px-2.5"
          aria-label="Refresh now"
          title="Refresh now"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading ? 'animate-spin text-accent' : ''}`}
          />
        </button>
      </div>
    </header>
  )
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/[0.06] bg-ink-950/60 px-4 py-6 backdrop-blur-xl lg:flex">
        <Brand />
        <NavItems />
        <ConnectionPill />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-ink-900 px-4 py-6 lg:hidden"
            >
              <div className="flex items-start justify-between">
                <Brand />
                <button
                  onClick={() => setOpen(false)}
                  className="btn-ghost !px-2"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavItems onNavigate={() => setOpen(false)} />
              <ConnectionPill />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setOpen(true)} />
        <DemoBanner />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-3 py-4 sm:px-6 sm:py-7">{children}</main>
        <footer className="border-t border-white/[0.06] px-4 py-4 text-center text-[11px] leading-relaxed text-slate-600 sm:px-6">
          <div className="mx-auto max-w-[1600px]">
            Monitoring assistance only — not a medical diagnosis. Alerts come from a
            deterministic rule engine; the AI layer explains them in plain language.
            <br className="hidden sm:inline" />
            D.K.T.E. Society&apos;s Textile &amp; Engineering Institute, Ichalkaranji ·
            B.Tech AI &amp; Data Science
          </div>
        </footer>
      </div>
    </div>
  )
}
