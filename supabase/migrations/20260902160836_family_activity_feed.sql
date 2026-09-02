-- Keep a small private activity feed so an open phone sees family updates even
-- when iOS push permission has not been granted on that device.

CREATE TABLE portal_read_model.family_activity_event (
  event_id uuid PRIMARY KEY,
  source_device_id uuid NOT NULL,
  activity_kind text NOT NULL CHECK (activity_kind IN ('meal','health','medical','journal','memory','task','inventory','profile','baby')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  target_url text NOT NULL CHECK (target_url ~ '^/[A-Za-z0-9_/?#=&.-]*$'),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX family_activity_event_created_idx
  ON portal_read_model.family_activity_event (created_at DESC);

ALTER TABLE portal_read_model.family_activity_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_activity_event FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_activity_event FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE portal_read_model.family_activity_event TO service_role;
CREATE POLICY family_activity_event_deny_clients ON portal_read_model.family_activity_event
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_record_family_activity(
  p_event_id uuid,
  p_source_device_id uuid,
  p_activity_kind text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE activity_title text; activity_url text;
BEGIN
  IF p_event_id IS NULL OR p_source_device_id IS NULL
     OR p_activity_kind NOT IN ('meal','health','medical','journal','memory','task','inventory','profile','baby') THEN
    RAISE EXCEPTION 'invalid family activity';
  END IF;
  activity_title := CASE p_activity_kind
    WHEN 'meal' THEN 'Nhà mình vừa cập nhật bữa ăn'
    WHEN 'health' THEN 'Nhà mình vừa cập nhật sức khỏe'
    WHEN 'medical' THEN 'Nhà mình vừa cập nhật hồ sơ khám'
    WHEN 'journal' THEN 'Nhà mình vừa ghi nhật ký'
    WHEN 'memory' THEN 'Nhà mình vừa thêm kỷ niệm'
    WHEN 'task' THEN 'Nhà mình vừa cập nhật kế hoạch'
    WHEN 'inventory' THEN 'Nhà mình vừa cập nhật đồ dùng'
    WHEN 'profile' THEN 'Nhà mình vừa cập nhật thông tin'
    ELSE 'Nhà mình vừa cập nhật sổ của Bé'
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
  INSERT INTO portal_read_model.family_activity_event(event_id, source_device_id, activity_kind, title, target_url)
  VALUES (p_event_id, p_source_device_id, p_activity_kind, activity_title, activity_url)
  ON CONFLICT (event_id) DO NOTHING;
  DELETE FROM portal_read_model.family_activity_event WHERE created_at < timezone('utc', now()) - interval '30 days';
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_list_family_activity(
  p_device_id uuid,
  p_after timestamptz,
  p_limit integer DEFAULT 10
) RETURNS TABLE(event_id uuid, activity_kind text, title text, target_url text, created_at timestamptz)
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $function$
  SELECT event.event_id, event.activity_kind, event.title, event.target_url, event.created_at
  FROM portal_read_model.family_activity_event AS event
  WHERE event.source_device_id <> p_device_id
    AND event.created_at > p_after
    AND p_after >= timezone('utc', now()) - interval '7 days'
    AND p_limit BETWEEN 1 AND 20
  ORDER BY event.created_at
  LIMIT p_limit;
$function$;

REVOKE ALL ON FUNCTION public.embe_record_family_activity(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_list_family_activity(uuid,timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_record_family_activity(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_list_family_activity(uuid,timestamptz,integer) TO service_role;
