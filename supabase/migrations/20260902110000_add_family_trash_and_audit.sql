BEGIN;

CREATE TABLE portal_read_model.family_audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('family_task', 'pregnancy_medical_record')),
  entity_id text NOT NULL CHECK (char_length(entity_id) BETWEEN 1 AND 64),
  action text NOT NULL CHECK (action IN ('delete', 'restore')),
  occurred_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX family_audit_event_entity_idx
  ON portal_read_model.family_audit_event (entity_type, entity_id, occurred_at DESC);

ALTER TABLE portal_read_model.family_audit_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_audit_event FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.family_audit_event FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE portal_read_model.family_audit_event TO service_role;
CREATE POLICY family_audit_event_deny_clients ON portal_read_model.family_audit_event
FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_list_family_trash()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(item ORDER BY deleted_at DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'kind', 'task', 'id', task.id::text, 'title', task.title,
      'detail', CASE task.owner_role WHEN 'mother' THEN 'Mẹ Ngân' WHEN 'father' THEN 'Ba Hiếu' ELSE 'Cả nhà' END,
      'deleted_at', task.deleted_at
    ) AS item, task.deleted_at
    FROM portal_read_model.family_task AS task
    WHERE task.deleted_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM portal_read_model.pregnancy_medical_record AS medical
        WHERE medical.id = task.idempotency_key AND medical.deleted_at IS NOT NULL
      )
    UNION ALL
    SELECT jsonb_build_object(
      'kind', 'medical', 'id', medical.id::text, 'title', medical.title,
      'detail', COALESCE(NULLIF(medical.provider, ''), 'Hồ sơ thai kỳ'),
      'deleted_at', medical.deleted_at
    ) AS item, medical.deleted_at
    FROM portal_read_model.pregnancy_medical_record AS medical
    WHERE medical.deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    LIMIT 100
  ) AS deleted;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_family_task(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_id IS NULL OR p_id < 1 THEN RAISE EXCEPTION 'invalid family task id'; END IF;
  UPDATE portal_read_model.family_task
  SET deleted_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'family task not found'; END IF;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('family_task', p_id::text, 'delete');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_restore_family_task(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_id IS NULL OR p_id < 1 THEN RAISE EXCEPTION 'invalid family task id'; END IF;
  UPDATE portal_read_model.family_task
  SET deleted_at = NULL, updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'deleted family task not found'; END IF;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('family_task', p_id::text, 'restore');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_medical_record_with_task(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.pregnancy_medical_record
  SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'pregnancy medical record not found'; END IF;

  UPDATE portal_read_model.family_task
  SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE idempotency_key = p_id AND deleted_at IS NULL;

  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('pregnancy_medical_record', p_id::text, 'delete');
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_restore_pregnancy_medical_record_with_task(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE record portal_read_model.pregnancy_medical_record%ROWTYPE;
BEGIN
  SELECT * INTO record
  FROM portal_read_model.pregnancy_medical_record
  WHERE id = p_id AND deleted_at IS NOT NULL
  FOR UPDATE;
  IF record.id IS NULL THEN RAISE EXCEPTION 'deleted pregnancy medical record not found'; END IF;

  UPDATE portal_read_model.pregnancy_medical_record
  SET deleted_at = NULL, updated_at = timezone('utc', now())
  WHERE id = p_id;

  IF record.kind = 'appointment' AND record.status = 'planned' THEN
    INSERT INTO portal_read_model.family_task (
      idempotency_key, title, note, owner_role, category, link_target, due_on, due_time, repeat_rule
    ) VALUES (
      record.id, 'Lịch khám: ' || record.title, record.provider, 'family', 'appointment', 'calendar',
      (record.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      date_trunc('minute', record.occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time, 'none'
    ) ON CONFLICT (idempotency_key) DO UPDATE SET
      title = EXCLUDED.title, note = EXCLUDED.note, owner_role = EXCLUDED.owner_role,
      category = EXCLUDED.category, link_target = EXCLUDED.link_target,
      due_on = EXCLUDED.due_on, due_time = EXCLUDED.due_time,
      repeat_rule = EXCLUDED.repeat_rule, deleted_at = NULL,
      updated_at = timezone('utc', now());
  END IF;

  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('pregnancy_medical_record', p_id::text, 'restore');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_list_family_trash() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_restore_family_task(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_restore_pregnancy_medical_record_with_task(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_family_trash() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_restore_family_task(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_restore_pregnancy_medical_record_with_task(uuid) TO service_role;

COMMENT ON TABLE portal_read_model.family_audit_event IS 'Append-only record of family task and pregnancy medical trash mutations.';

COMMIT;
