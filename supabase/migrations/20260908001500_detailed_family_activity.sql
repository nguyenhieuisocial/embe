-- Backwards compatible: existing subscriptions keep private lock-screen previews.
ALTER TABLE portal_read_model.push_subscription ADD COLUMN detail_preview boolean NOT NULL DEFAULT false;
ALTER TABLE portal_read_model.family_activity_event
  ADD COLUMN body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 240),
  ADD COLUMN safe_body text NOT NULL DEFAULT '' CHECK (char_length(safe_body) <= 240);

CREATE FUNCTION public.embe_publish_family_activity_v2(
  p_event_id uuid, p_source_device_id uuid, p_source_endpoint text,
  p_activity_kind text, p_action text, p_subject text, p_target_url text,
  p_resource_type text, p_resource_id uuid
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  source_role text; actor text; verb text; subject text := p_subject;
  activity_title text; activity_body text; safe_body text; activity_url text := p_target_url;
  context jsonb; record_id uuid; details text; inserted_count integer;
BEGIN
  IF p_event_id IS NULL OR p_source_device_id IS NULL OR p_activity_kind IS NULL
    OR p_activity_kind NOT IN ('meal','health','medical','journal','memory','task','inventory','profile','baby')
    OR p_action IS NULL OR p_action NOT IN ('created','updated','deleted','uploaded','confirmed','imported','synced')
    OR p_subject IS NULL OR char_length(p_subject) NOT BETWEEN 1 AND 80
    OR p_target_url IS NULL OR p_target_url !~ '^/[A-Za-z0-9_/?#=&.-]*$' OR p_target_url LIKE '//%'
    OR char_length(p_target_url)>256
    OR (p_resource_type IS NOT NULL AND p_resource_type NOT IN ('record','document'))
    OR (p_source_endpoint IS NOT NULL AND (char_length(p_source_endpoint) NOT BETWEEN 1 AND 2048 OR p_source_endpoint !~ '^https://'))
  THEN RAISE sqlstate '22023'; END IF;

  -- An event and its recipient queue are one transaction. Retries cannot notify
  -- newly subscribed devices for an old event or change an already recorded event.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));
  IF EXISTS(SELECT 1 FROM portal_read_model.family_activity_event WHERE event_id=p_event_id) THEN
    IF NOT EXISTS(SELECT 1 FROM portal_read_model.family_activity_event WHERE event_id=p_event_id AND source_device_id=p_source_device_id)
    THEN RAISE sqlstate '22023'; END IF;
    RETURN 0;
  END IF;
  SELECT device_role INTO source_role FROM portal_read_model.push_subscription
  WHERE endpoint=p_source_endpoint AND enabled;
  actor := CASE source_role WHEN 'mother' THEN 'Mẹ Ngân' WHEN 'father' THEN 'Ba Hiếu' ELSE 'Nhà mình' END;
  verb := CASE p_action WHEN 'created' THEN 'đã thêm' WHEN 'deleted' THEN 'đã xóa'
    WHEN 'uploaded' THEN 'đã tải lên' WHEN 'confirmed' THEN 'đã xác nhận bản đọc'
    WHEN 'imported' THEN 'đã lưu dữ liệu từ' WHEN 'synced' THEN 'đã đồng bộ' ELSE 'đã cập nhật' END;

  IF p_activity_kind='medical' AND p_resource_id IS NOT NULL THEN
    record_id := p_resource_id;
    IF p_resource_type='document' THEN
      SELECT d.record_id INTO record_id FROM portal_read_model.pregnancy_medical_document d
      WHERE d.id=p_resource_id AND d.status='ready';
      IF record_id IS NULL THEN RETURN 0; END IF;
      IF p_action='confirmed' AND NOT EXISTS(SELECT 1 FROM portal_read_model.medical_document_scan
        WHERE document_id=p_resource_id AND confirmed_at IS NOT NULL) THEN RETURN 0; END IF;
      IF p_action='imported' AND NOT EXISTS(SELECT 1 FROM portal_read_model.medical_document_import
        WHERE document_id=p_resource_id) THEN RETURN 0; END IF;
    END IF;
    -- Only administrative context, never notes, medicines, measurements or OCR
    -- guesses. A document awaiting review must not be reported as a confirmed scan.
    SELECT jsonb_build_object('id',r.id,'kind',r.kind,'title',r.title,'provider',r.provider,
      'occurredAt',r.occurred_at,'dateOnly',r.document_date_only,'intake',r.document_intake,'status',r.status)
    INTO context FROM portal_read_model.pregnancy_medical_record r
    WHERE r.id=record_id AND (p_action='deleted' OR r.deleted_at IS NULL);
    IF context IS NULL THEN RETURN 0; END IF;
    IF NOT (context->>'intake')::boolean THEN
      subject := CASE context->>'kind' WHEN 'appointment' THEN CASE WHEN context->>'status'='planned' THEN 'lịch khám' ELSE 'lần khám' END
        WHEN 'ultrasound' THEN 'phiếu siêu âm' WHEN 'laboratory' THEN 'phiếu xét nghiệm'
        WHEN 'prescription' THEN 'đơn thuốc' WHEN 'receipt' THEN 'phiếu thu'
        WHEN 'clinical' THEN 'bệnh án' WHEN 'discharge' THEN 'giấy ra viện' ELSE 'hồ sơ khám' END;
      details := concat_ws(' · ', nullif(left(context->>'title',90),''),
        to_char((context->>'occurredAt')::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh',
          CASE WHEN (context->>'dateOnly')::boolean THEN 'DD/MM/YYYY' ELSE 'HH24:MI DD/MM/YYYY' END),
        nullif(left(context->>'provider',80),''));
    ELSE details := 'Tài liệu đã tải lên, cần kiểm tra bản đọc trước khi thêm dữ liệu vào hồ sơ.';
    END IF;
    IF p_action='imported' THEN activity_url := '/me-bau/ho-so#record-' || record_id::text; END IF;
  END IF;
  activity_title := left(actor || ' ' || verb || ' ' || subject,80);
  safe_body := CASE WHEN p_activity_kind='medical' THEN 'Mở EmBe để xem ' || subject || ' và thông tin liên quan.'
    ELSE 'Mở EmBe để xem ' || subject || ' vừa thay đổi.' END;
  activity_body := left(COALESCE(nullif(regexp_replace(details, '[[:cntrl:]]+', ' ', 'g'),''),safe_body),240);
  INSERT INTO portal_read_model.family_activity_event(event_id,source_device_id,activity_kind,title,target_url,body,safe_body)
  VALUES(p_event_id,p_source_device_id,p_activity_kind,activity_title,activity_url,activity_body,safe_body);
  INSERT INTO portal_read_model.push_delivery(subscription_id,notification_key,title,body,target_url)
  SELECT s.id,'activity:'||p_event_id::text,activity_title,CASE WHEN s.detail_preview THEN activity_body ELSE safe_body END,activity_url
  FROM portal_read_model.push_subscription s WHERE s.enabled AND s.endpoint IS DISTINCT FROM p_source_endpoint
    AND (source_role IS NULL OR source_role='family' OR s.device_role<>source_role)
  ON CONFLICT(subscription_id,notification_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  DELETE FROM portal_read_model.family_activity_event WHERE created_at<now()-interval '30 days';
  RETURN inserted_count;
END $function$;

CREATE FUNCTION public.embe_list_family_activity_v2(p_device_id uuid,p_after timestamptz,p_limit integer DEFAULT 10)
RETURNS TABLE(event_id uuid,activity_kind text,title text,body text,target_url text,created_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT e.event_id,e.activity_kind,e.title,e.body,e.target_url,e.created_at
  FROM portal_read_model.family_activity_event e
  WHERE e.source_device_id<>p_device_id AND e.created_at>p_after
    AND p_after>=now()-interval '7 days' AND p_limit BETWEEN 1 AND 20
  ORDER BY e.created_at,e.event_id LIMIT p_limit;
$function$;

CREATE FUNCTION public.embe_push_preview(p_endpoint text,p_enabled boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_endpoint IS NULL OR char_length(p_endpoint) NOT BETWEEN 1 AND 2048 OR p_endpoint !~ '^https://' THEN RAISE sqlstate '22023'; END IF;
  IF p_enabled IS NOT NULL THEN
    UPDATE portal_read_model.push_subscription SET detail_preview=p_enabled,updated_at=now()
    WHERE endpoint=p_endpoint AND enabled;
    -- Hide detail in waiting deliveries too when the recipient disables preview.
    IF NOT p_enabled THEN
      UPDATE portal_read_model.push_delivery d SET body=e.safe_body
      FROM portal_read_model.push_subscription s,portal_read_model.family_activity_event e
      WHERE d.subscription_id=s.id AND s.endpoint=p_endpoint AND d.status<>'sent'
        AND d.notification_key='activity:'||e.event_id::text AND e.safe_body<>'';
    END IF;
  END IF;
  SELECT jsonb_build_object('detailPreview',detail_preview) INTO result
  FROM portal_read_model.push_subscription WHERE endpoint=p_endpoint AND enabled;
  RETURN result;
END $function$;

REVOKE ALL ON FUNCTION public.embe_publish_family_activity_v2(uuid,uuid,text,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_list_family_activity_v2(uuid,timestamptz,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_push_preview(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_publish_family_activity_v2(uuid,uuid,text,text,text,text,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_family_activity_v2(uuid,timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_push_preview(text,boolean) TO service_role;
