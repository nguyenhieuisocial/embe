CREATE TABLE portal_read_model.pregnancy_health (
  day date PRIMARY KEY REFERENCES portal_read_model.pregnancy_day(day) ON DELETE CASCADE,
  weight_kg numeric(5,2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 25 AND 300),
  systolic integer CHECK (systolic IS NULL OR systolic BETWEEN 60 AND 250),
  diastolic integer CHECK (diastolic IS NULL OR diastolic BETWEEN 30 AND 160),
  sleep_minutes integer CHECK (sleep_minutes IS NULL OR sleep_minutes BETWEEN 0 AND 1440),
  water_glasses integer CHECK (water_glasses IS NULL OR water_glasses BETWEEN 0 AND 30),
  movement_minutes integer CHECK (movement_minutes IS NULL OR movement_minutes BETWEEN 0 AND 600),
  wellbeing integer CHECK (wellbeing IS NULL OR wellbeing BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE portal_read_model.pregnancy_health IS
  'Private maternal measurements entered by the family; no diagnosis, free text or inferred medical targets.';

ALTER TABLE portal_read_model.pregnancy_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_health FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.pregnancy_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_health TO service_role;

CREATE POLICY pregnancy_health_deny_clients
ON portal_read_model.pregnancy_health FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_health_history(
  p_end_day date,
  p_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF p_end_day IS NULL
     OR p_end_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_days NOT IN (7, 28, 90) THEN
    RAISE EXCEPTION 'invalid pregnancy health history request';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'day', to_char(series.day, 'YYYY-MM-DD'),
      'weight_kg', health.weight_kg,
      'systolic', health.systolic,
      'diastolic', health.diastolic,
      'sleep_minutes', health.sleep_minutes,
      'water_glasses', health.water_glasses,
      'movement_minutes', health.movement_minutes,
      'wellbeing', health.wellbeing,
      'checklist_percent', round(
        100.0 * (
          SELECT count(*)
          FROM portal_read_model.pregnancy_check AS check_state
          WHERE check_state.day = series.day
        ) / 13
      )::integer
    ) ORDER BY series.day
  ), '[]'::jsonb)
  INTO result
  FROM generate_series(
    p_end_day - (p_days - 1),
    p_end_day,
    interval '1 day'
  ) AS series(day)
  LEFT JOIN portal_read_model.pregnancy_health AS health
    ON health.day = series.day;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_health(
  p_day date,
  p_weight_kg numeric,
  p_systolic integer,
  p_diastolic integer,
  p_sleep_minutes integer,
  p_water_glasses integer,
  p_movement_minutes integer,
  p_wellbeing integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF p_day IS NULL
     OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR (p_weight_kg IS NOT NULL AND p_weight_kg NOT BETWEEN 25 AND 300)
     OR (p_systolic IS NOT NULL AND p_systolic NOT BETWEEN 60 AND 250)
     OR (p_diastolic IS NOT NULL AND p_diastolic NOT BETWEEN 30 AND 160)
     OR (p_sleep_minutes IS NOT NULL AND p_sleep_minutes NOT BETWEEN 0 AND 1440)
     OR (p_water_glasses IS NOT NULL AND p_water_glasses NOT BETWEEN 0 AND 30)
     OR (p_movement_minutes IS NOT NULL AND p_movement_minutes NOT BETWEEN 0 AND 600)
     OR (p_wellbeing IS NOT NULL AND p_wellbeing NOT BETWEEN 1 AND 5) THEN
    RAISE EXCEPTION 'invalid pregnancy health snapshot';
  END IF;

  INSERT INTO portal_read_model.pregnancy_day (day, updated_at)
  VALUES (p_day, timezone('utc', now()))
  ON CONFLICT (day) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  IF p_weight_kg IS NULL
     AND p_systolic IS NULL
     AND p_diastolic IS NULL
     AND p_sleep_minutes IS NULL
     AND p_water_glasses IS NULL
     AND p_movement_minutes IS NULL
     AND p_wellbeing IS NULL THEN
    DELETE FROM portal_read_model.pregnancy_health AS health WHERE health.day = p_day;
  ELSE
    INSERT INTO portal_read_model.pregnancy_health (
      day, weight_kg, systolic, diastolic, sleep_minutes,
      water_glasses, movement_minutes, wellbeing, updated_at
    )
    VALUES (
      p_day, p_weight_kg, p_systolic, p_diastolic, p_sleep_minutes,
      p_water_glasses, p_movement_minutes, p_wellbeing, timezone('utc', now())
    )
    ON CONFLICT (day) DO UPDATE SET
      weight_kg = EXCLUDED.weight_kg,
      systolic = EXCLUDED.systolic,
      diastolic = EXCLUDED.diastolic,
      sleep_minutes = EXCLUDED.sleep_minutes,
      water_glasses = EXCLUDED.water_glasses,
      movement_minutes = EXCLUDED.movement_minutes,
      wellbeing = EXCLUDED.wellbeing,
      updated_at = EXCLUDED.updated_at;
  END IF;

  SELECT jsonb_build_object(
    'day', to_char(p_day, 'YYYY-MM-DD'),
    'weight_kg', health.weight_kg,
    'systolic', health.systolic,
    'diastolic', health.diastolic,
    'sleep_minutes', health.sleep_minutes,
    'water_glasses', health.water_glasses,
    'movement_minutes', health.movement_minutes,
    'wellbeing', health.wellbeing,
    'checklist_percent', round(
      100.0 * (
        SELECT count(*)
        FROM portal_read_model.pregnancy_check AS check_state
        WHERE check_state.day = p_day
      ) / 13
    )::integer
  )
  INTO result
  FROM (SELECT 1) AS singleton
  LEFT JOIN portal_read_model.pregnancy_health AS health ON health.day = p_day;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_health_history(date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_health(date, numeric, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_health_history(date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_health(date, numeric, integer, integer, integer, integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.embe_get_pregnancy_health_history(date, integer) IS
  'Server-only bounded history for private maternal charts.';
COMMENT ON FUNCTION public.embe_save_pregnancy_health(date, numeric, integer, integer, integer, integer, integer, integer) IS
  'Server-only bounded maternal snapshot; values are recorded without diagnosis.';
