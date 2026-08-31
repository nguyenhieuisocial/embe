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
    'supplements', 'varied-meals', 'food-safety', 'no-alcohol',
    'movement', 'water-rest', 'notes'
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
      'supplements', 'varied-meals', 'food-safety', 'no-alcohol',
      'movement', 'water-rest', 'notes'
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
