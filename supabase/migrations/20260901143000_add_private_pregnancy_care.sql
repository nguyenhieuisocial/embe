-- Private pregnancy care plans, adherence and privacy-minimised iPhone health summaries.
-- Reference nutrient targets stay versioned in application code; this schema only
-- stores family-entered facts and selected HealthKit aggregates.

CREATE TABLE IF NOT EXISTS portal_read_model.pregnancy_wellness_profile (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  birth_date date CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1940-01-01' AND CURRENT_DATE),
  height_cm numeric(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 120 AND 220),
  pre_pregnancy_weight_kg numeric(5,2) CHECK (pre_pregnancy_weight_kg IS NULL OR pre_pregnancy_weight_kg BETWEEN 25 AND 300),
  activity_level text CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'low_active', 'active', 'very_active')),
  clinician_energy_target_kcal integer CHECK (clinician_energy_target_kcal IS NULL OR clinician_energy_target_kcal BETWEEN 1000 AND 5000),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE portal_read_model.pregnancy_care_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('medicine', 'supplement')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  dose_display text NOT NULL CHECK (char_length(btrim(dose_display)) BETWEEN 1 AND 80),
  times_per_day smallint NOT NULL CHECK (times_per_day BETWEEN 1 AND 6),
  instructions text NOT NULL DEFAULT '' CHECK (char_length(instructions) <= 240),
  nutrient_amounts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(nutrient_amounts) = 'object'
    AND NOT jsonb_path_exists(nutrient_amounts, '$.* ? (@.type() != "number" || @ < 0 || @ > 100000)')
  ),
  confirmed_by_clinician boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE portal_read_model.pregnancy_care_intake (
  plan_id uuid NOT NULL REFERENCES portal_read_model.pregnancy_care_plan(id) ON DELETE CASCADE,
  day date NOT NULL CHECK (day BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 6),
  taken_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (plan_id, day, slot)
);

CREATE INDEX pregnancy_care_intake_day_idx
  ON portal_read_model.pregnancy_care_intake (day DESC, plan_id);
CREATE INDEX pregnancy_care_plan_active_idx
  ON portal_read_model.pregnancy_care_plan (active, category) WHERE active;

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

CREATE INDEX iphone_health_daily_day_idx
  ON portal_read_model.iphone_health_daily (day DESC);

COMMENT ON TABLE portal_read_model.pregnancy_care_plan IS
  'Family-entered medicine/supplement schedule. Never a prescription or inferred recommendation.';
COMMENT ON TABLE portal_read_model.iphone_health_daily IS
  'Explicitly authorised daily aggregates only; no routes, raw samples or exact location.';

ALTER TABLE portal_read_model.pregnancy_wellness_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_wellness_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_care_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_care_plan FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_care_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_care_intake FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.iphone_health_device ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.iphone_health_device FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.iphone_health_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.iphone_health_daily FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.pregnancy_wellness_profile FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_care_plan FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_care_intake FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.iphone_health_device FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.iphone_health_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_wellness_profile TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_care_plan TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_care_intake TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.iphone_health_device TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.iphone_health_daily TO service_role;

