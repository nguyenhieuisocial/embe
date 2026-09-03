BEGIN;

CREATE OR REPLACE FUNCTION public.embe_confirm_meal_analysis(
  p_id uuid, p_confirmed_analysis jsonb, p_note text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
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
  SET status = CASE WHEN p_confirmed_analysis ->> 'entry_mode' = 'note'
        THEN 'confirmed' ELSE 'nutrition_pending' END,
      confirmed_analysis = p_confirmed_analysis,
      note = btrim(COALESCE(p_note, '')),
      confirmed_at = timezone('utc', now()),
      claimed_at = NULL,
      last_error_code = NULL,
      attempts = 0,
      next_attempt_at = timezone('utc', now())
  WHERE id = p_id
    AND deleted_at IS NULL
    AND status IN ('failed', 'rejected', 'review', 'nutrition_pending', 'confirmed')
  RETURNING * INTO result_row;
  IF result_row.id IS NULL THEN RAISE EXCEPTION 'meal is not ready for confirmation'; END IF;
  checklist_task_id := CASE result_row.meal_type
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'lunch' THEN 'lunch'
    WHEN 'dinner' THEN 'dinner'
    ELSE NULL
  END;
  checklist_day := (result_row.eaten_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF checklist_task_id IS NOT NULL AND result_row.status IN ('nutrition_pending', 'confirmed') THEN
    PERFORM portal_read_model.complete_linked_daily_action(checklist_day, checklist_task_id);
  END IF;
  RETURN jsonb_build_object(
    'id', result_row.id, 'status', result_row.status,
    'meal_type', result_row.meal_type, 'eaten_at', result_row.eaten_at,
    'note', result_row.note, 'analysis', result_row.confirmed_analysis,
    'checklist_task_id', checklist_task_id,
    'checklist_day', CASE WHEN checklist_task_id IS NULL THEN NULL ELSE checklist_day END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_meal_analysis(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.meal_analysis
  SET status = 'deleted', deleted_at = timezone('utc', now()), claimed_at = NULL
  WHERE id = p_id AND status <> 'deleted' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'meal cannot be deleted'; END IF;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('meal_analysis', p_id::text, 'delete');
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_meal_analysis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_confirm_meal_analysis(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_meal_analysis(uuid) TO service_role;

COMMIT;
