-- Private, curated Immich previews for the family portal.
-- Originals and sensitive EXIF data never leave the local Immich instance.

CREATE TABLE portal_read_model.media_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id text NOT NULL UNIQUE,
  source_updated_at timestamptz NOT NULL,
  event_at timestamptz NOT NULL,
  title text NOT NULL,
  caption text NOT NULL,
  object_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/webp')),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  width integer CHECK (width IS NULL OR width BETWEEN 1 AND 10000),
  height integer CHECK (height IS NULL OR height BETWEEN 1 AND 10000),
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT media_item_source_asset_id_check CHECK (char_length(source_asset_id) BETWEEN 1 AND 128),
  CONSTRAINT media_item_title_check CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT media_item_caption_check CHECK (char_length(caption) BETWEEN 1 AND 500),
  CONSTRAINT media_item_object_path_check CHECK (
    object_path ~ '^assets/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|webp)$'
  )
);

COMMENT ON TABLE portal_read_model.media_item IS
  'Curated preview metadata only; no originals, GPS, camera serials, filenames, credentials, or medical data.';

CREATE INDEX media_item_approved_event_idx
  ON portal_read_model.media_item (event_at DESC)
  WHERE approved = true;

CREATE TRIGGER media_item_set_updated_at
BEFORE UPDATE ON portal_read_model.media_item
FOR EACH ROW
EXECUTE FUNCTION portal_read_model.touch_updated_at();

CREATE TABLE portal_read_model.media_sync_stage (
  sync_run_id uuid NOT NULL,
  source_asset_id text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  event_at timestamptz NOT NULL,
  title text NOT NULL,
  caption text NOT NULL,
  object_path text NOT NULL,
  mime_type text NOT NULL,
  checksum_sha256 text NOT NULL,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (sync_run_id, source_asset_id)
);

CREATE INDEX media_sync_stage_created_at_idx
  ON portal_read_model.media_sync_stage (created_at);

ALTER TABLE portal_read_model.media_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.media_item FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.media_sync_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.media_sync_stage FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.media_item FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.media_sync_stage FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.media_item TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.media_sync_stage TO service_role;

CREATE POLICY media_item_deny_clients
ON portal_read_model.media_item
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY media_sync_stage_deny_clients
ON portal_read_model.media_sync_stage
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE VIEW public.embe_media_item
WITH (security_invoker = true)
AS
SELECT id, event_at, title, caption, mime_type, width, height, updated_at
FROM portal_read_model.media_item
WHERE approved = true;

CREATE OR REPLACE VIEW public.embe_media_locator
WITH (security_invoker = true)
AS
SELECT id, object_path, mime_type, checksum_sha256
FROM portal_read_model.media_item
WHERE approved = true;

CREATE OR REPLACE VIEW public.embe_media_source_state
WITH (security_invoker = true)
AS
SELECT source_asset_id, source_updated_at, object_path, mime_type, checksum_sha256, width, height
FROM portal_read_model.media_item;

REVOKE ALL ON TABLE public.embe_media_item FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.embe_media_locator FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.embe_media_source_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_media_item TO service_role;
GRANT SELECT ON TABLE public.embe_media_locator TO service_role;
GRANT SELECT ON TABLE public.embe_media_source_state TO service_role;

ALTER TABLE portal_read_model.sync_status
  DROP CONSTRAINT sync_status_source_check;
ALTER TABLE portal_read_model.sync_status
  ADD CONSTRAINT sync_status_source_check CHECK (source_system IN ('memos', 'immich'));

