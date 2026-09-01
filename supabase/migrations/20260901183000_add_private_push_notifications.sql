-- Private Web Push subscriptions and a deduplicated delivery queue.
-- Browser clients never access these tables directly.

CREATE TABLE portal_read_model.push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 1 AND 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 80 AND 128),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 16 AND 64),
  device_role text NOT NULL CHECK (device_role IN ('mother', 'father', 'family')),
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK (char_length(timezone) BETWEEN 1 AND 64),
  notify_at time NOT NULL DEFAULT TIME '08:00',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_seen_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  disabled_at timestamptz
);

CREATE INDEX push_subscription_enabled_idx ON portal_read_model.push_subscription (notify_at, id) WHERE enabled;

CREATE TABLE portal_read_model.push_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES portal_read_model.push_subscription(id) ON DELETE CASCADE,
  notification_key text NOT NULL CHECK (char_length(notification_key) BETWEEN 1 AND 120),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  target_url text NOT NULL CHECK (target_url ~ '^/[^/]' OR target_url = '/'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) <= 80),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  sent_at timestamptz,
  UNIQUE (subscription_id, notification_key)
);

CREATE INDEX push_delivery_pending_idx ON portal_read_model.push_delivery (next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed', 'processing') AND attempt_count < 5;

ALTER TABLE portal_read_model.push_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.push_subscription FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.push_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.push_delivery FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.push_subscription, portal_read_model.push_delivery FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.push_subscription, portal_read_model.push_delivery TO service_role;
CREATE POLICY push_subscription_deny_clients ON portal_read_model.push_subscription FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY push_delivery_deny_clients ON portal_read_model.push_delivery FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_upsert_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_device_role text, p_timezone text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid;
BEGIN
  IF char_length(p_endpoint) NOT BETWEEN 1 AND 2048 OR p_endpoint !~ '^https://'
     OR char_length(p_p256dh) NOT BETWEEN 80 AND 128 OR char_length(p_auth) NOT BETWEEN 16 AND 64
     OR p_device_role NOT IN ('mother', 'father', 'family') OR char_length(p_timezone) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'invalid push subscription';
  END IF;
  INSERT INTO portal_read_model.push_subscription (endpoint, p256dh, auth, device_role, timezone)
  VALUES (p_endpoint, p_p256dh, p_auth, p_device_role, p_timezone)
  ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
    device_role = EXCLUDED.device_role, timezone = EXCLUDED.timezone, enabled = true,
    disabled_at = NULL, last_seen_at = timezone('utc', now()), updated_at = timezone('utc', now())
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_disable_push_subscription(p_endpoint text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  UPDATE portal_read_model.push_subscription SET enabled = false, disabled_at = timezone('utc', now()),
    updated_at = timezone('utc', now()) WHERE endpoint = p_endpoint;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_due_push_notifications(p_now timestamptz, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_now IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid push claim'; END IF;

  INSERT INTO portal_read_model.push_delivery (subscription_id, notification_key, title, body, target_url)
  SELECT subscription.id, 'daily:' || local_day.value::text, 'EmBe nhắc nhẹ',
    concat_ws(' · ',
      CASE WHEN digest.tasks_due > 0 THEN digest.tasks_due || ' việc cần làm hôm nay' END,
      CASE WHEN digest.appointments_due > 0 THEN digest.appointments_due || ' lịch khám trong 2 ngày tới' END,
      CASE WHEN digest.inventory_low > 0 THEN digest.inventory_low || ' đồ dùng sắp hết' END
    ),
    CASE WHEN digest.appointments_due > 0 THEN '/me-bau#ho-so-kham'
         WHEN digest.tasks_due > 0 THEN '/ke-hoach' ELSE '/do-dung' END
  FROM portal_read_model.push_subscription AS subscription
  CROSS JOIN LATERAL (SELECT (p_now AT TIME ZONE subscription.timezone)::date AS value) AS local_day
  CROSS JOIN LATERAL (SELECT
    (SELECT count(*) FROM portal_read_model.family_task AS task
      LEFT JOIN portal_read_model.family_task_completion AS completion ON completion.task_id = task.id AND completion.occurrence_on = local_day.value
      WHERE task.deleted_at IS NULL AND completion.task_id IS NULL AND task.category <> 'appointment'
        AND task.owner_role IN ('family', subscription.device_role)
        AND local_day.value >= task.due_on AND (task.repeat_rule = 'daily'
          OR task.repeat_rule = 'none' AND task.due_on = local_day.value
          OR task.repeat_rule = 'weekly' AND extract(isodow FROM task.due_on) = extract(isodow FROM local_day.value))) AS tasks_due,
    (SELECT count(*) FROM portal_read_model.family_task AS task WHERE task.deleted_at IS NULL AND task.category = 'appointment'
      AND task.owner_role IN ('family', subscription.device_role) AND task.due_on BETWEEN local_day.value AND local_day.value + 1) AS appointments_due,
    (SELECT count(*) FROM portal_read_model.inventory_item AS item WHERE item.needs_restock) AS inventory_low
  ) AS digest
  WHERE subscription.enabled
    AND (p_now AT TIME ZONE subscription.timezone)::time >= subscription.notify_at
    AND (p_now AT TIME ZONE subscription.timezone)::time < subscription.notify_at + interval '1 hour'
    AND digest.tasks_due + digest.appointments_due + digest.inventory_low > 0
  ON CONFLICT (subscription_id, notification_key) DO NOTHING;

  WITH candidates AS (
    SELECT delivery.id FROM portal_read_model.push_delivery AS delivery
    WHERE delivery.attempt_count < 5 AND delivery.next_attempt_at <= p_now
      AND (delivery.status IN ('pending', 'failed') OR delivery.status = 'processing' AND delivery.updated_at < p_now - interval '10 minutes')
    ORDER BY delivery.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE portal_read_model.push_delivery AS delivery SET status = 'processing', attempt_count = attempt_count + 1,
      updated_at = timezone('utc', now()) FROM candidates WHERE delivery.id = candidates.id
    RETURNING delivery.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', claimed.id, 'endpoint', subscription.endpoint, 'p256dh', subscription.p256dh, 'auth', subscription.auth,
    'title', claimed.title, 'body', claimed.body, 'url', claimed.target_url, 'tag', claimed.notification_key
  )), '[]'::jsonb) INTO result
  FROM claimed JOIN portal_read_model.push_subscription AS subscription ON subscription.id = claimed.subscription_id
  WHERE subscription.enabled;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_push_delivery(p_id uuid, p_sent boolean, p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.push_delivery SET status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
    sent_at = CASE WHEN p_sent THEN timezone('utc', now()) ELSE NULL END,
    next_attempt_at = CASE WHEN p_sent THEN next_attempt_at ELSE timezone('utc', now()) + make_interval(mins => LEAST(60, power(2, attempt_count)::integer)) END,
    last_error_code = CASE WHEN p_sent THEN NULL ELSE left(COALESCE(p_error_code, 'unknown'), 80) END,
    updated_at = timezone('utc', now()) WHERE id = p_id AND status = 'processing';
  IF NOT FOUND THEN RAISE EXCEPTION 'push delivery is not processing'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_upsert_push_subscription(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_disable_push_subscription(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_due_push_notifications(timestamptz,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_complete_push_delivery(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_upsert_push_subscription(text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_disable_push_subscription(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_due_push_notifications(timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_complete_push_delivery(uuid,boolean,text) TO service_role;

COMMENT ON TABLE portal_read_model.push_subscription IS 'Private per-device Web Push endpoints for Hiếu and Ngân.';
COMMENT ON TABLE portal_read_model.push_delivery IS 'Deduplicated retryable family reminder deliveries.';
