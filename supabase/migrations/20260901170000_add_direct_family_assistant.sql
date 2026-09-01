-- Short-lived, family-only direct questions for the loopback assistant.

ALTER TABLE portal_read_model.assistant_request
  DROP CONSTRAINT assistant_request_topic_check;

ALTER TABLE portal_read_model.assistant_request
  ADD COLUMN question text,
  ADD CONSTRAINT assistant_request_topic_check
    CHECK (topic IN ('ngu', 'bu', 'moi-truong', 'hoi-dap')),
  ADD CONSTRAINT assistant_request_question_shape CHECK (
    (topic = 'hoi-dap' AND char_length(btrim(question)) BETWEEN 1 AND 600)
    OR (topic <> 'hoi-dap' AND question IS NULL)
  );

COMMENT ON COLUMN portal_read_model.assistant_request.question IS
  'Short-lived family question, deleted with the request after 24 hours.';

DROP FUNCTION public.embe_submit_assistant_request(uuid, text, integer);
CREATE FUNCTION public.embe_submit_assistant_request(
  p_idempotency_key uuid, p_topic text, p_days integer, p_question text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE saved_id uuid;
BEGIN
  IF p_idempotency_key IS NULL
    OR p_topic NOT IN ('ngu', 'bu', 'moi-truong', 'hoi-dap')
    OR p_days NOT IN (7, 14, 30)
    OR (p_topic = 'hoi-dap' AND char_length(btrim(p_question)) NOT BETWEEN 1 AND 600)
    OR (p_topic <> 'hoi-dap' AND p_question IS NOT NULL)
  THEN RAISE EXCEPTION 'invalid assistant request';
  END IF;
  DELETE FROM portal_read_model.assistant_request WHERE expires_at < timezone('utc', now());
  INSERT INTO portal_read_model.assistant_request (idempotency_key, topic, days, question)
  VALUES (p_idempotency_key, p_topic, p_days, CASE WHEN p_topic = 'hoi-dap' THEN btrim(p_question) ELSE NULL END)
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO saved_id;
  RETURN saved_id;
END;
$function$;

DROP FUNCTION public.embe_claim_assistant_requests(integer);
CREATE FUNCTION public.embe_claim_assistant_requests(p_limit integer DEFAULT 5)
RETURNS TABLE (id uuid, topic text, days smallint, question text)
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
  RETURNING queue.id, queue.topic, queue.days, queue.question;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_submit_assistant_request(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_assistant_requests(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_submit_assistant_request(uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_assistant_requests(integer) TO service_role;