CREATE OR REPLACE FUNCTION public.embe_stage_media_batch(
  p_sync_run_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  staged_count integer := 0;
BEGIN
  IF p_sync_run_id IS NULL
     OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'invalid media sync batch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item
    WHERE COALESCE(char_length(item->>'source_asset_id'), 0) NOT BETWEEN 1 AND 128
       OR COALESCE(char_length(item->>'title'), 0) NOT BETWEEN 1 AND 120
       OR COALESCE(char_length(item->>'caption'), 0) NOT BETWEEN 1 AND 500
       OR COALESCE(item->>'object_path', '') !~ '^assets/[0-9a-f-]{36}/[0-9a-f]{64}\.(jpg|webp)$'
       OR COALESCE(item->>'mime_type', '') NOT IN ('image/jpeg', 'image/webp')
       OR COALESCE(item->>'checksum_sha256', '') !~ '^[0-9a-f]{64}$'
       OR COALESCE((item->>'width')::integer, 1) NOT BETWEEN 1 AND 10000
       OR COALESCE((item->>'height')::integer, 1) NOT BETWEEN 1 AND 10000
  ) THEN
    RAISE EXCEPTION 'media item failed the publication contract';
  END IF;

  DELETE FROM portal_read_model.media_sync_stage
  WHERE created_at < timezone('utc', now()) - interval '1 day';

  INSERT INTO portal_read_model.media_sync_stage (
    sync_run_id, source_asset_id, source_updated_at, event_at, title, caption, object_path,
    mime_type, checksum_sha256, width, height
  )
  SELECT
    p_sync_run_id,
    item->>'source_asset_id',
    (item->>'source_updated_at')::timestamptz,
    (item->>'event_at')::timestamptz,
    item->>'title',
    item->>'caption',
    item->>'object_path',
    item->>'mime_type',
    item->>'checksum_sha256',
    NULLIF(item->>'width', '')::integer,
    NULLIF(item->>'height', '')::integer
  FROM jsonb_array_elements(p_items) AS item
  ON CONFLICT (sync_run_id, source_asset_id) DO UPDATE SET
    source_updated_at = EXCLUDED.source_updated_at,
    event_at = EXCLUDED.event_at,
    title = EXCLUDED.title,
    caption = EXCLUDED.caption,
    object_path = EXCLUDED.object_path,
    mime_type = EXCLUDED.mime_type,
    checksum_sha256 = EXCLUDED.checksum_sha256,
    width = EXCLUDED.width,
    height = EXCLUDED.height;

  GET DIAGNOSTICS staged_count = ROW_COUNT;
  RETURN jsonb_build_object('staged', staged_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_finalize_media_sync(
  p_sync_run_id uuid,
  p_expected_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  actual_count integer := 0;
  upserted_count integer := 0;
  unapproved_count integer := 0;
BEGIN
  SELECT count(*) INTO actual_count
  FROM portal_read_model.media_sync_stage
  WHERE sync_run_id = p_sync_run_id;

  IF p_sync_run_id IS NULL
     OR p_expected_count IS NULL
     OR p_expected_count NOT BETWEEN 0 AND 10000
     OR actual_count <> p_expected_count THEN
    RAISE EXCEPTION 'media sync snapshot is incomplete';
  END IF;

  INSERT INTO portal_read_model.media_item (
    source_asset_id, source_updated_at, event_at, title, caption, object_path,
    mime_type, checksum_sha256, width, height, approved, approved_at
  )
  SELECT
    source_asset_id, source_updated_at, event_at, title, caption, object_path,
    mime_type, checksum_sha256, width, height, true, timezone('utc', now())
  FROM portal_read_model.media_sync_stage
  WHERE sync_run_id = p_sync_run_id
  ON CONFLICT (source_asset_id) DO UPDATE SET
    source_updated_at = EXCLUDED.source_updated_at,
    event_at = EXCLUDED.event_at,
    title = EXCLUDED.title,
    caption = EXCLUDED.caption,
    object_path = EXCLUDED.object_path,
    mime_type = EXCLUDED.mime_type,
    checksum_sha256 = EXCLUDED.checksum_sha256,
    width = EXCLUDED.width,
    height = EXCLUDED.height,
    approved = true,
    approved_at = EXCLUDED.approved_at;

  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  UPDATE portal_read_model.media_item AS existing
  SET approved = false,
      approved_at = NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM portal_read_model.media_sync_stage AS staged
    WHERE staged.sync_run_id = p_sync_run_id
      AND staged.source_asset_id = existing.source_asset_id
  );

  GET DIAGNOSTICS unapproved_count = ROW_COUNT;

  INSERT INTO portal_read_model.sync_status (source_system, last_success_at, event_count)
  VALUES ('immich', timezone('utc', now()), actual_count)
  ON CONFLICT (source_system) DO UPDATE SET
    last_success_at = EXCLUDED.last_success_at,
    event_count = EXCLUDED.event_count;

  DELETE FROM portal_read_model.media_sync_stage
  WHERE sync_run_id = p_sync_run_id;

  RETURN jsonb_build_object('upserted', upserted_count, 'unapproved', unapproved_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_stage_media_batch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_finalize_media_sync(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_stage_media_batch(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_finalize_media_sync(uuid, integer) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'embe-portal-previews',
  'embe-portal-previews',
  false,
  10000000,
  ARRAY['image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON VIEW public.embe_media_item IS
  'Server-only curated media projection without storage locators.';
COMMENT ON VIEW public.embe_media_locator IS
  'Server-only preview locator used only by the authenticated portal proxy.';
COMMENT ON VIEW public.embe_media_source_state IS
  'Server-only publisher state used to avoid downloading and uploading unchanged previews.';
