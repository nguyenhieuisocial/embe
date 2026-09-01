BEGIN;

ALTER TABLE portal_read_model.pregnancy_health
  ADD COLUMN glucose_context text CHECK (glucose_context IS NULL OR glucose_context IN ('fasting','after_1h','after_2h','other')),
  ADD COLUMN health_note text NOT NULL DEFAULT '' CHECK (char_length(health_note) <= 500),
  ADD CONSTRAINT pregnancy_health_glucose_pair CHECK ((blood_glucose_mg_dl IS NULL) = (glucose_context IS NULL)),
  ADD CONSTRAINT pregnancy_health_pressure_pair CHECK ((systolic IS NULL) = (diastolic IS NULL));

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
    'glucose_context', health.glucose_context, 'health_note', COALESCE(health.health_note, ''),
    'checklist_percent', round(100.0 * (SELECT count(*) FROM portal_read_model.pregnancy_check AS c WHERE c.day=series.day) / 13)::integer
  ) ORDER BY series.day), '[]'::jsonb) INTO result
  FROM generate_series(p_end_day-(p_days-1),p_end_day,interval '1 day') AS series(day)
  LEFT JOIN portal_read_model.pregnancy_health AS health ON health.day=series.day;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_health_v2(
  p_day date, p_weight_kg numeric, p_systolic integer, p_diastolic integer, p_sleep_minutes integer,
  p_water_glasses integer, p_movement_minutes integer, p_wellbeing integer,
  p_blood_glucose_mg_dl numeric, p_fetal_movement_count integer, p_symptoms text[],
  p_glucose_context text, p_health_note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
    OR (p_weight_kg IS NOT NULL AND p_weight_kg NOT BETWEEN 25 AND 300)
    OR (p_systolic IS NOT NULL AND p_systolic NOT BETWEEN 60 AND 250)
    OR (p_diastolic IS NOT NULL AND p_diastolic NOT BETWEEN 30 AND 160)
    OR ((p_systolic IS NULL) <> (p_diastolic IS NULL))
    OR (p_sleep_minutes IS NOT NULL AND p_sleep_minutes NOT BETWEEN 0 AND 1440)
    OR (p_water_glasses IS NOT NULL AND p_water_glasses NOT BETWEEN 0 AND 30)
    OR (p_movement_minutes IS NOT NULL AND p_movement_minutes NOT BETWEEN 0 AND 600)
    OR (p_wellbeing IS NOT NULL AND p_wellbeing NOT BETWEEN 1 AND 5)
    OR (p_blood_glucose_mg_dl IS NOT NULL AND p_blood_glucose_mg_dl NOT BETWEEN 20 AND 600)
    OR ((p_blood_glucose_mg_dl IS NULL) <> (p_glucose_context IS NULL))
    OR (p_glucose_context IS NOT NULL AND p_glucose_context NOT IN ('fasting','after_1h','after_2h','other'))
    OR (p_fetal_movement_count IS NOT NULL AND p_fetal_movement_count NOT BETWEEN 0 AND 500)
    OR char_length(COALESCE(p_health_note, '')) > 500
    OR NOT COALESCE(p_symptoms, '{}'::text[]) <@ ARRAY['bleeding','severe_abdominal_pain','severe_headache','vision_change','sudden_swelling','fever','fluid_leak','reduced_fetal_movement','persistent_vomiting','other']::text[]
  THEN RAISE EXCEPTION 'invalid pregnancy health snapshot'; END IF;
  INSERT INTO portal_read_model.pregnancy_day(day,updated_at) VALUES(p_day,timezone('utc',now()))
    ON CONFLICT(day) DO UPDATE SET updated_at=EXCLUDED.updated_at;
  INSERT INTO portal_read_model.pregnancy_health(day,weight_kg,systolic,diastolic,sleep_minutes,water_glasses,
    movement_minutes,wellbeing,blood_glucose_mg_dl,fetal_movement_count,symptoms,glucose_context,health_note,updated_at)
  VALUES(p_day,p_weight_kg,p_systolic,p_diastolic,p_sleep_minutes,p_water_glasses,p_movement_minutes,p_wellbeing,
    p_blood_glucose_mg_dl,p_fetal_movement_count,COALESCE(p_symptoms,'{}'::text[]),p_glucose_context,
    btrim(COALESCE(p_health_note,'')),timezone('utc',now()))
  ON CONFLICT(day) DO UPDATE SET weight_kg=EXCLUDED.weight_kg,systolic=EXCLUDED.systolic,diastolic=EXCLUDED.diastolic,
    sleep_minutes=EXCLUDED.sleep_minutes,water_glasses=EXCLUDED.water_glasses,movement_minutes=EXCLUDED.movement_minutes,
    wellbeing=EXCLUDED.wellbeing,blood_glucose_mg_dl=EXCLUDED.blood_glucose_mg_dl,
    fetal_movement_count=EXCLUDED.fetal_movement_count,symptoms=EXCLUDED.symptoms,
    glucose_context=EXCLUDED.glucose_context,health_note=EXCLUDED.health_note,updated_at=EXCLUDED.updated_at;
  SELECT jsonb_build_object('day',to_char(p_day,'YYYY-MM-DD'),'weight_kg',h.weight_kg,'systolic',h.systolic,
    'diastolic',h.diastolic,'sleep_minutes',h.sleep_minutes,'water_glasses',h.water_glasses,
    'movement_minutes',h.movement_minutes,'wellbeing',h.wellbeing,'blood_glucose_mg_dl',h.blood_glucose_mg_dl,
    'fetal_movement_count',h.fetal_movement_count,'symptoms',h.symptoms,'glucose_context',h.glucose_context,
    'health_note',h.health_note,
    'checklist_percent',round(100.0*(SELECT count(*) FROM portal_read_model.pregnancy_check c WHERE c.day=p_day)/13)::integer)
    INTO result FROM portal_read_model.pregnancy_health h WHERE h.day=p_day;
  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_save_pregnancy_health_v2(date,numeric,integer,integer,integer,integer,integer,integer,numeric,integer,text[],text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_health_v2(date,numeric,integer,integer,integer,integer,integer,integer,numeric,integer,text[],text,text) TO service_role;

COMMIT;
