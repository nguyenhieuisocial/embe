-- Private family planner. Browsers never access these tables directly; the
-- portal server is the only caller of the bounded RPC surface below.

CREATE TABLE portal_read_model.family_task (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  owner_role text NOT NULL CHECK (owner_role IN ('mother', 'father', 'family')),
  category text NOT NULL CHECK (category IN (
    'general', 'pregnancy', 'meal', 'health', 'inventory', 'journal', 'memory', 'appointment'
  )),
  link_target text NOT NULL CHECK (link_target IN (
    'none', 'pregnancy', 'meal', 'health', 'inventory', 'journal', 'memory', 'calendar', 'assistant'
  )),
  due_on date NOT NULL CHECK (due_on BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  due_time time,
  repeat_rule text NOT NULL DEFAULT 'none' CHECK (repeat_rule IN ('none', 'daily', 'weekly')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  deleted_at timestamptz
);

CREATE INDEX family_task_active_due_idx
  ON portal_read_model.family_task (due_on, repeat_rule, due_time, id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER family_task_set_updated_at
BEFORE UPDATE ON portal_read_model.family_task
FOR EACH ROW EXECUTE FUNCTION portal_read_model.touch_updated_at();

CREATE TABLE portal_read_model.family_task_completion (
  task_id bigint NOT NULL REFERENCES portal_read_model.family_task(id) ON DELETE CASCADE,
  occurrence_on date NOT NULL CHECK (occurrence_on BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  completed_by text NOT NULL CHECK (completed_by IN ('mother', 'father', 'family')),
  completed_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (task_id, occurrence_on)
);

CREATE INDEX family_task_completion_occurrence_idx
  ON portal_read_model.family_task_completion (occurrence_on, task_id);

ALTER TABLE portal_read_model.family_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_task FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_task_completion ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_task_completion FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.family_task FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.family_task_completion FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE portal_read_model.family_task_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.family_task TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.family_task_completion TO service_role;
GRANT USAGE, SELECT ON SEQUENCE portal_read_model.family_task_id_seq TO service_role;

CREATE POLICY family_task_deny_clients ON portal_read_model.family_task
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY family_task_completion_deny_clients ON portal_read_model.family_task_completion
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

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

CREATE OR REPLACE FUNCTION public.embe_create_family_task(
  p_idempotency_key uuid, p_title text, p_note text, p_owner_role text,
  p_category text, p_link_target text, p_due_on date, p_due_time time,
  p_repeat_rule text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id bigint;
BEGIN
  IF p_idempotency_key IS NULL
     OR char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120
     OR char_length(COALESCE(p_note, '')) > 500
     OR p_owner_role NOT IN ('mother', 'father', 'family')
     OR p_category NOT IN ('general', 'pregnancy', 'meal', 'health', 'inventory', 'journal', 'memory', 'appointment')
     OR p_link_target NOT IN ('none', 'pregnancy', 'meal', 'health', 'inventory', 'journal', 'memory', 'calendar', 'assistant')
     OR p_due_on NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_repeat_rule NOT IN ('none', 'daily', 'weekly') THEN
    RAISE EXCEPTION 'invalid family task';
  END IF;

  INSERT INTO portal_read_model.family_task (
    idempotency_key, title, note, owner_role, category, link_target, due_on, due_time, repeat_rule
  ) VALUES (
    p_idempotency_key, btrim(p_title), btrim(COALESCE(p_note, '')), p_owner_role,
    p_category, p_link_target, p_due_on, p_due_time, p_repeat_rule
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT id INTO result_id FROM portal_read_model.family_task WHERE idempotency_key = p_idempotency_key;
  RETURN jsonb_build_object('id', result_id::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_update_family_task(
  p_id bigint, p_title text, p_note text, p_owner_role text,
  p_category text, p_link_target text, p_due_on date, p_due_time time,
  p_repeat_rule text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_id IS NULL OR p_id < 1
     OR char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 120
     OR char_length(COALESCE(p_note, '')) > 500
     OR p_owner_role NOT IN ('mother', 'father', 'family')
     OR p_category NOT IN ('general', 'pregnancy', 'meal', 'health', 'inventory', 'journal', 'memory', 'appointment')
     OR p_link_target NOT IN ('none', 'pregnancy', 'meal', 'health', 'inventory', 'journal', 'memory', 'calendar', 'assistant')
     OR p_due_on NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_repeat_rule NOT IN ('none', 'daily', 'weekly') THEN
    RAISE EXCEPTION 'invalid family task update';
  END IF;

  UPDATE portal_read_model.family_task SET
    title = btrim(p_title), note = btrim(COALESCE(p_note, '')), owner_role = p_owner_role,
    category = p_category, link_target = p_link_target, due_on = p_due_on,
    due_time = p_due_time, repeat_rule = p_repeat_rule
  WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'family task not found'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_set_family_task_completion(
  p_id bigint, p_occurrence_on date, p_completed boolean, p_completed_by text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE task portal_read_model.family_task%ROWTYPE;
BEGIN
  IF p_id IS NULL OR p_id < 1 OR p_occurrence_on IS NULL
     OR p_completed IS NULL OR p_completed_by NOT IN ('mother', 'father', 'family') THEN
    RAISE EXCEPTION 'invalid family task completion';
  END IF;
  SELECT * INTO task FROM portal_read_model.family_task WHERE id = p_id AND deleted_at IS NULL;
  IF task.id IS NULL OR p_occurrence_on < task.due_on OR NOT (
    (task.repeat_rule = 'none' AND p_occurrence_on = task.due_on)
    OR task.repeat_rule = 'daily'
    OR (task.repeat_rule = 'weekly' AND extract(isodow FROM p_occurrence_on) = extract(isodow FROM task.due_on))
  ) THEN RAISE EXCEPTION 'family task occurrence not found'; END IF;

  IF p_completed THEN
    INSERT INTO portal_read_model.family_task_completion (task_id, occurrence_on, completed_by)
    VALUES (p_id, p_occurrence_on, p_completed_by)
    ON CONFLICT (task_id, occurrence_on) DO UPDATE SET
      completed_by = EXCLUDED.completed_by, completed_at = timezone('utc', now());
  ELSE
    DELETE FROM portal_read_model.family_task_completion
    WHERE task_id = p_id AND occurrence_on = p_occurrence_on;
  END IF;
  RETURN jsonb_build_object('ok', true, 'completed', p_completed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_family_task(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_id IS NULL OR p_id < 1 THEN RAISE EXCEPTION 'invalid family task id'; END IF;
  UPDATE portal_read_model.family_task
  SET deleted_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'family task not found'; END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_list_family_tasks(date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_create_family_task(uuid,text,text,text,text,text,date,time,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_update_family_task(bigint,text,text,text,text,text,date,time,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_set_family_task_completion(bigint,date,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_family_task(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_family_tasks(date,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_create_family_task(uuid,text,text,text,text,text,date,time,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_update_family_task(bigint,text,text,text,text,text,date,time,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_set_family_task_completion(bigint,date,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_family_task(bigint) TO service_role;

COMMENT ON TABLE portal_read_model.family_task IS 'Private family plans with simple daily and weekly recurrence.';
COMMENT ON TABLE portal_read_model.family_task_completion IS 'Per-day completion history for family plans.';
