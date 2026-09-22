import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts'
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useThemeColors } from '../context/ThemeContext'
import { fmtValue, severity, VITALS } from '../lib/format'

const TrendGlyph = ({ direction }) => {
  if (direction === 'rising') return <TrendingUp className="h-3.5 w-3.5" />
  if (direction === 'falling') return <TrendingDown className="h-3.5 w-3.5" />
  return <Minus className="h-3.5 w-3.5" />
}

function VitalCard({ vital, series, index = 0 }) {
  const meta = VITALS[vital.metric] || {}
  const sev = severity(vital.severity)
  const themeColors = useThemeColors()
  const color = themeColors[meta.color] || themeColors.accent

  const spark = useMemo(
    () =>
      (series || [])
        .filter((p) => p[vital.metric] !== null && p[vital.metric] !== undefined)
        .slice(-60)
        .map((p, i) => ({ i, v: Number(p[vital.metric]) })),
    [series, vital.metric],
  )

  const gradientId = `grad-${vital.metric}`
  const hasValue = vital.value !== null && vital.value !== undefined

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.45, ease: 'easeOut' }}
      className={`card card-hover group overflow-hidden p-5 ${
        vital.severity === 'critical' ? 'ring-1 ' + sev.ring : ''
      }`}
    >
      {/* accent wash that intensifies on hover */}
      <div
        className="pointer-events-none absolute inset-x-0 -top-24 h-40 opacity-[0.16] blur-2xl transition-opacity duration-500 group-hover:opacity-30"
        style={{ background: `radial-gradient(50% 100% at 50% 100%, ${color}, transparent)` }}
      />

      <header className="relative flex items-start justify-between gap-2">
        <div>
          <div className="label">{meta.label || vital.label}</div>
          <div className="mt-0.5 text-[11px] text-slate-600">
            Expected {vital.normal_range}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sev.bg} ${sev.border} ${sev.text}`}
        >
          {vital.sensor_fault ? 'Sensor' : sev.label}
        </span>
      </header>

      <div className="relative mt-4 flex items-end gap-2">
        <motion.span
          key={vital.value}
          initial={{ opacity: 0.4, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="readout text-[42px] font-extrabold leading-none tracking-tight"
          style={{ color: hasValue ? color : themeColors.muted }}
        >
          {fmtValue(vital.value, vital.metric)}
        </motion.span>
        <span className="pb-1.5 text-sm font-semibold text-slate-500">
          {meta.unit || vital.unit}
        </span>

        {vital.trend?.direction && vital.trend.direction !== 'unknown' && (
          <span
            className={`ml-auto mb-1.5 inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2 py-1 text-[11px] font-bold ${
              vital.trend.direction === 'stable' ? 'text-slate-400' : 'text-slate-200'
            }`}
            title={`${vital.trend.change >= 0 ? '+' : ''}${vital.trend.change} over the window`}
          >
            <TrendGlyph direction={vital.trend.direction} />
            {vital.trend.direction === 'stable'
              ? 'stable'
              : `${vital.trend.change > 0 ? '+' : ''}${vital.trend.change}`}
          </span>
        )}
      </div>

      {/* sparkline */}
      <div className="relative mt-3 h-14">
        {spark.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="grid h-full place-items-center text-[11px] text-slate-600">
            Waiting for enough samples to draw a trend
          </div>
        )}
      </div>

      {(vital.severity !== 'normal' || vital.discarded > 0) && (
        <footer className="relative mt-3 border-t border-white/[0.06] pt-3">
          {vital.severity !== 'normal' && (
            <p className={`flex gap-2 text-[11.5px] leading-relaxed ${sev.text}`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="text-slate-300">{vital.message}</span>
            </p>
          )}
          {vital.discarded > 0 && (
            <p className="mt-1.5 text-[10.5px] text-slate-600">
              {vital.discarded} reading{vital.discarded > 1 ? 's' : ''} discarded as
              sensor artifacts in this window.
            </p>
          )}
        </footer>
      )}
    </motion.article>
  )
}

export default memo(VitalCard)
