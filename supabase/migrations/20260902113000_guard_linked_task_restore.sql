BEGIN;

CREATE OR REPLACE FUNCTION public.embe_restore_family_task(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  IF p_id IS NULL OR p_id < 1 THEN RAISE EXCEPTION 'invalid family task id'; END IF;
  IF EXISTS (
    SELECT 1
    FROM portal_read_model.family_task AS task
    JOIN portal_read_model.pregnancy_medical_record AS medical ON medical.id = task.idempotency_key
    WHERE task.id = p_id AND task.deleted_at IS NOT NULL AND medical.deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'linked medical record must be restored first';
  END IF;
  UPDATE portal_read_model.family_task
  SET deleted_at = NULL, updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'deleted family task not found'; END IF;
  INSERT INTO portal_read_model.family_audit_event (entity_type, entity_id, action)
  VALUES ('family_task', p_id::text, 'restore');
  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_restore_family_task(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_restore_family_task(bigint) TO service_role;

COMMIT;
