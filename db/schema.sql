-- ============================================================================
--  AI-Enabled IoT-Based Remote Patient Health Monitoring System
--  Supabase / PostgreSQL migration
--
--  Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
--  It is idempotent and ADDITIVE: it never renames or drops anything in your
--  existing health_data table, so the firmware that is already streaming keeps
--  working unchanged while it runs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend health_data
--
--    Your existing columns stay exactly as they are:
--        id int8, bpm int4, temperature float8, movement bool,
--        created_at timestamptz, spo2 float8
--
--    Everything added below is nullable (or defaulted), so rows written by the
--    current sketch remain valid. The MPU6050 axis columns are what real fall
--    detection needs; until the firmware sends them, the backend degrades to
--    the `movement` boolean and reports falls as "not monitored" rather than
--    as "no fall occurred".
-- ---------------------------------------------------------------------------
alter table public.health_data
    add column if not exists device_id  text not null default 'esp8266-01',

    -- MPU6050 accelerometer, in g (1.0 = gravity)
    add column if not exists accel_x    real,
    add column if not exists accel_y    real,
    add column if not exists accel_z    real,

    -- MPU6050 gyroscope, in deg/s
    add column if not exists gyro_x     real,
    add column if not exists gyro_y     real,
    add column if not exists gyro_z     real,

    -- MAX30102 algorithm validity flags, if the firmware chooses to send them
    add column if not exists hr_valid   boolean,
    add column if not exists spo2_valid boolean;

-- Derived magnitude, computed in the DB so it can never drift out of sync
-- with the axes. Added separately because generated columns cannot be part of
-- a multi-clause ALTER in older Postgres versions.
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'health_data'
          and column_name = 'accel_magnitude'
    ) then
        alter table public.health_data
            add column accel_magnitude real generated always as (
                case
                    when accel_x is null or accel_y is null or accel_z is null
                        then null
                    else sqrt(accel_x * accel_x
                            + accel_y * accel_y
                            + accel_z * accel_z)
                end
            ) stored;
    end if;
end$$;

create index if not exists health_data_device_time_idx
    on public.health_data (device_id, created_at desc);

create index if not exists health_data_time_idx
    on public.health_data (created_at desc);

-- ---------------------------------------------------------------------------
-- 2. devices  --  one row per ESP8266 node / patient
-- ---------------------------------------------------------------------------
create table if not exists public.devices (
    device_id     text primary key,
    patient_name  text,
    patient_age   int,
    ward          text,
    registered_at timestamptz not null default now(),
    last_seen_at  timestamptz
);

insert into public.devices (device_id, patient_name, ward)
values ('esp8266-01', 'Demo Patient', 'General Ward')
on conflict (device_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. alerts  --  emitted by the deterministic rule/trend engine, never by AI
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'alert_severity') then
        create type alert_severity as enum ('normal', 'warning', 'critical');
    end if;
end$$;

create table if not exists public.alerts (
    id           bigserial primary key,
    device_id    text not null default 'esp8266-01',
    created_at   timestamptz not null default now(),

    severity     alert_severity not null,
    metric       text not null,          -- heart_rate | spo2 | temperature_c | fall
    value        numeric,                -- the reading that tripped the rule
    rule         text not null,          -- machine-readable rule id
    message      text not null,          -- human-readable one-liner

    reading_id   bigint,                 -- health_data.id, soft reference
    acknowledged boolean not null default false,
    acknowledged_at timestamptz
);

create index if not exists alerts_device_time_idx
    on public.alerts (device_id, created_at desc);

create index if not exists alerts_open_idx
    on public.alerts (device_id, acknowledged, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. ai_summaries  --  cached Generative AI explanations
--
--    Cached so the dashboard can re-render without re-billing the LLM, and so
--    every summary a caregiver was shown can be audited after the fact.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_summaries (
    id            bigserial primary key,
    device_id     text not null default 'esp8266-01',
    created_at    timestamptz not null default now(),

    window_start  timestamptz not null,
    window_end    timestamptz not null,

    status        alert_severity not null,   -- status the RULE engine decided
    summary       text not null,             -- the natural-language explanation
    headline      text,                      -- short one-line version

    model         text,                      -- e.g. llama-3.3-70b-versatile
    input_digest  jsonb,                     -- exact structured facts sent to the LLM
    latency_ms    int
);

create index if not exists ai_summaries_device_time_idx
    on public.ai_summaries (device_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. A normalised view
--
--    The backend reads through this view, so the API speaks clinical names
--    (heart_rate, temperature_c, recorded_at) while your firmware keeps
--    writing bpm / temperature / created_at. If you ever rename the physical
--    columns, change this view and nothing else.
--
--    bpm = 0 is the sketch's "no valid reading" sentinel, so it maps to NULL
--    here. A zero heart rate must never reach the rule engine as a real
--    measurement -- it would read as cardiac arrest.
-- ---------------------------------------------------------------------------
create or replace view public.readings_v as
select
    id,
    device_id,
    created_at                          as recorded_at,
    nullif(bpm, 0)                      as heart_rate,
    spo2,
    temperature                         as temperature_c,
    movement,
    accel_x, accel_y, accel_z,
    gyro_x,  gyro_y,  gyro_z,
    accel_magnitude,
    hr_valid,
    spo2_valid
from public.health_data;

-- ---------------------------------------------------------------------------
-- 6. Realtime  --  let the React dashboard subscribe to live inserts
-- ---------------------------------------------------------------------------
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'health_data'
    ) then
        alter publication supabase_realtime add table public.health_data;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'alerts'
    ) then
        alter publication supabase_realtime add table public.alerts;
    end if;
exception
    when undefined_object then
        raise notice 'supabase_realtime publication not found - skipping';
end$$;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
--
--    The FastAPI backend connects with the direct Postgres credentials and
--    bypasses RLS. The React dashboard uses the anon key, so it needs explicit
--    read policies. Reads only: the dashboard must never be able to forge a
--    reading or clear an alert without going through the backend.
--
--    NOTE: health_data currently has no RLS, which is why the anon key can
--    already read it. Enabling RLS with the policy below keeps the dashboard
--    working while closing off writes. If your ESP8266 posts straight to
--    PostgREST with the anon key, DO NOT run the health_data lines until you
--    have either moved it onto /api/ingest or added an insert policy for it.
-- ---------------------------------------------------------------------------
alter table public.alerts       enable row level security;
alter table public.ai_summaries enable row level security;
alter table public.devices      enable row level security;

drop policy if exists "anon read alerts"       on public.alerts;
drop policy if exists "anon read ai_summaries" on public.ai_summaries;
drop policy if exists "anon read devices"      on public.devices;

create policy "anon read alerts"       on public.alerts       for select using (true);
create policy "anon read ai_summaries" on public.ai_summaries for select using (true);
create policy "anon read devices"      on public.devices      for select using (true);

-- Uncomment once the board no longer writes with the anon key:
--
--   alter table public.health_data enable row level security;
--   drop policy if exists "anon read health_data" on public.health_data;
--   create policy "anon read health_data"
--       on public.health_data for select using (true);
