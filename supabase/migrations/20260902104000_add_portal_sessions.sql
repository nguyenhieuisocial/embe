BEGIN;

CREATE TABLE portal_read_model.portal_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_name text NOT NULL CHECK (char_length(btrim(device_name)) BETWEEN 1 AND 80),
  auth_method text NOT NULL CHECK (auth_method IN ('password', 'passkey')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  revoked_at timestamptz
);
CREATE INDEX portal_session_active_idx ON portal_read_model.portal_session (expires_at, last_seen_at DESC) WHERE revoked_at IS NULL;
ALTER TABLE portal_read_model.portal_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.portal_session FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.portal_session FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.portal_session TO service_role;
CREATE POLICY portal_session_deny_clients ON portal_read_model.portal_session
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_create_portal_session(p_device_name text, p_auth_method text, p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result uuid;
BEGIN
  IF char_length(btrim(COALESCE(p_device_name, ''))) NOT BETWEEN 1 AND 80
    OR p_auth_method NOT IN ('password', 'passkey')
    OR p_expires_at <= now() OR p_expires_at > now() + interval '31 days'
  THEN RAISE EXCEPTION 'invalid portal session'; END IF;
  INSERT INTO portal_read_model.portal_session (device_name, auth_method, expires_at)
    VALUES (btrim(p_device_name), p_auth_method, p_expires_at) RETURNING id INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_verify_portal_session(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.portal_session SET last_seen_at = timezone('utc', now())
    WHERE id = p_id AND revoked_at IS NULL AND expires_at > now()
      AND last_seen_at < now() - interval '15 minutes';
  RETURN EXISTS (SELECT 1 FROM portal_read_model.portal_session
    WHERE id = p_id AND revoked_at IS NULL AND expires_at > now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_list_portal_sessions(p_current_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', session.id, 'device_name', session.device_name, 'auth_method', session.auth_method,
    'created_at', session.created_at, 'last_seen_at', session.last_seen_at,
    'current', session.id = p_current_id
  ) ORDER BY (session.id = p_current_id) DESC, session.last_seen_at DESC), '[]'::jsonb)
  FROM portal_read_model.portal_session AS session
  WHERE session.revoked_at IS NULL AND session.expires_at > now();
$function$;

CREATE OR REPLACE FUNCTION public.embe_revoke_portal_sessions(p_current_id uuid, p_target_id uuid, p_all boolean)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE affected integer;
BEGIN
  IF p_current_id IS NULL OR p_all IS NULL OR (NOT p_all AND p_target_id IS NULL)
    THEN RAISE EXCEPTION 'invalid session revocation'; END IF;
  UPDATE portal_read_model.portal_session SET revoked_at = timezone('utc', now())
    WHERE revoked_at IS NULL AND (p_all OR id = p_target_id);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_create_portal_session(text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_verify_portal_session(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_list_portal_sessions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_revoke_portal_sessions(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_portal_session(text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_verify_portal_session(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_portal_sessions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_revoke_portal_sessions(uuid,uuid,boolean) TO service_role;

COMMIT;
