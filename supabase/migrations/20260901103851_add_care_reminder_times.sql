ALTER TABLE portal_read_model.pregnancy_care_plan
  ADD COLUMN reminder_times time[] NOT NULL DEFAULT '{}'::time[];

ALTER TABLE portal_read_model.pregnancy_care_plan
  ADD CONSTRAINT pregnancy_care_plan_reminder_times_valid CHECK (
    cardinality(reminder_times) IN (0, times_per_day)
    AND cardinality(reminder_times) <= 6
  );

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_care(p_day date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(profile) - 'singleton' - 'updated_at'
      FROM portal_read_model.pregnancy_wellness_profile AS profile WHERE profile.singleton),
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', entry.id, 'category', entry.category, 'name', entry.name,
      'dose_display', entry.dose_display, 'times_per_day', entry.times_per_day,
      'reminder_times', to_jsonb(entry.reminder_times),
      'instructions', entry.instructions, 'nutrient_amounts', entry.nutrient_amounts,
      'confirmed_by_clinician', entry.confirmed_by_clinician, 'active', entry.active,
      'taken_slots', COALESCE((SELECT jsonb_agg(intake.slot ORDER BY intake.slot)
        FROM portal_read_model.pregnancy_care_intake AS intake
        WHERE intake.plan_id = entry.id AND intake.day = p_day), '[]'::jsonb)
    ) ORDER BY entry.active DESC, entry.category, entry.created_at)
      FROM portal_read_model.pregnancy_care_plan AS entry), '[]'::jsonb),
    'iphone_health', (SELECT to_jsonb(health) - 'device_id'
      FROM portal_read_model.iphone_health_daily AS health
      WHERE health.day = p_day ORDER BY health.updated_at DESC LIMIT 1),
    'iphone_devices', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', device.id, 'label', device.label, 'active', device.active,
      'last_synced_at', device.last_synced_at
    ) ORDER BY device.created_at) FROM portal_read_model.iphone_health_device AS device), '[]'::jsonb)
  );
$function$;

DROP FUNCTION IF EXISTS public.embe_save_pregnancy_care_plan(uuid,text,text,text,smallint,text,jsonb,boolean,boolean);
CREATE FUNCTION public.embe_save_pregnancy_care_plan(
  p_id uuid, p_category text, p_name text, p_dose_display text, p_times_per_day smallint,
  p_reminder_times time[], p_instructions text, p_nutrient_amounts jsonb,
  p_confirmed_by_clinician boolean, p_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_category NOT IN ('medicine', 'supplement')
    OR char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 80
    OR char_length(btrim(COALESCE(p_dose_display, ''))) NOT BETWEEN 1 AND 80
    OR p_times_per_day NOT BETWEEN 1 AND 6
    OR cardinality(COALESCE(p_reminder_times, '{}'::time[])) <> p_times_per_day
    OR (SELECT count(DISTINCT value) FROM unnest(COALESCE(p_reminder_times, '{}'::time[])) AS value) <> p_times_per_day
    OR COALESCE(p_reminder_times, '{}'::time[]) <> ARRAY(SELECT value FROM unnest(COALESCE(p_reminder_times, '{}'::time[])) AS value ORDER BY value)
    OR char_length(COALESCE(p_instructions, '')) > 240
    OR jsonb_typeof(COALESCE(p_nutrient_amounts, '{}'::jsonb)) <> 'object'
  THEN RAISE EXCEPTION 'invalid care plan'; END IF;
  INSERT INTO portal_read_model.pregnancy_care_plan (
    id, category, name, dose_display, times_per_day, reminder_times, instructions,
    nutrient_amounts, confirmed_by_clinician, active
  ) VALUES (result_id, p_category, btrim(p_name), btrim(p_dose_display), p_times_per_day,
    p_reminder_times, btrim(COALESCE(p_instructions, '')), COALESCE(p_nutrient_amounts, '{}'::jsonb),
    COALESCE(p_confirmed_by_clinician, false), COALESCE(p_active, true))
  ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, name = EXCLUDED.name,
    dose_display = EXCLUDED.dose_display, times_per_day = EXCLUDED.times_per_day,
    reminder_times = EXCLUDED.reminder_times, instructions = EXCLUDED.instructions,
    nutrient_amounts = EXCLUDED.nutrient_amounts,
    confirmed_by_clinician = EXCLUDED.confirmed_by_clinician, active = EXCLUDED.active,
    updated_at = timezone('utc', now());
  RETURN result_id;
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
    CASE WHEN x.baby_due>0 THEN '/be/ho-so' WHEN x.pregnancy_due>0 THEN '/me-bau#ho-so-kham'
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
    'EmBe nhắc nhẹ', due.waiting_count||' lần Thuốc/vi chất đang chờ', '/me-bau#vi-chat-thuoc'
  FROM portal_read_model.push_subscription AS s
  CROSS JOIN LATERAL (SELECT p_now AT TIME ZONE s.timezone AS local_now) AS local_clock
  CROSS JOIN LATERAL (
    SELECT reminder_day.day, schedule.reminder_time, count(*) AS waiting_count
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

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_care(date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_care_plan(uuid,text,text,text,smallint,time[],text,jsonb,boolean,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.embe_claim_due_push_notifications(timestamptz,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_care(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_care_plan(uuid,text,text,text,smallint,time[],text,jsonb,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_claim_due_push_notifications(timestamptz,integer) TO service_role;

;
