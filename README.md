# AI-Enabled IoT-Based Remote Patient Health Monitoring System

Website and Generative AI layer for the B.Tech (AI & Data Science) major project
at D.K.T.E. Society's Textile & Engineering Institute, Ichalkaranji.

ESP32 sensors stream vitals into Supabase. A FastAPI backend applies a
deterministic rule and trend engine, detects falls, and asks a Generative AI
model to explain the result in plain language. A React dashboard shows it all
live.

> **Monitoring assistance only — not a medical diagnostic device.**
> Alerts are decided by deterministic code. The language model only explains
> those decisions; it never makes one.

---

## Architecture

```
MAX30102 ─┐
DS18B20  ─┼─► ESP8266 ──Wi-Fi──► Supabase (Postgres)
MPU6050  ─┘                           │
                                      ▼
                          FastAPI  ┌──────────────────┐
                                   │ rule & trend     │──► alerts table
                                   │ engine           │
                                   │ fall detection   │
                                   └────────┬─────────┘
                                            │ structured verdict only
                                            ▼
                                    Groq (Qwen3.8-27B)
                                            │
                                            ▼
                                   React dashboard + PDF reports
```

The arrow labelled *structured verdict only* is the point of the design. The
model receives a small JSON digest built in `backend/app/ai.py`, never raw
sensor arrays and never free text from the data path — so there is no channel
for anything in the database to instruct the model.

---

## Quick start

### 0. Apply the database migration (once)

**Already applied to this project's Supabase instance.** Re-run it only if you
reset the database or point the app at a different project — it is idempotent,
so running it twice is harmless.

Open Supabase → **SQL Editor** → **New query**, paste all of
[`db/schema.sql`](db/schema.sql), and run it.

It is additive and idempotent: it adds columns and tables but never renames or
drops anything, so the firmware that is already streaming keeps working while
it runs. It creates `devices`, `alerts`, `ai_summaries`, the `readings_v`
normalising view, and the realtime publication.

### 1. Backend

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Fill in `backend/.env`:

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string → URI |
| `GROQ_API_KEY` | https://console.groq.com/keys (free) |
| `GROQ_MODEL` | `qwen/qwen3.8-27b` (see *Choosing a model* below) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Supabase → Settings → API |

Then:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive API docs: <http://localhost:8000/docs>

### 2. Frontend

```bash
cd frontend
npm install
copy .env.example .env      # paste your VITE_SUPABASE_ANON_KEY
npm run dev
```

Dashboard: <http://localhost:5173>

Vite proxies `/api` to port 8000, so both run on one origin in development.

### 3. Themes and typography

The header carries a two-position switch: **dark** (default) and **milky white**.
The choice is stored per browser and applied before first paint, so the page
never flashes the wrong palette on reload. Without a stored choice the app
follows the operating system's light/dark setting.

The light theme is a warm paper palette (`#faf9f5`) rather than pure white:
saturated vital colours vibrate unpleasantly against `#ffffff`, and a cream
ground is easier on the eyes across a long monitoring session. Vital and status
colours are darkened in that theme so they keep their weight on the lighter
ground.

Typography is a serif/grotesque pairing — **Source Serif 4** for headings and
**Hanken Grotesk** for the interface, with **JetBrains Mono** for numeric
readouts so digits do not jitter as values change.

Every colour is a CSS custom property in `src/index.css`; `data-theme` on
`<html>` swaps the whole palette. Components never name a theme. To retune the
light palette, edit the `:root[data-theme='light']` block and nothing else.

### 4. Illustrations

`src/components/Illustrations.jsx` holds the artwork: the hero monitoring
scene, the all-clear state, the awaiting-signal state and the AI orb. They are
hand-authored SVG, not stock images and not raster output, so they recolour
themselves from the theme tokens, stay sharp on a projector, and add roughly
4 KB rather than several hundred. There is no attribution or licensing
question to answer in your report.

### 5. No hardware in front of you?

```bash
cd backend
python tools/simulate.py --backfill 180     # 3 hours of history
python tools/simulate.py                    # then stream live
```

Always pass `--device-id` something other than your real board when you are
just rehearsing, so simulated rows never mix into a genuine capture:

```bash
python tools/simulate.py --device-id sim-01 --backfill 40
```

Two such devices already exist in the database from build verification —
`sim-01` (normal vitals) and `sim-desat` (a critical SpO2 fall). Pick them from
the device list, or clear them with:

```sql
delete from health_data where device_id like 'sim-%';
```

Scenarios that make the rule engine trip on cue, which is useful when
rehearsing the demo:

```bash
python tools/simulate.py --scenario desat   # SpO2 falls -> critical
python tools/simulate.py --scenario fever   # temperature climbs
python tools/simulate.py --scenario tachy   # heart rate climbs
python tools/simulate.py --scenario fall    # injects a fall signature
```

---

## Choosing a Groq model

