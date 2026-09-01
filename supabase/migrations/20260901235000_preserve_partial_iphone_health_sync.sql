BEGIN;

CREATE OR REPLACE FUNCTION public.embe_ingest_iphone_health(
  p_token_hash text, p_day date, p_steps integer, p_active_energy_kcal numeric,
  p_resting_energy_kcal numeric, p_sleep_minutes integer, p_weight_kg numeric,
  p_water_ml integer, p_heart_rate_avg numeric
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE matched_device uuid;
BEGIN
  SELECT device.id INTO matched_device FROM portal_read_model.iphone_health_device AS device
    WHERE device.token_hash = p_token_hash AND device.active;
  IF matched_device IS NULL THEN RETURN false; END IF;
  INSERT INTO portal_read_model.iphone_health_daily (
    device_id, day, steps, active_energy_kcal, resting_energy_kcal, sleep_minutes,
    weight_kg, water_ml, heart_rate_avg, updated_at
  ) VALUES (matched_device, p_day, p_steps, p_active_energy_kcal, p_resting_energy_kcal,
    p_sleep_minutes, p_weight_kg, p_water_ml, p_heart_rate_avg, timezone('utc', now()))
  ON CONFLICT (device_id, day) DO UPDATE SET
    steps = COALESCE(EXCLUDED.steps, iphone_health_daily.steps),
    active_energy_kcal = COALESCE(EXCLUDED.active_energy_kcal, iphone_health_daily.active_energy_kcal),
    resting_energy_kcal = COALESCE(EXCLUDED.resting_energy_kcal, iphone_health_daily.resting_energy_kcal),
    sleep_minutes = COALESCE(EXCLUDED.sleep_minutes, iphone_health_daily.sleep_minutes),
    weight_kg = COALESCE(EXCLUDED.weight_kg, iphone_health_daily.weight_kg),
    water_ml = COALESCE(EXCLUDED.water_ml, iphone_health_daily.water_ml),
    heart_rate_avg = COALESCE(EXCLUDED.heart_rate_avg, iphone_health_daily.heart_rate_avg),
    updated_at = EXCLUDED.updated_at;
  UPDATE portal_read_model.iphone_health_device SET last_synced_at = timezone('utc', now())
    WHERE id = matched_device;
  RETURN true;
END;
$function$;

COMMIT;
