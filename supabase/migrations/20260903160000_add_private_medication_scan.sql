-- Review-first extraction of medicines from a ready prescription image.
-- The private object locator is returned only to the service-role worker.

CREATE TABLE portal_read_model.medication_scan (
  document_id uuid PRIMARY KEY
    REFERENCES portal_read_model.pregnancy_medical_document(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'processing', 'review', 'confirmed', 'failed', 'rejected')
  ),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz,
  checksum_sha256 text CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  model_name text CHECK (
    model_name IS NULL OR char_length(model_name) BETWEEN 1 AND 80
  ),
  analysis jsonb CHECK (
    analysis IS NULL OR jsonb_typeof(analysis) = 'object'
  ),
  confirmed_analysis jsonb CHECK (
    confirmed_analysis IS NULL OR jsonb_typeof(confirmed_analysis) = 'object'
  ),
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,48}$'
  ),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  analyzed_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT medication_scan_claim_shape CHECK (
    (status = 'processing') = (claimed_at IS NOT NULL)
  )
);

CREATE INDEX medication_scan_worker_idx
  ON portal_read_model.medication_scan (next_attempt_at, claimed_at, created_at)
  WHERE status IN ('queued', 'failed', 'processing');

CREATE TRIGGER medication_scan_set_updated_at
BEFORE UPDATE ON portal_read_model.medication_scan
FOR EACH ROW EXECUTE FUNCTION portal_read_model.touch_updated_at();

ALTER TABLE portal_read_model.medication_scan ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.medication_scan FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.medication_scan FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.medication_scan TO service_role;

