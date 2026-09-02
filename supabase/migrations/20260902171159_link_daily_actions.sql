BEGIN;

CREATE OR REPLACE FUNCTION portal_read_model.complete_linked_daily_action(
  p_day date,
  p_task_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_day IS NULL
     OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_task_id NOT IN ('supplements', 'breakfast', 'lunch', 'dinner') THEN
    RAISE EXCEPTION 'invalid linked daily action';
  END IF;

  INSERT INTO portal_read_model.pregnancy_day (day, updated_at)
  VALUES (p_day, timezone('utc', now()))
  ON CONFLICT (day) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  INSERT INTO portal_read_model.pregnancy_check (day, task_id, updated_at)
  VALUES (p_day, p_task_id, timezone('utc', now()))
  ON CONFLICT (day, task_id) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION portal_read_model.complete_linked_daily_action(date,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION portal_read_model.complete_linked_daily_action(date,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.embe_confirm_meal_analysis(
  p_id uuid,
  p_confirmed_analysis jsonb,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  result_row portal_read_model.meal_analysis%ROWTYPE;
  checklist_task_id text;
  checklist_day date;
BEGIN
  IF jsonb_typeof(p_confirmed_analysis) <> 'object'
     OR jsonb_typeof(p_confirmed_analysis -> 'foods') <> 'array'
     OR ((COALESCE(p_confirmed_analysis ->> 'entry_mode', '') = 'note') <>
         (jsonb_array_length(p_confirmed_analysis -> 'foods') = 0))
     OR char_length(COALESCE(btrim(p_note), '')) > 300 THEN
    RAISE EXCEPTION 'invalid confirmed meal';
  END IF;

  UPDATE portal_read_model.meal_analysis
  SET status = CASE
        WHEN p_confirmed_analysis ->> 'entry_mode' = 'note' THEN 'confirmed'
        ELSE 'nutrition_pending'
      END,
      confirmed_analysis = p_confirmed_analysis,
      note = btrim(COALESCE(p_note, '')),
      confirmed_at = timezone('utc', now())
  WHERE id = p_id
    AND status IN ('review', 'nutrition_pending', 'confirmed')
  RETURNING * INTO result_row;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'meal is not ready for confirmation';
  END IF;

  checklist_task_id := CASE result_row.meal_type
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'lunch' THEN 'lunch'
    WHEN 'dinner' THEN 'dinner'
    ELSE NULL
  END;
  checklist_day := (result_row.eaten_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  IF checklist_task_id IS NOT NULL
     AND result_row.status IN ('nutrition_pending', 'confirmed') THEN
    PERFORM portal_read_model.complete_linked_daily_action(checklist_day, checklist_task_id);
  END IF;

  RETURN jsonb_build_object(
    'id', result_row.id,
    'status', result_row.status,
    'meal_type', result_row.meal_type,
    'eaten_at', result_row.eaten_at,
    'note', result_row.note,
    'analysis', result_row.confirmed_analysis,
    'checklist_task_id', checklist_task_id,
    'checklist_day', CASE WHEN checklist_task_id IS NULL THEN NULL ELSE checklist_day END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.embe_record_pregnancy_care_intake(
  p_plan_id uuid,
  p_day date,
  p_slot smallint,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  allowed_slots smallint;
  required_doses integer;
  taken_doses integer;
BEGIN
  SELECT plan.times_per_day INTO allowed_slots
  FROM portal_read_model.pregnancy_care_plan AS plan
  WHERE plan.id = p_plan_id
    AND plan.active
    AND plan.confirmed_by_clinician;

  IF allowed_slots IS NULL
     OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_slot NOT BETWEEN 1 AND allowed_slots
     OR p_status NOT IN ('taken', 'skipped', 'deferred')
     OR char_length(btrim(COALESCE(p_reason, ''))) > 120 THEN
    RAISE EXCEPTION 'invalid care intake';
  END IF;

  INSERT INTO portal_read_model.pregnancy_care_intake (
    plan_id, day, slot, status, reason, taken_at
  ) VALUES (
    p_plan_id, p_day, p_slot, p_status,
    btrim(COALESCE(p_reason, '')), timezone('utc', now())
  )
  ON CONFLICT (plan_id, day, slot) DO UPDATE SET
    status = EXCLUDED.status,
    reason = EXCLUDED.reason,
    taken_at = EXCLUDED.taken_at;

  SELECT COALESCE(sum(plan.times_per_day), 0)::integer
  INTO required_doses
  FROM portal_read_model.pregnancy_care_plan AS plan
  WHERE plan.active AND plan.confirmed_by_clinician;

  SELECT count(*) FILTER (WHERE intake.status = 'taken')::integer
  INTO taken_doses
  FROM portal_read_model.pregnancy_care_intake AS intake
  JOIN portal_read_model.pregnancy_care_plan AS plan ON plan.id = intake.plan_id
  WHERE intake.day = p_day
    AND plan.active
    AND plan.confirmed_by_clinician;

  IF required_doses > 0 AND taken_doses = required_doses THEN
    PERFORM portal_read_model.complete_linked_daily_action(p_day, 'supplements');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  TO service_role;

COMMENT ON FUNCTION portal_read_model.complete_linked_daily_action(date,text) IS
  'Idempotently completes a bounded daily checklist action only from server-verified semantic evidence.';

COMMIT;
