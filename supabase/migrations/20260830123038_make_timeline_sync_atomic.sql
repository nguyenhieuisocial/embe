CREATE TABLE portal_read_model.timeline_sync_stage (
  sync_run_id uuid NOT NULL,
  source_event_id text NOT NULL,
  event_at timestamptz NOT NULL,
  portal_event_type text NOT NULL,
  title text NOT NULL,
  caption text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT timeline_sync_stage_pkey PRIMARY KEY (sync_run_id, source_event_id)
);

CREATE INDEX timeline_sync_stage_created_at_idx
  ON portal_read_model.timeline_sync_stage (created_at);

CREATE TABLE portal_read_model.sync_status (
  source_system text PRIMARY KEY,
  last_success_at timestamptz NOT NULL,
  event_count integer NOT NULL CHECK (event_count >= 0),
  CONSTRAINT sync_status_source_check CHECK (source_system = 'memos')
);

ALTER TABLE portal_read_model.timeline_sync_stage ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.timeline_sync_stage FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.sync_status FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.timeline_sync_stage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.sync_status FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.timeline_sync_stage TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.sync_status TO service_role;

CREATE OR REPLACE VIEW public.embe_portal_sync_status
WITH (security_invoker = true)
AS
SELECT last_success_at, event_count
FROM portal_read_model.sync_status
WHERE source_system = 'memos';

REVOKE ALL ON TABLE public.embe_portal_sync_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_portal_sync_status TO service_role;

CREATE OR REPLACE FUNCTION public.embe_stage_timeline_batch(
  p_sync_run_id uuid,
  p_events jsonb
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
     OR jsonb_typeof(p_events) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_events) > 500 THEN
    RAISE EXCEPTION 'invalid timeline sync batch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_events) AS item
    WHERE item->>'source_system' IS DISTINCT FROM 'memos'
       OR item->>'child_id' IS DISTINCT FROM 'embe-family'
       OR COALESCE(item->>'portal_event_type', '') NOT IN ('journal', 'milestone')
       OR COALESCE(length(item->>'source_event_id'), 0) NOT BETWEEN 1 AND 128
       OR COALESCE(length(item->>'title'), 0) NOT BETWEEN 1 AND 120
       OR COALESCE(length(item->>'caption'), 0) NOT BETWEEN 1 AND 1000
       OR item->>'album_cover_url' IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'portal event failed the publication contract';
  END IF;

  DELETE FROM portal_read_model.timeline_sync_stage
  WHERE created_at < timezone('utc', now()) - interval '1 day';

  INSERT INTO portal_read_model.timeline_sync_stage (
    sync_run_id,
    source_event_id,
    event_at,
    portal_event_type,
    title,
    caption
  )
  SELECT
    p_sync_run_id,
    item->>'source_event_id',
    (item->>'event_at')::timestamptz,
    item->>'portal_event_type',
    item->>'title',
    item->>'caption'
  FROM jsonb_array_elements(p_events) AS item
  ON CONFLICT (sync_run_id, source_event_id) DO UPDATE SET
    event_at = EXCLUDED.event_at,
    portal_event_type = EXCLUDED.portal_event_type,
    title = EXCLUDED.title,
    caption = EXCLUDED.caption;

  GET DIAGNOSTICS staged_count = ROW_COUNT;
  RETURN jsonb_build_object('staged', staged_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_finalize_timeline_sync(
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
  FROM portal_read_model.timeline_sync_stage
  WHERE sync_run_id = p_sync_run_id;

  IF p_sync_run_id IS NULL
     OR p_expected_count IS NULL
     OR p_expected_count NOT BETWEEN 0 AND 10000
     OR actual_count <> p_expected_count THEN
    RAISE EXCEPTION 'timeline sync snapshot is incomplete';
  END IF;

  INSERT INTO portal_read_model.timeline_event (
    source_system,
    source_event_id,
    child_id,
    event_at,
    portal_event_type,
    title,
    caption,
    album_cover_url,
    portal_role,
    approved,
    approved_at
  )
  SELECT
    'memos',
    source_event_id,
    'embe-family',
    event_at,
    portal_event_type,
    title,
    caption,
    NULL,
    'family',
    true,
    event_at
  FROM portal_read_model.timeline_sync_stage
  WHERE sync_run_id = p_sync_run_id
  ON CONFLICT (source_event_id) DO UPDATE SET
    event_at = EXCLUDED.event_at,
    portal_event_type = EXCLUDED.portal_event_type,
    title = EXCLUDED.title,
    caption = EXCLUDED.caption,
    album_cover_url = NULL,
    portal_role = 'family',
    approved = true,
    approved_at = EXCLUDED.approved_at;

  GET DIAGNOSTICS upserted_count = ROW_COUNT;

  UPDATE portal_read_model.timeline_event AS existing
  SET approved = false,
      approved_at = NULL
  WHERE existing.source_system = 'memos'
    AND NOT EXISTS (
      SELECT 1
      FROM portal_read_model.timeline_sync_stage AS staged
      WHERE staged.sync_run_id = p_sync_run_id
        AND staged.source_event_id = existing.source_event_id
    );

  GET DIAGNOSTICS unapproved_count = ROW_COUNT;

  INSERT INTO portal_read_model.sync_status (source_system, last_success_at, event_count)
  VALUES ('memos', timezone('utc', now()), actual_count)
  ON CONFLICT (source_system) DO UPDATE SET
    last_success_at = EXCLUDED.last_success_at,
    event_count = EXCLUDED.event_count;

  DELETE FROM portal_read_model.timeline_sync_stage
  WHERE sync_run_id = p_sync_run_id;

  RETURN jsonb_build_object(
    'upserted', upserted_count,
    'unapproved', unapproved_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_stage_timeline_batch(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_finalize_timeline_sync(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_stage_timeline_batch(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_finalize_timeline_sync(uuid, integer) TO service_role;

DROP FUNCTION public.embe_sync_timeline(jsonb);

COMMENT ON TABLE portal_read_model.timeline_sync_stage IS
  'Private staging area that makes multi-batch Memos publication atomic.';
COMMENT ON VIEW public.embe_portal_sync_status IS
  'Server-only freshness signal for the EmBe family timeline.';
