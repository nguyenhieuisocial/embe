-- Compatibility bootstrap for a clean migration replay. These tables were
-- originally introduced by a later migration, while 20260901094834 already
-- extends them. Existing environments are unchanged by IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS portal_read_model.pregnancy_wellness_profile (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  birth_date date CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1940-01-01' AND CURRENT_DATE),
  height_cm numeric(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 120 AND 220),
  pre_pregnancy_weight_kg numeric(5,2) CHECK (pre_pregnancy_weight_kg IS NULL OR pre_pregnancy_weight_kg BETWEEN 25 AND 300),
  activity_level text CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'low_active', 'active', 'very_active')),
  clinician_energy_target_kcal integer CHECK (clinician_energy_target_kcal IS NULL OR clinician_energy_target_kcal BETWEEN 1000 AND 5000),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS portal_read_model.iphone_health_device (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS portal_read_model.iphone_health_daily (
  device_id uuid NOT NULL REFERENCES portal_read_model.iphone_health_device(id) ON DELETE CASCADE,
  day date NOT NULL CHECK (day BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  steps integer CHECK (steps IS NULL OR steps BETWEEN 0 AND 200000),
  active_energy_kcal numeric(7,1) CHECK (active_energy_kcal IS NULL OR active_energy_kcal BETWEEN 0 AND 10000),
  resting_energy_kcal numeric(7,1) CHECK (resting_energy_kcal IS NULL OR resting_energy_kcal BETWEEN 0 AND 10000),
  sleep_minutes integer CHECK (sleep_minutes IS NULL OR sleep_minutes BETWEEN 0 AND 1440),
  weight_kg numeric(5,2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 25 AND 300),
  water_ml integer CHECK (water_ml IS NULL OR water_ml BETWEEN 0 AND 15000),
  heart_rate_avg numeric(5,1) CHECK (heart_rate_avg IS NULL OR heart_rate_avg BETWEEN 25 AND 240),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (device_id, day)
);
