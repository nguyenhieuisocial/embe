CREATE TABLE portal_read_model.baby_medical_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('discharge', 'newborn_screening', 'hearing', 'eye', 'visit', 'diagnosis', 'prescription', 'allergy', 'vaccination', 'other')),
  status text NOT NULL CHECK (status IN ('planned', 'completed')),
  occurred_at timestamptz NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  provider text NOT NULL DEFAULT '' CHECK (char_length(provider) <= 160),
  clinician text NOT NULL DEFAULT '' CHECK (char_length(clinician) <= 160),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  next_due_at timestamptz,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 8000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);
CREATE INDEX baby_medical_record_timeline_idx ON portal_read_model.baby_medical_record (occurred_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE portal_read_model.baby_medical_document (
  id uuid PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES portal_read_model.baby_medical_record(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^baby-records/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 15000000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ready_at timestamptz
);
CREATE INDEX baby_medical_document_record_idx ON portal_read_model.baby_medical_document (record_id, created_at);

ALTER TABLE portal_read_model.baby_medical_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.baby_medical_record FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.baby_medical_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.baby_medical_document FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.baby_medical_record, portal_read_model.baby_medical_document FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.baby_medical_record, portal_read_model.baby_medical_document TO service_role;
CREATE POLICY baby_medical_record_deny_clients ON portal_read_model.baby_medical_record FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY baby_medical_document_deny_clients ON portal_read_model.baby_medical_document FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_list_baby_medical_records()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', record.id, 'kind', record.kind, 'status', record.status, 'occurred_at', record.occurred_at,
    'title', record.title, 'provider', record.provider, 'clinician', record.clinician,
    'notes', record.notes, 'next_due_at', record.next_due_at, 'details', record.details,
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', document.id, 'original_filename', document.original_filename, 'mime_type', document.mime_type,
      'byte_size', document.byte_size, 'created_at', document.created_at
    ) ORDER BY document.created_at) FROM portal_read_model.baby_medical_document AS document
      WHERE document.record_id = record.id AND document.status = 'ready'), '[]'::jsonb)
  ) ORDER BY record.occurred_at DESC), '[]'::jsonb)
  FROM portal_read_model.baby_medical_record AS record WHERE record.deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_baby_medical_record(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_next_due_at timestamptz, p_details jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid()); result jsonb;
BEGIN
  IF p_kind NOT IN ('discharge', 'newborn_screening', 'hearing', 'eye', 'visit', 'diagnosis', 'prescription', 'allergy', 'vaccination', 'other')
     OR p_status NOT IN ('planned', 'completed') OR p_occurred_at IS NULL
     OR char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120
     OR char_length(COALESCE(p_provider, '')) > 160 OR char_length(COALESCE(p_clinician, '')) > 160
     OR char_length(COALESCE(p_notes, '')) > 2000 OR jsonb_typeof(p_details) <> 'object'
     OR octet_length(p_details::text) > 8000 THEN RAISE EXCEPTION 'invalid baby medical record'; END IF;
  INSERT INTO portal_read_model.baby_medical_record (
    id, kind, status, occurred_at, title, provider, clinician, notes, next_due_at, details
  ) VALUES (result_id, p_kind, p_status, p_occurred_at, trim(p_title), trim(p_provider),
    trim(p_clinician), trim(p_notes), p_next_due_at, p_details)
  ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, status = EXCLUDED.status,
    occurred_at = EXCLUDED.occurred_at, title = EXCLUDED.title, provider = EXCLUDED.provider,
    clinician = EXCLUDED.clinician, notes = EXCLUDED.notes, next_due_at = EXCLUDED.next_due_at,
    details = EXCLUDED.details, updated_at = timezone('utc', now())
  WHERE portal_read_model.baby_medical_record.deleted_at IS NULL;
  SELECT jsonb_build_object(
    'id', record.id, 'kind', record.kind, 'status', record.status, 'occurred_at', record.occurred_at,
    'title', record.title, 'provider', record.provider, 'clinician', record.clinician,
    'notes', record.notes, 'next_due_at', record.next_due_at, 'details', record.details, 'documents', '[]'::jsonb
  ) INTO result FROM portal_read_model.baby_medical_record AS record WHERE record.id = result_id;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_create_baby_medical_document(
  p_record_id uuid, p_document_id uuid, p_original_filename text, p_mime_type text, p_byte_size integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE extension text; object_path text;
BEGIN
  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_byte_size NOT BETWEEN 1 AND 15000000
     OR char_length(trim(COALESCE(p_original_filename, ''))) NOT BETWEEN 1 AND 180
     OR NOT EXISTS (SELECT 1 FROM portal_read_model.baby_medical_record WHERE id = p_record_id AND deleted_at IS NULL)
  THEN RAISE EXCEPTION 'invalid baby medical document'; END IF;
  extension := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE 'pdf' END;
  object_path := 'baby-records/' || p_record_id || '/' || p_document_id || '.' || extension;
  INSERT INTO portal_read_model.baby_medical_document (id, record_id, storage_path, original_filename, mime_type, byte_size)
  VALUES (p_document_id, p_record_id, object_path, trim(p_original_filename), p_mime_type, p_byte_size);
  RETURN jsonb_build_object('id', p_document_id, 'storage_path', object_path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_baby_medical_document(p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  UPDATE portal_read_model.baby_medical_document SET status = 'ready', ready_at = timezone('utc', now())
  WHERE id = p_id AND status = 'pending';
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_baby_medical_document(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object('storage_path', storage_path, 'mime_type', mime_type, 'byte_size', byte_size,
    'original_filename', original_filename, 'status', status)
  FROM portal_read_model.baby_medical_document WHERE id = p_id;
$function$;

REVOKE ALL ON FUNCTION public.embe_list_baby_medical_records() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_baby_medical_record(uuid,text,text,timestamptz,text,text,text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_create_baby_medical_document(uuid,uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_baby_medical_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_baby_medical_document(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_baby_medical_records() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_baby_medical_record(uuid,text,text,timestamptz,text,text,text,text,timestamptz,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_create_baby_medical_document(uuid,uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_baby_medical_document(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_baby_medical_document(uuid) TO service_role;

COMMENT ON TABLE portal_read_model.baby_medical_record IS 'Private child health, screening, visit, allergy, prescription and vaccination records.';
