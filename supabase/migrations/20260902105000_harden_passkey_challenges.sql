BEGIN;

CREATE TABLE portal_read_model.passkey_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_hash text NOT NULL CHECK (challenge_hash ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('login', 'register')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  consumed_at timestamptz
);
CREATE INDEX passkey_challenge_active_idx
  ON portal_read_model.passkey_challenge (expires_at)
  WHERE consumed_at IS NULL;
ALTER TABLE portal_read_model.passkey_challenge ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.passkey_challenge FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.passkey_challenge FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.passkey_challenge TO service_role;
CREATE POLICY passkey_challenge_deny_clients ON portal_read_model.passkey_challenge
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP FUNCTION public.embe_touch_passkey(text,bigint);
CREATE FUNCTION public.embe_touch_passkey(
  p_credential_id text, p_expected_counter bigint, p_new_counter bigint
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_expected_counter < 0 OR p_new_counter < 0 THEN
    RAISE EXCEPTION 'invalid passkey counter';
  END IF;
  UPDATE portal_read_model.family_passkey
  SET counter = p_new_counter,
      last_used_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE credential_id = p_credential_id
    AND active
    AND counter = p_expected_counter
    AND ((counter = 0 AND p_new_counter >= 0) OR (counter > 0 AND p_new_counter > counter));
  IF NOT FOUND THEN RAISE EXCEPTION 'passkey not found or stale counter'; END IF;
END;
$function$;

CREATE FUNCTION public.embe_create_passkey_challenge(
  p_challenge_hash text, p_purpose text, p_expires_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result uuid;
BEGIN
  IF p_challenge_hash !~ '^[a-f0-9]{64}$'
    OR p_purpose NOT IN ('login', 'register')
    OR p_expires_at <= now()
    OR p_expires_at > now() + interval '5 minutes 5 seconds'
  THEN RAISE EXCEPTION 'invalid passkey challenge'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('embe_passkey_challenge_cap'));
  DELETE FROM portal_read_model.passkey_challenge
    WHERE expires_at <= now() OR consumed_at IS NOT NULL;
  IF (SELECT count(*) FROM portal_read_model.passkey_challenge
      WHERE consumed_at IS NULL AND expires_at > now()) >= 20
  THEN RAISE EXCEPTION 'too many active passkey challenges'; END IF;

  INSERT INTO portal_read_model.passkey_challenge (challenge_hash, purpose, expires_at)
  VALUES (p_challenge_hash, p_purpose, p_expires_at)
  RETURNING id INTO result;
  RETURN result;
END;
$function$;

CREATE FUNCTION public.embe_consume_passkey_challenge(
  p_id uuid, p_challenge_hash text, p_purpose text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.passkey_challenge
  SET consumed_at = timezone('utc', now())
  WHERE id = p_id
    AND challenge_hash = p_challenge_hash
    AND purpose = p_purpose
    AND consumed_at IS NULL
    AND expires_at > now();
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_touch_passkey(text,bigint,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_create_passkey_challenge(text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_consume_passkey_challenge(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_touch_passkey(text,bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_create_passkey_challenge(text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_consume_passkey_challenge(uuid,text,text) TO service_role;

COMMIT;
