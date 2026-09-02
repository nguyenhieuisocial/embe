BEGIN;

ALTER TABLE portal_read_model.pregnancy_wellness_profile
  ADD COLUMN clinician_weight_gain_min_kg numeric(4,1)
    CHECK (clinician_weight_gain_min_kg IS NULL OR clinician_weight_gain_min_kg BETWEEN 0 AND 50),
  ADD COLUMN clinician_weight_gain_max_kg numeric(4,1)
    CHECK (clinician_weight_gain_max_kg IS NULL OR clinician_weight_gain_max_kg BETWEEN 0 AND 50),
  ADD CONSTRAINT pregnancy_weight_gain_range CHECK (
    clinician_weight_gain_min_kg IS NULL OR clinician_weight_gain_max_kg IS NULL
    OR clinician_weight_gain_min_kg <= clinician_weight_gain_max_kg
  );

ALTER TABLE portal_read_model.iphone_health_daily
  ADD COLUMN height_cm numeric(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 80 AND 230),
  ADD COLUMN distance_m numeric(9,1) CHECK (distance_m IS NULL OR distance_m BETWEEN 0 AND 200000),
  ADD COLUMN resting_heart_rate_bpm numeric(5,1) CHECK (resting_heart_rate_bpm IS NULL OR resting_heart_rate_bpm BETWEEN 25 AND 240),
  ADD COLUMN respiratory_rate numeric(4,1) CHECK (respiratory_rate IS NULL OR respiratory_rate BETWEEN 4 AND 60),
  ADD COLUMN oxygen_saturation_percent numeric(4,1) CHECK (oxygen_saturation_percent IS NULL OR oxygen_saturation_percent BETWEEN 50 AND 100),
  ADD COLUMN body_temperature_c numeric(4,1) CHECK (body_temperature_c IS NULL OR body_temperature_c BETWEEN 30 AND 45),
  ADD COLUMN wrist_temperature_c numeric(4,1) CHECK (wrist_temperature_c IS NULL OR wrist_temperature_c BETWEEN 25 AND 45),
  ADD COLUMN hrv_ms numeric(6,1) CHECK (hrv_ms IS NULL OR hrv_ms BETWEEN 0 AND 500),
  ADD COLUMN exercise_minutes integer CHECK (exercise_minutes IS NULL OR exercise_minutes BETWEEN 0 AND 1440),
  ADD COLUMN mindfulness_minutes integer CHECK (mindfulness_minutes IS NULL OR mindfulness_minutes BETWEEN 0 AND 1440),
  ADD COLUMN systolic integer CHECK (systolic IS NULL OR systolic BETWEEN 60 AND 250),
  ADD COLUMN diastolic integer CHECK (diastolic IS NULL OR diastolic BETWEEN 30 AND 160),
  ADD COLUMN metric_synced_at jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metric_synced_at) = 'object');

