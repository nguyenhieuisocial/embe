-- Canonical private birth dates for the two family members.
CREATE TABLE portal_read_model.family_parent_profile (
  role text PRIMARY KEY CHECK (role IN ('mother', 'father')),
  birth_date date CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1940-01-01' AND CURRENT_DATE),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE portal_read_model.family_parent_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_parent_profile FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_parent_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.family_parent_profile TO service_role;
CREATE POLICY family_parent_profile_deny_clients ON portal_read_model.family_parent_profile
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_family_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'mother_birth_date', (SELECT birth_date FROM portal_read_model.family_parent_profile WHERE role = 'mother'),
    'father_birth_date', (SELECT birth_date FROM portal_read_model.family_parent_profile WHERE role = 'father')
  );
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_family_profile(
  p_mother_birth_date date,
  p_father_birth_date date
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF (p_mother_birth_date IS NOT NULL AND p_mother_birth_date NOT BETWEEN DATE '1940-01-01' AND CURRENT_DATE)
    OR (p_father_birth_date IS NOT NULL AND p_father_birth_date NOT BETWEEN DATE '1940-01-01' AND CURRENT_DATE)
  THEN RAISE EXCEPTION 'invalid family profile'; END IF;

  INSERT INTO portal_read_model.family_parent_profile (role, birth_date, updated_at)
  VALUES ('mother', p_mother_birth_date, timezone('utc', now())),
         ('father', p_father_birth_date, timezone('utc', now()))
  ON CONFLICT (role) DO UPDATE SET birth_date = EXCLUDED.birth_date, updated_at = EXCLUDED.updated_at;

  INSERT INTO portal_read_model.pregnancy_wellness_profile (singleton, birth_date, updated_at)
  VALUES (true, p_mother_birth_date, timezone('utc', now()))
  ON CONFLICT (singleton) DO UPDATE SET birth_date = EXCLUDED.birth_date, updated_at = EXCLUDED.updated_at;

  RETURN public.embe_get_family_profile();
END;
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
  INSERT INTO portal_read_model.family_parent_profile (role, birth_date, updated_at)
  VALUES ('mother', p_birth_date, timezone('utc', now()))
  ON CONFLICT (role) DO UPDATE SET birth_date = EXCLUDED.birth_date, updated_at = EXCLUDED.updated_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_family_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_family_profile(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_family_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_family_profile(date,date) TO service_role;

COMMENT ON TABLE portal_read_model.family_parent_profile IS
  'Private canonical birth dates for Mother and Father; never exposed directly to browser clients.';
