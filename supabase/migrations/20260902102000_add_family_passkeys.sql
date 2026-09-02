BEGIN;

CREATE TABLE portal_read_model.family_passkey (
  credential_id text PRIMARY KEY CHECK (
    char_length(credential_id) BETWEEN 8 AND 1024 AND credential_id ~ '^[A-Za-z0-9_-]+$'
  ),
  public_key text NOT NULL CHECK (
    char_length(public_key) BETWEEN 4 AND 4096 AND public_key ~ '^[A-Za-z0-9_-]+$'
  ),
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports text[] NOT NULL DEFAULT '{}'::text[] CHECK (
    transports <@ ARRAY['ble', 'hybrid', 'internal', 'nfc', 'usb']::text[]
  ),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 60),
  device_type text NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_used_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX family_passkey_active_idx
  ON portal_read_model.family_passkey (active, created_at DESC);

ALTER TABLE portal_read_model.family_passkey ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_passkey FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_passkey FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.family_passkey TO service_role;
CREATE POLICY family_passkey_deny_clients ON portal_read_model.family_passkey
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_list_passkeys()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'credential_id', credential.credential_id,
    'public_key', credential.public_key,
    'counter', credential.counter,
    'transports', credential.transports,
    'label', credential.label,
    'backed_up', credential.backed_up,
    'created_at', credential.created_at,
    'last_used_at', credential.last_used_at
  ) ORDER BY credential.created_at), '[]'::jsonb)
  FROM portal_read_model.family_passkey AS credential
  WHERE credential.active;
$function$;

CREATE OR REPLACE FUNCTION public.embe_get_passkey(p_credential_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'credential_id', credential.credential_id,
    'public_key', credential.public_key,
    'counter', credential.counter,
    'transports', credential.transports
  )
  FROM portal_read_model.family_passkey AS credential
  WHERE credential.credential_id = p_credential_id AND credential.active;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_passkey(
  p_credential_id text, p_public_key text, p_counter bigint, p_transports text[],
  p_label text, p_device_type text, p_backed_up boolean
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF char_length(COALESCE(p_credential_id, '')) NOT BETWEEN 8 AND 1024
    OR p_credential_id !~ '^[A-Za-z0-9_-]+$'
    OR char_length(COALESCE(p_public_key, '')) NOT BETWEEN 4 AND 4096
    OR p_public_key !~ '^[A-Za-z0-9_-]+$'
    OR p_counter < 0
    OR NOT COALESCE(p_transports, '{}'::text[]) <@ ARRAY['ble', 'hybrid', 'internal', 'nfc', 'usb']::text[]
    OR char_length(btrim(COALESCE(p_label, ''))) NOT BETWEEN 1 AND 60
    OR p_device_type NOT IN ('singleDevice', 'multiDevice')
    OR p_backed_up IS NULL
  THEN RAISE EXCEPTION 'invalid passkey'; END IF;

  INSERT INTO portal_read_model.family_passkey (
    credential_id, public_key, counter, transports, label, device_type, backed_up, active
  ) VALUES (
    p_credential_id, p_public_key, p_counter, COALESCE(p_transports, '{}'::text[]),
    btrim(p_label), p_device_type, p_backed_up, true
  ) ON CONFLICT (credential_id) DO UPDATE SET
    public_key = EXCLUDED.public_key,
    counter = EXCLUDED.counter,
    transports = EXCLUDED.transports,
    label = EXCLUDED.label,
    device_type = EXCLUDED.device_type,
    backed_up = EXCLUDED.backed_up,
    active = true,
    updated_at = timezone('utc', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_touch_passkey(p_credential_id text, p_counter bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_counter < 0 THEN RAISE EXCEPTION 'invalid passkey counter'; END IF;
  UPDATE portal_read_model.family_passkey
  SET counter = p_counter, last_used_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE credential_id = p_credential_id AND active AND p_counter >= counter;
  IF NOT FOUND THEN RAISE EXCEPTION 'passkey not found or stale counter'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_disable_passkey(p_credential_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.family_passkey
  SET active = false, updated_at = timezone('utc', now())
  WHERE credential_id = p_credential_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'passkey not found'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_list_passkeys() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_passkey(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_passkey(text,text,bigint,text[],text,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_touch_passkey(text,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_disable_passkey(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_passkeys() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_passkey(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_passkey(text,text,bigint,text[],text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_touch_passkey(text,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_disable_passkey(text) TO service_role;

COMMENT ON TABLE portal_read_model.family_passkey IS
  'Public WebAuthn credentials only. Private passkey material remains on family devices/iCloud Keychain.';

COMMIT;