ALTER TABLE portal_read_model.pregnancy_health
  ADD COLUMN blood_glucose_mg_dl numeric(5,1) CHECK (blood_glucose_mg_dl IS NULL OR blood_glucose_mg_dl BETWEEN 20 AND 600),
  ADD COLUMN fetal_movement_count integer CHECK (fetal_movement_count IS NULL OR fetal_movement_count BETWEEN 0 AND 500),
  ADD COLUMN symptoms text[] NOT NULL DEFAULT '{}'::text[] CHECK (
    symptoms <@ ARRAY[
      'bleeding','severe_abdominal_pain','severe_headache','vision_change','sudden_swelling',
      'fever','fluid_leak','reduced_fetal_movement','persistent_vomiting','other'
    ]::text[]
  );

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_wellness_profile(
  p_birth_date date, p_height_cm numeric, p_pre_pregnancy_weight_kg numeric,
  p_activity_level text, p_clinician_energy_target_kcal integer,
  p_clinician_weight_gain_min_kg numeric, p_clinician_weight_gain_max_kg numeric
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF (p_birth_date IS NOT NULL AND p_birth_date NOT BETWEEN DATE '1940-01-01' AND CURRENT_DATE)
    OR (p_height_cm IS NOT NULL AND p_height_cm NOT BETWEEN 120 AND 220)
    OR (p_pre_pregnancy_weight_kg IS NOT NULL AND p_pre_pregnancy_weight_kg NOT BETWEEN 25 AND 300)
    OR (p_activity_level IS NOT NULL AND p_activity_level NOT IN ('sedentary', 'low_active', 'active', 'very_active'))
    OR (p_clinician_energy_target_kcal IS NOT NULL AND p_clinician_energy_target_kcal NOT BETWEEN 1000 AND 5000)
    OR (p_clinician_weight_gain_min_kg IS NOT NULL AND p_clinician_weight_gain_min_kg NOT BETWEEN 0 AND 50)
    OR (p_clinician_weight_gain_max_kg IS NOT NULL AND p_clinician_weight_gain_max_kg NOT BETWEEN 0 AND 50)
    OR (p_clinician_weight_gain_min_kg IS NOT NULL AND p_clinician_weight_gain_max_kg IS NOT NULL
      AND p_clinician_weight_gain_min_kg > p_clinician_weight_gain_max_kg)
  THEN RAISE EXCEPTION 'invalid wellness profile'; END IF;
  INSERT INTO portal_read_model.pregnancy_wellness_profile (
    singleton, birth_date, height_cm, pre_pregnancy_weight_kg, activity_level,
    clinician_energy_target_kcal, clinician_weight_gain_min_kg, clinician_weight_gain_max_kg, updated_at
  ) VALUES (true, p_birth_date, p_height_cm, p_pre_pregnancy_weight_kg, p_activity_level,
    p_clinician_energy_target_kcal, p_clinician_weight_gain_min_kg, p_clinician_weight_gain_max_kg, timezone('utc', now()))
  ON CONFLICT (singleton) DO UPDATE SET birth_date = EXCLUDED.birth_date,
    height_cm = EXCLUDED.height_cm, pre_pregnancy_weight_kg = EXCLUDED.pre_pregnancy_weight_kg,
    activity_level = EXCLUDED.activity_level, clinician_energy_target_kcal = EXCLUDED.clinician_energy_target_kcal,
    clinician_weight_gain_min_kg = EXCLUDED.clinician_weight_gain_min_kg,
    clinician_weight_gain_max_kg = EXCLUDED.clinician_weight_gain_max_kg, updated_at = EXCLUDED.updated_at;
END;
$function$;

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
  IF p_end_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31' OR p_days NOT IN (7,28,90)
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

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_health_history(p_end_day date, p_days integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_end_day IS NULL OR p_end_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31' OR p_days NOT IN (7,28,90)
    THEN RAISE EXCEPTION 'invalid pregnancy health history request'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', to_char(series.day, 'YYYY-MM-DD'), 'weight_kg', health.weight_kg,
    'systolic', health.systolic, 'diastolic', health.diastolic, 'sleep_minutes', health.sleep_minutes,
    'water_glasses', health.water_glasses, 'movement_minutes', health.movement_minutes,
    'wellbeing', health.wellbeing, 'blood_glucose_mg_dl', health.blood_glucose_mg_dl,
    'fetal_movement_count', health.fetal_movement_count, 'symptoms', COALESCE(health.symptoms, '{}'::text[]),
    'checklist_percent', round(100.0 * (SELECT count(*) FROM portal_read_model.pregnancy_check AS c WHERE c.day=series.day) / 13)::integer
  ) ORDER BY series.day), '[]'::jsonb) INTO result
  FROM generate_series(p_end_day-(p_days-1),p_end_day,interval '1 day') AS series(day)
  LEFT JOIN portal_read_model.pregnancy_health AS health ON health.day=series.day;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_health(
  p_day date, p_weight_kg numeric, p_systolic integer, p_diastolic integer, p_sleep_minutes integer,
  p_water_glasses integer, p_movement_minutes integer, p_wellbeing integer,
  p_blood_glucose_mg_dl numeric, p_fetal_movement_count integer, p_symptoms text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
    OR (p_weight_kg IS NOT NULL AND p_weight_kg NOT BETWEEN 25 AND 300)
    OR (p_systolic IS NOT NULL AND p_systolic NOT BETWEEN 60 AND 250)
    OR (p_diastolic IS NOT NULL AND p_diastolic NOT BETWEEN 30 AND 160)
    OR (p_sleep_minutes IS NOT NULL AND p_sleep_minutes NOT BETWEEN 0 AND 1440)
    OR (p_water_glasses IS NOT NULL AND p_water_glasses NOT BETWEEN 0 AND 30)
    OR (p_movement_minutes IS NOT NULL AND p_movement_minutes NOT BETWEEN 0 AND 600)
    OR (p_wellbeing IS NOT NULL AND p_wellbeing NOT BETWEEN 1 AND 5)
    OR (p_blood_glucose_mg_dl IS NOT NULL AND p_blood_glucose_mg_dl NOT BETWEEN 20 AND 600)
    OR (p_fetal_movement_count IS NOT NULL AND p_fetal_movement_count NOT BETWEEN 0 AND 500)
    OR NOT COALESCE(p_symptoms, '{}'::text[]) <@ ARRAY['bleeding','severe_abdominal_pain','severe_headache','vision_change','sudden_swelling','fever','fluid_leak','reduced_fetal_movement','persistent_vomiting','other']::text[]
  THEN RAISE EXCEPTION 'invalid pregnancy health snapshot'; END IF;
  INSERT INTO portal_read_model.pregnancy_day(day,updated_at) VALUES(p_day,timezone('utc',now()))
    ON CONFLICT(day) DO UPDATE SET updated_at=EXCLUDED.updated_at;
  INSERT INTO portal_read_model.pregnancy_health(day,weight_kg,systolic,diastolic,sleep_minutes,water_glasses,
    movement_minutes,wellbeing,blood_glucose_mg_dl,fetal_movement_count,symptoms,updated_at)
  VALUES(p_day,p_weight_kg,p_systolic,p_diastolic,p_sleep_minutes,p_water_glasses,p_movement_minutes,p_wellbeing,
    p_blood_glucose_mg_dl,p_fetal_movement_count,COALESCE(p_symptoms,'{}'::text[]),timezone('utc',now()))
  ON CONFLICT(day) DO UPDATE SET weight_kg=EXCLUDED.weight_kg,systolic=EXCLUDED.systolic,diastolic=EXCLUDED.diastolic,
    sleep_minutes=EXCLUDED.sleep_minutes,water_glasses=EXCLUDED.water_glasses,movement_minutes=EXCLUDED.movement_minutes,
    wellbeing=EXCLUDED.wellbeing,blood_glucose_mg_dl=EXCLUDED.blood_glucose_mg_dl,
    fetal_movement_count=EXCLUDED.fetal_movement_count,symptoms=EXCLUDED.symptoms,updated_at=EXCLUDED.updated_at;
  SELECT jsonb_build_object('day',to_char(p_day,'YYYY-MM-DD'),'weight_kg',h.weight_kg,'systolic',h.systolic,
    'diastolic',h.diastolic,'sleep_minutes',h.sleep_minutes,'water_glasses',h.water_glasses,
    'movement_minutes',h.movement_minutes,'wellbeing',h.wellbeing,'blood_glucose_mg_dl',h.blood_glucose_mg_dl,
    'fetal_movement_count',h.fetal_movement_count,'symptoms',h.symptoms,
    'checklist_percent',round(100.0*(SELECT count(*) FROM portal_read_model.pregnancy_check c WHERE c.day=p_day)/13)::integer)
    INTO result FROM portal_read_model.pregnancy_health h WHERE h.day=p_day;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_save_pregnancy_wellness_profile(date,numeric,numeric,text,integer,numeric,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_ingest_iphone_health_v2(text,date,integer,numeric,numeric,integer,numeric,numeric,numeric,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_get_iphone_health_history(date,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_health(date,numeric,integer,integer,integer,integer,integer,integer,numeric,integer,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_wellness_profile(date,numeric,numeric,text,integer,numeric,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_ingest_iphone_health_v2(text,date,integer,numeric,numeric,integer,numeric,numeric,numeric,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_iphone_health_history(date,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_health(date,numeric,integer,integer,integer,integer,integer,integer,numeric,integer,text[]) TO service_role;

COMMIT;

;
