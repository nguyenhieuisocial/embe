BEGIN;

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
    WHEN 'meal' THEN '/me-bau/bua-an'
    WHEN 'health' THEN '/me-bau/suc-khoe'
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

CREATE OR REPLACE FUNCTION public.embe_claim_due_push_notifications(p_now timestamptz,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_now IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid push claim'; END IF;

  INSERT INTO portal_read_model.push_delivery(subscription_id,notification_key,title,body,target_url)
  SELECT s.id,'daily:'||d.value::text,'EmBe nhắc nhẹ',concat_ws(' · ',
    CASE WHEN x.tasks_due>0 THEN x.tasks_due||' việc hôm nay' END,
    CASE WHEN x.pregnancy_due>0 THEN x.pregnancy_due||' lịch khám sắp tới' END,
    CASE WHEN x.baby_due>0 THEN x.baby_due||' lịch của Bé sắp tới' END,
    CASE WHEN x.mother_checkin>0 THEN 'Mẹ chưa ghi hồi phục hôm nay' END,
    CASE WHEN x.inventory_low>0 THEN x.inventory_low||' đồ dùng sắp hết' END),
    CASE WHEN x.baby_due>0 THEN '/be/ho-so' WHEN x.pregnancy_due>0 THEN '/me-bau/ho-so#ho-so-kham'
      WHEN x.mother_checkin>0 THEN '/me' WHEN x.tasks_due>0 THEN '/ke-hoach' ELSE '/do-dung' END
  FROM portal_read_model.push_subscription s
  CROSS JOIN LATERAL(SELECT(p_now AT TIME ZONE s.timezone)::date value)d
  CROSS JOIN LATERAL(SELECT
    (SELECT count(*) FROM portal_read_model.family_task t LEFT JOIN portal_read_model.family_task_completion c ON c.task_id=t.id AND c.occurrence_on=d.value WHERE t.deleted_at IS NULL AND c.task_id IS NULL AND t.category<>'appointment' AND t.owner_role IN('family',s.device_role) AND d.value>=t.due_on AND(t.repeat_rule='daily' OR t.repeat_rule='none' AND t.due_on=d.value OR t.repeat_rule='weekly' AND extract(isodow FROM t.due_on)=extract(isodow FROM d.value))) tasks_due,
    (SELECT count(*) FROM portal_read_model.family_task t WHERE t.deleted_at IS NULL AND t.category='appointment' AND t.owner_role IN('family',s.device_role) AND t.due_on BETWEEN d.value AND d.value+1 AND NOT EXISTS(SELECT 1 FROM portal_read_model.family_lifecycle l WHERE l.singleton_id=1 AND l.birth_occurred_at IS NOT NULL)) pregnancy_due,
    (SELECT count(*) FROM portal_read_model.baby_medical_record b WHERE b.deleted_at IS NULL AND b.status='planned' AND (b.occurred_at AT TIME ZONE s.timezone)::date BETWEEN d.value AND d.value+2) baby_due,
    (SELECT CASE WHEN EXISTS(SELECT 1 FROM portal_read_model.family_lifecycle l WHERE l.singleton_id=1 AND l.birth_occurred_at IS NOT NULL AND l.birth_occurred_at>p_now-interval '42 days') AND NOT EXISTS(SELECT 1 FROM portal_read_model.postpartum_health_day h WHERE h.day=d.value) THEN 1 ELSE 0 END) mother_checkin,
    (SELECT count(*) FROM portal_read_model.inventory_item i WHERE i.needs_restock) inventory_low)x
  WHERE s.enabled AND(p_now AT TIME ZONE s.timezone)::time>=s.notify_at
    AND(p_now AT TIME ZONE s.timezone)::time<s.notify_at+interval '1 hour'
    AND x.tasks_due+x.pregnancy_due+x.baby_due+x.mother_checkin+x.inventory_low>0
  ON CONFLICT(subscription_id,notification_key)DO NOTHING;

  INSERT INTO portal_read_model.push_delivery(subscription_id,notification_key,title,body,target_url)
  SELECT s.id,
    'care:'||due.reminder_day::text||':'||to_char(due.reminder_time,'HH24MI'),
    'EmBe nhắc nhẹ', due.waiting_count||' lần Thuốc/vi chất đang chờ', '/me-bau/suc-khoe-iphone#vi-chat-thuoc'
  FROM portal_read_model.push_subscription AS s
  CROSS JOIN LATERAL (SELECT p_now AT TIME ZONE s.timezone AS local_now) AS local_clock
  CROSS JOIN LATERAL (
    SELECT reminder_day.day AS reminder_day, schedule.reminder_time, count(*) AS waiting_count
    FROM (VALUES (local_clock.local_now::date), (local_clock.local_now::date - 1)) AS reminder_day(day)
    JOIN portal_read_model.pregnancy_care_plan AS entry ON entry.active
    CROSS JOIN LATERAL unnest(entry.reminder_times) WITH ORDINALITY AS schedule(reminder_time, slot)
    WHERE local_clock.local_now >= reminder_day.day + schedule.reminder_time
      AND local_clock.local_now < reminder_day.day + schedule.reminder_time + interval '35 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM portal_read_model.pregnancy_care_intake AS intake
        WHERE intake.plan_id = entry.id AND intake.day = reminder_day.day
          AND intake.slot = schedule.slot
      )
    GROUP BY reminder_day.day, schedule.reminder_time
  ) AS due
  WHERE s.enabled AND s.device_role = 'mother'
  ON CONFLICT(subscription_id,notification_key) DO NOTHING;

  WITH candidates AS(
    SELECT d.id FROM portal_read_model.push_delivery d
    WHERE d.attempt_count<5 AND d.next_attempt_at<=p_now
      AND(d.status IN('pending','failed') OR d.status='processing' AND d.updated_at<p_now-interval '10 minutes')
    ORDER BY d.created_at LIMIT p_limit FOR UPDATE SKIP LOCKED
  ),claimed AS(
    UPDATE portal_read_model.push_delivery d SET status='processing',attempt_count=attempt_count+1,
      updated_at=timezone('utc',now()) FROM candidates WHERE d.id=candidates.id RETURNING d.*
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'endpoint',s.endpoint,'p256dh',s.p256dh,
    'auth',s.auth,'title',c.title,'body',c.body,'url',c.target_url,'tag',c.notification_key)),'[]'::jsonb)
  INTO result FROM claimed c JOIN portal_read_model.push_subscription s ON s.id=c.subscription_id WHERE s.enabled;
  RETURN result;
END;
$function$;

UPDATE portal_read_model.family_activity_event
SET target_url = CASE activity_kind
  WHEN 'meal' THEN '/me-bau/bua-an'
  WHEN 'health' THEN '/me-bau/suc-khoe'
  ELSE target_url
END
WHERE activity_kind IN ('meal', 'health');

UPDATE portal_read_model.push_delivery
SET target_url = CASE target_url
  WHEN '/me-bau#ho-so-kham' THEN '/me-bau/ho-so#ho-so-kham'
  WHEN '/me-bau#vi-chat-thuoc' THEN '/me-bau/suc-khoe-iphone#vi-chat-thuoc'
  ELSE target_url
END
WHERE status IN ('pending', 'failed')
  AND target_url IN ('/me-bau#ho-so-kham', '/me-bau#vi-chat-thuoc');

REVOKE ALL ON FUNCTION public.embe_record_family_activity(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_due_push_notifications(timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_record_family_activity(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_due_push_notifications(timestamptz,integer) TO service_role;

COMMIT;
