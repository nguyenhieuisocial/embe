BEGIN;

ALTER TABLE portal_read_model.iphone_health_daily
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 80 AND 230),
  ADD COLUMN IF NOT EXISTS distance_m numeric(9,1) CHECK (distance_m IS NULL OR distance_m BETWEEN 0 AND 200000),
  ADD COLUMN IF NOT EXISTS resting_heart_rate_bpm numeric(5,1) CHECK (resting_heart_rate_bpm IS NULL OR resting_heart_rate_bpm BETWEEN 25 AND 240),
  ADD COLUMN IF NOT EXISTS respiratory_rate numeric(4,1) CHECK (respiratory_rate IS NULL OR respiratory_rate BETWEEN 4 AND 60),
  ADD COLUMN IF NOT EXISTS oxygen_saturation_percent numeric(4,1) CHECK (oxygen_saturation_percent IS NULL OR oxygen_saturation_percent BETWEEN 50 AND 100),
  ADD COLUMN IF NOT EXISTS body_temperature_c numeric(4,1) CHECK (body_temperature_c IS NULL OR body_temperature_c BETWEEN 30 AND 45),
  ADD COLUMN IF NOT EXISTS wrist_temperature_c numeric(4,1) CHECK (wrist_temperature_c IS NULL OR wrist_temperature_c BETWEEN 25 AND 45),
  ADD COLUMN IF NOT EXISTS hrv_ms numeric(6,1) CHECK (hrv_ms IS NULL OR hrv_ms BETWEEN 0 AND 500),
  ADD COLUMN IF NOT EXISTS exercise_minutes integer CHECK (exercise_minutes IS NULL OR exercise_minutes BETWEEN 0 AND 1440),
  ADD COLUMN IF NOT EXISTS mindfulness_minutes integer CHECK (mindfulness_minutes IS NULL OR mindfulness_minutes BETWEEN 0 AND 1440),
  ADD COLUMN IF NOT EXISTS systolic integer CHECK (systolic IS NULL OR systolic BETWEEN 60 AND 250),
  ADD COLUMN IF NOT EXISTS diastolic integer CHECK (diastolic IS NULL OR diastolic BETWEEN 30 AND 160),
  ADD COLUMN IF NOT EXISTS metric_synced_at jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metric_synced_at) = 'object');

