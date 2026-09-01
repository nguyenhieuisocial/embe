CREATE TABLE portal_read_model.baby_care_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('feeding', 'pumping', 'sleep', 'diaper', 'temperature', 'care')),
  occurred_at timestamptz NOT NULL,
  ended_at timestamptz CHECK (ended_at IS NULL OR ended_at >= occurred_at),
  caregiver text NOT NULL CHECK (caregiver IN ('mother', 'father')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 2000),
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'processing', 'synced', 'failed')),
  sync_attempts smallint NOT NULL DEFAULT 0 CHECK (sync_attempts BETWEEN 0 AND 5),
  next_sync_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  babybuddy_id integer CHECK (babybuddy_id IS NULL OR babybuddy_id > 0),
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);
CREATE INDEX baby_care_event_timeline_idx ON portal_read_model.baby_care_event (occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX baby_care_event_sync_idx ON portal_read_model.baby_care_event (next_sync_at, created_at)
  WHERE deleted_at IS NULL AND sync_status IN ('pending', 'failed', 'processing') AND sync_attempts < 5;
ALTER TABLE portal_read_model.baby_care_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.baby_care_event FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.baby_care_event FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.baby_care_event TO service_role;
CREATE POLICY baby_care_event_deny_clients ON portal_read_model.baby_care_event FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_create_baby_care_event(
  p_idempotency_key uuid, p_kind text, p_occurred_at timestamptz, p_ended_at timestamptz,
  p_caregiver text, p_details jsonb
) RETURNS SETOF portal_read_model.baby_care_event
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_idempotency_key IS NULL OR p_kind NOT IN ('feeding', 'pumping', 'sleep', 'diaper', 'temperature', 'care')
     OR p_occurred_at IS NULL OR p_occurred_at > timezone('utc', now()) + interval '5 minutes'
     OR p_occurred_at < timezone('utc', now()) - interval '2 years'
     OR (p_ended_at IS NOT NULL AND p_ended_at < p_occurred_at)
     OR p_caregiver NOT IN ('mother', 'father') OR jsonb_typeof(p_details) <> 'object'
     OR octet_length(p_details::text) > 2000 THEN RAISE EXCEPTION 'invalid baby care event'; END IF;
  RETURN QUERY INSERT INTO portal_read_model.baby_care_event (
    idempotency_key, kind, occurred_at, ended_at, caregiver, details
  ) VALUES (p_idempotency_key, p_kind, p_occurred_at, p_ended_at, p_caregiver, p_details)
  ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING *;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_end_baby_care_event(p_id uuid, p_ended_at timestamptz)
RETURNS SETOF portal_read_model.baby_care_event
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  RETURN QUERY UPDATE portal_read_model.baby_care_event SET ended_at = p_ended_at,
    sync_status = CASE WHEN sync_status = 'synced' THEN 'pending' ELSE sync_status END,
    next_sync_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NULL AND ended_at IS NULL AND p_ended_at >= occurred_at
  RETURNING *;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_list_baby_care_events(p_day date)
RETURNS SETOF portal_read_model.baby_care_event
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT * FROM portal_read_model.baby_care_event
  WHERE deleted_at IS NULL
    AND occurred_at >= p_day::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
    AND occurred_at < (p_day + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
  ORDER BY occurred_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_baby_care_sync(p_now timestamptz, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid sync claim'; END IF;
  WITH candidates AS (
    SELECT id FROM portal_read_model.baby_care_event
    WHERE deleted_at IS NULL AND sync_attempts < 5 AND next_sync_at <= p_now
      AND (sync_status IN ('pending', 'failed') OR sync_status = 'processing' AND updated_at < p_now - interval '10 minutes')
      AND (kind NOT IN ('feeding', 'sleep', 'pumping') OR ended_at IS NOT NULL)
    ORDER BY created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE portal_read_model.baby_care_event AS event SET sync_status = 'processing',
      sync_attempts = sync_attempts + 1, updated_at = timezone('utc', now())
    FROM candidates WHERE event.id = candidates.id RETURNING event.*
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'occurred_at', occurred_at, 'ended_at', ended_at,
    'caregiver', caregiver, 'details', details, 'babybuddy_id', babybuddy_id
  ) ORDER BY created_at), '[]'::jsonb) INTO result FROM claimed;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_baby_care_sync(
  p_id uuid, p_success boolean, p_babybuddy_id integer DEFAULT NULL, p_error_code text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.baby_care_event SET
    sync_status = CASE WHEN p_success THEN 'synced' ELSE 'failed' END,
    babybuddy_id = CASE WHEN p_success THEN COALESCE(p_babybuddy_id, babybuddy_id) ELSE babybuddy_id END,
    last_error_code = CASE WHEN p_success THEN NULL ELSE left(COALESCE(p_error_code, 'unknown'), 80) END,
    next_sync_at = CASE WHEN p_success THEN next_sync_at ELSE timezone('utc', now()) + make_interval(mins => LEAST(60, power(2, sync_attempts)::integer)) END,
    updated_at = timezone('utc', now())
  WHERE id = p_id AND sync_status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'baby care event is not processing'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_create_baby_care_event(uuid,text,timestamptz,timestamptz,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_end_baby_care_event(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_list_baby_care_events(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_baby_care_sync(timestamptz,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_baby_care_sync(uuid,boolean,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_baby_care_event(uuid,text,timestamptz,timestamptz,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_end_baby_care_event(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_baby_care_events(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_baby_care_sync(timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_baby_care_sync(uuid,boolean,integer,text) TO service_role;

COMMENT ON TABLE portal_read_model.baby_care_event IS 'Offline-tolerant portal events queued for Baby Buddy synchronization.';
