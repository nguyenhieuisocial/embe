BEGIN;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_medical_record_with_task(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_gestational_week integer,
  p_next_appointment_at timestamptz, p_measurements jsonb, p_medicines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result_id uuid := COALESCE(p_id, gen_random_uuid());
BEGIN
  IF p_kind NOT IN ('appointment', 'ultrasound', 'laboratory', 'prescription', 'other')
     OR p_status NOT IN ('planned', 'completed')
     OR p_occurred_at IS NULL
     OR char_length(trim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 100
     OR char_length(COALESCE(p_provider, '')) > 120
     OR char_length(COALESCE(p_clinician, '')) > 100
     OR char_length(COALESCE(p_notes, '')) > 2000
     OR (p_gestational_week IS NOT NULL AND p_gestational_week NOT BETWEEN 1 AND 42)
     OR jsonb_typeof(COALESCE(p_measurements, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_medicines, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid pregnancy medical record';
  END IF;

  INSERT INTO portal_read_model.pregnancy_medical_record (
    id, kind, status, occurred_at, title, provider, clinician, notes, gestational_week,
    next_appointment_at, measurements, medicines
  ) VALUES (
    result_id, p_kind, p_status, p_occurred_at, trim(p_title), trim(COALESCE(p_provider, '')),
    trim(COALESCE(p_clinician, '')), trim(COALESCE(p_notes, '')), p_gestational_week,
    p_next_appointment_at, COALESCE(p_measurements, '{}'::jsonb), COALESCE(p_medicines, '[]'::jsonb)
  ) ON CONFLICT (id) DO UPDATE SET
    kind = EXCLUDED.kind, status = EXCLUDED.status, occurred_at = EXCLUDED.occurred_at,
    title = EXCLUDED.title, provider = EXCLUDED.provider, clinician = EXCLUDED.clinician,
    notes = EXCLUDED.notes, gestational_week = EXCLUDED.gestational_week,
    next_appointment_at = EXCLUDED.next_appointment_at, measurements = EXCLUDED.measurements,
    medicines = EXCLUDED.medicines, updated_at = timezone('utc', now())
  WHERE portal_read_model.pregnancy_medical_record.deleted_at IS NULL;

  IF p_kind = 'appointment' AND p_status = 'planned' THEN
    INSERT INTO portal_read_model.family_task (
      idempotency_key, title, note, owner_role, category, link_target,
      due_on, due_time, repeat_rule
    ) VALUES (
      result_id, 'Lịch khám: ' || trim(p_title), trim(COALESCE(p_provider, '')),
      'family', 'appointment', 'calendar',
      (p_occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      date_trunc('minute', p_occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time,
      'none'
    ) ON CONFLICT (idempotency_key) DO UPDATE SET
      title = EXCLUDED.title, note = EXCLUDED.note, owner_role = EXCLUDED.owner_role,
      category = EXCLUDED.category, link_target = EXCLUDED.link_target,
      due_on = EXCLUDED.due_on, due_time = EXCLUDED.due_time,
      repeat_rule = EXCLUDED.repeat_rule, deleted_at = NULL,
      updated_at = timezone('utc', now());
  ELSE
    UPDATE portal_read_model.family_task
    SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
    WHERE idempotency_key = result_id AND deleted_at IS NULL;
  END IF;

  RETURN result_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_medical_record_with_task(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  UPDATE portal_read_model.pregnancy_medical_record
  SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE id = p_id AND deleted_at IS NULL;

  UPDATE portal_read_model.family_task
  SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now())
  WHERE idempotency_key = p_id AND deleted_at IS NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_medical_record(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_gestational_week integer,
  p_next_appointment_at timestamptz, p_measurements jsonb, p_medicines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  RETURN public.embe_save_pregnancy_medical_record_with_task(
    p_id, p_kind, p_status, p_occurred_at, p_title, p_provider, p_clinician,
    p_notes, p_gestational_week, p_next_appointment_at, p_measurements, p_medicines
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_delete_pregnancy_medical_record(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
  PERFORM public.embe_delete_pregnancy_medical_record_with_task(p_id);
END;
$function$;


REVOKE ALL ON FUNCTION public.embe_save_pregnancy_medical_record_with_task(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_delete_pregnancy_medical_record_with_task(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_medical_record_with_task(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_delete_pregnancy_medical_record_with_task(uuid) TO service_role;

COMMIT;
