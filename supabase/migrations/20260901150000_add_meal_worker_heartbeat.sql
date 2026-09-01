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
