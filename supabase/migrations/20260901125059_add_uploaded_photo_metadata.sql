ALTER TABLE portal_read_model.photo_upload
  ADD COLUMN latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD COLUMN longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD COLUMN location_name text CHECK (location_name IS NULL OR char_length(location_name) BETWEEN 1 AND 120),
  ADD COLUMN metadata_dirty boolean NOT NULL DEFAULT false,
  ADD COLUMN metadata_claimed_at timestamptz,
  ADD CONSTRAINT photo_upload_coordinate_pair CHECK ((latitude IS NULL) = (longitude IS NULL));

ALTER TABLE portal_read_model.photo_upload FORCE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.embe_create_photo_upload(uuid,text,text,text,bigint,text,timestamptz);
CREATE FUNCTION public.embe_create_photo_upload(
  p_idempotency_key uuid, p_author_role text, p_original_filename text,
  p_mime_type text, p_byte_size bigint, p_caption text, p_captured_at timestamptz,
  p_latitude double precision, p_longitude double precision, p_location_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  upload_id uuid := gen_random_uuid(); extension text; upload_path text;
  result_row portal_read_model.photo_upload%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR p_author_role NOT IN ('father', 'mother')
     OR COALESCE(char_length(btrim(p_original_filename)), 0) NOT BETWEEN 1 AND 180
     OR p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
     OR p_byte_size NOT BETWEEN 1 AND 25000000
     OR char_length(COALESCE(btrim(p_caption), '')) > 180
     OR p_captured_at IS NULL OR p_captured_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_captured_at > timezone('utc', now()) + interval '1 day'
     OR ((p_latitude IS NULL) <> (p_longitude IS NULL))
     OR (p_latitude IS NOT NULL AND p_latitude NOT BETWEEN -90 AND 90)
     OR (p_longitude IS NOT NULL AND p_longitude NOT BETWEEN -180 AND 180)
     OR char_length(COALESCE(btrim(p_location_name), '')) > 120 THEN
    RAISE EXCEPTION 'invalid photo upload request';
  END IF;
  extension := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp' WHEN 'image/heic' THEN 'heic' WHEN 'image/heif' THEN 'heif' END;
  upload_path := format('incoming/%s/%s/%s.%s', to_char(timezone('utc', now()), 'YYYY'),
    to_char(timezone('utc', now()), 'MM'), upload_id, extension);
  INSERT INTO portal_read_model.photo_upload (
    id, idempotency_key, author_role, original_filename, mime_type, byte_size,
    storage_path, caption, captured_at, latitude, longitude, location_name
  ) VALUES (
    upload_id, p_idempotency_key, p_author_role, btrim(p_original_filename), p_mime_type,
    p_byte_size, upload_path, btrim(COALESCE(p_caption, '')), p_captured_at,
    p_latitude, p_longitude, NULLIF(btrim(p_location_name), '')
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO result_row FROM portal_read_model.photo_upload WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('id', result_row.id, 'storage_path', result_row.storage_path, 'status', result_row.status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_photo_upload()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE claimed portal_read_model.photo_upload%ROWTYPE;
BEGIN
  UPDATE portal_read_model.photo_upload
  SET status = 'rejected', claimed_at = NULL, last_error_code = 'worker_timeout'
  WHERE status = 'importing' AND attempts >= 20
    AND claimed_at < timezone('utc', now()) - interval '15 minutes';
  UPDATE portal_read_model.photo_upload AS queue
  SET status = 'importing', attempts = attempts + 1,
      claimed_at = timezone('utc', now()), last_error_code = NULL
  WHERE queue.id = (
    SELECT candidate.id FROM portal_read_model.photo_upload AS candidate
    WHERE ((candidate.status IN ('uploaded', 'failed') AND candidate.next_attempt_at <= timezone('utc', now()))
      OR (candidate.status = 'importing' AND candidate.claimed_at < timezone('utc', now()) - interval '15 minutes'))
      AND candidate.attempts < 20 ORDER BY candidate.created_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) RETURNING queue.* INTO claimed;
  IF claimed.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', claimed.id, 'storage_path', claimed.storage_path, 'mime_type', claimed.mime_type,
    'byte_size', claimed.byte_size, 'caption', claimed.caption, 'captured_at', claimed.captured_at,
    'latitude', claimed.latitude, 'longitude', claimed.longitude, 'location_name', claimed.location_name,
    'original_filename', claimed.original_filename, 'attempts', claimed.attempts
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_update_uploaded_media_metadata(
  p_media_item_id uuid, p_captured_at timestamptz, p_location_name text,
  p_latitude double precision, p_longitude double precision, p_keep_coordinates boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE upload_row portal_read_model.photo_upload%ROWTYPE;
BEGIN
  IF p_media_item_id IS NULL OR p_captured_at IS NULL
     OR p_captured_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_captured_at > timezone('utc', now()) + interval '1 day'
     OR p_keep_coordinates IS NULL OR ((p_latitude IS NULL) <> (p_longitude IS NULL))
     OR (p_latitude IS NOT NULL AND p_latitude NOT BETWEEN -90 AND 90)
     OR (p_longitude IS NOT NULL AND p_longitude NOT BETWEEN -180 AND 180)
     OR char_length(COALESCE(btrim(p_location_name), '')) > 120 THEN
    RAISE EXCEPTION 'invalid uploaded photo metadata';
  END IF;
  SELECT upload.* INTO upload_row
  FROM portal_read_model.photo_upload AS upload
  JOIN portal_read_model.media_item AS media ON media.source_asset_id = upload.immich_asset_id::text
  WHERE media.id = p_media_item_id AND media.approved = true AND upload.status = 'imported';
  IF upload_row.id IS NULL THEN RAISE EXCEPTION 'media metadata is not editable'; END IF;
  UPDATE portal_read_model.photo_upload SET captured_at = p_captured_at,
    location_name = NULLIF(btrim(p_location_name), ''),
    latitude = CASE WHEN p_keep_coordinates THEN latitude ELSE p_latitude END,
    longitude = CASE WHEN p_keep_coordinates THEN longitude ELSE p_longitude END,
    metadata_dirty = true, metadata_claimed_at = NULL WHERE id = upload_row.id;
  UPDATE portal_read_model.media_item SET event_at = p_captured_at,
    place_city = NULLIF(btrim(p_location_name), '') WHERE id = p_media_item_id;
  RETURN jsonb_build_object('event_at', p_captured_at, 'place_city', NULLIF(btrim(p_location_name), ''));
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_photo_metadata_update()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE claimed portal_read_model.photo_upload%ROWTYPE;
BEGIN
  UPDATE portal_read_model.photo_upload SET metadata_claimed_at = NULL
  WHERE metadata_dirty = true AND metadata_claimed_at < timezone('utc', now()) - interval '15 minutes';
  UPDATE portal_read_model.photo_upload AS upload SET metadata_claimed_at = timezone('utc', now())
  WHERE upload.id = (
    SELECT candidate.id FROM portal_read_model.photo_upload AS candidate
    WHERE candidate.status = 'imported' AND candidate.metadata_dirty = true AND candidate.metadata_claimed_at IS NULL
    ORDER BY candidate.updated_at FOR UPDATE SKIP LOCKED LIMIT 1
  ) RETURNING upload.* INTO claimed;
  IF claimed.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', claimed.id, 'immich_asset_id', claimed.immich_asset_id,
    'captured_at', claimed.captured_at, 'latitude', claimed.latitude, 'longitude', claimed.longitude);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_finish_photo_metadata_update(p_upload_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.photo_upload SET metadata_dirty = false, metadata_claimed_at = NULL
  WHERE id = p_upload_id AND metadata_dirty = true AND metadata_claimed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'photo metadata update is not claimed'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_photo_metadata_update(p_upload_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.photo_upload SET metadata_claimed_at = NULL
  WHERE id = p_upload_id AND metadata_dirty = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'photo metadata update is not pending'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION portal_read_model.apply_uploaded_photo_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE upload_row portal_read_model.photo_upload%ROWTYPE;
BEGIN
  SELECT upload.* INTO upload_row FROM portal_read_model.photo_upload AS upload
  WHERE upload.immich_asset_id::text = NEW.source_asset_id AND upload.status = 'imported' LIMIT 1;
  IF upload_row.id IS NOT NULL THEN
    NEW.event_at := upload_row.captured_at;
    NEW.place_city := COALESCE(upload_row.location_name, NEW.place_city);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER media_item_apply_uploaded_metadata
BEFORE INSERT OR UPDATE ON portal_read_model.media_item
FOR EACH ROW EXECUTE FUNCTION portal_read_model.apply_uploaded_photo_metadata();

CREATE OR REPLACE VIEW public.embe_media_item WITH (security_invoker = true) AS
SELECT item.id, item.event_at, item.title, item.caption, item.mime_type,
       item.width, item.height, item.updated_at, item.place_city, item.place_region, item.place_country,
       COALESCE((SELECT jsonb_object_agg(reaction.emoji, reaction.total) FROM (
         SELECT media_reaction.emoji, count(*)::integer AS total
         FROM portal_read_model.media_reaction WHERE media_reaction.media_item_id = item.id
         GROUP BY media_reaction.emoji
       ) AS reaction), '{}'::jsonb) AS reactions,
       item.album_key, item.album_title, item.album_order,
       EXISTS (SELECT 1 FROM portal_read_model.photo_upload AS upload
         WHERE upload.immich_asset_id::text = item.source_asset_id AND upload.status = 'imported') AS editable
FROM portal_read_model.media_item AS item WHERE item.approved = true;

REVOKE ALL ON TABLE public.embe_media_item FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_media_item TO service_role;
REVOKE ALL ON FUNCTION public.embe_create_photo_upload(uuid,text,text,text,bigint,text,timestamptz,double precision,double precision,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_update_uploaded_media_metadata(uuid,timestamptz,text,double precision,double precision,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_photo_metadata_update() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_finish_photo_metadata_update(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_photo_metadata_update(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_photo_upload(uuid,text,text,text,bigint,text,timestamptz,double precision,double precision,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_update_uploaded_media_metadata(uuid,timestamptz,text,double precision,double precision,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_photo_metadata_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_finish_photo_metadata_update(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_photo_metadata_update(uuid) TO service_role;

;
