BEGIN;

-- New web journals are canonical cloud records. The existing Memos queue and
-- source-specific reconciliation remain intact for legacy entries.
ALTER TABLE portal_read_model.timeline_event
  DROP CONSTRAINT timeline_event_source_system_check;
ALTER TABLE portal_read_model.timeline_event
  ADD CONSTRAINT timeline_event_source_system_check
  CHECK (source_system IN ('memos', 'babybuddy', 'immich', 'portal_journal'));

CREATE OR REPLACE FUNCTION public.embe_submit_journal(
  p_idempotency_key uuid, p_content text, p_author_role text
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  saved_id uuid;
  clean_content text := btrim(p_content);
  journal_title text;
  existing portal_read_model.timeline_event%ROWTYPE;
BEGIN
  IF p_idempotency_key IS NULL OR p_content IS NULL OR p_author_role IS NULL
    OR p_author_role NOT IN ('mother', 'father')
    OR char_length(clean_content) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid journal submission';
  END IF;

  -- An old phone may replay a request accepted by the legacy inbox. Never
  -- create a second entry for that same request or resurrect erased text.
  SELECT id INTO saved_id FROM portal_read_model.journal_inbox
    WHERE idempotency_key = p_idempotency_key;
  IF saved_id IS NOT NULL THEN RETURN saved_id; END IF;

  journal_title := CASE p_author_role
    WHEN 'mother' THEN 'Mẹ Ngân ghi lại' ELSE 'Ba Hiếu ghi lại' END;
  INSERT INTO portal_read_model.timeline_event (
    source_system, source_event_id, child_id, event_at, portal_event_type,
    title, caption, album_cover_url, portal_role, approved, approved_at
  ) VALUES (
    'portal_journal', 'portal-journal/' || p_idempotency_key::text,
    'embe-family', now(), 'journal', journal_title, clean_content,
    NULL, 'family', true, now()
  ) ON CONFLICT (source_event_id) DO NOTHING;

  SELECT * INTO existing FROM portal_read_model.timeline_event
    WHERE source_event_id = 'portal-journal/' || p_idempotency_key::text;
  IF existing.source_system IS DISTINCT FROM 'portal_journal'
    OR existing.caption IS DISTINCT FROM clean_content
    OR existing.title IS DISTINCT FROM journal_title THEN
    RAISE EXCEPTION 'journal request conflicts with an existing entry';
  END IF;
  RETURN existing.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.embe_submit_journal(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_submit_journal(uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.embe_export_journal_data() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'published_entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'event_at', e.event_at, 'event_type', e.portal_event_type,
        'title', e.title, 'caption', e.caption
      ) ORDER BY e.event_at, e.id)
      FROM portal_read_model.timeline_event e
      WHERE e.source_system IN ('memos', 'portal_journal')
        AND e.approved = true AND e.portal_role = 'family'
    ), '[]'::jsonb),
    'pending_entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'author_role', i.author_role, 'status', i.status,
        'created_at', i.created_at, 'content', i.content
      ) ORDER BY i.created_at, i.id)
      FROM portal_read_model.journal_inbox i
      WHERE i.status IN ('pending', 'processing', 'dead_letter') AND i.content IS NOT NULL
    ), '[]'::jsonb)
  );
$function$;
REVOKE ALL ON FUNCTION public.embe_export_journal_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_journal_data() TO service_role;
COMMENT ON FUNCTION public.embe_submit_journal(uuid,text,text) IS
  'Save a private web journal atomically on Supabase without a local worker; legacy requests remain idempotent.';
COMMIT;
