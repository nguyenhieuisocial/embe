-- Private, review-first food-photo analysis. Images are short-lived staging
-- objects; only confirmed estimates become meal history.

CREATE TABLE portal_read_model.meal_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  author_role text NOT NULL CHECK (author_role IN ('father', 'mother')),
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  eaten_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 12000000),
  storage_path text NOT NULL UNIQUE CHECK (
    storage_path ~ '^incoming/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (
    status IN ('awaiting_upload', 'uploaded', 'analyzing', 'review', 'nutrition_pending', 'nutrition_processing', 'confirmed', 'failed', 'rejected', 'deleted')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
  analysis jsonb,
  confirmed_analysis jsonb,
  model_name text CHECK (model_name IS NULL OR char_length(model_name) <= 80),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,48}$'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  uploaded_at timestamptz,
  analyzed_at timestamptz,
  confirmed_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX meal_analysis_worker_idx
  ON portal_read_model.meal_analysis (status, next_attempt_at, created_at)
  WHERE status IN ('uploaded', 'failed');

CREATE INDEX meal_analysis_history_idx
  ON portal_read_model.meal_analysis (eaten_at DESC)
  WHERE status = 'confirmed';

CREATE TRIGGER meal_analysis_set_updated_at
BEFORE UPDATE ON portal_read_model.meal_analysis
FOR EACH ROW EXECUTE FUNCTION portal_read_model.touch_updated_at();

ALTER TABLE portal_read_model.meal_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.meal_analysis FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.meal_analysis FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.meal_analysis TO service_role;

