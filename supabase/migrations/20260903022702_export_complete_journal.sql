BEGIN;

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

COMMIT;
