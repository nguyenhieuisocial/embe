BEGIN;

ALTER TABLE portal_read_model.pregnancy_care_intake
  ADD COLUMN status text NOT NULL DEFAULT 'taken'
    CHECK (status IN ('taken', 'skipped', 'deferred')),
  ADD COLUMN reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 120);

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
        WHERE intake.plan_id = entry.id AND intake.day = p_day AND intake.status = 'taken'), '[]'::jsonb),
      'dose_states', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'slot', intake.slot, 'status', intake.status, 'reason', intake.reason,
        'recorded_at', intake.taken_at
      ) ORDER BY intake.slot) FROM portal_read_model.pregnancy_care_intake AS intake
        WHERE intake.plan_id = entry.id AND intake.day = p_day), '[]'::jsonb)
    ) ORDER BY entry.active DESC, entry.category, entry.created_at)
      FROM portal_read_model.pregnancy_care_plan AS entry), '[]'::jsonb),
    'adherence_history', COALESCE((SELECT jsonb_agg(to_jsonb(history) ORDER BY history.day DESC, history.recorded_at DESC)
      FROM (SELECT intake.plan_id, plan.name AS plan_name, intake.day, intake.slot,
        intake.status, intake.reason, intake.taken_at AS recorded_at
        FROM portal_read_model.pregnancy_care_intake AS intake
        JOIN portal_read_model.pregnancy_care_plan AS plan ON plan.id = intake.plan_id
        WHERE intake.day < p_day AND intake.day >= p_day - 30
        ORDER BY intake.day DESC, intake.taken_at DESC LIMIT 120) AS history), '[]'::jsonb),
    'iphone_health', (SELECT to_jsonb(health) - 'device_id'
      FROM portal_read_model.iphone_health_daily AS health
      WHERE health.day = p_day ORDER BY health.updated_at DESC LIMIT 1),
    'iphone_devices', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', device.id, 'label', device.label, 'active', device.active,
      'last_synced_at', device.last_synced_at
    ) ORDER BY device.created_at) FROM portal_read_model.iphone_health_device AS device), '[]'::jsonb)
  );
$function$;

CREATE OR REPLACE FUNCTION public.embe_record_pregnancy_care_intake(
  p_plan_id uuid, p_day date, p_slot smallint, p_status text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE allowed_slots smallint;
BEGIN
  SELECT plan.times_per_day INTO allowed_slots FROM portal_read_model.pregnancy_care_plan AS plan
    WHERE plan.id = p_plan_id AND plan.active AND plan.confirmed_by_clinician;
  IF allowed_slots IS NULL OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
    OR p_slot NOT BETWEEN 1 AND allowed_slots
    OR p_status NOT IN ('taken', 'skipped', 'deferred')
    OR char_length(btrim(COALESCE(p_reason, ''))) > 120
  THEN RAISE EXCEPTION 'invalid care intake'; END IF;
  INSERT INTO portal_read_model.pregnancy_care_intake (plan_id, day, slot, status, reason, taken_at)
    VALUES (p_plan_id, p_day, p_slot, p_status, btrim(COALESCE(p_reason, '')), timezone('utc', now()))
  ON CONFLICT (plan_id, day, slot) DO UPDATE SET status = EXCLUDED.status,
    reason = EXCLUDED.reason, taken_at = EXCLUDED.taken_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_set_pregnancy_care_plan_active(p_plan_id uuid, p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_plan_id IS NULL OR p_active IS NULL THEN RAISE EXCEPTION 'invalid care plan state'; END IF;
  UPDATE portal_read_model.pregnancy_care_plan SET active = p_active, updated_at = timezone('utc', now())
    WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'care plan not found'; END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.embe_toggle_pregnancy_care_intake(uuid,date,smallint,boolean) FROM service_role;
REVOKE ALL ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_set_pregnancy_care_plan_active(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_set_pregnancy_care_plan_active(uuid,boolean) TO service_role;

COMMIT;
