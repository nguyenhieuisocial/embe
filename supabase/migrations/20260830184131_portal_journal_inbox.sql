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
