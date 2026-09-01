CREATE TABLE portal_read_model.postpartum_health_day (
  day date PRIMARY KEY,
  lochia text CHECK (lochia IN ('none', 'light', 'moderate', 'heavy')),
  pain smallint CHECK (pain BETWEEN 0 AND 10),
  temperature_c numeric(3,1) CHECK (temperature_c BETWEEN 34 AND 43),
  systolic smallint CHECK (systolic BETWEEN 60 AND 250),
  diastolic smallint CHECK (diastolic BETWEEN 30 AND 160),
  wound_status text CHECK (wound_status IN ('not_applicable', 'comfortable', 'tender', 'red_swollen', 'drainage')),
  urination text CHECK (urination IN ('comfortable', 'discomfort', 'difficulty')),
  digestion text CHECK (digestion IN ('usual', 'constipated', 'diarrhea', 'other')),
  pelvic_pain smallint CHECK (pelvic_pain BETWEEN 0 AND 10),
  breast_discomfort smallint CHECK (breast_discomfort BETWEEN 0 AND 10),
  feeding_difficulty boolean,
  sleep_minutes smallint CHECK (sleep_minutes BETWEEN 0 AND 1440),
  exhaustion smallint CHECK (exhaustion BETWEEN 1 AND 5),
  support smallint CHECK (support BETWEEN 1 AND 5),
  mood smallint CHECK (mood BETWEEN 1 AND 5),
  phq2_interest smallint CHECK (phq2_interest BETWEEN 0 AND 3),
  phq2_depressed smallint CHECK (phq2_depressed BETWEEN 0 AND 3),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX postpartum_health_day_recent_idx ON portal_read_model.postpartum_health_day (day DESC);
ALTER TABLE portal_read_model.postpartum_health_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.postpartum_health_day FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.postpartum_health_day FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.postpartum_health_day TO service_role;
CREATE POLICY postpartum_health_deny_clients ON portal_read_model.postpartum_health_day
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_save_postpartum_health(
  p_day date, p_lochia text, p_pain smallint, p_temperature_c numeric, p_systolic smallint,
  p_diastolic smallint, p_wound_status text, p_urination text, p_digestion text,
  p_pelvic_pain smallint, p_breast_discomfort smallint, p_feeding_difficulty boolean,
  p_sleep_minutes smallint, p_exhaustion smallint, p_support smallint, p_mood smallint,
  p_phq2_interest smallint, p_phq2_depressed smallint, p_notes text
) RETURNS SETOF portal_read_model.postpartum_health_day
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_day IS NULL OR p_day > current_date + 1 OR p_day < current_date - 730
     OR (p_lochia IS NOT NULL AND p_lochia NOT IN ('none', 'light', 'moderate', 'heavy'))
     OR (p_pain IS NOT NULL AND p_pain NOT BETWEEN 0 AND 10)
     OR (p_temperature_c IS NOT NULL AND p_temperature_c NOT BETWEEN 34 AND 43)
     OR (p_systolic IS NOT NULL AND p_systolic NOT BETWEEN 60 AND 250)
     OR (p_diastolic IS NOT NULL AND p_diastolic NOT BETWEEN 30 AND 160)
     OR (p_wound_status IS NOT NULL AND p_wound_status NOT IN ('not_applicable', 'comfortable', 'tender', 'red_swollen', 'drainage'))
     OR (p_urination IS NOT NULL AND p_urination NOT IN ('comfortable', 'discomfort', 'difficulty'))
     OR (p_digestion IS NOT NULL AND p_digestion NOT IN ('usual', 'constipated', 'diarrhea', 'other'))
     OR (p_pelvic_pain IS NOT NULL AND p_pelvic_pain NOT BETWEEN 0 AND 10)
     OR (p_breast_discomfort IS NOT NULL AND p_breast_discomfort NOT BETWEEN 0 AND 10)
     OR (p_sleep_minutes IS NOT NULL AND p_sleep_minutes NOT BETWEEN 0 AND 1440)
     OR (p_exhaustion IS NOT NULL AND p_exhaustion NOT BETWEEN 1 AND 5)
     OR (p_support IS NOT NULL AND p_support NOT BETWEEN 1 AND 5)
     OR (p_mood IS NOT NULL AND p_mood NOT BETWEEN 1 AND 5)
     OR (p_phq2_interest IS NOT NULL AND p_phq2_interest NOT BETWEEN 0 AND 3)
     OR (p_phq2_depressed IS NOT NULL AND p_phq2_depressed NOT BETWEEN 0 AND 3)
     OR char_length(COALESCE(p_notes, '')) > 1000 THEN RAISE EXCEPTION 'invalid postpartum health'; END IF;

  RETURN QUERY INSERT INTO portal_read_model.postpartum_health_day (
    day, lochia, pain, temperature_c, systolic, diastolic, wound_status, urination, digestion,
    pelvic_pain, breast_discomfort, feeding_difficulty, sleep_minutes, exhaustion, support, mood,
    phq2_interest, phq2_depressed, notes
  ) VALUES (
    p_day, p_lochia, p_pain, p_temperature_c, p_systolic, p_diastolic, p_wound_status,
    p_urination, p_digestion, p_pelvic_pain, p_breast_discomfort, p_feeding_difficulty,
    p_sleep_minutes, p_exhaustion, p_support, p_mood, p_phq2_interest, p_phq2_depressed,
    NULLIF(trim(p_notes), '')
  ) ON CONFLICT (day) DO UPDATE SET
    lochia = EXCLUDED.lochia, pain = EXCLUDED.pain, temperature_c = EXCLUDED.temperature_c,
    systolic = EXCLUDED.systolic, diastolic = EXCLUDED.diastolic, wound_status = EXCLUDED.wound_status,
    urination = EXCLUDED.urination, digestion = EXCLUDED.digestion, pelvic_pain = EXCLUDED.pelvic_pain,
    breast_discomfort = EXCLUDED.breast_discomfort, feeding_difficulty = EXCLUDED.feeding_difficulty,
    sleep_minutes = EXCLUDED.sleep_minutes, exhaustion = EXCLUDED.exhaustion, support = EXCLUDED.support,
    mood = EXCLUDED.mood, phq2_interest = EXCLUDED.phq2_interest, phq2_depressed = EXCLUDED.phq2_depressed,
    notes = EXCLUDED.notes, updated_at = timezone('utc', now())
  RETURNING *;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_postpartum_health_history(p_end_day date, p_days integer DEFAULT 42)
RETURNS SETOF portal_read_model.postpartum_health_day
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT * FROM portal_read_model.postpartum_health_day
  WHERE day BETWEEN p_end_day - (p_days - 1) AND p_end_day ORDER BY day;
$function$;

REVOKE ALL ON FUNCTION public.embe_save_postpartum_health(date,text,smallint,numeric,smallint,smallint,text,text,text,smallint,smallint,boolean,smallint,smallint,smallint,smallint,smallint,smallint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_postpartum_health_history(date,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_postpartum_health(date,text,smallint,numeric,smallint,smallint,text,text,text,smallint,smallint,boolean,smallint,smallint,smallint,smallint,smallint,smallint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_postpartum_health_history(date,integer) TO service_role;

COMMENT ON TABLE portal_read_model.postpartum_health_day IS 'Private daily maternal recovery and mood journal after birth.';
