-- Short-lived, server-only bridge from the family Portal to loopback Ollama.
-- The queue accepts only topic + period. It never stores free-form prompts or raw records.

CREATE TABLE portal_read_model.assistant_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  topic text NOT NULL CHECK (topic IN ('ngu', 'bu', 'moi-truong')),
  days smallint NOT NULL CHECK (days IN (7, 14, 30)),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  answer text CHECK (answer IS NULL OR char_length(answer) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  claimed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT timezone('utc', now()) + interval '24 hours',
  last_error_code text
);

CREATE INDEX assistant_request_work_idx ON portal_read_model.assistant_request (status, created_at)
WHERE status IN ('pending', 'processing');
CREATE INDEX assistant_request_expiry_idx ON portal_read_model.assistant_request (expires_at);

COMMENT ON TABLE portal_read_model.assistant_request IS
  'Short-lived bridge to local AI. Stores only allowlisted topic, bounded period and aggregate answer.';

ALTER TABLE portal_read_model.assistant_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.assistant_request FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.assistant_request FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.assistant_request TO service_role;
CREATE POLICY assistant_request_deny_clients ON portal_read_model.assistant_request
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_submit_assistant_request(
  p_idempotency_key uuid, p_topic text, p_days integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE saved_id uuid;
BEGIN
  IF p_idempotency_key IS NULL OR p_topic NOT IN ('ngu', 'bu', 'moi-truong') OR p_days NOT IN (7, 14, 30) THEN
    RAISE EXCEPTION 'invalid assistant request';
  END IF;
  DELETE FROM portal_read_model.assistant_request WHERE expires_at < timezone('utc', now());
  INSERT INTO portal_read_model.assistant_request (idempotency_key, topic, days)
  VALUES (p_idempotency_key, p_topic, p_days)
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO saved_id;
  RETURN saved_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_assistant_requests(p_limit integer DEFAULT 5)
RETURNS TABLE (id uuid, topic text, days smallint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_limit NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'invalid assistant claim limit'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT queue.id FROM portal_read_model.assistant_request AS queue
    WHERE queue.expires_at >= timezone('utc', now()) AND queue.attempts < 3
      AND (queue.status IN ('pending', 'failed') OR
        (queue.status = 'processing' AND queue.claimed_at < timezone('utc', now()) - interval '3 minutes'))
    ORDER BY queue.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE portal_read_model.assistant_request AS queue
  SET status = 'processing', attempts = queue.attempts + 1,
      claimed_at = timezone('utc', now()), last_error_code = NULL
  FROM candidates WHERE queue.id = candidates.id
  RETURNING queue.id, queue.topic, queue.days;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_assistant_request(p_id uuid, p_answer text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF char_length(btrim(p_answer)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'invalid assistant answer'; END IF;
  UPDATE portal_read_model.assistant_request
  SET status = 'completed', answer = btrim(p_answer), completed_at = timezone('utc', now()),
      claimed_at = NULL, last_error_code = NULL
  WHERE id = p_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'assistant request is not processing'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_fail_assistant_request(p_id uuid, p_error_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_error_code NOT IN ('invalid_payload', 'local_ai_unavailable') THEN RAISE EXCEPTION 'invalid assistant failure'; END IF;
  UPDATE portal_read_model.assistant_request
  SET status = CASE WHEN attempts >= 3 OR p_error_code = 'invalid_payload' THEN 'dead_letter' ELSE 'failed' END,
      claimed_at = NULL, last_error_code = p_error_code
  WHERE id = p_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'assistant request is not processing'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_assistant_response(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT CASE WHEN request.id IS NULL THEN NULL ELSE jsonb_build_object(
    'status', CASE WHEN request.status = 'dead_letter' THEN 'failed' ELSE request.status END,
    'answer', CASE WHEN request.status = 'completed' THEN request.answer ELSE NULL END
  ) END
  FROM (SELECT 1) AS singleton
  LEFT JOIN portal_read_model.assistant_request AS request
    ON request.id = p_id AND request.expires_at >= timezone('utc', now());
$function$;

CREATE OR REPLACE FUNCTION public.embe_assistant_queue_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status IN ('pending', 'failed')),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'dead_letters', count(*) FILTER (WHERE status = 'dead_letter')
  ) FROM portal_read_model.assistant_request WHERE expires_at >= timezone('utc', now());
$function$;

REVOKE ALL ON FUNCTION public.embe_submit_assistant_request(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_assistant_requests(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_assistant_request(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_fail_assistant_request(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_assistant_response(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_assistant_queue_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_submit_assistant_request(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_assistant_requests(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_assistant_request(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_fail_assistant_request(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_assistant_response(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_assistant_queue_status() TO service_role;
