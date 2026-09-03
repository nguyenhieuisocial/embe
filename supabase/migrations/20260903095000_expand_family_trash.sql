BEGIN;

ALTER TABLE portal_read_model.family_audit_event
  DROP CONSTRAINT family_audit_event_entity_type_check;
ALTER TABLE portal_read_model.family_audit_event
  ADD CONSTRAINT family_audit_event_entity_type_check
  CHECK (entity_type IN ('family_task', 'pregnancy_medical_record', 'meal_analysis', 'family_expense'));

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
    UNION ALL
    SELECT jsonb_build_object(
      'kind', 'meal', 'id', meal.id::text,
      'title', CASE meal.meal_type WHEN 'breakfast' THEN 'Bữa sáng' WHEN 'lunch' THEN 'Bữa trưa'
        WHEN 'dinner' THEN 'Bữa tối' ELSE 'Bữa phụ' END,
      'detail', COALESCE(NULLIF(left(meal.note, 120), ''), to_char(meal.eaten_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')),
      'deleted_at', meal.deleted_at
    ) AS item, meal.deleted_at
    FROM portal_read_model.meal_analysis AS meal
    WHERE meal.deleted_at IS NOT NULL
    UNION ALL
    SELECT jsonb_build_object(
      'kind', 'expense', 'id', expense.id::text, 'title', expense.description,
      'detail', CASE expense.category
        WHEN 'pregnancy_visit' THEN 'Khám thai' WHEN 'test' THEN 'Xét nghiệm'
        WHEN 'medicine' THEN 'Thuốc' WHEN 'baby_supply' THEN 'Đồ cho Bé'
        WHEN 'birth' THEN 'Sinh nở' WHEN 'travel' THEN 'Đi lại' ELSE 'Khác' END
        || ' · ' || expense.amount_vnd::text || ' ₫',
      'deleted_at', expense.deleted_at
    ) AS item, expense.deleted_at
    FROM portal_read_model.family_expense AS expense
    WHERE expense.deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    LIMIT 100
  ) AS deleted;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_meal_analysis(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.meal_analysis
  SET status = 'deleted', deleted_at = timezone('utc', now()), claimed_at = NULL
  WHERE id = p_id AND status NOT IN ('deleted', 'analyzing');
  IF NOT FOUND THEN RAISE EXCEPTION 'meal cannot be deleted'; END IF;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('meal_analysis', p_id::text, 'delete');
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_restore_meal_analysis(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.meal_analysis
  SET status = CASE
      WHEN confirmed_analysis IS NOT NULL THEN 'confirmed'
      WHEN analysis IS NOT NULL THEN 'review'
      ELSE 'uploaded'
    END,
    deleted_at = NULL, claimed_at = NULL, attempts = 0,
    next_attempt_at = timezone('utc', now()), last_error_code = NULL
  WHERE id = p_id AND deleted_at IS NOT NULL AND status = 'deleted';
  IF NOT FOUND THEN RAISE EXCEPTION 'deleted meal not found'; END IF;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('meal_analysis', p_id::text, 'restore');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_set_family_expense_deleted(p_id uuid, p_deleted boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE current_deleted_at timestamptz;
BEGIN
  SELECT deleted_at INTO current_deleted_at
  FROM portal_read_model.family_expense WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_deleted = (current_deleted_at IS NOT NULL) THEN RETURN true; END IF;
  UPDATE portal_read_model.family_expense SET
    deleted_at = CASE WHEN p_deleted THEN timezone('utc', now()) ELSE NULL END,
    updated_at = timezone('utc', now())
  WHERE id = p_id;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('family_expense', p_id::text, CASE WHEN p_deleted THEN 'delete' ELSE 'restore' END);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_restore_family_expense(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.family_expense
  SET deleted_at = NULL, updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'deleted family expense not found'; END IF;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('family_expense', p_id::text, 'restore');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_list_family_trash() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_meal_analysis(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_restore_meal_analysis(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_set_family_expense_deleted(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_restore_family_expense(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_family_trash() TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_meal_analysis(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_restore_meal_analysis(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_set_family_expense_deleted(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_restore_family_expense(uuid) TO service_role;

COMMENT ON TABLE portal_read_model.family_audit_event IS 'Append-only record of family task, pregnancy record, meal and expense trash mutations.';

COMMIT;
