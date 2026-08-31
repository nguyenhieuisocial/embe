-- Preserve family-facing album chapters derived from the read-only C:\Anh
-- hierarchy. Raw filesystem paths never leave the local media publisher.

ALTER TABLE portal_read_model.media_item
  ADD COLUMN album_key text NOT NULL DEFAULT 'gia-dinh'
    CHECK (album_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(album_key) <= 64),
  ADD COLUMN album_title text NOT NULL DEFAULT 'Khoảnh khắc gia đình'
    CHECK (char_length(album_title) BETWEEN 1 AND 120),
  ADD COLUMN album_order integer NOT NULL DEFAULT 90
    CHECK (album_order BETWEEN 0 AND 999);

ALTER TABLE portal_read_model.media_sync_stage
  ADD COLUMN album_key text NOT NULL DEFAULT 'gia-dinh',
  ADD COLUMN album_title text NOT NULL DEFAULT 'Khoảnh khắc gia đình',
  ADD COLUMN album_order integer NOT NULL DEFAULT 90;

CREATE INDEX media_item_album_event_idx
  ON portal_read_model.media_item (album_order, album_key, event_at DESC)
  WHERE approved = true;

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
       OR COALESCE(char_length(item->>'place_city'), 0) > 80
       OR COALESCE(char_length(item->>'place_region'), 0) > 80
       OR COALESCE(char_length(item->>'place_country'), 0) > 80
       OR COALESCE(item->>'album_key', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       OR COALESCE(char_length(item->>'album_key'), 0) > 64
       OR COALESCE(char_length(item->>'album_title'), 0) NOT BETWEEN 1 AND 120
       OR COALESCE((item->>'album_order')::integer, -1) NOT BETWEEN 0 AND 999
  ) THEN
    RAISE EXCEPTION 'media item failed the publication contract';
  END IF;

  DELETE FROM portal_read_model.media_sync_stage
  WHERE created_at < timezone('utc', now()) - interval '1 day';

  INSERT INTO portal_read_model.media_sync_stage (
    sync_run_id, source_asset_id, source_updated_at, event_at, title, caption, object_path,
    mime_type, checksum_sha256, width, height, place_city, place_region, place_country,
    album_key, album_title, album_order
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
    NULLIF(item->>'height', '')::integer,
    NULLIF(item->>'place_city', ''),
    NULLIF(item->>'place_region', ''),
    NULLIF(item->>'place_country', ''),
    item->>'album_key',
    item->>'album_title',
    (item->>'album_order')::integer
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
    height = EXCLUDED.height,
    place_city = EXCLUDED.place_city,
    place_region = EXCLUDED.place_region,
    place_country = EXCLUDED.place_country,
    album_key = EXCLUDED.album_key,
    album_title = EXCLUDED.album_title,
    album_order = EXCLUDED.album_order;

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
    mime_type, checksum_sha256, width, height, place_city, place_region, place_country,
    album_key, album_title, album_order, approved, approved_at
  )
  SELECT
    source_asset_id, source_updated_at, event_at, title, caption, object_path,
    mime_type, checksum_sha256, width, height, place_city, place_region, place_country,
    album_key, album_title, album_order, true, timezone('utc', now())
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
    place_city = EXCLUDED.place_city,
    place_region = EXCLUDED.place_region,
    place_country = EXCLUDED.place_country,
    album_key = EXCLUDED.album_key,
    album_title = EXCLUDED.album_title,
    album_order = EXCLUDED.album_order,
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

CREATE OR REPLACE VIEW public.embe_media_item
WITH (security_invoker = true)
AS
SELECT item.id, item.event_at, item.title, item.caption, item.mime_type,
       item.width, item.height, item.updated_at,
       item.place_city, item.place_region, item.place_country,
       COALESCE((
         SELECT jsonb_object_agg(reaction.emoji, reaction.total)
         FROM (
           SELECT media_reaction.emoji, count(*)::integer AS total
           FROM portal_read_model.media_reaction
           WHERE media_reaction.media_item_id = item.id
           GROUP BY media_reaction.emoji
         ) AS reaction
       ), '{}'::jsonb) AS reactions,
       item.album_key, item.album_title, item.album_order
FROM portal_read_model.media_item AS item
WHERE item.approved = true;

REVOKE ALL ON TABLE public.embe_media_item FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_media_item TO service_role;

COMMENT ON VIEW public.embe_media_item IS
  'Server-only curated media projection with semantic album chapters; no source paths or storage locators.';
