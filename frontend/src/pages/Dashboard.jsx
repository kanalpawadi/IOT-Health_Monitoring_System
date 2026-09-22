import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ServerCrash } from 'lucide-react'
import AiSummaryCard from '../components/AiSummaryCard'
import ErrorBoundary from '../components/ErrorBoundary'
import AlertList from '../components/AlertList'
import LiveChart from '../components/LiveChart'
import PatientHero from '../components/PatientHero'
import VitalCard from '../components/VitalCard'
import { useMonitor } from '../context/MonitorContext'

function ErrorPanel({ error }) {
  return (
    <div className="card border-status-critical/25 bg-status-critical/[0.06] p-6">
      <div className="flex items-start gap-3">
        <ServerCrash className="mt-0.5 h-5 w-5 shrink-0 text-status-critical" />
        <div>
          <h3 className="text-sm font-bold text-status-critical">
            Cannot load monitoring data
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
            {error.message}
          </p>
          <p className="mt-3 text-[12px] text-slate-500">
            Start the backend with{' '}
            <code className="rounded bg-black/[0.35] px-1.5 py-0.5 font-mono text-[11px] text-accent">
              uvicorn app.main:app --reload --port 8000
            </code>{' '}
            from the <code className="font-mono text-[11px]">backend/</code> folder.
          </p>
        </div>
      </div>
    </div>
  )
}

function VitalSkeleton() {
  return (
    <div className="card h-[248px] p-5">
      <div className="shimmer relative h-3 w-24 overflow-hidden rounded bg-white/[0.05]" />
      <div className="shimmer relative mt-5 h-10 w-28 overflow-hidden rounded bg-white/[0.05]" />
      <div className="shimmer relative mt-6 h-14 w-full overflow-hidden rounded bg-white/[0.04]" />
    </div>
  )
}

export default function Dashboard() {
  const {
    deviceId,
    status,
    series,
    alerts,
    loading,
    error,
    acknowledge,
    liveWindowMinutes,
  } = useMonitor()

  if (error && !status) return <ErrorPanel error={error} />

  const recentAlerts = alerts.slice(0, 5)

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      {status ? <PatientHero status={status} /> : <div className="card h-[168px]" />}

      {/* vital cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading && !status
          ? [0, 1, 2].map((i) => <VitalSkeleton key={i} />)
          : status?.vitals?.map((v, i) => (
              <VitalCard key={v.metric} vital={v} series={series} index={i} />
            ))}
      </div>

      {/* chart + AI, side by side on wide screens */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <ErrorBoundary label="The live chart">
          <LiveChart
            points={series}
            spanMinutes={liveWindowMinutes}
            title="Live vitals"
            subtitle={`Last ${liveWindowMinutes} minutes · ${series.length} readings · shaded ribbons show the healthy range`}
          />
        </ErrorBoundary>

        <div className="space-y-5">
          <ErrorBoundary label="The AI summary">
            <AiSummaryCard deviceId={deviceId} status={status?.status} />
          </ErrorBoundary>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card p-5"
          >
            <header className="mb-3.5 flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Recent alerts</h3>
              <Link
                to="/alerts"
                className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-accent transition-colors hover:text-accent/80"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Link>
            </header>
            <AlertList alerts={recentAlerts} onAcknowledge={acknowledge} />
          </motion.section>
        </div>
      </div>
    </div>
  )
}