CREATE POLICY pregnancy_wellness_profile_deny_clients ON portal_read_model.pregnancy_wellness_profile
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY pregnancy_care_plan_deny_clients ON portal_read_model.pregnancy_care_plan
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY pregnancy_care_intake_deny_clients ON portal_read_model.pregnancy_care_intake
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY iphone_health_device_deny_clients ON portal_read_model.iphone_health_device
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY iphone_health_daily_deny_clients ON portal_read_model.iphone_health_daily
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_care(p_day date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(profile) - 'singleton' - 'updated_at'
      FROM portal_read_model.pregnancy_wellness_profile AS profile WHERE profile.singleton),
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', plan.id, 'category', plan.category, 'name', plan.name,
      'dose_display', plan.dose_display, 'times_per_day', plan.times_per_day,
      'instructions', plan.instructions, 'nutrient_amounts', plan.nutrient_amounts,
      'confirmed_by_clinician', plan.confirmed_by_clinician, 'active', plan.active,
      'taken_slots', COALESCE((SELECT jsonb_agg(intake.slot ORDER BY intake.slot)
        FROM portal_read_model.pregnancy_care_intake AS intake
        WHERE intake.plan_id = plan.id AND intake.day = p_day), '[]'::jsonb)
    ) ORDER BY plan.active DESC, plan.category, plan.created_at)
      FROM portal_read_model.pregnancy_care_plan AS plan), '[]'::jsonb),
    'iphone_health', (SELECT jsonb_build_object(
      'day', health.day, 'steps', health.steps, 'active_energy_kcal', health.active_energy_kcal,
      'resting_energy_kcal', health.resting_energy_kcal, 'sleep_minutes', health.sleep_minutes,
      'weight_kg', health.weight_kg, 'water_ml', health.water_ml,
      'heart_rate_avg', health.heart_rate_avg, 'updated_at', health.updated_at
    ) FROM portal_read_model.iphone_health_daily AS health
      WHERE health.day = p_day ORDER BY health.updated_at DESC LIMIT 1),
    'iphone_devices', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', device.id, 'label', device.label, 'active', device.active,
      'last_synced_at', device.last_synced_at
    ) ORDER BY device.created_at) FROM portal_read_model.iphone_health_device AS device), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_wellness_profile(
  p_birth_date date, p_height_cm numeric, p_pre_pregnancy_weight_kg numeric,
  p_activity_level text, p_clinician_energy_target_kcal integer
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF (p_birth_date IS NOT NULL AND p_birth_date NOT BETWEEN DATE '1940-01-01' AND CURRENT_DATE)
    OR (p_height_cm IS NOT NULL AND p_height_cm NOT BETWEEN 120 AND 220)
    OR (p_pre_pregnancy_weight_kg IS NOT NULL AND p_pre_pregnancy_weight_kg NOT BETWEEN 25 AND 300)
    OR (p_activity_level IS NOT NULL AND p_activity_level NOT IN ('sedentary', 'low_active', 'active', 'very_active'))
    OR (p_clinician_energy_target_kcal IS NOT NULL AND p_clinician_energy_target_kcal NOT BETWEEN 1000 AND 5000)
  THEN RAISE EXCEPTION 'invalid wellness profile'; END IF;
  INSERT INTO portal_read_model.pregnancy_wellness_profile (
    singleton, birth_date, height_cm, pre_pregnancy_weight_kg, activity_level,
    clinician_energy_target_kcal, updated_at
  ) VALUES (true, p_birth_date, p_height_cm, p_pre_pregnancy_weight_kg, p_activity_level,
    p_clinician_energy_target_kcal, timezone('utc', now()))
  ON CONFLICT (singleton) DO UPDATE SET birth_date = EXCLUDED.birth_date,
    height_cm = EXCLUDED.height_cm, pre_pregnancy_weight_kg = EXCLUDED.pre_pregnancy_weight_kg,
    activity_level = EXCLUDED.activity_level,
    clinician_energy_target_kcal = EXCLUDED.clinician_energy_target_kcal,
    updated_at = EXCLUDED.updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_care_plan(
  p_id uuid, p_category text, p_name text, p_dose_display text, p_times_per_day smallint,
  p_instructions text, p_nutrient_amounts jsonb, p_confirmed_by_clinician boolean, p_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_category NOT IN ('medicine', 'supplement')
    OR char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 80
    OR char_length(btrim(COALESCE(p_dose_display, ''))) NOT BETWEEN 1 AND 80
    OR p_times_per_day NOT BETWEEN 1 AND 6 OR char_length(COALESCE(p_instructions, '')) > 240
    OR jsonb_typeof(COALESCE(p_nutrient_amounts, '{}'::jsonb)) <> 'object'
  THEN RAISE EXCEPTION 'invalid care plan'; END IF;
  INSERT INTO portal_read_model.pregnancy_care_plan (
    id, category, name, dose_display, times_per_day, instructions,
    nutrient_amounts, confirmed_by_clinician, active
  ) VALUES (result_id, p_category, btrim(p_name), btrim(p_dose_display), p_times_per_day,
    btrim(COALESCE(p_instructions, '')), COALESCE(p_nutrient_amounts, '{}'::jsonb),
    COALESCE(p_confirmed_by_clinician, false), COALESCE(p_active, true))
  ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, name = EXCLUDED.name,
    dose_display = EXCLUDED.dose_display, times_per_day = EXCLUDED.times_per_day,
    instructions = EXCLUDED.instructions, nutrient_amounts = EXCLUDED.nutrient_amounts,
    confirmed_by_clinician = EXCLUDED.confirmed_by_clinician, active = EXCLUDED.active,
    updated_at = timezone('utc', now());
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_toggle_pregnancy_care_intake(
  p_plan_id uuid, p_day date, p_slot smallint, p_taken boolean
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE allowed_slots smallint;
BEGIN
  SELECT plan.times_per_day INTO allowed_slots FROM portal_read_model.pregnancy_care_plan AS plan
    WHERE plan.id = p_plan_id AND plan.active;
  IF allowed_slots IS NULL OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
    OR p_slot NOT BETWEEN 1 AND allowed_slots THEN RAISE EXCEPTION 'invalid care intake'; END IF;
  IF p_taken THEN
    INSERT INTO portal_read_model.pregnancy_care_intake (plan_id, day, slot)
      VALUES (p_plan_id, p_day, p_slot) ON CONFLICT (plan_id, day, slot) DO NOTHING;
  ELSE
    DELETE FROM portal_read_model.pregnancy_care_intake
      WHERE plan_id = p_plan_id AND day = p_day AND slot = p_slot;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_create_iphone_health_device(p_token_hash text, p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR char_length(btrim(COALESCE(p_label, ''))) NOT BETWEEN 1 AND 60
    THEN RAISE EXCEPTION 'invalid health device'; END IF;
  INSERT INTO portal_read_model.iphone_health_device (token_hash, label)
    VALUES (p_token_hash, btrim(p_label)) RETURNING id INTO result_id;
  RETURN result_id;
END;
$function$;

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
  ON CONFLICT (device_id, day) DO UPDATE SET steps = EXCLUDED.steps,
    active_energy_kcal = EXCLUDED.active_energy_kcal, resting_energy_kcal = EXCLUDED.resting_energy_kcal,
    sleep_minutes = EXCLUDED.sleep_minutes, weight_kg = EXCLUDED.weight_kg,
    water_ml = EXCLUDED.water_ml, heart_rate_avg = EXCLUDED.heart_rate_avg,
    updated_at = EXCLUDED.updated_at;
  UPDATE portal_read_model.iphone_health_device SET last_synced_at = timezone('utc', now())
    WHERE id = matched_device;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_care(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_wellness_profile(date,numeric,numeric,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_care_plan(uuid,text,text,text,smallint,text,jsonb,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_toggle_pregnancy_care_intake(uuid,date,smallint,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_create_iphone_health_device(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_ingest_iphone_health(text,date,integer,numeric,numeric,integer,numeric,integer,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_care(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_wellness_profile(date,numeric,numeric,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_care_plan(uuid,text,text,text,smallint,text,jsonb,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_toggle_pregnancy_care_intake(uuid,date,smallint,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_create_iphone_health_device(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_ingest_iphone_health(text,date,integer,numeric,numeric,integer,numeric,integer,numeric) TO service_role;
