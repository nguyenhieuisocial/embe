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
