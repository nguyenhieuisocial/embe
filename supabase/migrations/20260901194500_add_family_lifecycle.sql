-- Private singleton that moves EmBe from pregnancy into postpartum and baby stages.
CREATE TABLE portal_read_model.family_lifecycle (
  singleton_id smallint PRIMARY KEY DEFAULT 1 CHECK (singleton_id = 1),
  birth_occurred_at timestamptz NOT NULL,
  birth_method text NOT NULL CHECK (birth_method IN ('vaginal', 'planned_c_section', 'emergency_c_section', 'assisted', 'other')),
  gestational_weeks smallint CHECK (gestational_weeks BETWEEN 20 AND 45),
  gestational_days smallint CHECK (gestational_days BETWEEN 0 AND 6),
  birth_weight_g integer CHECK (birth_weight_g BETWEEN 300 AND 7000),
  birth_length_cm numeric(4,1) CHECK (birth_length_cm BETWEEN 20 AND 70),
  birth_head_cm numeric(4,1) CHECK (birth_head_cm BETWEEN 20 AND 50),
  birth_facility text CHECK (birth_facility IS NULL OR char_length(birth_facility) <= 160),
  birth_clinician text CHECK (birth_clinician IS NULL OR char_length(birth_clinician) <= 160),
  premature boolean NOT NULL DEFAULT false,
  low_birth_weight boolean NOT NULL DEFAULT false,
  special_monitoring boolean NOT NULL DEFAULT false,
  special_monitoring_notes text CHECK (special_monitoring_notes IS NULL OR char_length(special_monitoring_notes) <= 1000),
  discharged_at timestamptz,
  discharge_notes text CHECK (discharge_notes IS NULL OR char_length(discharge_notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (discharged_at IS NULL OR discharged_at >= birth_occurred_at)
);

ALTER TABLE portal_read_model.family_lifecycle ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_lifecycle FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_lifecycle FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.family_lifecycle TO service_role;
CREATE POLICY family_lifecycle_deny_clients ON portal_read_model.family_lifecycle
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_family_lifecycle()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'birth_occurred_at', lifecycle.birth_occurred_at,
      'birth_method', lifecycle.birth_method,
      'gestational_weeks', lifecycle.gestational_weeks,
      'gestational_days', lifecycle.gestational_days,
      'birth_weight_g', lifecycle.birth_weight_g,
      'birth_length_cm', lifecycle.birth_length_cm,
      'birth_head_cm', lifecycle.birth_head_cm,
      'birth_facility', lifecycle.birth_facility,
      'birth_clinician', lifecycle.birth_clinician,
      'premature', lifecycle.premature,
      'low_birth_weight', lifecycle.low_birth_weight,
      'special_monitoring', lifecycle.special_monitoring,
      'special_monitoring_notes', lifecycle.special_monitoring_notes,
      'discharged_at', lifecycle.discharged_at,
      'discharge_notes', lifecycle.discharge_notes,
      'has_birth_record', true
    ) FROM portal_read_model.family_lifecycle AS lifecycle WHERE singleton_id = 1
  ), jsonb_build_object(
    'birth_occurred_at', NULL, 'birth_method', NULL, 'gestational_weeks', NULL,
    'gestational_days', NULL, 'birth_weight_g', NULL, 'birth_length_cm', NULL,
    'birth_head_cm', NULL, 'birth_facility', NULL, 'birth_clinician', NULL,
    'premature', false, 'low_birth_weight', false, 'special_monitoring', false,
    'special_monitoring_notes', NULL, 'discharged_at', NULL, 'discharge_notes', NULL,
    'has_birth_record', false
  ));
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_family_lifecycle(
  p_birth_occurred_at timestamptz,
  p_birth_method text,
  p_gestational_weeks smallint,
  p_gestational_days smallint,
  p_birth_weight_g integer,
  p_birth_length_cm numeric,
  p_birth_head_cm numeric,
  p_birth_facility text,
  p_birth_clinician text,
  p_premature boolean,
  p_low_birth_weight boolean,
  p_special_monitoring boolean,
  p_special_monitoring_notes text,
  p_discharged_at timestamptz,
  p_discharge_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_birth_occurred_at IS NULL OR p_birth_occurred_at > timezone('utc', now()) + interval '1 day'
     OR p_birth_method NOT IN ('vaginal', 'planned_c_section', 'emergency_c_section', 'assisted', 'other')
     OR (p_gestational_weeks IS NOT NULL AND p_gestational_weeks NOT BETWEEN 20 AND 45)
     OR (p_gestational_days IS NOT NULL AND p_gestational_days NOT BETWEEN 0 AND 6)
     OR (p_birth_weight_g IS NOT NULL AND p_birth_weight_g NOT BETWEEN 300 AND 7000)
     OR (p_birth_length_cm IS NOT NULL AND p_birth_length_cm NOT BETWEEN 20 AND 70)
     OR (p_birth_head_cm IS NOT NULL AND p_birth_head_cm NOT BETWEEN 20 AND 50)
     OR char_length(COALESCE(p_birth_facility, '')) > 160
     OR char_length(COALESCE(p_birth_clinician, '')) > 160
     OR char_length(COALESCE(p_special_monitoring_notes, '')) > 1000
     OR char_length(COALESCE(p_discharge_notes, '')) > 2000
     OR (p_discharged_at IS NOT NULL AND p_discharged_at < p_birth_occurred_at) THEN
    RAISE EXCEPTION 'invalid family lifecycle';
  END IF;

  INSERT INTO portal_read_model.family_lifecycle (
    singleton_id, birth_occurred_at, birth_method, gestational_weeks, gestational_days,
    birth_weight_g, birth_length_cm, birth_head_cm, birth_facility, birth_clinician,
    premature, low_birth_weight, special_monitoring, special_monitoring_notes,
    discharged_at, discharge_notes
  ) VALUES (
    1, p_birth_occurred_at, p_birth_method, p_gestational_weeks, p_gestational_days,
    p_birth_weight_g, p_birth_length_cm, p_birth_head_cm, NULLIF(trim(p_birth_facility), ''),
    NULLIF(trim(p_birth_clinician), ''), p_premature, p_low_birth_weight, p_special_monitoring,
    NULLIF(trim(p_special_monitoring_notes), ''), p_discharged_at, NULLIF(trim(p_discharge_notes), '')
  ) ON CONFLICT (singleton_id) DO UPDATE SET
    birth_occurred_at = EXCLUDED.birth_occurred_at, birth_method = EXCLUDED.birth_method,
    gestational_weeks = EXCLUDED.gestational_weeks, gestational_days = EXCLUDED.gestational_days,
    birth_weight_g = EXCLUDED.birth_weight_g, birth_length_cm = EXCLUDED.birth_length_cm,
    birth_head_cm = EXCLUDED.birth_head_cm, birth_facility = EXCLUDED.birth_facility,
    birth_clinician = EXCLUDED.birth_clinician, premature = EXCLUDED.premature,
    low_birth_weight = EXCLUDED.low_birth_weight, special_monitoring = EXCLUDED.special_monitoring,
    special_monitoring_notes = EXCLUDED.special_monitoring_notes, discharged_at = EXCLUDED.discharged_at,
    discharge_notes = EXCLUDED.discharge_notes, updated_at = timezone('utc', now());
  RETURN public.embe_get_family_lifecycle();
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_family_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_family_lifecycle(timestamptz,text,smallint,smallint,integer,numeric,numeric,text,text,boolean,boolean,boolean,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_family_lifecycle() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_family_lifecycle(timestamptz,text,smallint,smallint,integer,numeric,numeric,text,text,boolean,boolean,boolean,text,timestamptz,text) TO service_role;

COMMENT ON TABLE portal_read_model.family_lifecycle IS 'Private birth and discharge transition for the Hiếu–Ngân family lifecycle.';
