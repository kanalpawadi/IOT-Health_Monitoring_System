import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, Clock, Cpu, ShieldCheck } from 'lucide-react'
import AiSummaryCard from '../components/AiSummaryCard'
import { useMonitor } from '../context/MonitorContext'
import { api } from '../lib/api'
import { fmtDateTime, severity } from '../lib/format'

function Pipeline() {
  const steps = [
    {
      icon: Cpu,
      title: 'Sensors → Supabase',
      body: 'The ESP8266 reads MAX30102, DS18B20 and MPU6050, then streams each sample into Postgres over Wi-Fi.',
      tint: 'from-accent to-accent',
    },
    {
      icon: ShieldCheck,
      title: 'Rule & trend engine',
      body: 'FastAPI applies threshold bands, a persistence filter and least-squares trends, then decides Normal, Warning or Critical.',
      tint: 'from-status-normal to-status-normal',
    },
    {
      icon: Brain,
      title: 'Generative AI',
      body: 'Groq receives only the structured verdict and writes the plain-language explanation. It never sets the status.',
      tint: 'from-vital-move to-vital-move',
    },
  ]

  return (
    <section className="card p-5">
      <h3 className="text-sm font-bold text-white">How a summary is produced</h3>
      <p className="mt-1 text-[12px] text-slate-500">
        The split below is the safety property of this system: deterministic code
        decides, the language model only explains.
      </p>

      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <motion.li
            key={s.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"
          >
            <div
              className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${s.tint}`}
            >
              <s.icon className="h-4 w-4 text-ink-950" />
            </div>
            <h4 className="mt-3 text-[13px] font-bold text-white">
              {i + 1}. {s.title}
            </h4>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">
              {s.body}
            </p>
          </motion.li>
        ))}
      </ol>
    </section>
  )
}

export default function Insights() {
  const { deviceId, status } = useMonitor()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.aiHistory(deviceId, 25)
      setHistory(data.summaries || [])
    } catch {
      setHistory([])
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Visual Showcase Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="label text-accent">Generative Medical Intelligence</span>
            <h2 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
              Neural Telemetry & AI Vitals Analysis
            </h2>
            <p className="mt-1 text-xs text-slate-400 max-w-lg">
              Combining real-time IoT hardware streaming (ESP8266 + MAX30102) with Groq LLM intelligence to translate complex vitals into clear caregiver insights.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <img
              src="/images/ai_analytics.jpg"
              alt="AI Analytics"
              className="h-20 w-32 rounded-xl border border-white/10 object-cover shadow-card"
            />
            <img
              src="/images/hero_monitoring.jpg"
              alt="Monitoring Telemetry"
              className="h-20 w-32 rounded-xl border border-white/10 object-cover shadow-card hidden md:block"
            />
          </div>
        </div>
      </div>

      <AiSummaryCard deviceId={deviceId} status={status?.status} />

      <Pipeline />

      <section className="card p-5">
        <header className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-bold text-white">Summary audit trail</h3>
          <span className="ml-auto text-[11px] text-slate-600">
            {history.length} stored
          </span>
        </header>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="shimmer relative h-16 overflow-hidden rounded-xl bg-white/[0.03]"
              />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-slate-600">
            No summaries stored yet. Generate one from the card above and it will be
            recorded here.
          </p>
        ) : (
          <ol className="relative space-y-3 border-l border-white/[0.08] pl-5">
            {history.map((h) => {
              const sev = severity(h.status)
              return (
                <li key={h.id} className="relative">
                  <span
                    className={`absolute -left-[26px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-ink-950 ${sev.dot}`}
                  />
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${sev.bg} ${sev.text}`}
                      >
                        {sev.label}
                      </span>
                      <span className="text-[12.5px] font-bold text-slate-200">
                        {h.headline}
                      </span>
                      <span className="ml-auto text-[10.5px] text-slate-600">
                        {fmtDateTime(h.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                      {h.summary}
                    </p>
                    <p className="mt-1.5 font-mono text-[10px] text-slate-600">
                      {h.model}
                      {h.latency_ms ? ` · ${h.latency_ms} ms` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
