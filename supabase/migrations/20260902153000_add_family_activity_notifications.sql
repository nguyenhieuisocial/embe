-- Notify the other family member after a successful EmBe mutation.
-- Notification copy is deliberately generic so lock screens never expose private values.

CREATE OR REPLACE FUNCTION public.embe_enqueue_family_activity(
  p_event_id uuid,
  p_source_endpoint text,
  p_activity_kind text
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  source_role text;
  activity_title text;
  activity_body text;
  activity_url text;
  inserted_count integer;
BEGIN
  IF p_event_id IS NULL
     OR p_activity_kind NOT IN ('meal','health','medical','journal','memory','task','inventory','profile','baby')
     OR (p_source_endpoint IS NOT NULL AND (char_length(p_source_endpoint) NOT BETWEEN 1 AND 2048 OR p_source_endpoint !~ '^https://')) THEN
    RAISE EXCEPTION 'invalid family activity';
  END IF;

  SELECT subscription.device_role INTO source_role
  FROM portal_read_model.push_subscription AS subscription
  WHERE subscription.endpoint = p_source_endpoint AND subscription.enabled
  LIMIT 1;

  activity_title := CASE source_role
    WHEN 'mother' THEN 'Mẹ Ngân vừa cập nhật'
    WHEN 'father' THEN 'Ba Hiếu vừa cập nhật'
    ELSE 'Nhà mình vừa cập nhật'
  END;
  activity_body := CASE p_activity_kind
    WHEN 'meal' THEN 'Nhật ký bữa ăn có thông tin mới.'
    WHEN 'health' THEN 'Sổ theo dõi sức khỏe có thông tin mới.'
    WHEN 'medical' THEN 'Lịch hoặc hồ sơ khám có thông tin mới.'
    WHEN 'journal' THEN 'Nhật ký gia đình có ghi chép mới.'
    WHEN 'memory' THEN 'Kỷ niệm gia đình có nội dung mới.'
    WHEN 'task' THEN 'Kế hoạch của gia đình vừa được cập nhật.'
    WHEN 'inventory' THEN 'Danh sách đồ dùng vừa được cập nhật.'
    WHEN 'profile' THEN 'Thông tin gia đình vừa được cập nhật.'
    ELSE 'Sổ của Mẹ và Bé có thông tin mới.'
  END;
  activity_url := CASE p_activity_kind
    WHEN 'meal' THEN '/me-bau#bua-an'
    WHEN 'health' THEN '/me-bau#suc-khoe'
    WHEN 'medical' THEN '/me-bau/ho-so'
    WHEN 'journal' THEN '/nhat-ky'
    WHEN 'memory' THEN '/ky-niem'
    WHEN 'task' THEN '/ke-hoach'
    WHEN 'inventory' THEN '/do-dung'
    WHEN 'profile' THEN '/cai-dat'
    ELSE '/be'
  END;

  INSERT INTO portal_read_model.push_delivery (
    subscription_id, notification_key, title, body, target_url
  )
  SELECT subscription.id, 'activity:' || p_event_id::text, activity_title, activity_body, activity_url
  FROM portal_read_model.push_subscription AS subscription
  WHERE subscription.enabled
    AND subscription.endpoint IS DISTINCT FROM p_source_endpoint
    AND (source_role IS NULL OR source_role = 'family' OR subscription.device_role <> source_role)
  ON CONFLICT (subscription_id, notification_key) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_claim_family_activity(
  p_event_id uuid,
  p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_event_id IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid family activity claim';
  END IF;

  WITH candidates AS (
    SELECT delivery.id
    FROM portal_read_model.push_delivery AS delivery
    WHERE delivery.notification_key = 'activity:' || p_event_id::text
      AND delivery.attempt_count < 5
      AND delivery.next_attempt_at <= timezone('utc', now())
      AND delivery.status IN ('pending', 'failed')
    ORDER BY delivery.created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE portal_read_model.push_delivery AS delivery
    SET status = 'processing', attempt_count = attempt_count + 1, updated_at = timezone('utc', now())
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', claimed.id,
    'endpoint', subscription.endpoint,
    'p256dh', subscription.p256dh,
    'auth', subscription.auth,
    'title', claimed.title,
    'body', claimed.body,
    'url', claimed.target_url,
    'tag', claimed.notification_key
  )), '[]'::jsonb)
  INTO result
  FROM claimed
  JOIN portal_read_model.push_subscription AS subscription ON subscription.id = claimed.subscription_id
  WHERE subscription.enabled;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_enqueue_family_activity(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_family_activity(uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_enqueue_family_activity(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_family_activity(uuid,integer) TO service_role;