CREATE POLICY meal_analysis_deny_clients ON portal_read_model.meal_analysis
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_create_meal_analysis(
  p_idempotency_key uuid, p_author_role text, p_meal_type text,
  p_eaten_at timestamptz, p_note text, p_original_filename text,
  p_mime_type text, p_byte_size bigint
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  entry_id uuid := gen_random_uuid();
  extension text;
  object_path text;
  result_row portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
     OR p_author_role NOT IN ('father', 'mother')
     OR p_meal_type NOT IN ('breakfast', 'lunch', 'dinner', 'snack')
     OR p_eaten_at IS NULL OR p_eaten_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_eaten_at > timezone('utc', now()) + interval '1 day'
     OR char_length(COALESCE(btrim(p_note), '')) > 300
     OR COALESCE(char_length(btrim(p_original_filename)), 0) NOT BETWEEN 1 AND 180
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR p_byte_size NOT BETWEEN 1 AND 12000000 THEN
    RAISE EXCEPTION 'invalid meal analysis request';
  END IF;

  extension := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
  object_path := format('incoming/%s/%s/%s.%s',
    to_char(timezone('utc', now()), 'YYYY'), to_char(timezone('utc', now()), 'MM'), entry_id, extension);

  INSERT INTO portal_read_model.meal_analysis (
    id, idempotency_key, author_role, meal_type, eaten_at, note,
    original_filename, mime_type, byte_size, storage_path
  ) VALUES (
    entry_id, p_idempotency_key, p_author_role, p_meal_type, p_eaten_at,
    btrim(COALESCE(p_note, '')), btrim(p_original_filename), p_mime_type, p_byte_size, object_path
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO result_row FROM portal_read_model.meal_analysis WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('id', result_row.id, 'storage_path', result_row.storage_path, 'status', result_row.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_meal_analysis(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT CASE WHEN entry.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id', entry.id, 'status', entry.status, 'meal_type', entry.meal_type,
    'eaten_at', entry.eaten_at, 'note', entry.note, 'storage_path', entry.storage_path,
    'byte_size', entry.byte_size, 'mime_type', entry.mime_type,
    'analysis', entry.analysis, 'confirmed_analysis', entry.confirmed_analysis,
    'last_error_code', entry.last_error_code
  ) END
  FROM portal_read_model.meal_analysis AS entry WHERE entry.id = p_id;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_meal_upload(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.meal_analysis
  SET status = 'uploaded', uploaded_at = timezone('utc', now()),
      next_attempt_at = timezone('utc', now()), last_error_code = NULL
  WHERE id = p_id AND status IN ('awaiting_upload', 'uploaded');
  IF NOT FOUND THEN RAISE EXCEPTION 'meal upload cannot be completed'; END IF;
  RETURN jsonb_build_object('status', 'accepted');
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_meal_analysis()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE claimed portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  UPDATE portal_read_model.meal_analysis AS queue
  SET status = 'analyzing', attempts = attempts + 1
  WHERE queue.id = (
    SELECT candidate.id FROM portal_read_model.meal_analysis AS candidate
    WHERE candidate.status IN ('uploaded', 'failed')
      AND candidate.next_attempt_at <= timezone('utc', now()) AND candidate.attempts < 10
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
      analysis = p_analysis, analyzed_at = timezone('utc', now()), last_error_code = NULL
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
      last_error_code = p_error_code,
      next_attempt_at = timezone('utc', now()) + make_interval(secs => p_retry_after_seconds)
  WHERE id = p_id AND status = 'analyzing';
  IF NOT FOUND THEN RAISE EXCEPTION 'meal analysis is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_confirm_meal_analysis(p_id uuid, p_confirmed_analysis jsonb, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_row portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_confirmed_analysis) <> 'object' OR char_length(COALESCE(btrim(p_note), '')) > 300
    THEN RAISE EXCEPTION 'invalid confirmed meal'; END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = 'nutrition_pending', confirmed_analysis = p_confirmed_analysis,
      note = btrim(COALESCE(p_note, '')), confirmed_at = timezone('utc', now())
  WHERE id = p_id AND status IN ('review', 'nutrition_pending', 'confirmed') RETURNING * INTO result_row;
  IF result_row.id IS NULL THEN RAISE EXCEPTION 'meal is not ready for confirmation'; END IF;
  RETURN jsonb_build_object('id', result_row.id, 'status', result_row.status,
    'meal_type', result_row.meal_type, 'eaten_at', result_row.eaten_at,
    'note', result_row.note, 'analysis', result_row.confirmed_analysis);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_meal_nutrition()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE claimed portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  UPDATE portal_read_model.meal_analysis AS queue
  SET status = 'nutrition_processing', attempts = attempts + 1
  WHERE queue.id = (
    SELECT candidate.id FROM portal_read_model.meal_analysis AS candidate
    WHERE candidate.status = 'nutrition_pending'
      AND candidate.next_attempt_at <= timezone('utc', now()) AND candidate.attempts < 10
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
      last_error_code = NULL
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
      last_error_code = p_error_code,
      next_attempt_at = timezone('utc', now()) + make_interval(secs => p_retry_after_seconds)
  WHERE id = p_id AND status = 'nutrition_processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'meal nutrition is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_list_meal_history(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entry.id, 'meal_type', entry.meal_type, 'eaten_at', entry.eaten_at,
    'note', entry.note, 'analysis', entry.confirmed_analysis
  ) ORDER BY entry.eaten_at DESC), '[]'::jsonb)
  FROM portal_read_model.meal_analysis AS entry
  WHERE entry.status = 'confirmed'
    AND p_days BETWEEN 1 AND 30
    AND entry.eaten_at >= timezone('utc', now()) - make_interval(days => p_days);
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_meal_analysis(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.meal_analysis SET status = 'deleted', deleted_at = timezone('utc', now())
  WHERE id = p_id AND status NOT IN ('deleted', 'analyzing');
  IF NOT FOUND THEN RAISE EXCEPTION 'meal cannot be deleted'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_create_meal_analysis(uuid,text,text,timestamptz,text,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_meal_analysis(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_meal_upload(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_meal_analysis() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_finish_meal_analysis(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_meal_analysis(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_meal_nutrition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_finish_meal_nutrition(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_meal_nutrition(uuid,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_list_meal_history(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_meal_analysis(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.embe_create_meal_analysis(uuid,text,text,timestamptz,text,text,text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_meal_analysis(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_meal_upload(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_meal_analysis() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_finish_meal_analysis(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_meal_analysis(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_meal_nutrition() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_finish_meal_nutrition(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_meal_nutrition(uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_meal_history(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_meal_analysis(uuid) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('embe-meal-inbox', 'embe-meal-inbox', false, 12000000,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
