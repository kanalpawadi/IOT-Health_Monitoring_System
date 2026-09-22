# Firmware notes

Your board is already streaming into Supabase successfully — 51 rows of
`bpm`, `spo2`, `temperature`, `movement` were present when this software was
built. **Nothing here asks you to replace that working sketch.** This file only
describes the two changes that unlock features the dashboard is already built
for, plus what the live data revealed.

The sketch in `sketch_sep16a/` is a MAX30102 serial test only — it has no Wi-Fi
or Supabase code — so the sketch actually running on the board is a different
file that isn't in this folder. Merge the snippets below into that one.

---

## 1. Two things the live data showed

### `temperature` reads ~30.4 °C

Every one of the 51 readings sat between 30.31 and 30.94 °C. That is room
temperature, not body temperature — the DS18B20 is measuring air.

The rule engine treats anything below 32 °C as a **sensor fault**, not as
hypothermia, and says so on the dashboard. It deliberately does *not* raise a
critical patient alarm, because a body at 30 °C would be a medical emergency
and crying wolf trains a caregiver to ignore real alarms.

To fix it in hardware: tape the probe flat against skin (armpit or forehead
works best for a prototype), and allow ~30 s to settle before trusting the
reading. Once it reads in the 36–37.5 °C band the card turns green by itself —
no software change needed.

### `bpm` is 0 in 36 of 51 rows, and the rest include 31 and 174 BPM

Zero is the MAX30102 algorithm's "no valid reading" output. The database view
(`readings_v`) maps `bpm = 0` to NULL so the rule engine never sees a zero
heart rate as a real measurement — a literal 0 BPM reading would classify as
cardiac arrest.

The 31 and 174 values are motion artifacts. The engine discards anything
outside 35–200 BPM and requires three consecutive breaching readings before
alerting, so these no longer produce false alarms. You can reduce them at the
source by keeping the fingertip still and fully covering the sensor window.

Optionally, publish the algorithm's own validity flags and the engine will use
them directly:

```cpp
// after maxim_heart_rate_and_oxygen_saturation(...)
doc["hr_valid"]   = validHeartRate == 1;
doc["spo2_valid"] = validSPO2 == 1;
```

---

## 2. Sending MPU6050 axes (required for fall detection)

Right now the board sends `movement` as a single boolean. A boolean can
describe *activity*, but it cannot describe a *fall*, because a fall is a
sequence — free fall, then impact, then stillness — and one bit per sample
cannot express a sequence.

So the dashboard currently reports activity (resting / light movement /
active) and states honestly that fall detection is unavailable. It does **not**
claim "no fall detected", which would be a dangerous thing to show.

To enable it, send the three accelerometer axes **in g** (not raw LSB counts).
The columns already exist after running `db/schema.sql`:

```cpp
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

void setupMpu() {
  if (!mpu.begin()) {
    Serial.println("MPU6050 not found");
    return;
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);  // 8g: a fall impact exceeds 2.5g
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
}

void addMotion(JsonDocument& doc) {
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);

  // Adafruit returns m/s^2; the backend expects g. 1 g = 9.80665 m/s^2.
  const float G = 9.80665f;
  doc["accel_x"] = a.acceleration.x / G;
  doc["accel_y"] = a.acceleration.y / G;
  doc["accel_z"] = a.acceleration.z / G;

  doc["gyro_x"] = g.gyro.x * 57.2958f;   // rad/s -> deg/s
  doc["gyro_y"] = g.gyro.y * 57.2958f;
  doc["gyro_z"] = g.gyro.z * 57.2958f;

  // Keep sending `movement` too - it stays useful as a cheap activity flag.
  float mag = sqrt(sq(doc["accel_x"].as<float>())
                 + sq(doc["accel_y"].as<float>())
                 + sq(doc["accel_z"].as<float>()));
  doc["movement"] = fabs(mag - 1.0f) > 0.18f;
}
```

`accel_magnitude` is a generated column — Postgres computes it from the three
axes automatically. Do not send it.

### Sampling rate matters here

The detector looks for a free-fall dip followed by an impact **within 2
seconds**. At your current ~10 s interval a whole fall happens between two
samples and will be missed.

For fall detection to work, the accelerometer needs to be sampled at roughly
**10–20 Hz**. You do not need to push every sample to the cloud — sample fast
locally, and either upload at a higher rate during motion or run the threshold
check on the ESP8266 and upload a flag when it trips. The thresholds used by
the backend are in `backend/app/fall.py` (`FREE_FALL_G`, `IMPACT_G`,
`IMPACT_WINDOW_S`) if you want to mirror them on-device.

---

## 3. Optional: posting through the backend instead of straight to Supabase

Your board writes to Supabase directly, which is fine and matches what is
running today. If you would rather match the block diagram's
`ESP8266 → backend → database` arrow, POST to `/api/ingest` instead:

```
POST http://<your-pc-ip>:8000/api/ingest
Content-Type: application/json
X-Device-Key: <INGEST_KEY from backend/.env, if you set one>

{"device_id":"esp8266-01","heart_rate":78,"spo2":97,"temperature_c":36.8,
 "movement":false,"accel_x":0.02,"accel_y":-0.01,"accel_z":0.99}
```

The response carries the rule engine's verdict on that same round trip:

```json
{"id": 52, "status": "normal", "new_alerts": 0}
```

which is what you would use if you later want the board itself to buzz on a
critical reading rather than waiting for someone to look at the dashboard.

Field names in this JSON are the *clinical* names (`heart_rate`,
`temperature_c`); the backend maps them onto your physical `bpm` and
`temperature` columns.
