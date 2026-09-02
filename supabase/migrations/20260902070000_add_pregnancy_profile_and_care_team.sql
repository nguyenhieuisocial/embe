BEGIN;

ALTER TABLE portal_read_model.pregnancy_wellness_profile
  ADD COLUMN lmp_date date CHECK (lmp_date IS NULL OR lmp_date BETWEEN DATE '2020-01-01' AND CURRENT_DATE),
  ADD COLUMN due_date_source text CHECK (due_date_source IS NULL OR due_date_source IN ('estimated_lmp', 'ultrasound', 'clinician')),
  ADD COLUMN gestation_type text CHECK (gestation_type IS NULL OR gestation_type IN ('singleton', 'twins', 'multiples')),
  ADD COLUMN blood_group text CHECK (blood_group IS NULL OR blood_group IN ('A', 'B', 'AB', 'O')),
  ADD COLUMN rh_factor text CHECK (rh_factor IS NULL OR rh_factor IN ('positive', 'negative')),
  ADD COLUMN allergies text NOT NULL DEFAULT '' CHECK (char_length(allergies) <= 500),
  ADD COLUMN medical_notes text NOT NULL DEFAULT '' CHECK (char_length(medical_notes) <= 1000);

CREATE TABLE portal_read_model.pregnancy_care_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('doctor', 'midwife', 'clinic', 'hospital', 'emergency', 'support')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  organization text NOT NULL DEFAULT '' CHECK (char_length(organization) <= 120),
  phone text NOT NULL CHECK (phone ~ '^[+]?[0-9][0-9 ()-]{5,24}$'),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  is_primary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX pregnancy_care_contact_primary_kind_idx
  ON portal_read_model.pregnancy_care_contact (kind)
  WHERE is_primary AND active;
CREATE INDEX pregnancy_care_contact_active_order_idx
  ON portal_read_model.pregnancy_care_contact (active, is_primary DESC, kind, created_at);

CREATE TRIGGER pregnancy_care_contact_set_updated_at
BEFORE UPDATE ON portal_read_model.pregnancy_care_contact
FOR EACH ROW EXECUTE FUNCTION portal_read_model.touch_updated_at();

