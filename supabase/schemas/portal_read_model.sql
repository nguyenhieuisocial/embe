-- Curated timeline read-model for Supabase.
-- This schema is one-way: only approved rows are exposed for portal/family reads.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists portal_read_model;

-- Canonical table for portal read-model entries.
create table if not exists portal_read_model.timeline_event (
  id uuid primary key default gen_random_uuid(),
  source_system text not null check (source_system in ('memos', 'babybuddy', 'immich')),
  source_event_id text not null unique,
  child_id text not null,
  event_at timestamptz not null,
  portal_event_type text not null,
  title text not null,
  caption text not null,
  album_cover_url text,
  portal_role text not null default 'family',
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table portal_read_model.timeline_event is
  'Curated read-model only; no medical notes, GPS, secret tokens, or raw media identifiers.';

comment on column portal_read_model.timeline_event.caption is
  'Sanitized and rewritten for family publication.';

-- Keep data changes auditable and deterministic.
create or replace function portal_read_model.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists timeline_event_set_updated_at on portal_read_model.timeline_event;
create trigger timeline_event_set_updated_at
before update on portal_read_model.timeline_event
for each row
execute function portal_read_model.touch_updated_at();

-- Partial index for common portal query pattern.
create index if not exists timeline_event_approved_at_idx
on portal_read_model.timeline_event (approved, event_at desc)
where approved = true;

-- Read API is only through this security-invoker view.
create or replace view portal_read_model.timeline_event_public
with (security_invoker = true) as
select
  id,
  child_id,
  event_at,
  portal_event_type,
  title,
  caption,
  album_cover_url,
  approved_at
from portal_read_model.timeline_event;

-- Grant view/table read privileges for API roles.
grant usage on schema portal_read_model to anon, authenticated;
grant select on portal_read_model.timeline_event to anon, authenticated;
grant select on portal_read_model.timeline_event_public to anon, authenticated;

-- Disallow direct writes at the object privilege layer.
revoke insert, update, delete on portal_read_model.timeline_event from anon, authenticated;

-- Enable row-level controls.
alter table portal_read_model.timeline_event enable row level security;
alter table portal_read_model.timeline_event force row level security;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'portal_read_model' and tablename = 'timeline_event') then
    drop policy if exists anon_timeline_event_zero_rows on portal_read_model.timeline_event;
    drop policy if exists family_timeline_event_approved_select on portal_read_model.timeline_event;
    drop policy if exists family_timeline_event_no_insert on portal_read_model.timeline_event;
    drop policy if exists family_timeline_event_no_update on portal_read_model.timeline_event;
    drop policy if exists family_timeline_event_no_delete on portal_read_model.timeline_event;
  end if;
end;
$$;

-- anonymous: always false -> 0 rows
create policy anon_timeline_event_zero_rows
on portal_read_model.timeline_event
for select
to anon
using (false);

-- Authenticated is not sufficient by itself: only JWTs marked by the server in
-- immutable app_metadata as family readers can see approved rows.
create policy family_timeline_event_approved_select
on portal_read_model.timeline_event
for select
to authenticated
using (
  approved = true
  and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'portal_role'), '') = 'family'
);

-- clients cannot mutate
create policy family_timeline_event_no_insert
on portal_read_model.timeline_event
for insert
to anon, authenticated
with check (false);

create policy family_timeline_event_no_update
on portal_read_model.timeline_event
for update
to anon, authenticated
using (false)
with check (false);

create policy family_timeline_event_no_delete
on portal_read_model.timeline_event
for delete
to anon, authenticated
using (false);

GRANT USAGE ON SCHEMA portal_read_model TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.timeline_event TO service_role;

CREATE OR REPLACE VIEW public.embe_timeline_event
WITH (security_invoker = true)
AS
SELECT
  id,
  event_at,
  portal_event_type,
  title,
  caption,
  album_cover_url
FROM portal_read_model.timeline_event
WHERE approved = true
  AND portal_role = 'family';

REVOKE ALL ON TABLE public.embe_timeline_event FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_timeline_event TO service_role;

CREATE OR REPLACE FUNCTION public.embe_sync_timeline(p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  upserted_count integer := 0;
  unapproved_count integer := 0;
BEGIN
  IF jsonb_typeof(p_events) <> 'array' OR jsonb_array_length(p_events) > 500 THEN
    RAISE EXCEPTION 'p_events must be an array containing at most 500 records';
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
    item->>'source_event_id',
    'embe-family',
    (item->>'event_at')::timestamptz,
    item->>'portal_event_type',
    item->>'title',
    item->>'caption',
    NULL,
    'family',
    true,
    (item->>'event_at')::timestamptz
  FROM jsonb_array_elements(p_events) AS item
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
      FROM jsonb_array_elements(p_events) AS item
      WHERE item->>'source_event_id' = existing.source_event_id
    );

  GET DIAGNOSTICS unapproved_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'upserted', upserted_count,
    'unapproved', unapproved_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_sync_timeline(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_sync_timeline(jsonb) TO service_role;

COMMENT ON VIEW public.embe_timeline_event IS
  'Server-only EmBe timeline projection. Requires a Supabase secret key.';
COMMENT ON FUNCTION public.embe_sync_timeline(jsonb) IS
  'Server-only bounded sync for explicitly approved Memos events.';

-- Atomic multi-batch publication and a server-only freshness signal.
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

CREATE POLICY timeline_sync_stage_deny_clients
ON portal_read_model.timeline_sync_stage
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY sync_status_deny_clients
ON portal_read_model.sync_status
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
-- Private, server-only hand-off from the family portal to local Memos.
-- Journal text is deleted from Supabase immediately after a successful import.

CREATE TABLE portal_read_model.journal_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  content text,
  author_role text NOT NULL CHECK (author_role IN ('mother', 'father')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'imported', 'dead_letter')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz,
  imported_at timestamptz,
  last_error_code text,
  CONSTRAINT journal_inbox_content_lifecycle_check CHECK (
    (status = 'imported' AND content IS NULL)
    OR
    (status <> 'imported' AND char_length(btrim(content)) BETWEEN 1 AND 1000)
  )
);

COMMENT ON TABLE portal_read_model.journal_inbox IS
  'Temporary server-only journal queue. Never store medical, address, credential or raw-media data.';
COMMENT ON COLUMN portal_read_model.journal_inbox.content IS
  'Family narrative only; erased as soon as local Memos confirms import.';

CREATE INDEX journal_inbox_work_idx
  ON portal_read_model.journal_inbox (status, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX journal_inbox_imported_at_idx
  ON portal_read_model.journal_inbox (imported_at)
  WHERE status = 'imported';

ALTER TABLE portal_read_model.journal_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.journal_inbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.journal_inbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.journal_inbox TO service_role;

CREATE POLICY journal_inbox_deny_clients
ON portal_read_model.journal_inbox
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE OR REPLACE VIEW public.embe_pending_journal
WITH (security_invoker = true)
AS
SELECT
  id,
  created_at,
  content,
  author_role,
  status
FROM portal_read_model.journal_inbox
WHERE status IN ('pending', 'processing')
  AND content IS NOT NULL;

REVOKE ALL ON TABLE public.embe_pending_journal FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.embe_pending_journal TO service_role;

COMMENT ON VIEW public.embe_pending_journal IS
  'Server-only pending journal projection for immediate family feedback while Memos import is in progress.';

CREATE OR REPLACE FUNCTION public.embe_export_journal_data()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'published_entries',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'event_at', event.event_at,
          'event_type', event.portal_event_type,
          'title', event.title,
          'caption', event.caption
        )
        ORDER BY event.event_at, event.id
      )
      FROM portal_read_model.timeline_event AS event
      WHERE event.source_system = 'memos'
        AND event.approved = true
        AND event.portal_role = 'family'
    ), '[]'::jsonb),
    'pending_entries',
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', inbox.id,
          'author_role', inbox.author_role,
          'status', inbox.status,
          'created_at', inbox.created_at,
          'content', inbox.content
        )
        ORDER BY inbox.created_at, inbox.id
      )
      FROM portal_read_model.journal_inbox AS inbox
      WHERE inbox.status IN ('pending', 'processing', 'dead_letter')
        AND inbox.content IS NOT NULL
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.embe_export_journal_data()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_journal_data()
  TO service_role;

