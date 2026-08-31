-- Keep the recurrence start separate from the selected occurrence so editing a
-- later daily/weekly occurrence does not accidentally move the whole series.
CREATE OR REPLACE FUNCTION public.embe_list_family_tasks(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to
     OR p_from < DATE '2020-01-01' OR p_to > DATE '2100-12-31'
     OR p_to - p_from > 41 THEN
    RAISE EXCEPTION 'invalid family task range';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', task.id::text,
    'occurrence_on', to_char(day.value, 'YYYY-MM-DD'),
    'starts_on', to_char(task.due_on, 'YYYY-MM-DD'),
    'title', task.title,
    'note', task.note,
    'owner_role', task.owner_role,
    'category', task.category,
    'link_target', task.link_target,
    'due_time', CASE WHEN task.due_time IS NULL THEN NULL ELSE to_char(task.due_time, 'HH24:MI') END,
    'repeat_rule', task.repeat_rule,
    'completed', completion.task_id IS NOT NULL
  ) ORDER BY day.value, task.due_time NULLS LAST, task.id), '[]'::jsonb)
  INTO result
  FROM generate_series(p_from, p_to, interval '1 day') AS day(value)
  JOIN portal_read_model.family_task AS task ON task.deleted_at IS NULL
    AND day.value::date >= task.due_on
    AND (
      (task.repeat_rule = 'none' AND day.value::date = task.due_on)
      OR task.repeat_rule = 'daily'
      OR (task.repeat_rule = 'weekly' AND extract(isodow FROM day.value) = extract(isodow FROM task.due_on))
    )
  LEFT JOIN portal_read_model.family_task_completion AS completion
    ON completion.task_id = task.id AND completion.occurrence_on = day.value::date;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_list_family_tasks(date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_family_tasks(date,date) TO service_role;
