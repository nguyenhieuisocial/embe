BEGIN;

CREATE OR REPLACE FUNCTION public.embe_create_meal_note(
  p_idempotency_key uuid, p_author_role text, p_meal_type text,
  p_eaten_at timestamptz, p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  entry_id uuid := gen_random_uuid();
  result_row portal_read_model.meal_analysis%ROWTYPE;
  note_text text := btrim(COALESCE(p_note, ''));
  checklist_task_id text;
  checklist_day date;
BEGIN
  IF p_idempotency_key IS NULL
     OR p_author_role NOT IN ('father', 'mother')
     OR p_meal_type NOT IN ('breakfast', 'lunch', 'dinner', 'snack')
     OR p_eaten_at IS NULL OR p_eaten_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_eaten_at > timezone('utc', now()) + interval '1 day'
     OR char_length(note_text) NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid meal note request';
  END IF;

  INSERT INTO portal_read_model.meal_analysis (
    id, idempotency_key, author_role, meal_type, eaten_at, note,
    status, uploaded_at
  ) VALUES (
    entry_id, p_idempotency_key, p_author_role, p_meal_type, p_eaten_at, note_text,
    'uploaded', timezone('utc', now())
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO result_row
  FROM portal_read_model.meal_analysis
  WHERE idempotency_key = p_idempotency_key;

  checklist_task_id := CASE result_row.meal_type
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'lunch' THEN 'lunch'
    WHEN 'dinner' THEN 'dinner'
    ELSE NULL
  END;
  checklist_day := (result_row.eaten_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF checklist_task_id IS NOT NULL THEN
    PERFORM portal_read_model.complete_linked_daily_action(checklist_day, checklist_task_id);
  END IF;

  RETURN jsonb_build_object(
    'id', result_row.id,
    'status', result_row.status,
    'checklist_task_id', checklist_task_id,
    'checklist_day', CASE WHEN checklist_task_id IS NULL THEN NULL ELSE checklist_day END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_complete_meal_upload(p_id uuid)
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
  UPDATE portal_read_model.meal_analysis
  SET status = 'uploaded', uploaded_at = timezone('utc', now()),
      next_attempt_at = timezone('utc', now()), last_error_code = NULL
  WHERE id = p_id AND status IN ('awaiting_upload', 'uploaded')
  RETURNING * INTO result_row;
  IF result_row.id IS NULL THEN RAISE EXCEPTION 'meal upload cannot be completed'; END IF;

  checklist_task_id := CASE result_row.meal_type
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'lunch' THEN 'lunch'
    WHEN 'dinner' THEN 'dinner'
    ELSE NULL
  END;
  checklist_day := (result_row.eaten_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF checklist_task_id IS NOT NULL THEN
    PERFORM portal_read_model.complete_linked_daily_action(checklist_day, checklist_task_id);
  END IF;

  RETURN jsonb_build_object(
    'status', 'accepted',
    'checklist_task_id', checklist_task_id,
    'checklist_day', CASE WHEN checklist_task_id IS NULL THEN NULL ELSE checklist_day END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_create_meal_note(uuid,text,text,timestamptz,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_meal_note(uuid,text,text,timestamptz,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.embe_complete_meal_upload(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_complete_meal_upload(uuid)
  TO service_role;

COMMIT;
