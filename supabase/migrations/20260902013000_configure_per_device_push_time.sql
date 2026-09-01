-- Let each family phone choose its own quiet daily reminder time.
DROP FUNCTION IF EXISTS public.embe_upsert_push_subscription(text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.embe_upsert_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_device_role text, p_timezone text, p_notify_at time
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid;
BEGIN
  IF char_length(p_endpoint) NOT BETWEEN 1 AND 2048 OR p_endpoint !~ '^https://'
     OR char_length(p_p256dh) NOT BETWEEN 80 AND 128 OR char_length(p_auth) NOT BETWEEN 16 AND 64
     OR p_device_role NOT IN ('mother', 'father', 'family') OR char_length(p_timezone) NOT BETWEEN 1 AND 64
     OR p_notify_at IS NULL THEN
    RAISE EXCEPTION 'invalid push subscription';
  END IF;
  INSERT INTO portal_read_model.push_subscription (endpoint, p256dh, auth, device_role, timezone, notify_at)
  VALUES (p_endpoint, p_p256dh, p_auth, p_device_role, p_timezone, p_notify_at)
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
    device_role = EXCLUDED.device_role, timezone = EXCLUDED.timezone, notify_at = EXCLUDED.notify_at,
    enabled = true, disabled_at = NULL, last_seen_at = timezone('utc', now()), updated_at = timezone('utc', now())
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_update_push_schedule(p_endpoint text, p_notify_at time)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF char_length(p_endpoint) NOT BETWEEN 1 AND 2048 OR p_endpoint !~ '^https://' OR p_notify_at IS NULL THEN
    RAISE EXCEPTION 'invalid push schedule';
  END IF;
  UPDATE portal_read_model.push_subscription
  SET notify_at = p_notify_at, updated_at = timezone('utc', now()), last_seen_at = timezone('utc', now())
  WHERE endpoint = p_endpoint AND enabled;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_upsert_push_subscription(text,text,text,text,text,time) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_update_push_schedule(text,time) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_upsert_push_subscription(text,text,text,text,text,time) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_update_push_schedule(text,time) TO service_role;
