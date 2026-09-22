import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useThemeColors } from '../context/ThemeContext'
import { AwaitingSignalArt } from './Illustrations'
import { fmtTime, timeTickFormatter, VITALS } from '../lib/format'

/** Healthy bands drawn as a soft ribbon behind each series. */
const BANDS = {
  heart_rate: [60, 100],
  spo2: [95, 100],
  temperature_c: [36.1, 37.5],
}

function ChartTooltip({ active, payload, label, metrics, colors }) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl">
      <div className="mb-1.5 text-[11px] font-semibold text-slate-400">
        {fmtTime(label, 'd MMM HH:mm:ss')}
      </div>
      {payload.map((p) => {
        const meta = VITALS[p.dataKey]
        if (!meta || !metrics.includes(p.dataKey)) return null
        return (
          <div key={p.dataKey} className="flex items-center gap-2 py-0.5 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: colors[p.dataKey] }}
            />
            <span className="text-slate-400">{meta.short}</span>
            <span className="readout ml-auto font-bold text-white">
              {p.value == null ? '—' : Number(p.value).toFixed(meta.unit === '°C' ? 1 : 0)}
              <span className="ml-0.5 font-medium text-slate-500">{meta.unit}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function LiveChart({
  points = [],
  spanMinutes = 15,
  height = 320,
  title = 'Live vitals',
  subtitle,
}) {
  const [metrics, setMetrics] = useState(['heart_rate', 'spo2', 'temperature_c'])
  const c = useThemeColors()
  const COLOR = { heart_rate: c.hr, spo2: c.spo2, temperature_c: c.temp }

  const data = useMemo(
    () =>
      points.map((p) => ({
        t: new Date(p.recorded_at).getTime(),
        heart_rate: p.heart_rate,
        spo2: p.spo2,
        temperature_c: p.temperature_c,
      })),
    [points],
  )

  const toggle = (m) =>
    setMetrics((prev) =>
      prev.includes(m)
        ? prev.length > 1
          ? prev.filter((x) => x !== m)
          : prev
        : [...prev, m],
    )

  // Heart rate and SpO2 share a percentage-ish range; temperature does not, so
  // it gets its own right-hand axis rather than being squashed flat.
  const showTemp = metrics.includes('temperature_c')
  const showLeft = metrics.some((m) => m === 'heart_rate' || m === 'spo2')

  return (
    <section className="card p-5">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(VITALS).map(([key, meta]) => {
            const on = metrics.includes(key)
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
                  on
                    ? 'border-white/15 bg-white/[0.08] text-white'
                    : 'border-white/[0.06] bg-transparent text-slate-600 hover:text-slate-400'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full transition-opacity"
                  style={{ background: COLOR[key], opacity: on ? 1 : 0.35 }}
                />
                {meta.short}
              </button>
            )
          })}
        </div>
      </header>

      {data.length < 2 ? (
        <div
          className="grid place-items-center gap-1 rounded-xl border border-dashed border-white/[0.08]"
          style={{ height }}
        >
          <AwaitingSignalArt className="h-28 w-36" />
          <p className="text-sm text-slate-600">Not enough readings yet to draw a chart.</p>
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -12 }}>
              <defs>
                {Object.entries(VITALS).map(([key, meta]) => (
                  <linearGradient key={key} id={`fill-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR[key]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLOR[key]} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>

              <CartesianGrid stroke={c.grid} vertical={false} />

              {/* A numeric axis over epoch millis. Recharts' scale="time" is
                  deliberately NOT used here: it re-parses the tick values as
                  date strings and throws on numbers. */}
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={timeTickFormatter(spanMinutes)}
                tickLine={false}
                axisLine={{ stroke: c.grid }}
                minTickGap={44}
              />

              {showLeft && (
                <YAxis
                  yAxisId="left"
                  domain={[40, 110]}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
              )}
              {showTemp && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[30, 42]}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                />
              )}

              <Tooltip
                content={<ChartTooltip metrics={metrics} colors={COLOR} />}
                cursor={{ stroke: c.muted, strokeWidth: 1, strokeOpacity: 0.5 }}
              />

              {/* healthy-range ribbons */}
              {showLeft && metrics.includes('spo2') && (
                <ReferenceArea
                  yAxisId="left"
                  y1={BANDS.spo2[0]}
                  y2={BANDS.spo2[1]}
                  fill={c.spo2}
                  fillOpacity={0.05}
                  strokeOpacity={0}
                />
              )}
              {showLeft && metrics.includes('heart_rate') && (
                <ReferenceArea
                  yAxisId="left"
                  y1={BANDS.heart_rate[0]}
                  y2={BANDS.heart_rate[1]}
                  fill={c.hr}
                  fillOpacity={0.05}
                  strokeOpacity={0}
                />
              )}

              {metrics.includes('heart_rate') && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="heart_rate"
                  name="Heart rate"
                  stroke={c.hr}
                  strokeWidth={2}
                  fill="url(#fill-heart_rate)"
                  connectNulls
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}
              {metrics.includes('spo2') && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="spo2"
                  name="SpO₂"
                  stroke={c.spo2}
                  strokeWidth={2}
                  connectNulls
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}
              {showTemp && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="temperature_c"
                  name="Temperature"
                  stroke={c.temp}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  connectNulls
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}

              <Legend
                verticalAlign="bottom"
                height={28}
                iconType="plainline"
                wrapperStyle={{ fontSize: 11, color: c.muted }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
