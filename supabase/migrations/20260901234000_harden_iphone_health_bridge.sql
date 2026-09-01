BEGIN;

CREATE OR REPLACE FUNCTION public.embe_create_iphone_health_device(p_token_hash text, p_label text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR char_length(btrim(COALESCE(p_label, ''))) NOT BETWEEN 1 AND 60
    THEN RAISE EXCEPTION 'invalid health device'; END IF;

  UPDATE portal_read_model.iphone_health_device
    SET active = false
    WHERE active AND last_synced_at IS NULL;

  INSERT INTO portal_read_model.iphone_health_device (token_hash, label)
    VALUES (p_token_hash, btrim(p_label)) RETURNING id INTO result_id;
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_probe_iphone_health(p_token_hash text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'device_id', device.id,
    'label', device.label,
    'last_synced_at', device.last_synced_at
  )
  FROM portal_read_model.iphone_health_device AS device
  WHERE device.token_hash = p_token_hash AND device.active
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.embe_probe_iphone_health(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_probe_iphone_health(text) TO service_role;

COMMIT;
