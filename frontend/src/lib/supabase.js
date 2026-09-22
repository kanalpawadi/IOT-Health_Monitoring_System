import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Supabase is used for ONE thing in this app: a realtime subscription so a new
 * reading paints instantly instead of waiting for the next poll. Every other
 * read goes through FastAPI, where the rule engine lives.
 *
 * If the keys are missing the app still works -- it falls back to polling.
 */
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } },
}) : null

export const realtimeAvailable = Boolean(supabase)

/**
 * Subscribe to new rows in health_data.
 * Returns an unsubscribe function; safe to call even when Supabase is absent.
 */
export function subscribeToReadings(deviceId, onInsert) {
  if (!supabase) return () => {}

  const channel = supabase
    .channel(`health_data:${deviceId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'health_data' },
      (payload) => {
        const row = payload.new
        // device_id may be absent on rows written before the migration.
        if (row.device_id && row.device_id !== deviceId) return
        onInsert(normaliseRow(row))
      },
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

/** Map physical health_data column names onto the API's clinical names. */
export function normaliseRow(row) {
  return {
    id: row.id,
    recorded_at: row.created_at,
    // bpm = 0 is the firmware's "no valid reading" sentinel, same as the
    // readings_v view applies server-side.
    heart_rate: row.bpm === 0 ? null : row.bpm,
    spo2: row.spo2,
    temperature_c: row.temperature,
    movement: row.movement,
    accel_magnitude: row.accel_magnitude ?? null,
  }
}