CREATE POLICY medication_scan_deny_clients
ON portal_read_model.medication_scan
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_queue_medication_scan(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  scan_row portal_read_model.medication_scan%ROWTYPE;
BEGIN
  IF p_document_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM portal_read_model.pregnancy_medical_document AS document
    JOIN portal_read_model.pregnancy_medical_record AS medical_record
      ON medical_record.id = document.record_id
    WHERE document.id = p_document_id
      AND document.status = 'ready'
      AND document.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND medical_record.kind = 'prescription'
      AND medical_record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'document is not a ready prescription image';
  END IF;

  INSERT INTO portal_read_model.medication_scan (document_id)
  VALUES (p_document_id)
  ON CONFLICT (document_id) DO NOTHING;

  SELECT * INTO scan_row
  FROM portal_read_model.medication_scan
  WHERE document_id = p_document_id;

  RETURN jsonb_build_object(
    'document_id', scan_row.document_id,
    'status', scan_row.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_medication_scan(p_document_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'document_id', scan.document_id,
    'status', scan.status,
    'attempts', scan.attempts,
    'analysis', scan.analysis,
    'confirmed_analysis', scan.confirmed_analysis,
    'last_error_code', scan.last_error_code,
    'analyzed_at', scan.analyzed_at,
    'confirmed_at', scan.confirmed_at,
    'updated_at', scan.updated_at
  )
  FROM portal_read_model.medication_scan AS scan
  WHERE scan.document_id = p_document_id;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_medication_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  claimed portal_read_model.medication_scan%ROWTYPE;
  source_document portal_read_model.pregnancy_medical_document%ROWTYPE;
BEGIN
  UPDATE portal_read_model.medication_scan
  SET status = 'rejected', claimed_at = NULL, last_error_code = 'worker_timeout'
  WHERE status = 'processing'
    AND attempts >= 10
    AND claimed_at < timezone('utc', now()) - interval '15 minutes';

  UPDATE portal_read_model.medication_scan AS queue
  SET status = 'processing',
      attempts = attempts + 1,
      claimed_at = timezone('utc', now()),
      last_error_code = NULL
  WHERE queue.document_id = (
    SELECT candidate.document_id
    FROM portal_read_model.medication_scan AS candidate
    JOIN portal_read_model.pregnancy_medical_document AS document
      ON document.id = candidate.document_id
    JOIN portal_read_model.pregnancy_medical_record AS medical_record
      ON medical_record.id = document.record_id
    WHERE (
        (candidate.status IN ('queued', 'failed')
          AND candidate.next_attempt_at <= timezone('utc', now()))
        OR (candidate.status = 'processing'
          AND candidate.claimed_at < timezone('utc', now()) - interval '15 minutes')
      )
      AND candidate.attempts < 10
      AND document.status = 'ready'
      AND document.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
      AND medical_record.kind = 'prescription'
      AND medical_record.deleted_at IS NULL
    ORDER BY candidate.created_at
    FOR UPDATE OF candidate SKIP LOCKED
    LIMIT 1
  )
  RETURNING queue.* INTO claimed;

  IF claimed.document_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO source_document
  FROM portal_read_model.pregnancy_medical_document
  WHERE id = claimed.document_id;

  RETURN jsonb_build_object(
    'document_id', claimed.document_id,
    'storage_path', source_document.storage_path,
    'mime_type', source_document.mime_type,
    'byte_size', source_document.byte_size,
    'attempts', claimed.attempts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_finish_medication_scan(
  p_document_id uuid,
  p_checksum_sha256 text,
  p_model_name text,
  p_extraction jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_checksum_sha256 !~ '^[0-9a-f]{64}$'
     OR COALESCE(char_length(p_model_name), 0) NOT BETWEEN 1 AND 80
     OR jsonb_typeof(p_extraction) <> 'object' THEN
    RAISE EXCEPTION 'invalid medication scan result';
  END IF;

  UPDATE portal_read_model.medication_scan
  SET status = 'review',
      checksum_sha256 = p_checksum_sha256,
      model_name = p_model_name,
      analysis = p_extraction,
      analyzed_at = timezone('utc', now()),
      claimed_at = NULL,
      last_error_code = NULL
  WHERE document_id = p_document_id AND status = 'processing';

  IF NOT FOUND THEN RAISE EXCEPTION 'medication scan is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_medication_scan(
  p_document_id uuid,
  p_error_code text,
  p_retry_after_seconds integer DEFAULT 60
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_error_code !~ '^[a-z0-9_]{1,48}$'
     OR p_retry_after_seconds NOT BETWEEN 30 AND 86400 THEN
    RAISE EXCEPTION 'invalid medication scan failure';
  END IF;

  UPDATE portal_read_model.medication_scan
  SET status = CASE WHEN attempts >= 10 THEN 'rejected' ELSE 'failed' END,
      claimed_at = NULL,
      last_error_code = p_error_code,
      next_attempt_at = timezone('utc', now()) + make_interval(secs => p_retry_after_seconds)
  WHERE document_id = p_document_id AND status = 'processing';

  IF NOT FOUND THEN RAISE EXCEPTION 'medication scan is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_confirm_medication_scan(
  p_document_id uuid,
  p_confirmed_analysis jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  medicines jsonb;
  medicine jsonb;
  normalized_medicines jsonb := '[]'::jsonb;
  target_record_id uuid;
BEGIN
  IF jsonb_typeof(p_confirmed_analysis) <> 'object'
     OR (p_confirmed_analysis - 'medicines') <> '{}'::jsonb
     OR jsonb_typeof(p_confirmed_analysis -> 'medicines') <> 'array'
     OR jsonb_array_length(p_confirmed_analysis -> 'medicines') NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'invalid confirmed medication scan';
  END IF;

  medicines := p_confirmed_analysis -> 'medicines';
  FOR medicine IN SELECT value FROM jsonb_array_elements(medicines) AS item(value)
  LOOP
    IF jsonb_typeof(medicine) <> 'object'
       OR (medicine - ARRAY['name', 'dose', 'frequency', 'instructions']::text[]) <> '{}'::jsonb
       OR NOT (medicine ?& ARRAY['name', 'dose', 'frequency', 'instructions'])
       OR jsonb_typeof(medicine -> 'name') <> 'string'
       OR jsonb_typeof(medicine -> 'dose') <> 'string'
       OR jsonb_typeof(medicine -> 'frequency') <> 'string'
       OR jsonb_typeof(medicine -> 'instructions') <> 'string'
       OR char_length(btrim(medicine ->> 'name')) NOT BETWEEN 1 AND 100
       OR char_length(btrim(medicine ->> 'dose')) > 80
       OR char_length(btrim(medicine ->> 'frequency')) > 80
       OR char_length(btrim(medicine ->> 'instructions')) > 200 THEN
      RAISE EXCEPTION 'invalid confirmed medication scan';
    END IF;

    normalized_medicines := normalized_medicines || jsonb_build_array(jsonb_build_object(
      'name', btrim(medicine ->> 'name'),
      'dose', btrim(medicine ->> 'dose'),
      'frequency', btrim(medicine ->> 'frequency'),
      'instructions', btrim(medicine ->> 'instructions')
    ));
  END LOOP;

  SELECT document.record_id INTO target_record_id
  FROM portal_read_model.medication_scan AS scan
  JOIN portal_read_model.pregnancy_medical_document AS document
    ON document.id = scan.document_id
  JOIN portal_read_model.pregnancy_medical_record AS medical_record
    ON medical_record.id = document.record_id
  WHERE scan.document_id = p_document_id
    AND scan.status IN ('review', 'confirmed')
    AND document.status = 'ready'
    AND document.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
    AND medical_record.kind = 'prescription'
    AND medical_record.deleted_at IS NULL
  FOR UPDATE OF scan, medical_record;

  IF target_record_id IS NULL THEN
    RAISE EXCEPTION 'medication scan is not ready for confirmation';
  END IF;

  UPDATE portal_read_model.pregnancy_medical_record
  SET medicines = normalized_medicines,
      updated_at = timezone('utc', now())
  WHERE id = target_record_id;

  UPDATE portal_read_model.medication_scan
  SET status = 'confirmed',
      confirmed_analysis = jsonb_build_object(
        'medicines', normalized_medicines,
        'questions', '[]'::jsonb
      ),
      confirmed_at = timezone('utc', now()),
      claimed_at = NULL,
      last_error_code = NULL
  WHERE document_id = p_document_id;

  RETURN jsonb_build_object(
    'document_id', p_document_id,
    'status', 'confirmed',
    'confirmed_analysis', jsonb_build_object(
      'medicines', normalized_medicines,
      'questions', '[]'::jsonb
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_queue_medication_scan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_medication_scan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_medication_scan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_finish_medication_scan(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_medication_scan(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_confirm_medication_scan(uuid,jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.embe_queue_medication_scan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_medication_scan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_medication_scan() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_finish_medication_scan(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_medication_scan(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_confirm_medication_scan(uuid,jsonb) TO service_role;

COMMENT ON TABLE portal_read_model.medication_scan IS
  'Private review-first OCR queue for ready prescription images; never creates medication reminders.';
COMMENT ON FUNCTION public.embe_get_medication_scan(uuid) IS
  'Returns review state without the private storage object locator.';
