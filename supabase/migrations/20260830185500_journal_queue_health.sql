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

