BEGIN;

ALTER TABLE portal_read_model.pregnancy_care_plan
  ADD COLUMN IF NOT EXISTS entry_source text NOT NULL DEFAULT 'clinician_plan';

ALTER TABLE portal_read_model.pregnancy_care_plan
  DROP CONSTRAINT IF EXISTS pregnancy_care_plan_entry_source_valid;
ALTER TABLE portal_read_model.pregnancy_care_plan
  ADD CONSTRAINT pregnancy_care_plan_entry_source_valid
    CHECK (entry_source IN ('clinician_plan', 'self_purchased'));

COMMENT ON COLUMN portal_read_model.pregnancy_care_plan.entry_source IS
  'Whether the family copied a clinician plan or recorded an item bought without a prescription.';

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_care(p_day date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(profile) - 'singleton' - 'updated_at'
      FROM portal_read_model.pregnancy_wellness_profile AS profile WHERE profile.singleton),
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', entry.id, 'category', entry.category, 'entry_source', entry.entry_source,
      'name', entry.name, 'dose_display', entry.dose_display,
      'times_per_day', entry.times_per_day, 'reminder_times', to_jsonb(entry.reminder_times),
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
    ) ORDER BY entry.active DESC, entry.entry_source, entry.category, entry.created_at)
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

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_care_plan(
  p_id uuid, p_category text, p_entry_source text, p_name text, p_dose_display text,
  p_times_per_day smallint, p_reminder_times time[], p_instructions text,
  p_nutrient_amounts jsonb, p_confirmed_by_clinician boolean, p_active boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_category NOT IN ('medicine', 'supplement')
    OR p_entry_source NOT IN ('clinician_plan', 'self_purchased')
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
    id, category, entry_source, name, dose_display, times_per_day, reminder_times,
    instructions, nutrient_amounts, confirmed_by_clinician, active
  ) VALUES (
    result_id, p_category, p_entry_source, btrim(p_name), btrim(p_dose_display),
    p_times_per_day, p_reminder_times, btrim(COALESCE(p_instructions, '')),
    COALESCE(p_nutrient_amounts, '{}'::jsonb), COALESCE(p_confirmed_by_clinician, false),
    COALESCE(p_active, true)
  )
  ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category,
    entry_source = EXCLUDED.entry_source, name = EXCLUDED.name,
    dose_display = EXCLUDED.dose_display, times_per_day = EXCLUDED.times_per_day,
    reminder_times = EXCLUDED.reminder_times, instructions = EXCLUDED.instructions,
    nutrient_amounts = EXCLUDED.nutrient_amounts,
    confirmed_by_clinician = EXCLUDED.confirmed_by_clinician, active = EXCLUDED.active,
    updated_at = timezone('utc', now());
  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_record_pregnancy_care_intake(
  p_plan_id uuid, p_day date, p_slot smallint, p_status text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE allowed_slots smallint; required_doses integer; taken_doses integer;
BEGIN
  SELECT plan.times_per_day INTO allowed_slots
  FROM portal_read_model.pregnancy_care_plan AS plan
  WHERE plan.id = p_plan_id AND plan.active
    AND (plan.confirmed_by_clinician OR plan.entry_source = 'self_purchased');
  IF allowed_slots IS NULL OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
    OR p_slot NOT BETWEEN 1 AND allowed_slots OR p_status NOT IN ('taken', 'skipped', 'deferred')
    OR char_length(btrim(COALESCE(p_reason, ''))) > 120
  THEN RAISE EXCEPTION 'invalid care intake'; END IF;
  INSERT INTO portal_read_model.pregnancy_care_intake (plan_id, day, slot, status, reason, taken_at)
    VALUES (p_plan_id, p_day, p_slot, p_status, btrim(COALESCE(p_reason, '')), timezone('utc', now()))
  ON CONFLICT (plan_id, day, slot) DO UPDATE SET status = EXCLUDED.status,
    reason = EXCLUDED.reason, taken_at = EXCLUDED.taken_at;
  SELECT COALESCE(sum(plan.times_per_day), 0)::integer INTO required_doses
  FROM portal_read_model.pregnancy_care_plan AS plan
  WHERE plan.active AND (plan.confirmed_by_clinician OR plan.entry_source = 'self_purchased');
  SELECT count(*) FILTER (WHERE intake.status = 'taken')::integer INTO taken_doses
  FROM portal_read_model.pregnancy_care_intake AS intake
  JOIN portal_read_model.pregnancy_care_plan AS plan ON plan.id = intake.plan_id
  WHERE intake.day = p_day AND plan.active
    AND (plan.confirmed_by_clinician OR plan.entry_source = 'self_purchased');
  IF required_doses > 0 AND taken_doses = required_doses THEN
    PERFORM portal_read_model.complete_linked_daily_action(p_day, 'supplements');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_save_pregnancy_care_plan(uuid,text,text,text,text,smallint,time[],text,jsonb,boolean,boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_get_pregnancy_care(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_care_plan(uuid,text,text,text,text,smallint,time[],text,jsonb,boolean,boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_care(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  TO service_role;

COMMIT;
