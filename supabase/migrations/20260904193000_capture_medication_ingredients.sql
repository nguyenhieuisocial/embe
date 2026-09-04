-- Preserve visible medication ingredients/strengths and allow a failed image scan to be retried.

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
  ON CONFLICT (document_id) DO UPDATE
  SET status = 'queued', attempts = 0, next_attempt_at = timezone('utc', now()),
      claimed_at = NULL, last_error_code = NULL
  WHERE medication_scan.status IN ('failed', 'rejected');

  SELECT * INTO scan_row
  FROM portal_read_model.medication_scan
  WHERE document_id = p_document_id;

  RETURN jsonb_build_object('document_id', scan_row.document_id, 'status', scan_row.status);
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
       OR (medicine - ARRAY['name', 'ingredients', 'dose', 'frequency', 'instructions']::text[]) <> '{}'::jsonb
       OR NOT (medicine ?& ARRAY['name', 'dose', 'frequency', 'instructions'])
       OR jsonb_typeof(medicine -> 'name') <> 'string'
       OR (medicine ? 'ingredients' AND jsonb_typeof(medicine -> 'ingredients') <> 'string')
       OR jsonb_typeof(medicine -> 'dose') <> 'string'
       OR jsonb_typeof(medicine -> 'frequency') <> 'string'
       OR jsonb_typeof(medicine -> 'instructions') <> 'string'
       OR char_length(btrim(medicine ->> 'name')) NOT BETWEEN 1 AND 100
       OR char_length(btrim(COALESCE(medicine ->> 'ingredients', ''))) > 300
       OR char_length(btrim(medicine ->> 'dose')) > 80
       OR char_length(btrim(medicine ->> 'frequency')) > 80
       OR char_length(btrim(medicine ->> 'instructions')) > 200 THEN
      RAISE EXCEPTION 'invalid confirmed medication scan';
    END IF;

    normalized_medicines := normalized_medicines || jsonb_build_array(jsonb_build_object(
      'name', btrim(medicine ->> 'name'),
      'ingredients', btrim(COALESCE(medicine ->> 'ingredients', '')),
      'dose', btrim(medicine ->> 'dose'),
      'frequency', btrim(medicine ->> 'frequency'),
      'instructions', btrim(medicine ->> 'instructions')
    ));
  END LOOP;

  SELECT document.record_id INTO target_record_id
  FROM portal_read_model.medication_scan AS scan
  JOIN portal_read_model.pregnancy_medical_document AS document ON document.id = scan.document_id
  JOIN portal_read_model.pregnancy_medical_record AS medical_record ON medical_record.id = document.record_id
  WHERE scan.document_id = p_document_id
    AND scan.status IN ('review', 'confirmed')
    AND document.status = 'ready'
    AND document.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
    AND medical_record.kind = 'prescription'
    AND medical_record.deleted_at IS NULL
  FOR UPDATE OF scan, medical_record;

  IF target_record_id IS NULL THEN RAISE EXCEPTION 'medication scan is not ready for confirmation'; END IF;

  UPDATE portal_read_model.pregnancy_medical_record
  SET medicines = normalized_medicines, updated_at = timezone('utc', now())
  WHERE id = target_record_id;

  UPDATE portal_read_model.medication_scan
  SET status = 'confirmed',
      confirmed_analysis = jsonb_build_object('medicines', normalized_medicines, 'questions', '[]'::jsonb),
      confirmed_at = timezone('utc', now()), claimed_at = NULL, last_error_code = NULL
  WHERE document_id = p_document_id;

  RETURN jsonb_build_object(
    'document_id', p_document_id, 'status', 'confirmed',
    'confirmed_analysis', jsonb_build_object('medicines', normalized_medicines, 'questions', '[]'::jsonb)
  );
END;
$function$;

UPDATE portal_read_model.medication_scan
SET status = 'queued', attempts = 0, next_attempt_at = timezone('utc', now()),
    claimed_at = NULL, last_error_code = NULL
WHERE status IN ('failed', 'rejected')
  AND last_error_code = 'invalid_medication_vision_output';

REVOKE ALL ON FUNCTION public.embe_queue_medication_scan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_confirm_medication_scan(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_queue_medication_scan(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_confirm_medication_scan(uuid,jsonb) TO service_role;
