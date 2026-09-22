import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info, RefreshCw, Sparkles, Zap } from 'lucide-react'
import { AiOrb } from './Illustrations'
import { api } from '../lib/api'
import { useMonitor } from '../context/MonitorContext'
import { demoAiSummary } from '../lib/demoData'
import { fmtAgo, severity } from '../lib/format'

/** Reveals the summary word by word, so it reads as generated rather than pasted. */
function Typewriter({ text, active }) {
  const [shown, setShown] = useState(active ? '' : text)

  useEffect(() => {
    if (!active) {
      setShown(text)
      return undefined
    }
    const words = text.split(' ')
    let i = 0
    setShown('')
    const id = setInterval(() => {
      i += 1
      setShown(words.slice(0, i).join(' '))
      if (i >= words.length) clearInterval(id)
    }, 28)
    return () => clearInterval(id)
  }, [text, active])

  return (
    <p className="text-[13.5px] leading-relaxed text-slate-300 text-balance">
      {shown}
      {active && shown.length < text.length && (
        <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse bg-accent" />
      )}
    </p>
  )
}

export default function AiSummaryCard({ deviceId, status }) {
  const { demoMode, status: assessment } = useMonitor()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [animate, setAnimate] = useState(false)

  // The demo assessment is rebuilt every couple of seconds; reading it from a
  // ref keeps `load` stable instead of re-firing on every simulated sample.
  const assessmentRef = useRef(assessment)
  useEffect(() => {
    assessmentRef.current = assessment
  }, [assessment])

  const load = useCallback(
    async (refresh = false) => {
      // No backend, no model call -- write the summary from the simulated
      // verdict instead, and label it as a template rather than as AI output.
      if (demoMode) {
        setError(null)
        setAnimate(refresh)
        setData(demoAiSummary(assessmentRef.current))
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const result = await api.aiSummary(deviceId, refresh)
        setAnimate(refresh || !result.cached)
        setData(result)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    },
    [deviceId, demoMode],
  )

  useEffect(() => {
    load(false)
  }, [load])

  // Re-explain when the rule engine's verdict changes -- that is exactly the
  // moment a caregiver needs new words, not the same cached paragraph.
  useEffect(() => {
    if (status && data && status !== data.status) load(false)
  }, [status, data, load])

  const sev = severity(data?.status || status)

  return (
    <section className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-56 opacity-20 transition-opacity duration-500 hover:opacity-40">
        <img
          src="/images/ai_analytics.jpg"
          alt="AI Neural Map"
          className="h-full w-full object-cover rounded-full blur-[1px]"
        />
      </div>
      <AiOrb className="pointer-events-none absolute -left-16 -top-16 h-52 w-52 opacity-50" />

      <header className="relative mb-4 flex items-center gap-2.5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-vital-move shadow-lg shadow-vital-move/25">
          <Sparkles className="h-4 w-4 text-ink-950" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">AI Monitoring Summary</h3>
          <p className="truncate text-[10.5px] text-slate-500">
            {data?.model === 'rule-based-fallback'
              ? 'Deterministic template (no AI key configured)'
              : data?.model === 'demo-template'
                ? 'Demo template (simulated vitals, no model call)'
                : data?.model || 'Generating…'}
            {data?.latency_ms ? ` · ${data.latency_ms} ms` : ''}
            {data?.cached ? ' · cached' : ''}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="btn-ghost !px-2.5"
          title="Generate a fresh summary"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-vital-move' : ''}`} />
        </button>
      </header>

      <div className="relative min-h-[112px]">
        <AnimatePresence mode="wait">
          {loading && !data ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2.5"
            >
              {[92, 100, 78].map((w, i) => (
                <div
                  key={i}
                  className="shimmer relative h-3 overflow-hidden rounded bg-white/[0.05]"
                  style={{ width: `${w}%` }}
                />
              ))}
            </motion.div>
          ) : error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[13px] text-status-critical"
            >
              {error}
            </motion.p>
          ) : data ? (
            <motion.div
              key={data.generated_at}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
            >
              <h4
                className={`mb-2 flex items-start gap-2 text-[15px] font-bold leading-snug ${sev.text}`}
              >
                <Zap className="mt-0.5 h-4 w-4 shrink-0" />
                {data.headline}
              </h4>
              <Typewriter text={data.summary || ''} active={animate} />

              {data.note && (
                <p className="mt-3 rounded-lg border border-status-warning/20 bg-status-warning/[0.07] px-3 py-2 text-[11px] text-status-warning">
                  {data.note}
                </p>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="relative mt-4 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[10.5px] leading-relaxed text-slate-600">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          The <strong className="font-semibold text-slate-500">{sev.label}</strong>{' '}
          status was decided by the rule engine, not by the AI. This text explains it
          in plain language and is not a medical diagnosis.
          {data?.generated_at ? ` Generated ${fmtAgo(data.generated_at)}.` : ''}
        </span>
      </footer>
    </section>
  )
}
