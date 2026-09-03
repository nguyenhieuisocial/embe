ALTER TABLE portal_read_model.iphone_health_device
  ADD COLUMN IF NOT EXISTS subject_role text NOT NULL DEFAULT 'mother'
  CHECK (subject_role IN ('mother', 'father'));

CREATE OR REPLACE FUNCTION public.embe_create_iphone_health_device(p_token_hash text, p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR char_length(btrim(COALESCE(p_label, ''))) NOT BETWEEN 1 AND 60
    THEN RAISE EXCEPTION 'invalid health device'; END IF;

  UPDATE portal_read_model.iphone_health_device
    SET active = false
    WHERE subject_role = 'mother' AND active AND last_synced_at IS NULL;

  INSERT INTO portal_read_model.iphone_health_device (token_hash, label, subject_role)
    VALUES (p_token_hash, btrim(p_label), 'mother') RETURNING id INTO result_id;
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_revoke_iphone_health_device(p_device_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE changed_count integer;
BEGIN
  IF p_device_id IS NULL THEN RAISE EXCEPTION 'invalid health device'; END IF;
  UPDATE portal_read_model.iphone_health_device
  SET active = false
  WHERE id = p_device_id AND subject_role = 'mother' AND active;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count = 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_unified_pregnancy_health_history(p_end_day date, p_days integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_end_day IS NULL OR p_end_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_days NOT IN (7,28,90) THEN
    RAISE EXCEPTION 'invalid unified pregnancy health history request';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', to_char(series.day, 'YYYY-MM-DD'),
    'weight_kg', COALESCE(manual.weight_kg, iphone_weight.weight_kg),
    'systolic', COALESCE(manual.systolic, iphone_pressure.systolic),
    'diastolic', COALESCE(manual.diastolic, iphone_pressure.diastolic),
    'sleep_minutes', COALESCE(manual.sleep_minutes, iphone_sleep.sleep_minutes),
    'water_glasses', manual.water_glasses,
    'water_ml', iphone_water.water_ml,
    'movement_minutes', manual.movement_minutes,
    'wellbeing', manual.wellbeing,
    'blood_glucose_mg_dl', manual.blood_glucose_mg_dl,
    'fetal_movement_count', manual.fetal_movement_count,
    'symptoms', COALESCE(manual.symptoms, '{}'::text[]),
    'glucose_context', manual.glucose_context,
    'health_note', COALESCE(manual.health_note, ''),
    'checklist_percent', round(100.0 * (
      SELECT count(*) FROM portal_read_model.pregnancy_check AS check_state WHERE check_state.day = series.day
    ) / 13)::integer,
    'metric_sources', jsonb_strip_nulls(jsonb_build_object(
      'weightKg', CASE WHEN manual.weight_kg IS NOT NULL THEN 'manual' WHEN iphone_weight.weight_kg IS NOT NULL THEN 'iphone' END,
      'bloodPressure', CASE WHEN manual.systolic IS NOT NULL AND manual.diastolic IS NOT NULL THEN 'manual'
        WHEN iphone_pressure.systolic IS NOT NULL AND iphone_pressure.diastolic IS NOT NULL THEN 'iphone' END,
      'sleepMinutes', CASE WHEN manual.sleep_minutes IS NOT NULL THEN 'manual'
        WHEN iphone_sleep.sleep_minutes IS NOT NULL THEN 'iphone' END,
      'waterMl', CASE WHEN iphone_water.water_ml IS NOT NULL THEN 'iphone' END
    )),
    'metric_synced_at', jsonb_strip_nulls(jsonb_build_object(
      'weightKg', CASE WHEN manual.weight_kg IS NULL THEN iphone_weight.synced_at END,
      'bloodPressure', CASE WHEN manual.systolic IS NULL THEN iphone_pressure.synced_at END,
      'sleepMinutes', CASE WHEN manual.sleep_minutes IS NULL THEN iphone_sleep.synced_at END,
      'waterMl', iphone_water.synced_at
    ))
  ) ORDER BY series.day), '[]'::jsonb) INTO result
  FROM generate_series(p_end_day - (p_days - 1), p_end_day, interval '1 day') AS series(day)
  LEFT JOIN portal_read_model.pregnancy_health AS manual ON manual.day = series.day
  LEFT JOIN LATERAL (
    SELECT health.weight_kg,
      COALESCE((health.metric_synced_at ->> 'weightKg')::timestamptz, health.updated_at) AS synced_at
    FROM portal_read_model.iphone_health_daily AS health
    JOIN portal_read_model.iphone_health_device AS device ON device.id = health.device_id
    WHERE device.subject_role = 'mother' AND health.day = series.day AND health.weight_kg IS NOT NULL
    ORDER BY COALESCE((health.metric_synced_at ->> 'weightKg')::timestamptz, health.updated_at) DESC
    LIMIT 1
  ) AS iphone_weight ON true
  LEFT JOIN LATERAL (
    SELECT health.systolic, health.diastolic,
      GREATEST(
        COALESCE((health.metric_synced_at ->> 'systolic')::timestamptz, health.updated_at),
        COALESCE((health.metric_synced_at ->> 'diastolic')::timestamptz, health.updated_at)
      ) AS synced_at
    FROM portal_read_model.iphone_health_daily AS health
    JOIN portal_read_model.iphone_health_device AS device ON device.id = health.device_id
    WHERE device.subject_role = 'mother' AND health.day = series.day
      AND health.systolic IS NOT NULL AND health.diastolic IS NOT NULL
    ORDER BY GREATEST(
      COALESCE((health.metric_synced_at ->> 'systolic')::timestamptz, health.updated_at),
      COALESCE((health.metric_synced_at ->> 'diastolic')::timestamptz, health.updated_at)
    ) DESC
    LIMIT 1
  ) AS iphone_pressure ON true
  LEFT JOIN LATERAL (
    SELECT health.sleep_minutes,
      COALESCE((health.metric_synced_at ->> 'sleepMinutes')::timestamptz, health.updated_at) AS synced_at
    FROM portal_read_model.iphone_health_daily AS health
    JOIN portal_read_model.iphone_health_device AS device ON device.id = health.device_id
    WHERE device.subject_role = 'mother' AND health.day = series.day AND health.sleep_minutes IS NOT NULL
    ORDER BY COALESCE((health.metric_synced_at ->> 'sleepMinutes')::timestamptz, health.updated_at) DESC
    LIMIT 1
  ) AS iphone_sleep ON true
  LEFT JOIN LATERAL (
    SELECT health.water_ml,
      COALESCE((health.metric_synced_at ->> 'waterMl')::timestamptz, health.updated_at) AS synced_at
    FROM portal_read_model.iphone_health_daily AS health
    JOIN portal_read_model.iphone_health_device AS device ON device.id = health.device_id
    WHERE device.subject_role = 'mother' AND health.day = series.day AND health.water_ml IS NOT NULL
    ORDER BY COALESCE((health.metric_synced_at ->> 'waterMl')::timestamptz, health.updated_at) DESC
    LIMIT 1
  ) AS iphone_water ON true;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_create_iphone_health_device(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_revoke_iphone_health_device(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_unified_pregnancy_health_history(date,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_iphone_health_device(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_revoke_iphone_health_device(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_unified_pregnancy_health_history(date,integer) TO service_role;