CREATE OR REPLACE FUNCTION public.embe_ingest_iphone_health_v2(
  p_token_hash text, p_day date, p_steps integer, p_active_energy_kcal numeric,
  p_resting_energy_kcal numeric, p_sleep_minutes integer, p_weight_kg numeric, p_height_cm numeric,
  p_distance_m numeric, p_water_ml integer, p_heart_rate_avg numeric, p_resting_heart_rate_bpm numeric,
  p_respiratory_rate numeric, p_oxygen_saturation_percent numeric, p_body_temperature_c numeric,
  p_wrist_temperature_c numeric, p_hrv_ms numeric, p_exercise_minutes integer,
  p_mindfulness_minutes integer, p_systolic integer, p_diastolic integer
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE matched_device uuid; synced_at timestamptz := timezone('utc', now()); synced jsonb;
BEGIN
  SELECT device.id INTO matched_device FROM portal_read_model.iphone_health_device AS device
    WHERE device.token_hash = p_token_hash AND device.active;
  IF matched_device IS NULL THEN RETURN false; END IF;
  synced := jsonb_strip_nulls(jsonb_build_object(
    'steps', CASE WHEN p_steps IS NOT NULL THEN synced_at END,
    'activeEnergyKcal', CASE WHEN p_active_energy_kcal IS NOT NULL THEN synced_at END,
    'restingEnergyKcal', CASE WHEN p_resting_energy_kcal IS NOT NULL THEN synced_at END,
    'sleepMinutes', CASE WHEN p_sleep_minutes IS NOT NULL THEN synced_at END,
    'weightKg', CASE WHEN p_weight_kg IS NOT NULL THEN synced_at END,
    'heightCm', CASE WHEN p_height_cm IS NOT NULL THEN synced_at END,
    'distanceM', CASE WHEN p_distance_m IS NOT NULL THEN synced_at END,
    'waterMl', CASE WHEN p_water_ml IS NOT NULL THEN synced_at END,
    'heartRateAvg', CASE WHEN p_heart_rate_avg IS NOT NULL THEN synced_at END,
    'restingHeartRateBpm', CASE WHEN p_resting_heart_rate_bpm IS NOT NULL THEN synced_at END,
    'respiratoryRate', CASE WHEN p_respiratory_rate IS NOT NULL THEN synced_at END,
    'oxygenSaturationPercent', CASE WHEN p_oxygen_saturation_percent IS NOT NULL THEN synced_at END,
    'bodyTemperatureC', CASE WHEN p_body_temperature_c IS NOT NULL THEN synced_at END,
    'wristTemperatureC', CASE WHEN p_wrist_temperature_c IS NOT NULL THEN synced_at END,
    'hrvMs', CASE WHEN p_hrv_ms IS NOT NULL THEN synced_at END,
    'exerciseMinutes', CASE WHEN p_exercise_minutes IS NOT NULL THEN synced_at END,
    'mindfulnessMinutes', CASE WHEN p_mindfulness_minutes IS NOT NULL THEN synced_at END,
    'systolic', CASE WHEN p_systolic IS NOT NULL THEN synced_at END,
    'diastolic', CASE WHEN p_diastolic IS NOT NULL THEN synced_at END
  ));
  INSERT INTO portal_read_model.iphone_health_daily (
    device_id, day, steps, active_energy_kcal, resting_energy_kcal, sleep_minutes, weight_kg,
    height_cm, distance_m, water_ml, heart_rate_avg, resting_heart_rate_bpm, respiratory_rate,
    oxygen_saturation_percent, body_temperature_c, wrist_temperature_c, hrv_ms, exercise_minutes,
    mindfulness_minutes, systolic, diastolic, metric_synced_at, updated_at
  ) VALUES (matched_device, p_day, p_steps, p_active_energy_kcal, p_resting_energy_kcal, p_sleep_minutes,
    p_weight_kg, p_height_cm, p_distance_m, p_water_ml, p_heart_rate_avg, p_resting_heart_rate_bpm,
    p_respiratory_rate, p_oxygen_saturation_percent, p_body_temperature_c, p_wrist_temperature_c,
    p_hrv_ms, p_exercise_minutes, p_mindfulness_minutes, p_systolic, p_diastolic, synced, synced_at)
  ON CONFLICT (device_id, day) DO UPDATE SET
    steps = COALESCE(EXCLUDED.steps, iphone_health_daily.steps),
    active_energy_kcal = COALESCE(EXCLUDED.active_energy_kcal, iphone_health_daily.active_energy_kcal),
    resting_energy_kcal = COALESCE(EXCLUDED.resting_energy_kcal, iphone_health_daily.resting_energy_kcal),
    sleep_minutes = COALESCE(EXCLUDED.sleep_minutes, iphone_health_daily.sleep_minutes),
    weight_kg = COALESCE(EXCLUDED.weight_kg, iphone_health_daily.weight_kg),
    height_cm = COALESCE(EXCLUDED.height_cm, iphone_health_daily.height_cm),
    distance_m = COALESCE(EXCLUDED.distance_m, iphone_health_daily.distance_m),
    water_ml = COALESCE(EXCLUDED.water_ml, iphone_health_daily.water_ml),
    heart_rate_avg = COALESCE(EXCLUDED.heart_rate_avg, iphone_health_daily.heart_rate_avg),
    resting_heart_rate_bpm = COALESCE(EXCLUDED.resting_heart_rate_bpm, iphone_health_daily.resting_heart_rate_bpm),
    respiratory_rate = COALESCE(EXCLUDED.respiratory_rate, iphone_health_daily.respiratory_rate),
    oxygen_saturation_percent = COALESCE(EXCLUDED.oxygen_saturation_percent, iphone_health_daily.oxygen_saturation_percent),
    body_temperature_c = COALESCE(EXCLUDED.body_temperature_c, iphone_health_daily.body_temperature_c),
    wrist_temperature_c = COALESCE(EXCLUDED.wrist_temperature_c, iphone_health_daily.wrist_temperature_c),
    hrv_ms = COALESCE(EXCLUDED.hrv_ms, iphone_health_daily.hrv_ms),
    exercise_minutes = COALESCE(EXCLUDED.exercise_minutes, iphone_health_daily.exercise_minutes),
    mindfulness_minutes = COALESCE(EXCLUDED.mindfulness_minutes, iphone_health_daily.mindfulness_minutes),
    systolic = COALESCE(EXCLUDED.systolic, iphone_health_daily.systolic),
    diastolic = COALESCE(EXCLUDED.diastolic, iphone_health_daily.diastolic),
    metric_synced_at = iphone_health_daily.metric_synced_at || EXCLUDED.metric_synced_at,
    updated_at = EXCLUDED.updated_at;
  UPDATE portal_read_model.iphone_health_device SET last_synced_at = synced_at WHERE id = matched_device;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_iphone_health_history(p_end_day date, p_days integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_end_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31' OR p_days NOT IN (7,30)
    THEN RAISE EXCEPTION 'invalid iphone health history'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(daily) - 'device_id' ORDER BY daily.day), '[]'::jsonb) INTO result
  FROM (
    SELECT DISTINCT ON (health.day) health.* FROM portal_read_model.iphone_health_daily AS health
    JOIN portal_read_model.iphone_health_device AS device ON device.id = health.device_id AND device.active
    WHERE health.day BETWEEN p_end_day - (p_days - 1) AND p_end_day
    ORDER BY health.day, health.updated_at DESC
  ) AS daily;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_ingest_iphone_health_v2(text,date,integer,numeric,numeric,integer,numeric,numeric,numeric,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_iphone_health_history(date,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_ingest_iphone_health_v2(text,date,integer,numeric,numeric,integer,numeric,numeric,numeric,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_iphone_health_history(date,integer) TO service_role;

COMMENT ON TABLE portal_read_model.iphone_health_daily IS
  'Explicitly authorised daily aggregates with per-metric freshness; no routes, raw samples or exact location.';

COMMIT;
