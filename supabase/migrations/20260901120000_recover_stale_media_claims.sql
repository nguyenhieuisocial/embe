-- Recover work abandoned when a local media worker exits after claiming it.
-- A claim is a 15-minute lease. Reclaiming consumes another bounded attempt;
-- exhausted vision/import work is rejected, while exhausted nutrition work
-- keeps the confirmed meal and records nutrition as unavailable.

ALTER TABLE portal_read_model.photo_upload
  ADD COLUMN claimed_at timestamptz;

UPDATE portal_read_model.photo_upload
SET claimed_at = updated_at
WHERE status = 'importing';

ALTER TABLE portal_read_model.photo_upload
  ADD CONSTRAINT photo_upload_claim_shape CHECK (
    (status = 'importing') = (claimed_at IS NOT NULL)
  );

DROP INDEX IF EXISTS portal_read_model.photo_upload_worker_idx;
CREATE INDEX photo_upload_worker_idx
  ON portal_read_model.photo_upload (status, next_attempt_at, claimed_at, created_at)
  WHERE status IN ('uploaded', 'failed', 'importing');

CREATE OR REPLACE FUNCTION public.embe_claim_photo_upload()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  claimed portal_read_model.photo_upload%ROWTYPE;
BEGIN
  UPDATE portal_read_model.photo_upload
  SET status = 'rejected', claimed_at = NULL, last_error_code = 'worker_timeout'
  WHERE status = 'importing'
    AND attempts >= 20
    AND claimed_at < timezone('utc', now()) - interval '15 minutes';

  UPDATE portal_read_model.photo_upload AS queue
  SET status = 'importing', attempts = attempts + 1,
      claimed_at = timezone('utc', now()), last_error_code = NULL
  WHERE queue.id = (
    SELECT candidate.id
    FROM portal_read_model.photo_upload AS candidate
    WHERE (
        (candidate.status IN ('uploaded', 'failed')
          AND candidate.next_attempt_at <= timezone('utc', now()))
        OR (candidate.status = 'importing'
          AND candidate.claimed_at < timezone('utc', now()) - interval '15 minutes')
      )
      AND candidate.attempts < 20
    ORDER BY candidate.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING queue.* INTO claimed;

  IF claimed.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', claimed.id,
    'storage_path', claimed.storage_path,
    'mime_type', claimed.mime_type,
    'byte_size', claimed.byte_size,
    'caption', claimed.caption,
    'captured_at', claimed.captured_at,
    'original_filename', claimed.original_filename,
    'attempts', claimed.attempts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_finish_photo_import(
  p_upload_id uuid,
  p_immich_asset_id uuid,
  p_checksum_sha256 text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_immich_asset_id IS NULL OR p_checksum_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid photo import result';
  END IF;
  UPDATE portal_read_model.photo_upload
  SET status = 'imported', immich_asset_id = p_immich_asset_id,
      checksum_sha256 = p_checksum_sha256, imported_at = timezone('utc', now()),
      claimed_at = NULL, last_error_code = NULL
  WHERE id = p_upload_id AND status = 'importing';
  IF NOT FOUND THEN RAISE EXCEPTION 'photo import is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_photo_import(
  p_upload_id uuid,
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
    RAISE EXCEPTION 'invalid photo import failure';
  END IF;
  UPDATE portal_read_model.photo_upload
  SET status = CASE WHEN attempts >= 20 THEN 'rejected' ELSE 'failed' END,
      claimed_at = NULL, last_error_code = p_error_code,
      next_attempt_at = timezone('utc', now()) + make_interval(secs => p_retry_after_seconds)
  WHERE id = p_upload_id AND status = 'importing';
  IF NOT FOUND THEN RAISE EXCEPTION 'photo import is not claimed'; END IF;
END;
$function$;

ALTER TABLE portal_read_model.meal_analysis
  ADD COLUMN claimed_at timestamptz;

UPDATE portal_read_model.meal_analysis
SET claimed_at = updated_at
WHERE status IN ('analyzing', 'nutrition_processing');

ALTER TABLE portal_read_model.meal_analysis
  ADD CONSTRAINT meal_analysis_claim_shape CHECK (
    (status IN ('analyzing', 'nutrition_processing')) = (claimed_at IS NOT NULL)
  );

DROP INDEX IF EXISTS portal_read_model.meal_analysis_worker_idx;
CREATE INDEX meal_analysis_worker_idx
  ON portal_read_model.meal_analysis (status, next_attempt_at, claimed_at, created_at)
  WHERE status IN ('uploaded', 'failed', 'analyzing', 'nutrition_pending', 'nutrition_processing');

CREATE OR REPLACE FUNCTION public.embe_claim_meal_analysis()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE claimed portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  UPDATE portal_read_model.meal_analysis
  SET status = 'rejected', claimed_at = NULL, last_error_code = 'worker_timeout'
  WHERE status = 'analyzing'
    AND attempts >= 10
    AND claimed_at < timezone('utc', now()) - interval '15 minutes';

  UPDATE portal_read_model.meal_analysis AS queue
  SET status = 'analyzing', attempts = attempts + 1,
      claimed_at = timezone('utc', now()), last_error_code = NULL
  WHERE queue.id = (
    SELECT candidate.id FROM portal_read_model.meal_analysis AS candidate
    WHERE (
        (candidate.status IN ('uploaded', 'failed')
          AND candidate.next_attempt_at <= timezone('utc', now()))
        OR (candidate.status = 'analyzing'
          AND candidate.claimed_at < timezone('utc', now()) - interval '15 minutes')
      )
      AND candidate.attempts < 10
    ORDER BY candidate.created_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) RETURNING queue.* INTO claimed;
  IF claimed.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', claimed.id, 'storage_path', claimed.storage_path, 'mime_type', claimed.mime_type,
    'byte_size', claimed.byte_size, 'note', claimed.note, 'meal_type', claimed.meal_type,
    'eaten_at', claimed.eaten_at, 'attempts', claimed.attempts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_finish_meal_analysis(
  p_id uuid, p_checksum_sha256 text, p_model_name text, p_analysis jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_checksum_sha256 !~ '^[0-9a-f]{64}$' OR COALESCE(char_length(p_model_name), 0) NOT BETWEEN 1 AND 80
     OR jsonb_typeof(p_analysis) <> 'object' THEN RAISE EXCEPTION 'invalid meal analysis result'; END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = 'review', checksum_sha256 = p_checksum_sha256, model_name = p_model_name,
      analysis = p_analysis, analyzed_at = timezone('utc', now()),
      claimed_at = NULL, last_error_code = NULL
  WHERE id = p_id AND status = 'analyzing';
  IF NOT FOUND THEN RAISE EXCEPTION 'meal analysis is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_meal_analysis(
  p_id uuid, p_error_code text, p_retry_after_seconds integer DEFAULT 60
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_error_code !~ '^[a-z0-9_]{1,48}$' OR p_retry_after_seconds NOT BETWEEN 30 AND 86400
    THEN RAISE EXCEPTION 'invalid meal analysis failure'; END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = CASE WHEN attempts >= 10 THEN 'rejected' ELSE 'failed' END,
      claimed_at = NULL, last_error_code = p_error_code,
      next_attempt_at = timezone('utc', now()) + make_interval(secs => p_retry_after_seconds)
  WHERE id = p_id AND status = 'analyzing';
  IF NOT FOUND THEN RAISE EXCEPTION 'meal analysis is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_meal_nutrition()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE claimed portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  UPDATE portal_read_model.meal_analysis
  SET status = 'confirmed', claimed_at = NULL,
      confirmed_analysis = confirmed_analysis || jsonb_build_object(
        'nutrition', jsonb_build_object(
          'status', 'unavailable',
          'notice', 'Chưa tra được dữ liệu dinh dưỡng; món và khẩu phần vẫn được lưu.'
        )
      ),
      last_error_code = 'worker_timeout'
  WHERE status = 'nutrition_processing'
    AND attempts >= 10
    AND claimed_at < timezone('utc', now()) - interval '15 minutes';

  UPDATE portal_read_model.meal_analysis AS queue
  SET status = 'nutrition_processing', attempts = attempts + 1,
      claimed_at = timezone('utc', now()), last_error_code = NULL
  WHERE queue.id = (
    SELECT candidate.id FROM portal_read_model.meal_analysis AS candidate
    WHERE (
        (candidate.status = 'nutrition_pending'
          AND candidate.next_attempt_at <= timezone('utc', now()))
        OR (candidate.status = 'nutrition_processing'
          AND candidate.claimed_at < timezone('utc', now()) - interval '15 minutes')
      )
      AND candidate.attempts < 10
    ORDER BY candidate.confirmed_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) RETURNING queue.* INTO claimed;
  IF claimed.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', claimed.id, 'analysis', claimed.confirmed_analysis, 'attempts', claimed.attempts);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_finish_meal_nutrition(p_id uuid, p_nutrition jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF jsonb_typeof(p_nutrition) <> 'object' THEN RAISE EXCEPTION 'invalid meal nutrition result'; END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = 'confirmed',
      confirmed_analysis = confirmed_analysis || jsonb_build_object('nutrition', p_nutrition),
      claimed_at = NULL, last_error_code = NULL
  WHERE id = p_id AND status = 'nutrition_processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'meal nutrition is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_meal_nutrition(p_id uuid, p_error_code text, p_retry_after_seconds integer DEFAULT 60)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_error_code !~ '^[a-z0-9_]{1,48}$' OR p_retry_after_seconds NOT BETWEEN 30 AND 86400
    THEN RAISE EXCEPTION 'invalid meal nutrition failure'; END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = CASE WHEN attempts >= 10 THEN 'confirmed' ELSE 'nutrition_pending' END,
      confirmed_analysis = CASE WHEN attempts >= 10 THEN confirmed_analysis || jsonb_build_object(
        'nutrition', jsonb_build_object('status', 'unavailable', 'notice', 'Chưa tra được dữ liệu dinh dưỡng; món và khẩu phần vẫn được lưu.'))
        ELSE confirmed_analysis END,
      claimed_at = NULL, last_error_code = p_error_code,
      next_attempt_at = timezone('utc', now()) + make_interval(secs => p_retry_after_seconds)
  WHERE id = p_id AND status = 'nutrition_processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'meal nutrition is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_meal_analysis(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.meal_analysis
  SET status = 'deleted', deleted_at = timezone('utc', now()), claimed_at = NULL
  WHERE id = p_id AND status NOT IN ('deleted', 'analyzing');
  IF NOT FOUND THEN RAISE EXCEPTION 'meal cannot be deleted'; END IF;
END;
$function$;
