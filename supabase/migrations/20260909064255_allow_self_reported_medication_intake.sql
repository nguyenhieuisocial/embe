BEGIN;

-- Intake is a family-reported event, not clinical approval of a prescription.
-- Do not change a plan's source, instructions, dose or confirmation on intake.
CREATE OR REPLACE FUNCTION public.embe_record_pregnancy_care_intake(
  p_plan_id uuid, p_day date, p_slot smallint, p_status text, p_reason text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE allowed_slots smallint; required_doses integer; taken_doses integer;
BEGIN
  SELECT plan.times_per_day INTO allowed_slots
  FROM portal_read_model.pregnancy_care_plan AS plan
  WHERE plan.id = p_plan_id AND plan.active;
  IF allowed_slots IS NULL OR p_day IS NULL OR p_slot IS NULL OR p_status IS NULL
    OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
    OR p_slot NOT BETWEEN 1 AND allowed_slots OR p_status NOT IN ('taken', 'skipped', 'deferred')
    OR char_length(btrim(COALESCE(p_reason, ''))) > 120
  THEN RAISE EXCEPTION 'invalid care intake'; END IF;
  INSERT INTO portal_read_model.pregnancy_care_intake (plan_id, day, slot, status, reason, taken_at)
    VALUES (p_plan_id, p_day, p_slot, p_status, btrim(COALESCE(p_reason, '')), timezone('utc', now()))
  ON CONFLICT (plan_id, day, slot) DO UPDATE SET status = EXCLUDED.status,
    reason = EXCLUDED.reason, taken_at = EXCLUDED.taken_at;
  SELECT COALESCE(sum(plan.times_per_day), 0)::integer INTO required_doses
  FROM portal_read_model.pregnancy_care_plan AS plan WHERE plan.active;
  SELECT count(*) FILTER (WHERE intake.status = 'taken')::integer INTO taken_doses
  FROM portal_read_model.pregnancy_care_intake AS intake
  JOIN portal_read_model.pregnancy_care_plan AS plan ON plan.id = intake.plan_id
  WHERE intake.day = p_day AND plan.active AND intake.slot BETWEEN 1 AND plan.times_per_day;
  IF required_doses > 0 AND taken_doses = required_doses THEN
    PERFORM portal_read_model.complete_linked_daily_action(p_day, 'supplements');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text)
  TO service_role;
COMMENT ON FUNCTION public.embe_record_pregnancy_care_intake(uuid,date,smallint,text,text) IS
  'Records family-reported use for an active tracked plan. Does not approve or alter treatment.';

COMMIT;
