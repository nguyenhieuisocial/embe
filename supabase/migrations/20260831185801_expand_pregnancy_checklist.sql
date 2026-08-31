ALTER TABLE portal_read_model.pregnancy_check
  DROP CONSTRAINT pregnancy_check_task_id_check,
  ADD CONSTRAINT pregnancy_check_task_id_check CHECK (task_id IN (
    'supplements', 'breakfast', 'lunch', 'dinner', 'varied-meals',
    'fruit-veg', 'protein', 'food-safety', 'water-rest', 'no-alcohol',
    'movement', 'rest', 'notes'
  ));

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_state(
  p_day date,
  p_due_date date,
  p_completed text[],
  p_write_due_date boolean,
  p_write_completed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_day IS NULL
     OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_write_due_date IS NULL
     OR p_write_completed IS NULL
     OR (NOT p_write_due_date AND NOT p_write_completed)
     OR (p_write_due_date AND p_due_date IS NOT NULL AND p_due_date NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31')
     OR (p_write_completed AND p_completed IS NULL) THEN
    RAISE EXCEPTION 'invalid pregnancy state';
  END IF;

  IF p_write_completed AND (
    NOT (p_completed <@ ARRAY[
      'supplements', 'breakfast', 'lunch', 'dinner', 'varied-meals',
      'fruit-veg', 'protein', 'food-safety', 'water-rest', 'no-alcohol',
      'movement', 'rest', 'notes'
    ]::text[])
    OR cardinality(p_completed) <> (
      SELECT count(DISTINCT task_id)
      FROM unnest(p_completed) AS tasks(task_id)
    )
  ) THEN
    RAISE EXCEPTION 'invalid pregnancy checklist';
  END IF;

  IF p_write_due_date THEN
    INSERT INTO portal_read_model.pregnancy_profile (singleton, due_date, updated_at)
    VALUES (true, p_due_date, timezone('utc', now()))
    ON CONFLICT (singleton) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        updated_at = EXCLUDED.updated_at;
  END IF;

  IF p_write_completed THEN
    INSERT INTO portal_read_model.pregnancy_day (day, updated_at)
    VALUES (p_day, timezone('utc', now()))
    ON CONFLICT (day) DO UPDATE SET updated_at = EXCLUDED.updated_at;

    DELETE FROM portal_read_model.pregnancy_check AS check_state
    WHERE check_state.day = p_day;

    INSERT INTO portal_read_model.pregnancy_check (day, task_id, updated_at)
    SELECT p_day, task_id, timezone('utc', now())
    FROM unnest(p_completed) AS task_id;
  END IF;

  RETURN public.embe_get_pregnancy_state(p_day);
END;
$function$;