Groq's catalogue changes. At the time of writing, this account has no Llama
chat models, and the `openai/gpt-oss-*` entries are reasoning models that emit
reasoning tokens and therefore fail strict JSON mode with
`json_validate_failed`. `qwen/qwen3.8-27b` works cleanly and returns in roughly
600–800 ms, so it is the default.

List what your key can actually reach:

```bash
curl -H "Authorization: Bearer $GROQ_API_KEY" https://api.groq.com/openai/v1/models
```

`ai.py` retries once without `response_format` if a model rejects JSON mode,
and falls back to the deterministic template if the call fails entirely — so a
model change degrades the prose, never the monitoring.

## Project layout

```
db/schema.sql              Supabase migration (run this first)
backend/
  app/config.py            settings from .env
  app/db.py                asyncpg pool
  app/repo.py              queries; maps bpm/temperature/created_at -> clinical names
  app/rules.py             THE RULE ENGINE - thresholds, persistence, trends
  app/fall.py              MPU6050 threshold fall detection
  app/ai.py                Groq layer + digest builder + safe fallback
  app/report.py            PDF report (reportlab + matplotlib)
  app/routers/             monitoring, alerts, insights, reports, ingest
  tools/simulate.py        sensor simulator
frontend/
  src/context/             polling + Supabase realtime, theme state
  src/components/Illustrations.jsx   hand-authored SVG artwork
  src/components/          vital cards, charts, AI card, alert list
  src/pages/               Dashboard, History, Alerts, Insights, Reports
firmware/FIRMWARE_NOTES.md what to change on the board, and why
```

---

## How the rule engine decides

`backend/app/rules.py`. Four stages, in order:

1. **Plausibility.** Values outside what an attached sensor can physically
   produce (HR outside 35–200, SpO₂ outside 70–100, temperature outside 32–45 °C)
   are classified as a **sensor fault**, not a patient emergency, and counted as
   discarded artifacts.
2. **Threshold bands.** Critical outside `[crit_low, crit_high]`, warning
   outside `[warn_low, warn_high]`, otherwise normal.
3. **Persistence.** A breach must hold for `PERSISTENCE_SAMPLES` consecutive
   readings (default 3) before it is confirmed. An unconfirmed *critical* is
   still surfaced as a warning rather than silently swallowed.
4. **Trend.** Least-squares slope across the window, only named rising or
   falling when the total change clears a per-vital epsilon.

| Vital | Normal | Warning | Critical | Sensor fault |
| --- | --- | --- | --- | --- |
| Heart rate | 60–100 BPM | 50–59, 101–120 | <50 or >120 | <35 or >200 |
| SpO₂ | ≥95 % | 90–94 | <90 | <70 or >100 |
| Temperature | 36.1–37.5 °C | 35.0–36.0, 37.6–38.4 | <35 or ≥38.5 | <32 or >45 |

All configurable from `backend/.env`.

---

## Mapping to the synopsis

| Objective | Where |
| --- | --- |
| 1–4. Sensors and Wi-Fi transmission | your firmware (already working) |
| 5. Cloud storage | Supabase Postgres, `db/schema.sql` |
| 6. Real-time responsive dashboard | `frontend/` |
| 7. Rule/trend engine | `backend/app/rules.py` |
| 8. Generative AI summaries | `backend/app/ai.py`, Groq |
| 9. Alerts and historical reports | `alerts` table, `backend/app/report.py` |
| 10. Monitoring vs diagnosis separation | enforced in `ai.py`; stated in UI and PDF |

Two documented deviations from the synopsis text:

- **Supabase instead of Firebase.** The synopsis names Firebase; the hardware
  was built against Supabase Postgres. Worth a line in your report — relational
  storage is the easier defence anyway (SQL aggregation drives the trend engine
  and the history charts directly).
- **Fall detection is built but not yet fed.** The detector in `fall.py`
  implements the threshold stage of Xu et al. [6]; it needs accelerometer axes
  at 10–20 Hz, which the board does not send yet. See
  [`firmware/FIRMWARE_NOTES.md`](firmware/FIRMWARE_NOTES.md). The UI reports
  fall detection as *unavailable* rather than claiming no fall occurred.

---

## Security notes

- `.env` files are gitignored. The Postgres password is a superuser
  credential — if it has ever been pasted into a chat, a document or a
  screenshot, reset it in Supabase → Settings → Database.
- The anon key in `frontend/.env` is browser-visible by design. It is safe
  **only** because Row Level Security restricts it to `SELECT`. Section 7 of
  `db/schema.sql` sets those policies; read the note there before enabling RLS
  on `health_data`, since the board may currently write with that key.
- `/api/ingest` is open unless you set `INGEST_KEY`. Acceptable on a lab
  network; set it before exposing the backend anywhere else.
#   I O T - H e a l t h _ M o n i t o r i n g _ S y s t e m 
 
 