ALTER TABLE portal_read_model.pregnancy_care_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_care_contact FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.pregnancy_care_contact FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_care_contact TO service_role;
CREATE POLICY pregnancy_care_contact_deny_clients ON portal_read_model.pregnancy_care_contact
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'due_date', (SELECT to_char(profile.due_date, 'YYYY-MM-DD')
      FROM portal_read_model.pregnancy_profile AS profile WHERE profile.singleton),
    'lmp_date', (SELECT to_char(wellness.lmp_date, 'YYYY-MM-DD')
      FROM portal_read_model.pregnancy_wellness_profile AS wellness WHERE wellness.singleton),
    'due_date_source', (SELECT wellness.due_date_source
      FROM portal_read_model.pregnancy_wellness_profile AS wellness WHERE wellness.singleton),
    'gestation_type', (SELECT wellness.gestation_type
      FROM portal_read_model.pregnancy_wellness_profile AS wellness WHERE wellness.singleton),
    'blood_group', (SELECT wellness.blood_group
      FROM portal_read_model.pregnancy_wellness_profile AS wellness WHERE wellness.singleton),
    'rh_factor', (SELECT wellness.rh_factor
      FROM portal_read_model.pregnancy_wellness_profile AS wellness WHERE wellness.singleton),
    'allergies', COALESCE((SELECT wellness.allergies
      FROM portal_read_model.pregnancy_wellness_profile AS wellness WHERE wellness.singleton), ''),
    'medical_notes', COALESCE((SELECT wellness.medical_notes
      FROM portal_read_model.pregnancy_wellness_profile AS wellness WHERE wellness.singleton), ''),
    'contacts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', contact.id, 'kind', contact.kind, 'name', contact.name,
      'organization', contact.organization, 'phone', contact.phone,
      'note', contact.note, 'primary', contact.is_primary
    ) ORDER BY contact.is_primary DESC, contact.kind, contact.created_at)
      FROM portal_read_model.pregnancy_care_contact AS contact WHERE contact.active), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_profile(
  p_due_date date, p_due_date_source text, p_lmp_date date, p_gestation_type text,
  p_blood_group text, p_rh_factor text, p_allergies text, p_medical_notes text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF (p_due_date IS NOT NULL AND p_due_date NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31')
    OR (p_lmp_date IS NOT NULL AND p_lmp_date NOT BETWEEN DATE '2020-01-01' AND CURRENT_DATE)
    OR (p_due_date_source IS NOT NULL AND p_due_date_source NOT IN ('estimated_lmp', 'ultrasound', 'clinician'))
    OR (p_gestation_type IS NOT NULL AND p_gestation_type NOT IN ('singleton', 'twins', 'multiples'))
    OR (p_blood_group IS NOT NULL AND p_blood_group NOT IN ('A', 'B', 'AB', 'O'))
    OR (p_rh_factor IS NOT NULL AND p_rh_factor NOT IN ('positive', 'negative'))
    OR char_length(COALESCE(p_allergies, '')) > 500
    OR char_length(COALESCE(p_medical_notes, '')) > 1000
  THEN RAISE EXCEPTION 'invalid pregnancy profile'; END IF;

  INSERT INTO portal_read_model.pregnancy_profile (singleton, due_date, updated_at)
  VALUES (true, p_due_date, timezone('utc', now()))
  ON CONFLICT (singleton) DO UPDATE SET due_date = EXCLUDED.due_date, updated_at = EXCLUDED.updated_at;

  INSERT INTO portal_read_model.pregnancy_wellness_profile (
    singleton, lmp_date, due_date_source, gestation_type, blood_group, rh_factor,
    allergies, medical_notes, updated_at
  ) VALUES (
    true, p_lmp_date, p_due_date_source, p_gestation_type, p_blood_group, p_rh_factor,
    btrim(COALESCE(p_allergies, '')), btrim(COALESCE(p_medical_notes, '')), timezone('utc', now())
  ) ON CONFLICT (singleton) DO UPDATE SET
    lmp_date = EXCLUDED.lmp_date, due_date_source = EXCLUDED.due_date_source,
    gestation_type = EXCLUDED.gestation_type, blood_group = EXCLUDED.blood_group,
    rh_factor = EXCLUDED.rh_factor, allergies = EXCLUDED.allergies,
    medical_notes = EXCLUDED.medical_notes, updated_at = EXCLUDED.updated_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_care_contact(
  p_id uuid, p_kind text, p_name text, p_organization text, p_phone text,
  p_note text, p_primary boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_kind NOT IN ('doctor', 'midwife', 'clinic', 'hospital', 'emergency', 'support')
    OR char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 80
    OR char_length(COALESCE(p_organization, '')) > 120
    OR COALESCE(p_phone, '') !~ '^[+]?[0-9][0-9 ()-]{5,24}$'
    OR char_length(COALESCE(p_note, '')) > 300 OR p_primary IS NULL
  THEN RAISE EXCEPTION 'invalid care contact'; END IF;
  IF p_primary THEN
    UPDATE portal_read_model.pregnancy_care_contact SET is_primary = false
      WHERE kind = p_kind AND active AND id <> result_id;
  END IF;
  INSERT INTO portal_read_model.pregnancy_care_contact (
    id, kind, name, organization, phone, note, is_primary, active
  ) VALUES (
    result_id, p_kind, btrim(p_name), btrim(COALESCE(p_organization, '')),
    btrim(p_phone), btrim(COALESCE(p_note, '')), p_primary, true
  ) ON CONFLICT (id) DO UPDATE SET
    kind = EXCLUDED.kind, name = EXCLUDED.name, organization = EXCLUDED.organization,
    phone = EXCLUDED.phone, note = EXCLUDED.note, is_primary = EXCLUDED.is_primary,
    active = true, updated_at = timezone('utc', now());
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_care_contact(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.pregnancy_care_contact
    SET active = false, is_primary = false, updated_at = timezone('utc', now())
    WHERE id = p_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'care contact not found'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_profile(date,text,date,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_care_contact(uuid,text,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_pregnancy_care_contact(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_profile(date,text,date,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_care_contact(uuid,text,text,text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_pregnancy_care_contact(uuid) TO service_role;

COMMIT;