COMMENT ON FUNCTION public.embe_export_journal_data() IS
  'Server-only portable export of published Memos journal text and recoverable queue entries.';

CREATE OR REPLACE FUNCTION public.embe_submit_journal(
  p_idempotency_key uuid,
  p_content text,
  p_author_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  saved_id uuid;
  clean_content text := btrim(p_content);
BEGIN
  IF p_idempotency_key IS NULL
     OR p_author_role NOT IN ('mother', 'father')
     OR char_length(clean_content) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid journal submission';
  END IF;

  INSERT INTO portal_read_model.journal_inbox (idempotency_key, content, author_role)
  VALUES (p_idempotency_key, clean_content, p_author_role)
  ON CONFLICT (idempotency_key) DO UPDATE
  SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO saved_id;

  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_journal_entries(p_limit integer DEFAULT 10)
RETURNS TABLE (id uuid, content text, author_role text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'invalid journal claim limit';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT queue.id
    FROM portal_read_model.journal_inbox AS queue
    WHERE queue.attempts < 5
      AND (
        queue.status = 'pending'
        OR (
          queue.status = 'processing'
          AND queue.claimed_at < timezone('utc', now()) - interval '15 minutes'
        )
      )
    ORDER BY queue.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE portal_read_model.journal_inbox AS queue
  SET status = 'processing',
      attempts = queue.attempts + 1,
      claimed_at = timezone('utc', now()),
      last_error_code = NULL
  FROM candidates
  WHERE queue.id = candidates.id
  RETURNING queue.id, queue.content, queue.author_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_journal_entry(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  UPDATE portal_read_model.journal_inbox
  SET status = 'imported',
      content = NULL,
      imported_at = timezone('utc', now()),
      claimed_at = NULL,
      last_error_code = NULL
  WHERE id = p_id AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'journal entry is not processing';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_journal_entry(
  p_id uuid,
  p_error_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_error_code NOT IN ('memos_unavailable', 'invalid_payload') THEN
    RAISE EXCEPTION 'invalid journal failure code';
  END IF;

  UPDATE portal_read_model.journal_inbox
  SET status = CASE WHEN attempts >= 5 THEN 'dead_letter' ELSE 'pending' END,
      claimed_at = NULL,
      last_error_code = p_error_code
  WHERE id = p_id AND status = 'processing';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'journal entry is not processing';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_submit_journal(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_journal_entries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_journal_entry(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_journal_entry(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_submit_journal(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_journal_entries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_journal_entry(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_journal_entry(uuid, text) TO service_role;

COMMENT ON FUNCTION public.embe_submit_journal(uuid, text, text) IS
  'Server-only, idempotent enqueue for short family journal notes.';
COMMENT ON FUNCTION public.embe_claim_journal_entries(integer) IS
  'Server-only bounded claim using SKIP LOCKED and stale-claim recovery.';
-- Safe operational visibility for the local health gate; no journal content leaves the queue.
CREATE OR REPLACE FUNCTION public.embe_journal_queue_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'dead_letters', count(*) FILTER (WHERE status = 'dead_letter')
  )
  FROM portal_read_model.journal_inbox;
$function$;

REVOKE ALL ON FUNCTION public.embe_journal_queue_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_journal_queue_status() TO service_role;

COMMENT ON FUNCTION public.embe_journal_queue_status() IS
  'Server-only PII-free journal queue counts for the local health gate.';

-- Private, curated Immich previews for the family portal.
-- Keep this section aligned with 20260831022414_add_private_media_previews.sql.
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
  place_city text CHECK (place_city IS NULL OR char_length(place_city) BETWEEN 1 AND 80),
  place_region text CHECK (place_region IS NULL OR char_length(place_region) BETWEEN 1 AND 80),
  place_country text CHECK (place_country IS NULL OR char_length(place_country) BETWEEN 1 AND 80),
  album_key text NOT NULL DEFAULT 'gia-dinh'
    CHECK (album_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(album_key) <= 64),
  album_title text NOT NULL DEFAULT 'Khoảnh khắc gia đình'
    CHECK (char_length(album_title) BETWEEN 1 AND 120),
  album_order integer NOT NULL DEFAULT 90 CHECK (album_order BETWEEN 0 AND 999),
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

CREATE INDEX media_item_album_event_idx
  ON portal_read_model.media_item (album_order, album_key, event_at DESC)
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
  place_city text,
  place_region text,
  place_country text,
  album_key text NOT NULL DEFAULT 'gia-dinh',
  album_title text NOT NULL DEFAULT 'Khoảnh khắc gia đình',
  album_order integer NOT NULL DEFAULT 90,
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
SELECT id, event_at, title, caption, mime_type, width, height, updated_at,
       place_city, place_region, place_country
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
  claimed_at timestamptz,
  immich_asset_id uuid,
  checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,48}$'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  uploaded_at timestamptz,
  imported_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT photo_upload_claim_shape CHECK (
    (status = 'importing') = (claimed_at IS NOT NULL)
  )
);

COMMENT ON TABLE portal_read_model.photo_upload IS
  'Private server-only upload queue. Provider credentials and signed URLs are never stored here.';

CREATE INDEX photo_upload_worker_idx
  ON portal_read_model.photo_upload (status, next_attempt_at, claimed_at, created_at)
  WHERE status IN ('uploaded', 'failed', 'importing');

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



-- Private cross-device pregnancy preferences and daily checklist state.
CREATE TABLE portal_read_model.pregnancy_profile (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  due_date date CHECK (due_date IS NULL OR due_date BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE portal_read_model.pregnancy_day (
  day date PRIMARY KEY CHECK (day BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE portal_read_model.pregnancy_check (
  day date NOT NULL REFERENCES portal_read_model.pregnancy_day(day) ON DELETE CASCADE,
  task_id text NOT NULL CHECK (task_id IN (
    'supplements', 'breakfast', 'lunch', 'dinner', 'varied-meals',
    'fruit-veg', 'protein', 'food-safety', 'water-rest', 'no-alcohol',
    'movement', 'rest', 'notes'
  )),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (day, task_id)
);

COMMENT ON TABLE portal_read_model.pregnancy_profile IS
  'Private singleton pregnancy preference; server-only and never exposed directly to a browser.';
COMMENT ON TABLE portal_read_model.pregnancy_day IS
  'Marks an initialized daily checklist, including a deliberately empty day.';
COMMENT ON TABLE portal_read_model.pregnancy_check IS
  'Private completed task identifiers only; no symptom, diagnosis, medication name or free text.';

ALTER TABLE portal_read_model.pregnancy_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_day FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_check FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.pregnancy_profile FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_day FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_check FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_profile TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_day TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_check TO service_role;

CREATE POLICY pregnancy_profile_deny_clients
ON portal_read_model.pregnancy_profile FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);
CREATE POLICY pregnancy_day_deny_clients
ON portal_read_model.pregnancy_day FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);
CREATE POLICY pregnancy_check_deny_clients
ON portal_read_model.pregnancy_check FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_state(p_day date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_day IS NULL OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31' THEN
    RAISE EXCEPTION 'invalid pregnancy state day';
  END IF;

  RETURN jsonb_build_object(
    'due_date', (
      SELECT to_char(profile.due_date, 'YYYY-MM-DD')
      FROM portal_read_model.pregnancy_profile AS profile
      WHERE profile.singleton = true
    ),
    'completed', COALESCE((
      SELECT jsonb_agg(check_state.task_id ORDER BY check_state.task_id)
      FROM portal_read_model.pregnancy_check AS check_state
      WHERE check_state.day = p_day
    ), '[]'::jsonb),
    'has_profile', EXISTS (
      SELECT 1 FROM portal_read_model.pregnancy_profile AS profile
      WHERE profile.singleton = true
    ),
    'has_day_state', EXISTS (
      SELECT 1 FROM portal_read_model.pregnancy_day AS day_state
      WHERE day_state.day = p_day
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_state(
  p_day date,
  p_due_date date,
  p_completed text[],
  p_write_due_date boolean,
  p_write_completed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_day IS NULL
     OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_write_due_date IS NULL
     OR p_write_completed IS NULL
     OR (NOT p_write_due_date AND NOT p_write_completed)
     OR (p_write_due_date AND p_due_date IS NOT NULL AND p_due_date NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31')
     OR (p_write_completed AND p_completed IS NULL) THEN
    RAISE EXCEPTION 'invalid pregnancy state';
  END IF;

  IF p_write_completed AND (
    NOT (p_completed <@ ARRAY[
      'supplements', 'breakfast', 'lunch', 'dinner', 'varied-meals',
      'fruit-veg', 'protein', 'food-safety', 'water-rest', 'no-alcohol',
      'movement', 'rest', 'notes'
    ]::text[])
    OR cardinality(p_completed) <> (
      SELECT count(DISTINCT task_id)
      FROM unnest(p_completed) AS tasks(task_id)
    )
  ) THEN
    RAISE EXCEPTION 'invalid pregnancy checklist';
  END IF;

  IF p_write_due_date THEN
    INSERT INTO portal_read_model.pregnancy_profile (singleton, due_date, updated_at)
    VALUES (true, p_due_date, timezone('utc', now()))
    ON CONFLICT (singleton) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        updated_at = EXCLUDED.updated_at;
  END IF;

  IF p_write_completed THEN
    INSERT INTO portal_read_model.pregnancy_day (day, updated_at)
    VALUES (p_day, timezone('utc', now()))
    ON CONFLICT (day) DO UPDATE SET updated_at = EXCLUDED.updated_at;

    DELETE FROM portal_read_model.pregnancy_check AS check_state
    WHERE check_state.day = p_day;

    INSERT INTO portal_read_model.pregnancy_check (day, task_id, updated_at)
    SELECT p_day, task_id, timezone('utc', now())
    FROM unnest(p_completed) AS task_id;
  END IF;

  RETURN public.embe_get_pregnancy_state(p_day);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_state(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_state(date, date, text[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_state(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_state(date, date, text[], boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.embe_get_pregnancy_state(date) IS
  'Server-only read of a bounded pregnancy preference and daily checklist snapshot.';
COMMENT ON FUNCTION public.embe_save_pregnancy_state(date, date, text[], boolean, boolean) IS
  'Server-only atomic last-write-wins snapshot used by the authenticated family Portal.';
CREATE TABLE portal_read_model.pregnancy_health (
  day date PRIMARY KEY REFERENCES portal_read_model.pregnancy_day(day) ON DELETE CASCADE,
  weight_kg numeric(5,2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 25 AND 300),
  systolic integer CHECK (systolic IS NULL OR systolic BETWEEN 60 AND 250),
  diastolic integer CHECK (diastolic IS NULL OR diastolic BETWEEN 30 AND 160),
  sleep_minutes integer CHECK (sleep_minutes IS NULL OR sleep_minutes BETWEEN 0 AND 1440),
  water_glasses integer CHECK (water_glasses IS NULL OR water_glasses BETWEEN 0 AND 30),
  movement_minutes integer CHECK (movement_minutes IS NULL OR movement_minutes BETWEEN 0 AND 600),
  wellbeing integer CHECK (wellbeing IS NULL OR wellbeing BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE portal_read_model.pregnancy_health IS
  'Private maternal measurements entered by the family; no diagnosis, free text or inferred medical targets.';

ALTER TABLE portal_read_model.pregnancy_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_health FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.pregnancy_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_health TO service_role;

CREATE POLICY pregnancy_health_deny_clients
ON portal_read_model.pregnancy_health FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_health_history(
  p_end_day date,
  p_days integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF p_end_day IS NULL
     OR p_end_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_days NOT IN (7, 28, 90) THEN
    RAISE EXCEPTION 'invalid pregnancy health history request';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'day', to_char(series.day, 'YYYY-MM-DD'),
      'weight_kg', health.weight_kg,
      'systolic', health.systolic,
      'diastolic', health.diastolic,
      'sleep_minutes', health.sleep_minutes,
      'water_glasses', health.water_glasses,
      'movement_minutes', health.movement_minutes,
      'wellbeing', health.wellbeing,
      'checklist_percent', round(
        100.0 * (
          SELECT count(*)
          FROM portal_read_model.pregnancy_check AS check_state
          WHERE check_state.day = series.day
        ) / 13
      )::integer
    ) ORDER BY series.day
  ), '[]'::jsonb)
  INTO result
  FROM generate_series(
    p_end_day - (p_days - 1),
    p_end_day,
    interval '1 day'
  ) AS series(day)
  LEFT JOIN portal_read_model.pregnancy_health AS health
    ON health.day = series.day;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_health(
  p_day date,
  p_weight_kg numeric,
  p_systolic integer,
  p_diastolic integer,
  p_sleep_minutes integer,
  p_water_glasses integer,
  p_movement_minutes integer,
  p_wellbeing integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF p_day IS NULL
     OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR (p_weight_kg IS NOT NULL AND p_weight_kg NOT BETWEEN 25 AND 300)
     OR (p_systolic IS NOT NULL AND p_systolic NOT BETWEEN 60 AND 250)
     OR (p_diastolic IS NOT NULL AND p_diastolic NOT BETWEEN 30 AND 160)
     OR (p_sleep_minutes IS NOT NULL AND p_sleep_minutes NOT BETWEEN 0 AND 1440)
     OR (p_water_glasses IS NOT NULL AND p_water_glasses NOT BETWEEN 0 AND 30)
     OR (p_movement_minutes IS NOT NULL AND p_movement_minutes NOT BETWEEN 0 AND 600)
     OR (p_wellbeing IS NOT NULL AND p_wellbeing NOT BETWEEN 1 AND 5) THEN
    RAISE EXCEPTION 'invalid pregnancy health snapshot';
  END IF;

  INSERT INTO portal_read_model.pregnancy_day (day, updated_at)
  VALUES (p_day, timezone('utc', now()))
  ON CONFLICT (day) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  IF p_weight_kg IS NULL
     AND p_systolic IS NULL
     AND p_diastolic IS NULL
     AND p_sleep_minutes IS NULL
     AND p_water_glasses IS NULL
     AND p_movement_minutes IS NULL
     AND p_wellbeing IS NULL THEN
    DELETE FROM portal_read_model.pregnancy_health AS health WHERE health.day = p_day;
  ELSE
    INSERT INTO portal_read_model.pregnancy_health (
      day, weight_kg, systolic, diastolic, sleep_minutes,
      water_glasses, movement_minutes, wellbeing, updated_at
    )
    VALUES (
      p_day, p_weight_kg, p_systolic, p_diastolic, p_sleep_minutes,
      p_water_glasses, p_movement_minutes, p_wellbeing, timezone('utc', now())
    )
    ON CONFLICT (day) DO UPDATE SET
      weight_kg = EXCLUDED.weight_kg,
      systolic = EXCLUDED.systolic,
      diastolic = EXCLUDED.diastolic,
      sleep_minutes = EXCLUDED.sleep_minutes,
      water_glasses = EXCLUDED.water_glasses,
      movement_minutes = EXCLUDED.movement_minutes,
      wellbeing = EXCLUDED.wellbeing,
      updated_at = EXCLUDED.updated_at;
  END IF;

  SELECT jsonb_build_object(
    'day', to_char(p_day, 'YYYY-MM-DD'),
    'weight_kg', health.weight_kg,
    'systolic', health.systolic,
    'diastolic', health.diastolic,
    'sleep_minutes', health.sleep_minutes,
    'water_glasses', health.water_glasses,
    'movement_minutes', health.movement_minutes,
    'wellbeing', health.wellbeing,
    'checklist_percent', round(
      100.0 * (
        SELECT count(*)
        FROM portal_read_model.pregnancy_check AS check_state
        WHERE check_state.day = p_day
      ) / 13
    )::integer
  )
  INTO result
  FROM (SELECT 1) AS singleton
  LEFT JOIN portal_read_model.pregnancy_health AS health ON health.day = p_day;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_health_history(date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_health(date, numeric, integer, integer, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_health_history(date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_health(date, numeric, integer, integer, integer, integer, integer, integer) TO service_role;

COMMENT ON FUNCTION public.embe_get_pregnancy_health_history(date, integer) IS
  'Server-only bounded history for private maternal charts.';
COMMENT ON FUNCTION public.embe_save_pregnancy_health(date, numeric, integer, integer, integer, integer, integer, integer) IS
  'Server-only bounded maternal snapshot; values are recorded without diagnosis.';

-- Small private reactions inspired by close-family messaging. No public totals,
-- follower graph, comments, or external identities.

CREATE TABLE portal_read_model.media_reaction (
  media_item_id uuid NOT NULL REFERENCES portal_read_model.media_item(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('father', 'mother')),
  emoji text NOT NULL CHECK (emoji IN ('heart', 'love', 'laugh', 'moved')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (media_item_id, author_role)
);

CREATE TRIGGER media_reaction_set_updated_at
BEFORE UPDATE ON portal_read_model.media_reaction
FOR EACH ROW
EXECUTE FUNCTION portal_read_model.touch_updated_at();

ALTER TABLE portal_read_model.media_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.media_reaction FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.media_reaction FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.media_reaction TO service_role;

CREATE POLICY media_reaction_deny_clients
ON portal_read_model.media_reaction
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

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

CREATE OR REPLACE FUNCTION public.embe_react_media(
  p_media_item_id uuid,
  p_author_role text,
  p_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  counts jsonb;
BEGIN
  IF p_media_item_id IS NULL
     OR p_author_role NOT IN ('father', 'mother')
     OR p_emoji NOT IN ('heart', 'love', 'laugh', 'moved')
     OR NOT EXISTS (
       SELECT 1 FROM portal_read_model.media_item
       WHERE id = p_media_item_id AND approved = true
     ) THEN
    RAISE EXCEPTION 'invalid media reaction';
  END IF;

  INSERT INTO portal_read_model.media_reaction (media_item_id, author_role, emoji)
  VALUES (p_media_item_id, p_author_role, p_emoji)
  ON CONFLICT (media_item_id, author_role) DO UPDATE
  SET emoji = EXCLUDED.emoji;

  SELECT COALESCE(jsonb_object_agg(grouped.emoji, grouped.total), '{}'::jsonb)
  INTO counts
  FROM (
    SELECT emoji, count(*)::integer AS total
    FROM portal_read_model.media_reaction
    WHERE media_item_id = p_media_item_id
    GROUP BY emoji
  ) AS grouped;
  RETURN counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_react_media(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_react_media(uuid,text,text) TO service_role;
-- The internal schema is deliberately not exposed through PostgREST. The
-- portal resolves one bounded upload through this service-role-only function.

CREATE OR REPLACE FUNCTION public.embe_get_photo_upload(p_upload_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'storage_path', upload.storage_path,
    'byte_size', upload.byte_size,
    'mime_type', upload.mime_type,
    'status', upload.status
  )
  FROM portal_read_model.photo_upload AS upload
  WHERE upload.id = p_upload_id;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_photo_upload(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_photo_upload(uuid) TO service_role;

-- Private, review-first food-photo analysis. Images are short-lived staging
-- objects; only confirmed estimates become meal history.

CREATE TABLE portal_read_model.meal_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  author_role text NOT NULL CHECK (author_role IN ('father', 'mother')),
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  eaten_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  original_filename text CHECK (original_filename IS NULL OR char_length(original_filename) BETWEEN 1 AND 180),
  mime_type text CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint CHECK (byte_size IS NULL OR byte_size BETWEEN 1 AND 12000000),
  storage_path text UNIQUE CHECK (
    storage_path IS NULL OR storage_path ~ '^incoming/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  ),
  status text NOT NULL DEFAULT 'awaiting_upload' CHECK (
    status IN ('awaiting_upload', 'uploaded', 'analyzing', 'review', 'nutrition_pending', 'nutrition_processing', 'confirmed', 'failed', 'rejected', 'deleted')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz,
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
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT meal_analysis_claim_shape CHECK (
    (status IN ('analyzing', 'nutrition_processing')) = (claimed_at IS NOT NULL)
  ),
  CONSTRAINT meal_analysis_image_shape CHECK (
    num_nonnulls(original_filename, mime_type, byte_size, storage_path) IN (0, 4)
  )
);

CREATE INDEX meal_analysis_worker_idx
  ON portal_read_model.meal_analysis (status, next_attempt_at, claimed_at, created_at)
  WHERE status IN ('uploaded', 'failed', 'analyzing', 'nutrition_pending', 'nutrition_processing');

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

CREATE OR REPLACE FUNCTION public.embe_create_meal_note(
  p_idempotency_key uuid, p_author_role text, p_meal_type text,
  p_eaten_at timestamptz, p_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  entry_id uuid := gen_random_uuid();
  result_row portal_read_model.meal_analysis%ROWTYPE;
  note_text text := btrim(COALESCE(p_note, ''));
BEGIN
  IF p_idempotency_key IS NULL
     OR p_author_role NOT IN ('father', 'mother')
     OR p_meal_type NOT IN ('breakfast', 'lunch', 'dinner', 'snack')
     OR p_eaten_at IS NULL OR p_eaten_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_eaten_at > timezone('utc', now()) + interval '1 day'
     OR char_length(note_text) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid meal note request';
  END IF;

  INSERT INTO portal_read_model.meal_analysis (
    id, idempotency_key, author_role, meal_type, eaten_at, note,
    status, uploaded_at
  ) VALUES (
    entry_id, p_idempotency_key, p_author_role, p_meal_type, p_eaten_at, note_text,
    'uploaded', timezone('utc', now())
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO result_row FROM portal_read_model.meal_analysis WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('id', result_row.id, 'status', result_row.status);
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

CREATE OR REPLACE FUNCTION public.embe_confirm_meal_analysis(p_id uuid, p_confirmed_analysis jsonb, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_row portal_read_model.meal_analysis%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_confirmed_analysis) <> 'object'
     OR jsonb_typeof(p_confirmed_analysis -> 'foods') <> 'array'
     OR ((COALESCE(p_confirmed_analysis ->> 'entry_mode', '') = 'note') <>
         (jsonb_array_length(p_confirmed_analysis -> 'foods') = 0))
     OR char_length(COALESCE(btrim(p_note), '')) > 300
    THEN RAISE EXCEPTION 'invalid confirmed meal'; END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = CASE WHEN p_confirmed_analysis ->> 'entry_mode' = 'note' THEN 'confirmed' ELSE 'nutrition_pending' END,
      confirmed_analysis = p_confirmed_analysis,
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

CREATE OR REPLACE FUNCTION public.embe_list_meal_history(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entry.id, 'meal_type', entry.meal_type, 'eaten_at', entry.eaten_at,
    'note', entry.note, 'status', entry.status,
    'analysis', COALESCE(entry.confirmed_analysis, entry.analysis, jsonb_build_object(
      'entry_mode', 'note', 'foods', '[]'::jsonb, 'needs_user_confirmation', '[]'::jsonb,
      'estimate_notice', CASE WHEN entry.status IN ('failed', 'rejected')
        THEN 'Chưa nhận diện được; ghi chú vẫn được giữ lại.'
        ELSE 'Đang nhận diện món từ ghi chú.' END
    ))
  ) ORDER BY entry.eaten_at DESC), '[]'::jsonb)
  FROM portal_read_model.meal_analysis AS entry
  WHERE entry.status IN (
      'uploaded', 'analyzing', 'failed', 'rejected', 'review',
      'nutrition_pending', 'nutrition_processing', 'confirmed'
    )
    AND p_days BETWEEN 1 AND 30
    AND entry.eaten_at >= timezone('utc', now()) - make_interval(days => p_days);
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

REVOKE ALL ON FUNCTION public.embe_create_meal_analysis(uuid,text,text,timestamptz,text,text,text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_create_meal_note(uuid,text,text,timestamptz,text) FROM PUBLIC, anon, authenticated;
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
GRANT EXECUTE ON FUNCTION public.embe_create_meal_note(uuid,text,text,timestamptz,text) TO service_role;
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

CREATE TABLE portal_read_model.worker_heartbeat (
  worker_name text PRIMARY KEY CHECK (worker_name ~ '^[a-z0-9_-]{3,48}$'),
  state text NOT NULL CHECK (state IN ('online', 'degraded')),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 80),
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE portal_read_model.worker_heartbeat ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.worker_heartbeat FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.worker_heartbeat FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.worker_heartbeat TO service_role;

CREATE POLICY worker_heartbeat_deny_clients ON portal_read_model.worker_heartbeat
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_touch_worker_heartbeat(
  p_worker_name text, p_state text, p_detail text DEFAULT ''
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_worker_name !~ '^[a-z0-9_-]{3,48}$'
     OR p_state NOT IN ('online', 'degraded')
     OR char_length(COALESCE(p_detail, '')) > 80 THEN
    RAISE EXCEPTION 'invalid worker heartbeat';
  END IF;

  INSERT INTO portal_read_model.worker_heartbeat (worker_name, state, detail, last_seen_at)
  VALUES (p_worker_name, p_state, COALESCE(p_detail, ''), timezone('utc', now()))
  ON CONFLICT (worker_name) DO UPDATE
  SET state = EXCLUDED.state, detail = EXCLUDED.detail, last_seen_at = EXCLUDED.last_seen_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_worker_heartbeat(p_worker_name text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT CASE WHEN heartbeat.worker_name IS NULL THEN NULL ELSE jsonb_build_object(
    'worker_name', heartbeat.worker_name,
    'state', heartbeat.state,
    'detail', heartbeat.detail,
    'last_seen_at', heartbeat.last_seen_at
  ) END
  FROM portal_read_model.worker_heartbeat AS heartbeat
  WHERE heartbeat.worker_name = p_worker_name;
$function$;

REVOKE ALL ON FUNCTION public.embe_touch_worker_heartbeat(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_worker_heartbeat(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_touch_worker_heartbeat(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_worker_heartbeat(text) TO service_role;

CREATE TABLE portal_read_model.pregnancy_medical_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('appointment', 'ultrasound', 'laboratory', 'prescription', 'other')),
  status text NOT NULL CHECK (status IN ('planned', 'completed')),
  occurred_at timestamptz NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  provider text NOT NULL DEFAULT '' CHECK (char_length(provider) <= 120),
  clinician text NOT NULL DEFAULT '' CHECK (char_length(clinician) <= 100),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  gestational_week smallint CHECK (gestational_week BETWEEN 1 AND 42),
  next_appointment_at timestamptz,
  measurements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(measurements) = 'object'),
  medicines jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(medicines) = 'array'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE TABLE portal_read_model.pregnancy_medical_document (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES portal_read_model.pregnancy_medical_record(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE CHECK (storage_path ~ '^records/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 180),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 15000000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  ready_at timestamptz
);

CREATE INDEX pregnancy_medical_record_timeline_idx
ON portal_read_model.pregnancy_medical_record (occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX pregnancy_medical_document_record_idx
ON portal_read_model.pregnancy_medical_document (record_id, created_at);

ALTER TABLE portal_read_model.pregnancy_medical_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_medical_record FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_medical_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_medical_document FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.pregnancy_medical_record FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_medical_document FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.pregnancy_medical_record TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_medical_document TO service_role;

CREATE POLICY pregnancy_medical_record_deny_clients ON portal_read_model.pregnancy_medical_record
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY pregnancy_medical_document_deny_clients ON portal_read_model.pregnancy_medical_document
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_medical_record(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_gestational_week integer,
  p_next_appointment_at timestamptz, p_measurements jsonb, p_medicines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_kind NOT IN ('appointment', 'ultrasound', 'laboratory', 'prescription', 'other')
     OR p_status NOT IN ('planned', 'completed')
     OR char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 100
     OR char_length(COALESCE(p_provider, '')) > 120
     OR char_length(COALESCE(p_clinician, '')) > 100
     OR char_length(COALESCE(p_notes, '')) > 2000
     OR (p_gestational_week IS NOT NULL AND p_gestational_week NOT BETWEEN 1 AND 42)
     OR jsonb_typeof(COALESCE(p_measurements, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_medicines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid pregnancy medical record';
  END IF;

  INSERT INTO portal_read_model.pregnancy_medical_record (
    id, kind, status, occurred_at, title, provider, clinician, notes, gestational_week,
    next_appointment_at, measurements, medicines
  ) VALUES (
    result_id, p_kind, p_status, p_occurred_at, trim(p_title), trim(COALESCE(p_provider, '')),
    trim(COALESCE(p_clinician, '')), trim(COALESCE(p_notes, '')), p_gestational_week,
    p_next_appointment_at, COALESCE(p_measurements, '{}'::jsonb), COALESCE(p_medicines, '[]'::jsonb)
  ) ON CONFLICT (id) DO UPDATE SET
    kind = EXCLUDED.kind, status = EXCLUDED.status, occurred_at = EXCLUDED.occurred_at,
    title = EXCLUDED.title, provider = EXCLUDED.provider, clinician = EXCLUDED.clinician,
    notes = EXCLUDED.notes, gestational_week = EXCLUDED.gestational_week,
    next_appointment_at = EXCLUDED.next_appointment_at, measurements = EXCLUDED.measurements,
    medicines = EXCLUDED.medicines, updated_at = timezone('utc', now())
  WHERE portal_read_model.pregnancy_medical_record.deleted_at IS NULL;
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_list_pregnancy_medical_records()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', record.id, 'kind', record.kind, 'status', record.status,
    'occurred_at', record.occurred_at, 'title', record.title, 'provider', record.provider,
    'clinician', record.clinician, 'notes', record.notes, 'gestational_week', record.gestational_week,
    'next_appointment_at', record.next_appointment_at, 'measurements', record.measurements,
    'medicines', record.medicines, 'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', document.id, 'original_filename', document.original_filename,
        'mime_type', document.mime_type, 'byte_size', document.byte_size, 'created_at', document.created_at
      ) ORDER BY document.created_at)
      FROM portal_read_model.pregnancy_medical_document AS document
      WHERE document.record_id = record.id AND document.status = 'ready'
    ), '[]'::jsonb)
  ) ORDER BY record.occurred_at DESC), '[]'::jsonb)
  FROM portal_read_model.pregnancy_medical_record AS record
  WHERE record.deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_medical_record(p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  UPDATE portal_read_model.pregnancy_medical_record
  SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.embe_create_pregnancy_medical_document(
  p_record_id uuid, p_document_id uuid, p_original_filename text, p_mime_type text, p_byte_size integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE extension text; object_path text;
BEGIN
  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     OR p_byte_size NOT BETWEEN 1 AND 15000000
     OR char_length(trim(COALESCE(p_original_filename, ''))) NOT BETWEEN 1 AND 180
     OR NOT EXISTS (SELECT 1 FROM portal_read_model.pregnancy_medical_record WHERE id = p_record_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'invalid pregnancy medical document';
  END IF;
  extension := CASE p_mime_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp' ELSE 'pdf' END;
  object_path := 'records/' || p_record_id || '/' || p_document_id || '.' || extension;
  INSERT INTO portal_read_model.pregnancy_medical_document (
    id, record_id, storage_path, original_filename, mime_type, byte_size
  ) VALUES (p_document_id, p_record_id, object_path, trim(p_original_filename), p_mime_type, p_byte_size);
  RETURN jsonb_build_object('id', p_document_id, 'storage_path', object_path);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_pregnancy_medical_document(p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  UPDATE portal_read_model.pregnancy_medical_document
  SET status = 'ready', ready_at = timezone('utc', now()) WHERE id = p_id AND status = 'pending';
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_medical_document(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object('storage_path', storage_path, 'mime_type', mime_type,
    'byte_size', byte_size, 'original_filename', original_filename, 'status', status)
  FROM portal_read_model.pregnancy_medical_document WHERE id = p_id;
$function$;

REVOKE ALL ON FUNCTION public.embe_save_pregnancy_medical_record(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_list_pregnancy_medical_records() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_pregnancy_medical_record(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_create_pregnancy_medical_document(uuid,uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_pregnancy_medical_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_pregnancy_medical_document(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_medical_record(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_pregnancy_medical_records() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_pregnancy_medical_record(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_create_pregnancy_medical_document(uuid,uuid,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_pregnancy_medical_document(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_medical_document(uuid) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('embe-medical-records', 'embe-medical-records', false, 15000000,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('embe-meal-inbox', 'embe-meal-inbox', false, 12000000,
  ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE portal_read_model.family_parent_profile (
  role text PRIMARY KEY CHECK (role IN ('mother', 'father')),
  birth_date date CHECK (birth_date IS NULL OR birth_date BETWEEN DATE '1940-01-01' AND CURRENT_DATE),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE portal_read_model.family_parent_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_parent_profile FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_parent_profile FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.family_parent_profile TO service_role;
CREATE POLICY family_parent_profile_deny_clients ON portal_read_model.family_parent_profile
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_family_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'mother_birth_date', (SELECT birth_date FROM portal_read_model.family_parent_profile WHERE role = 'mother'),
    'father_birth_date', (SELECT birth_date FROM portal_read_model.family_parent_profile WHERE role = 'father')
  );
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_family_profile(p_mother_birth_date date, p_father_birth_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF (p_mother_birth_date IS NOT NULL AND p_mother_birth_date NOT BETWEEN DATE '1940-01-01' AND CURRENT_DATE)
    OR (p_father_birth_date IS NOT NULL AND p_father_birth_date NOT BETWEEN DATE '1940-01-01' AND CURRENT_DATE)
  THEN RAISE EXCEPTION 'invalid family profile'; END IF;
  INSERT INTO portal_read_model.family_parent_profile (role, birth_date, updated_at)
  VALUES ('mother', p_mother_birth_date, timezone('utc', now())),
         ('father', p_father_birth_date, timezone('utc', now()))
  ON CONFLICT (role) DO UPDATE SET birth_date = EXCLUDED.birth_date, updated_at = EXCLUDED.updated_at;
  INSERT INTO portal_read_model.pregnancy_wellness_profile (singleton, birth_date, updated_at)
  VALUES (true, p_mother_birth_date, timezone('utc', now()))
  ON CONFLICT (singleton) DO UPDATE SET birth_date = EXCLUDED.birth_date, updated_at = EXCLUDED.updated_at;
  RETURN public.embe_get_family_profile();
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_family_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_family_profile(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_family_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_family_profile(date,date) TO service_role;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_medical_record_with_task(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_gestational_week integer,
  p_next_appointment_at timestamptz, p_measurements jsonb, p_medicines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_kind NOT IN ('appointment', 'ultrasound', 'laboratory', 'prescription', 'other')
     OR p_status NOT IN ('planned', 'completed')
     OR p_occurred_at IS NULL
     OR char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 100
     OR char_length(COALESCE(p_provider, '')) > 120
     OR char_length(COALESCE(p_clinician, '')) > 100
     OR char_length(COALESCE(p_notes, '')) > 2000
     OR (p_gestational_week IS NOT NULL AND p_gestational_week NOT BETWEEN 1 AND 42)
     OR jsonb_typeof(COALESCE(p_measurements, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_medicines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid pregnancy medical record';
  END IF;

  INSERT INTO portal_read_model.pregnancy_medical_record (
    id, kind, status, occurred_at, title, provider, clinician, notes, gestational_week,
    next_appointment_at, measurements, medicines
  ) VALUES (
    result_id, p_kind, p_status, p_occurred_at, trim(p_title), trim(COALESCE(p_provider, '')),
    trim(COALESCE(p_clinician, '')), trim(COALESCE(p_notes, '')), p_gestational_week,
    p_next_appointment_at, COALESCE(p_measurements, '{}'::jsonb), COALESCE(p_medicines, '[]'::jsonb)
  ) ON CONFLICT (id) DO UPDATE SET
    kind = EXCLUDED.kind, status = EXCLUDED.status, occurred_at = EXCLUDED.occurred_at,
    title = EXCLUDED.title, provider = EXCLUDED.provider, clinician = EXCLUDED.clinician,
    notes = EXCLUDED.notes, gestational_week = EXCLUDED.gestational_week,
    next_appointment_at = EXCLUDED.next_appointment_at, measurements = EXCLUDED.measurements,
    medicines = EXCLUDED.medicines, updated_at = timezone('utc', now())
  WHERE portal_read_model.pregnancy_medical_record.deleted_at IS NULL;

  IF p_kind = 'appointment' AND p_status = 'planned' THEN
    INSERT INTO portal_read_model.family_task (
      idempotency_key, title, note, owner_role, category, link_target,
      due_on, due_time, repeat_rule
    ) VALUES (
      result_id, 'Lịch khám: ' || trim(p_title), trim(COALESCE(p_provider, '')),
      'family', 'appointment', 'calendar',
      (p_occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      date_trunc('minute', p_occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time,
      'none'
    ) ON CONFLICT (idempotency_key) DO UPDATE SET
      title = EXCLUDED.title, note = EXCLUDED.note, owner_role = EXCLUDED.owner_role,
      category = EXCLUDED.category, link_target = EXCLUDED.link_target,
      due_on = EXCLUDED.due_on, due_time = EXCLUDED.due_time,
      repeat_rule = EXCLUDED.repeat_rule, deleted_at = NULL,
      updated_at = timezone('utc', now());
  ELSE
    UPDATE portal_read_model.family_task
    SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
    WHERE idempotency_key = result_id AND deleted_at IS NULL;
  END IF;

  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_medical_record_with_task(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.pregnancy_medical_record
  SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NULL;

  UPDATE portal_read_model.family_task
  SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE idempotency_key = p_id AND deleted_at IS NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_medical_record(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_gestational_week integer,
  p_next_appointment_at timestamptz, p_measurements jsonb, p_medicines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  RETURN public.embe_save_pregnancy_medical_record_with_task(
    p_id, p_kind, p_status, p_occurred_at, p_title, p_provider, p_clinician,
    p_notes, p_gestational_week, p_next_appointment_at, p_measurements, p_medicines
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_medical_record(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  PERFORM public.embe_delete_pregnancy_medical_record_with_task(p_id);
END;
$function$;


REVOKE ALL ON FUNCTION public.embe_save_pregnancy_medical_record_with_task(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_pregnancy_medical_record_with_task(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_medical_record_with_task(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_pregnancy_medical_record_with_task(uuid) TO service_role;

CREATE TABLE portal_read_model.login_rate_limit (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  failure_count smallint NOT NULL CHECK (failure_count BETWEEN 1 AND 50),
  window_started_at timestamptz NOT NULL,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL
);

CREATE INDEX login_rate_limit_updated_idx
  ON portal_read_model.login_rate_limit (updated_at);

ALTER TABLE portal_read_model.login_rate_limit ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.login_rate_limit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.login_rate_limit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.login_rate_limit TO service_role;
CREATE POLICY login_rate_limit_deny_clients ON portal_read_model.login_rate_limit
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_check_login_rate_limit(p_key_hash text, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE entry portal_read_model.login_rate_limit%ROWTYPE;
DECLARE retry_after integer := 0;
BEGIN
  IF p_key_hash !~ '^[0-9a-f]{64}$' OR p_now IS NULL THEN
    RAISE EXCEPTION 'invalid login rate key';
  END IF;

  SELECT * INTO entry FROM portal_read_model.login_rate_limit WHERE key_hash = p_key_hash;
  IF entry.key_hash IS NULL OR entry.window_started_at <= p_now - interval '15 minutes'
     OR entry.blocked_until IS NULL OR entry.blocked_until <= p_now THEN
    RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  END IF;

  retry_after := greatest(1, ceil(extract(epoch FROM entry.blocked_until - p_now))::integer);
  RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', least(retry_after, 900));
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_record_login_failure(p_key_hash text, p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE entry portal_read_model.login_rate_limit%ROWTYPE;
DECLARE next_count smallint;
DECLARE delay_seconds integer;
BEGIN
  IF p_key_hash !~ '^[0-9a-f]{64}$' OR p_now IS NULL THEN
    RAISE EXCEPTION 'invalid login rate key';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key_hash, 0));
  DELETE FROM portal_read_model.login_rate_limit WHERE updated_at < p_now - interval '24 hours';
  SELECT * INTO entry FROM portal_read_model.login_rate_limit WHERE key_hash = p_key_hash FOR UPDATE;

  IF entry.key_hash IS NULL OR entry.window_started_at <= p_now - interval '15 minutes' THEN
    next_count := 1;
    INSERT INTO portal_read_model.login_rate_limit (
      key_hash, failure_count, window_started_at, blocked_until, updated_at
    ) VALUES (p_key_hash, next_count, p_now, NULL, p_now)
    ON CONFLICT (key_hash) DO UPDATE SET
      failure_count = next_count, window_started_at = p_now,
      blocked_until = NULL, updated_at = p_now;
  ELSE
    next_count := least(entry.failure_count + 1, 50);
  END IF;

  delay_seconds := CASE
    WHEN next_count <= 4 THEN 0
    WHEN next_count = 5 THEN 30
    WHEN next_count = 6 THEN 60
    WHEN next_count = 7 THEN 120
    WHEN next_count = 8 THEN 300
    ELSE 900
  END;

  IF entry.key_hash IS NOT NULL AND entry.window_started_at > p_now - interval '15 minutes' THEN
    UPDATE portal_read_model.login_rate_limit SET
      failure_count = next_count,
      blocked_until = CASE WHEN delay_seconds = 0 THEN NULL ELSE p_now + make_interval(secs => delay_seconds) END,
      updated_at = p_now
    WHERE key_hash = p_key_hash;
  ELSIF delay_seconds > 0 THEN
    UPDATE portal_read_model.login_rate_limit
    SET blocked_until = p_now + make_interval(secs => delay_seconds), updated_at = p_now
    WHERE key_hash = p_key_hash;
  END IF;

  RETURN jsonb_build_object('allowed', delay_seconds = 0, 'retry_after_seconds', delay_seconds);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_reset_login_rate_limit(p_key_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_key_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid login rate key'; END IF;
  DELETE FROM portal_read_model.login_rate_limit WHERE key_hash = p_key_hash;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_check_login_rate_limit(text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_record_login_failure(text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_reset_login_rate_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_check_login_rate_limit(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_record_login_failure(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_reset_login_rate_limit(text) TO service_role;

COMMENT ON TABLE portal_read_model.login_rate_limit IS
  'Short-lived login backoff keyed only by a server-side HMAC; raw client addresses are never stored.';

CREATE OR REPLACE FUNCTION portal_read_model.complete_linked_daily_action(
  p_day date, p_task_id text
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_day IS NULL OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_task_id NOT IN ('supplements', 'breakfast', 'lunch', 'dinner') THEN
    RAISE EXCEPTION 'invalid linked daily action';
  END IF;
  INSERT INTO portal_read_model.pregnancy_day (day, updated_at)
  VALUES (p_day, timezone('utc', now()))
  ON CONFLICT (day) DO UPDATE SET updated_at = EXCLUDED.updated_at;
  INSERT INTO portal_read_model.pregnancy_check (day, task_id, updated_at)
  VALUES (p_day, p_task_id, timezone('utc', now()))
  ON CONFLICT (day, task_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION portal_read_model.complete_linked_daily_action(date,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_read_model.complete_linked_daily_action(date,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.embe_confirm_meal_analysis(
  p_id uuid, p_confirmed_analysis jsonb, p_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  result_row portal_read_model.meal_analysis%ROWTYPE;
  checklist_task_id text;
  checklist_day date;
BEGIN
  IF jsonb_typeof(p_confirmed_analysis) <> 'object'
     OR jsonb_typeof(p_confirmed_analysis -> 'foods') <> 'array'
     OR ((COALESCE(p_confirmed_analysis ->> 'entry_mode', '') = 'note') <>
         (jsonb_array_length(p_confirmed_analysis -> 'foods') = 0))
     OR char_length(COALESCE(btrim(p_note), '')) > 300 THEN
    RAISE EXCEPTION 'invalid confirmed meal';
  END IF;
  UPDATE portal_read_model.meal_analysis
  SET status = CASE WHEN p_confirmed_analysis ->> 'entry_mode' = 'note'
        THEN 'confirmed' ELSE 'nutrition_pending' END,
      confirmed_analysis = p_confirmed_analysis,
      note = btrim(COALESCE(p_note, '')),
      confirmed_at = timezone('utc', now())
  WHERE id = p_id AND status IN ('review', 'nutrition_pending', 'confirmed')
  RETURNING * INTO result_row;
  IF result_row.id IS NULL THEN RAISE EXCEPTION 'meal is not ready for confirmation'; END IF;
  checklist_task_id := CASE result_row.meal_type
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'lunch' THEN 'lunch'
    WHEN 'dinner' THEN 'dinner'
    ELSE NULL
  END;
  checklist_day := (result_row.eaten_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF checklist_task_id IS NOT NULL AND result_row.status IN ('nutrition_pending', 'confirmed') THEN
    PERFORM portal_read_model.complete_linked_daily_action(checklist_day, checklist_task_id);
  END IF;
  RETURN jsonb_build_object(
    'id', result_row.id, 'status', result_row.status,
    'meal_type', result_row.meal_type, 'eaten_at', result_row.eaten_at,
    'note', result_row.note, 'analysis', result_row.confirmed_analysis,
    'checklist_task_id', checklist_task_id,
    'checklist_day', CASE WHEN checklist_task_id IS NULL THEN NULL ELSE checklist_day END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.embe_record_pregnancy_care_intake(
  p_plan_id uuid, p_day date, p_slot smallint, p_status text, p_reason text
)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  allowed_slots smallint;
  required_doses integer;
  taken_doses integer;
BEGIN
  SELECT plan.times_per_day INTO allowed_slots
  FROM portal_read_model.pregnancy_care_plan AS plan
  WHERE plan.id = p_plan_id AND plan.active AND plan.confirmed_by_clinician;
  IF allowed_slots IS NULL OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_slot NOT BETWEEN 1 AND allowed_slots
     OR p_status NOT IN ('taken', 'skipped', 'deferred')
     OR char_length(btrim(COALESCE(p_reason, ''))) > 120 THEN
    RAISE EXCEPTION 'invalid care intake';
  END IF;
  INSERT INTO portal_read_model.pregnancy_care_intake (plan_id, day, slot, status, reason, taken_at)
  VALUES (p_plan_id, p_day, p_slot, p_status, btrim(COALESCE(p_reason, '')), timezone('utc', now()))
  ON CONFLICT (plan_id, day, slot) DO UPDATE SET
    status = EXCLUDED.status, reason = EXCLUDED.reason, taken_at = EXCLUDED.taken_at;
  SELECT COALESCE(sum(plan.times_per_day), 0)::integer INTO required_doses
  FROM portal_read_model.pregnancy_care_plan AS plan
  WHERE plan.active AND plan.confirmed_by_clinician;
  SELECT count(*) FILTER (WHERE intake.status = 'taken')::integer INTO taken_doses
  FROM portal_read_model.pregnancy_care_intake AS intake
  JOIN portal_read_model.pregnancy_care_plan AS plan ON plan.id = intake.plan_id
  WHERE intake.day = p_day AND plan.active AND plan.confirmed_by_clinician;
  IF required_doses > 0 AND taken_doses = required_doses THEN
    PERFORM portal_read_model.complete_linked_daily_action(p_day, 'supplements');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  TO service_role;

COMMENT ON FUNCTION portal_read_model.complete_linked_daily_action(date,text) IS
  'Idempotently completes a bounded daily checklist action only from server-verified semantic evidence.';
+CREATE TABLE portal_read_model.fetal_movement_session (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  movement_count integer NOT NULL DEFAULT 0 CHECK (movement_count BETWEEN 0 AND 500),
  last_movement_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (last_movement_at IS NULL OR last_movement_at >= started_at),
  CHECK (ended_at IS NULL OR ended_at <= started_at + interval '12 hours')
);
CREATE UNIQUE INDEX fetal_movement_one_active_idx
  ON portal_read_model.fetal_movement_session ((true)) WHERE ended_at IS NULL;
CREATE INDEX fetal_movement_started_at_idx
  ON portal_read_model.fetal_movement_session (started_at DESC);
ALTER TABLE portal_read_model.fetal_movement_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.fetal_movement_session FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.fetal_movement_session FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.fetal_movement_session TO service_role;
CREATE POLICY fetal_movement_session_deny_clients
  ON portal_read_model.fetal_movement_session FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_list_fetal_movement_sessions(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', session.id, 'started_at', session.started_at, 'ended_at', session.ended_at,
    'movement_count', session.movement_count, 'note', session.note, 'created_at', session.created_at
  ) ORDER BY session.started_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM portal_read_model.fetal_movement_session
    ORDER BY started_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 50)
  ) AS session;
$f$;

CREATE OR REPLACE FUNCTION public.embe_start_fetal_movement_session(p_id uuid, p_started_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(87203411);
  IF p_started_at < timezone('utc', now()) - interval '24 hours'
     OR p_started_at > timezone('utc', now()) + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid movement session start';
  END IF;
  SELECT jsonb_build_object(
    'id', active.id, 'started_at', active.started_at, 'ended_at', active.ended_at,
    'movement_count', active.movement_count, 'note', active.note, 'created_at', active.created_at
  ) INTO result
  FROM portal_read_model.fetal_movement_session AS active WHERE active.ended_at IS NULL LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
  INSERT INTO portal_read_model.fetal_movement_session (id, started_at) VALUES (p_id, p_started_at)
  ON CONFLICT (id) DO NOTHING;
  SELECT jsonb_build_object(
    'id', saved.id, 'started_at', saved.started_at, 'ended_at', saved.ended_at,
    'movement_count', saved.movement_count, 'note', saved.note, 'created_at', saved.created_at
  ) INTO result FROM portal_read_model.fetal_movement_session AS saved WHERE saved.id = p_id;
  RETURN result;
END;
$f$;

CREATE OR REPLACE FUNCTION public.embe_record_fetal_movement(p_id uuid, p_recorded_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  UPDATE portal_read_model.fetal_movement_session AS session
  SET movement_count = session.movement_count + 1, last_movement_at = p_recorded_at,
      updated_at = timezone('utc', now())
  WHERE session.id = p_id AND session.ended_at IS NULL AND session.movement_count < 500
    AND p_recorded_at >= session.started_at
    AND p_recorded_at <= timezone('utc', now()) + interval '5 minutes'
  RETURNING jsonb_build_object(
    'id', session.id, 'started_at', session.started_at, 'ended_at', session.ended_at,
    'movement_count', session.movement_count, 'note', session.note, 'created_at', session.created_at
  ) INTO result;
  RETURN result;
END;
$f$;

CREATE OR REPLACE FUNCTION public.embe_finish_fetal_movement_session(p_id uuid, p_ended_at timestamptz, p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  IF char_length(trim(COALESCE(p_note, ''))) > 500 THEN RAISE EXCEPTION 'invalid movement note'; END IF;
  UPDATE portal_read_model.fetal_movement_session AS session
  SET ended_at = p_ended_at, note = trim(COALESCE(p_note, '')), updated_at = timezone('utc', now())
  WHERE session.id = p_id AND session.ended_at IS NULL
    AND p_ended_at >= session.started_at AND p_ended_at <= session.started_at + interval '12 hours'
    AND p_ended_at <= timezone('utc', now()) + interval '5 minutes'
  RETURNING jsonb_build_object(
    'id', session.id, 'started_at', session.started_at, 'ended_at', session.ended_at,
    'movement_count', session.movement_count, 'note', session.note, 'created_at', session.created_at
  ) INTO result;
  RETURN result;
END;
$f$;

REVOKE ALL ON FUNCTION public.embe_list_fetal_movement_sessions(integer),
  public.embe_start_fetal_movement_session(uuid, timestamptz),
  public.embe_record_fetal_movement(uuid, timestamptz),
  public.embe_finish_fetal_movement_session(uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_fetal_movement_sessions(integer),
  public.embe_start_fetal_movement_session(uuid, timestamptz),
  public.embe_record_fetal_movement(uuid, timestamptz),
  public.embe_finish_fetal_movement_session(uuid, timestamptz, text)
  TO service_role;

COMMENT ON TABLE portal_read_model.fetal_movement_session IS
  'Private, non-diagnostic sessions for recording the baby usual movement pattern.';
COMMENT ON FUNCTION public.embe_list_fetal_movement_sessions(integer) IS
  'Lists a bounded fetal movement history for the private family portal.';
+CREATE TABLE portal_read_model.family_expense (
  id uuid PRIMARY KEY,
  incurred_on date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('planned', 'actual')),
  category text NOT NULL CHECK (category IN ('pregnancy_visit', 'test', 'medicine', 'baby_supply', 'birth', 'travel', 'other')),
  amount_vnd bigint NOT NULL CHECK (amount_vnd BETWEEN 0 AND 1000000000),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);
CREATE INDEX family_expense_active_day_idx ON portal_read_model.family_expense (incurred_on DESC, id) WHERE deleted_at IS NULL;
ALTER TABLE portal_read_model.family_expense ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_expense FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_expense FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.family_expense TO service_role;
CREATE POLICY family_expense_deny_clients ON portal_read_model.family_expense
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_list_family_expenses(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', entry.id, 'incurred_on', entry.incurred_on, 'kind', entry.kind,
    'category', entry.category, 'amount_vnd', entry.amount_vnd,
    'description', entry.description, 'note', entry.note,
    'created_at', entry.created_at, 'updated_at', entry.updated_at
  ) ORDER BY entry.incurred_on DESC, entry.created_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM portal_read_model.family_expense
    WHERE deleted_at IS NULL ORDER BY incurred_on DESC, created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 500)
  ) AS entry;
$f$;

CREATE OR REPLACE FUNCTION public.embe_save_family_expense(
  p_id uuid, p_incurred_on date, p_kind text, p_category text,
  p_amount_vnd bigint, p_description text, p_note text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  IF p_kind NOT IN ('planned', 'actual')
    OR p_category NOT IN ('pregnancy_visit', 'test', 'medicine', 'baby_supply', 'birth', 'travel', 'other')
    OR p_amount_vnd < 0 OR p_amount_vnd > 1000000000
    OR char_length(trim(p_description)) NOT BETWEEN 1 AND 120
    OR char_length(trim(COALESCE(p_note, ''))) > 500 THEN RAISE EXCEPTION 'invalid family expense'; END IF;
  INSERT INTO portal_read_model.family_expense (id, incurred_on, kind, category, amount_vnd, description, note)
  VALUES (p_id, p_incurred_on, p_kind, p_category, p_amount_vnd, trim(p_description), trim(COALESCE(p_note, '')))
  ON CONFLICT (id) DO UPDATE SET incurred_on = EXCLUDED.incurred_on, kind = EXCLUDED.kind,
    category = EXCLUDED.category, amount_vnd = EXCLUDED.amount_vnd,
    description = EXCLUDED.description, note = EXCLUDED.note,
    deleted_at = NULL, updated_at = timezone('utc', now());
  SELECT jsonb_build_object(
    'id', entry.id, 'incurred_on', entry.incurred_on, 'kind', entry.kind,
    'category', entry.category, 'amount_vnd', entry.amount_vnd,
    'description', entry.description, 'note', entry.note,
    'created_at', entry.created_at, 'updated_at', entry.updated_at
  ) INTO result FROM portal_read_model.family_expense AS entry WHERE entry.id = p_id;
  RETURN result;
END;
$f$;

CREATE OR REPLACE FUNCTION public.embe_set_family_expense_deleted(p_id uuid, p_deleted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE changed integer;
BEGIN
  UPDATE portal_read_model.family_expense SET
    deleted_at = CASE WHEN p_deleted THEN timezone('utc', now()) ELSE NULL END,
    updated_at = timezone('utc', now())
  WHERE id = p_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$f$;

REVOKE ALL ON FUNCTION public.embe_list_family_expenses(integer),
  public.embe_save_family_expense(uuid, date, text, text, bigint, text, text),
  public.embe_set_family_expense_deleted(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_family_expenses(integer),
  public.embe_save_family_expense(uuid, date, text, text, bigint, text, text),
  public.embe_set_family_expense_deleted(uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.embe_export_family_data_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT jsonb_set(
    jsonb_set(
      jsonb_set(
        public.embe_export_family_data_v1(),
        '{data,pregnancy,mental_health}',
        public.embe_export_pregnancy_mental_health(),
        true
      ),
      '{data,pregnancy,fetal_movement_sessions}',
      COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT id, started_at, ended_at, movement_count, last_movement_at, note, created_at, updated_at
        FROM portal_read_model.fetal_movement_session ORDER BY started_at, id
      ) AS row_data), '[]'::jsonb), true
    ),
    '{data,budget}',
    COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
      SELECT id, incurred_on, kind, category, amount_vnd, description, note,
             created_at, updated_at, deleted_at
      FROM portal_read_model.family_expense ORDER BY incurred_on, id
    ) AS row_data), '[]'::jsonb), true
  );
$f$;
REVOKE ALL ON FUNCTION public.embe_export_family_data_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_family_data_v2() TO service_role;
