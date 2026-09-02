BEGIN;

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

COMMIT;
