CREATE TABLE portal_read_model.pregnancy_medical_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('appointment', 'ultrasound', 'laboratory', 'prescription', 'other')),
  status text NOT NULL CHECK (status IN ('planned', 'completed')),
  occurred_at timestamptz NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  provider text NOT NULL DEFAULT '' CHECK (char_length(provider) <= 120),
  clinician text NOT NULL DEFAULT '' CHECK (char_length(clinician) <= 100),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  gestational_week smallint CHECK (gestational_week BETWEEN 1 AND 42),
  next_appointment_at timestamptz,
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(measurements) = 'object'),
  medicines jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(medicines) = 'array'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE portal_read_model.pregnancy_medical_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES portal_read_model.pregnancy_medical_record(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^records/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 15000000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ready_at timestamptz
);

CREATE INDEX pregnancy_medical_record_timeline_idx ON portal_read_model.pregnancy_medical_record (occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX pregnancy_medical_document_record_idx ON portal_read_model.pregnancy_medical_document (record_id, created_at);
ALTER TABLE portal_read_model.pregnancy_medical_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_medical_record FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_medical_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_medical_document FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.pregnancy_medical_record FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_medical_document FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.pregnancy_medical_record TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_medical_document TO service_role;
CREATE POLICY pregnancy_medical_record_deny_clients ON portal_read_model.pregnancy_medical_record FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY pregnancy_medical_document_deny_clients ON portal_read_model.pregnancy_medical_document FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_medical_record(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_gestational_week integer,
  p_next_appointment_at timestamptz, p_measurements jsonb, p_medicines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_kind NOT IN ('appointment', 'ultrasound', 'laboratory', 'prescription', 'other')
     OR p_status NOT IN ('planned', 'completed')
     OR char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 100
     OR char_length(COALESCE(p_provider, '')) > 120 OR char_length(COALESCE(p_clinician, '')) > 100
     OR char_length(COALESCE(p_notes, '')) > 2000
     OR (p_gestational_week IS NOT NULL AND p_gestational_week NOT BETWEEN 1 AND 42)
     OR jsonb_typeof(COALESCE(p_measurements, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_medicines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid pregnancy medical record';
  END IF;
  INSERT INTO portal_read_model.pregnancy_medical_record (
    id, kind, status, occurred_at, title, provider, clinician, notes, gestational_week,
    next_appointment_at, measurements, medicines
  ) VALUES (
    result_id, p_kind, p_status, p_occurred_at, trim(p_title), trim(COALESCE(p_provider, '')),
    trim(COALESCE(p_clinician, '')), trim(COALESCE(p_notes, '')), p_gestational_week,
    p_next_appointment_at, COALESCE(p_measurements, '{}'::jsonb), COALESCE(p_medicines, '[]'::jsonb)
  ) ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, status = EXCLUDED.status,
    occurred_at = EXCLUDED.occurred_at, title = EXCLUDED.title, provider = EXCLUDED.provider,
    clinician = EXCLUDED.clinician, notes = EXCLUDED.notes, gestational_week = EXCLUDED.gestational_week,
    next_appointment_at = EXCLUDED.next_appointment_at, measurements = EXCLUDED.measurements,
    medicines = EXCLUDED.medicines, updated_at = timezone('utc', now())
  WHERE portal_read_model.pregnancy_medical_record.deleted_at IS NULL;
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_list_pregnancy_medical_records()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', record.id, 'kind', record.kind, 'status', record.status, 'occurred_at', record.occurred_at,
    'title', record.title, 'provider', record.provider, 'clinician', record.clinician, 'notes', record.notes,
    'gestational_week', record.gestational_week, 'next_appointment_at', record.next_appointment_at,
    'measurements', record.measurements, 'medicines', record.medicines, 'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', document.id, 'original_filename', document.original_filename,
        'mime_type', document.mime_type, 'byte_size', document.byte_size, 'created_at', document.created_at)
        ORDER BY document.created_at)
      FROM portal_read_model.pregnancy_medical_document AS document
      WHERE document.record_id = record.id AND document.status = 'ready'
    ), '[]'::jsonb)
  ) ORDER BY record.occurred_at DESC), '[]'::jsonb)
  FROM portal_read_model.pregnancy_medical_record AS record WHERE record.deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_medical_record(p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  UPDATE portal_read_model.pregnancy_medical_record SET deleted_at = timezone('utc', now()),
    updated_at = timezone('utc', now()) WHERE id = p_id AND deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.embe_create_pregnancy_medical_document(
  p_record_id uuid, p_document_id uuid, p_original_filename text, p_mime_type text, p_byte_size integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE extension text; object_path text;
BEGIN
  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_byte_size NOT BETWEEN 1 AND 15000000
     OR char_length(trim(COALESCE(p_original_filename, ''))) NOT BETWEEN 1 AND 180
     OR NOT EXISTS (SELECT 1 FROM portal_read_model.pregnancy_medical_record WHERE id = p_record_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invalid pregnancy medical document';
  END IF;
  extension := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE 'pdf' END;
  object_path := 'records/' || p_record_id || '/' || p_document_id || '.' || extension;
  INSERT INTO portal_read_model.pregnancy_medical_document (id, record_id, storage_path, original_filename, mime_type, byte_size)
  VALUES (p_document_id, p_record_id, object_path, trim(p_original_filename), p_mime_type, p_byte_size);
  RETURN jsonb_build_object('id', p_document_id, 'storage_path', object_path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_pregnancy_medical_document(p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  UPDATE portal_read_model.pregnancy_medical_document SET status = 'ready', ready_at = timezone('utc', now())
  WHERE id = p_id AND status = 'pending';
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_medical_document(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object('storage_path', storage_path, 'mime_type', mime_type,
    'byte_size', byte_size, 'original_filename', original_filename, 'status', status)
  FROM portal_read_model.pregnancy_medical_document WHERE id = p_id;
$function$;

REVOKE ALL ON FUNCTION public.embe_save_pregnancy_medical_record(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_list_pregnancy_medical_records() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_pregnancy_medical_record(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_create_pregnancy_medical_document(uuid,uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_pregnancy_medical_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_pregnancy_medical_document(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_medical_record(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_pregnancy_medical_records() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_pregnancy_medical_record(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_create_pregnancy_medical_document(uuid,uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_pregnancy_medical_document(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_medical_document(uuid) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('embe-medical-records', 'embe-medical-records', false, 15000000,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
