-- Camera-first family photo inbox. Originals are staged privately until the
-- local worker validates and imports them into Immich.

CREATE TABLE portal_read_model.photo_upload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  author_role text NOT NULL CHECK (author_role IN ('father', 'mother')),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK (mime_type IN (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  )),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 25000000),
  storage_path text NOT NULL UNIQUE CHECK (
    storage_path ~ '^incoming/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$'
  ),
  caption text NOT NULL DEFAULT '' CHECK (char_length(caption) <= 180),
  captured_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (
    status IN ('awaiting_upload', 'uploaded', 'importing', 'imported', 'failed', 'rejected')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  immich_asset_id uuid,
  checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,48}$'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  uploaded_at timestamptz,
  imported_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE portal_read_model.photo_upload IS
  'Private server-only upload queue. Provider credentials and signed URLs are never stored here.';

CREATE INDEX photo_upload_worker_idx
  ON portal_read_model.photo_upload (status, next_attempt_at, created_at)
  WHERE status IN ('uploaded', 'failed');

CREATE TRIGGER photo_upload_set_updated_at
BEFORE UPDATE ON portal_read_model.photo_upload
FOR EACH ROW
EXECUTE FUNCTION portal_read_model.touch_updated_at();

ALTER TABLE portal_read_model.photo_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.photo_upload FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.photo_upload FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.photo_upload TO service_role;

CREATE POLICY photo_upload_deny_clients
ON portal_read_model.photo_upload
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_create_photo_upload(
  p_idempotency_key uuid,
  p_author_role text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size bigint,
  p_caption text,
  p_captured_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  upload_id uuid := gen_random_uuid();
  extension text;
  upload_path text;
  result_row portal_read_model.photo_upload%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL
     OR p_author_role NOT IN ('father', 'mother')
     OR COALESCE(char_length(btrim(p_original_filename)), 0) NOT BETWEEN 1 AND 180
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
     OR p_byte_size NOT BETWEEN 1 AND 25000000
     OR char_length(COALESCE(btrim(p_caption), '')) > 180
     OR p_captured_at IS NULL
     OR p_captured_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_captured_at > timezone('utc', now()) + interval '1 day' THEN
    RAISE EXCEPTION 'invalid photo upload request';
  END IF;

  extension := CASE p_mime_type
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
    WHEN 'image/heic' THEN 'heic'
    WHEN 'image/heif' THEN 'heif'
  END;
  upload_path := format(
    'incoming/%s/%s/%s.%s',
    to_char(timezone('utc', now()), 'YYYY'),
    to_char(timezone('utc', now()), 'MM'),
    upload_id,
    extension
  );

  INSERT INTO portal_read_model.photo_upload (
    id, idempotency_key, author_role, original_filename, mime_type,
    byte_size, storage_path, caption, captured_at
  )
  VALUES (
    upload_id, p_idempotency_key, p_author_role, btrim(p_original_filename), p_mime_type,
    p_byte_size, upload_path, btrim(COALESCE(p_caption, '')), p_captured_at
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO result_row
  FROM portal_read_model.photo_upload
  WHERE idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object(
    'id', result_row.id,
    'storage_path', result_row.storage_path,
    'status', result_row.status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_photo_upload(p_upload_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  affected integer;
BEGIN
  UPDATE portal_read_model.photo_upload
  SET status = 'uploaded', uploaded_at = timezone('utc', now()),
      next_attempt_at = timezone('utc', now()), last_error_code = NULL
  WHERE id = p_upload_id AND status IN ('awaiting_upload', 'uploaded');
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'photo upload cannot be completed'; END IF;
  RETURN jsonb_build_object('status', 'accepted');
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_photo_upload()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  claimed portal_read_model.photo_upload%ROWTYPE;
BEGIN
  UPDATE portal_read_model.photo_upload AS queue
  SET status = 'importing', attempts = attempts + 1
  WHERE queue.id = (
    SELECT candidate.id
    FROM portal_read_model.photo_upload AS candidate
    WHERE candidate.status IN ('uploaded', 'failed')
      AND candidate.next_attempt_at <= timezone('utc', now())
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
      last_error_code = NULL
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
      last_error_code = p_error_code,
      next_attempt_at = timezone('utc', now()) + make_interval(secs => p_retry_after_seconds)
  WHERE id = p_upload_id AND status = 'importing';
  IF NOT FOUND THEN RAISE EXCEPTION 'photo import is not claimed'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_create_photo_upload(uuid,text,text,text,bigint,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_photo_upload(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_photo_upload() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_finish_photo_import(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_photo_import(uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_photo_upload(uuid,text,text,text,bigint,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_photo_upload(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_photo_upload() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_finish_photo_import(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_photo_import(uuid,text,integer) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'embe-photo-inbox',
  'embe-photo-inbox',
  false,
  25000000,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
