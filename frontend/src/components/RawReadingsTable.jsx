import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  Radio,
  RefreshCw,
  Table as TableIcon,
  Activity,
  Heart,
  Thermometer,
  Wind,
  Layers,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react'
import { useMonitor } from '../context/MonitorContext'
import { fmtTime, fmtDateTime, fmtAgo } from '../lib/format'

export default function RawReadingsTable() {
  const { rawReadings, refreshRawReadings, realtimeActive, deviceId, liveTick } = useMonitor()
  const [viewMode, setViewMode] = useState('supabase') // 'supabase' | 'clinical'
  const [copiedId, setCopiedId] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshRawReadings?.()
    } finally {
      setTimeout(() => setIsRefreshing(false), 400)
    }
  }

  const handleCopyRow = (row) => {
    navigator.clipboard?.writeText(JSON.stringify(row, null, 2))
    setCopiedId(row.id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  return (
    <div className="card overflow-hidden border border-white/[0.08] shadow-2xl bg-slate-900/60 backdrop-blur-md">
      {/* Table Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-white/[0.06] bg-slate-950/40">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold text-white tracking-wide">
                Live Supabase Telemetry Stream
              </h3>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-400 border border-white/[0.06]">
                public.health_data
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400 flex items-center gap-2">
              <span>ESP32 streaming to Supabase</span>
              <span className="text-slate-600">·</span>
              <span className="flex items-center gap-1.5 font-medium">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    realtimeActive
                      ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                      : 'bg-emerald-500'
                  }`}
                />
                <span className={realtimeActive ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                  {realtimeActive ? 'Realtime Active' : 'Polling Sync'}
                </span>
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-slate-950/70 p-1 text-xs">
            <button
              onClick={() => setViewMode('supabase')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-all ${
                viewMode === 'supabase'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Supabase Schema</span>
            </button>
            <button
              onClick={() => setViewMode('clinical')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold transition-all ${
                viewMode === 'clinical'
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Clinical View</span>
            </button>
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.08] hover:text-white transition-all disabled:opacity-50"
            title="Refresh rows from Supabase"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden xs:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Realtime Stats Bar */}
      <div className="px-5 py-2.5 bg-slate-950/60 border-b border-white/[0.04] flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <span>
            Device: <strong className="font-mono text-slate-200">{deviceId}</strong>
          </span>
          <span>·</span>
          <span>
            Streamed in Memory: <strong className="text-slate-200">{rawReadings.length}</strong> rows
          </span>
          {liveTick > 0 && (
            <>
              <span>·</span>
              <span className="text-emerald-400 font-medium">
                +{liveTick} live updates received
              </span>
            </>
          )}
        </div>
        <div className="text-slate-500 font-mono text-[10px]">
          Latest row ID: {rawReadings[0]?.id ?? '—'}
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto max-h-[460px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
        <table className="w-full text-left text-xs text-slate-300 font-mono">
          <thead className="sticky top-0 z-10 bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 border-b border-white/[0.08]">
            {viewMode === 'supabase' ? (
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-400 w-20">id</th>
                <th className="px-4 py-3 font-semibold text-slate-400">device_id</th>
                <th className="px-4 py-3 font-semibold text-slate-400">created_at</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">bpm</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">spo2</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">temperature</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">movement</th>
                <th className="px-3 py-3 font-semibold text-slate-500 text-right w-12">raw</th>
              </tr>
            ) : (
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-400 w-20">Record #</th>
                <th className="px-4 py-3 font-semibold text-slate-400">Device</th>
                <th className="px-4 py-3 font-semibold text-slate-400">Recorded At</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">Heart Rate</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">Blood Oxygen</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">Body Temp</th>
                <th className="px-4 py-3 font-semibold text-slate-400 text-center">Activity</th>
                <th className="px-3 py-3 font-semibold text-slate-500 text-right w-12">Copy</th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rawReadings.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Radio className="h-6 w-6 animate-pulse text-emerald-400/50" />
                    <p className="text-sm font-medium">Waiting for telemetry from Supabase...</p>
                    <p className="text-xs text-slate-600">
                      Ensure your ESP32 is powered on and streaming to health_data
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rawReadings.map((r, idx) => {
                const isNew = idx === 0 && liveTick > 0
                const isNullBpm = r.bpm === null || r.bpm === 0 || r.bpm === undefined
                const isNullSpo2 = r.spo2 === null || r.spo2 === 0
                const isAbnormalTemp = r.temperature !== null && (r.temperature < 35 || r.temperature > 38.5)

                return (
                  <tr
                    key={r.id || idx}
                    className={`transition-colors hover:bg-white/[0.03] ${
                      isNew ? 'bg-emerald-500/[0.08]' : ''
                    }`}
                  >
                    {/* id */}
                    <td className="px-4 py-2.5 font-bold text-slate-200 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300">
                        {r.id}
                      </span>
                    </td>

                    {/* device_id */}
                    <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap text-xs">
                      {r.device_id || 'esp32-01'}
                    </td>

                    {/* created_at */}
                    <td className="px-4 py-2.5 text-slate-300 whitespace-nowrap text-xs">
                      <div className="flex items-center gap-2">
                        <span>{r.created_at ? r.created_at.replace('T', ' ').slice(0, 23) : '—'}</span>
                        <span className="text-[10px] text-slate-500 font-sans">
                          ({fmtAgo(r.created_at)})
                        </span>
                      </div>
                    </td>

                    {/* bpm */}
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      {isNullBpm ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-400 font-bold border border-slate-700/60">
                          {viewMode === 'supabase' ? 'NULL' : '— (No pulse)'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-300 font-bold border border-rose-500/25">
                          <Heart className="h-3 w-3 text-rose-400 fill-rose-400/30" />
                          <span>{r.bpm}</span>
                          {viewMode === 'clinical' && <span className="text-[9px] font-normal opacity-70">BPM</span>}
                        </span>
                      )}
                    </td>

                    {/* spo2 */}
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      {isNullSpo2 ? (
                        <span className="inline-flex items-center rounded bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400 font-bold border border-amber-500/20">
                          {r.spo2 !== null ? `${Number(r.spo2).toFixed(1)}%` : 'NULL'}
                          <span className="ml-1 text-[9px] text-amber-500/80 font-sans">(fault)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300 font-bold border border-cyan-500/20">
                          {Number(r.spo2).toFixed(0)}%
                        </span>
                      )}
                    </td>

                    {/* temperature */}
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold border ${
                          isAbnormalTemp
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        }`}
                      >
                        <Thermometer className="h-3 w-3 text-amber-400" />
                        <span>{r.temperature !== null ? Number(r.temperature).toFixed(2) : 'NULL'}</span>
                        {r.temperature !== null && (
                          <span className="text-[9px] font-normal opacity-70">°C</span>
                        )}
                      </span>
                    </td>

                    {/* movement */}
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${
                          r.movement
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700/50'
                        }`}
                      >
                        {viewMode === 'supabase'
                          ? r.movement
                            ? 'TRUE'
                            : 'FALSE'
                          : r.movement
                          ? 'Motion'
                          : 'Resting'}
                      </span>
                    </td>

                    {/* copy JSON */}
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleCopyRow(r)}
                        className="rounded p-1 text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
                        title="Copy row as JSON"
                      >
                        {copiedId === r.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="px-5 py-3 border-t border-white/[0.06] bg-slate-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
        <div>
          Showing recent rows from <code className="text-slate-400">health_data</code> (ordered by id DESC).
        </div>
        <div className="text-[11px] text-slate-500">
          Tip: When the fingertip is removed from the sensor, <code className="text-slate-400">bpm</code> reports NULL/0 and <code className="text-slate-400">spo2</code> reports 0.
        </div>
      </div>
    </div>
  )
}
