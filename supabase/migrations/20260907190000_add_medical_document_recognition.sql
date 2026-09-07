-- Additive, private, review-first scans. OCR never changes clinical records or expenses.
BEGIN;
CREATE TABLE portal_read_model.medical_document_scan (
  document_id uuid PRIMARY KEY REFERENCES portal_read_model.pregnancy_medical_document(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','review','confirmed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid, claimed_at timestamptz,
  completed_pages integer NOT NULL DEFAULT 0 CHECK (completed_pages BETWEEN 0 AND 6),
  page_count integer CHECK (page_count BETWEEN 1 AND 6),
  analysis jsonb, confirmed_analysis jsonb,
  checksum text CHECK (checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$'),
  model text, error_code text, revision integer NOT NULL DEFAULT 1,
  confirmed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='processing') = (claim_token IS NOT NULL AND claimed_at IS NOT NULL)),
  CHECK (analysis IS NULL OR (jsonb_typeof(analysis)='object' AND octet_length(analysis::text)<=70000)),
  CHECK (confirmed_analysis IS NULL OR (jsonb_typeof(confirmed_analysis)='object' AND octet_length(confirmed_analysis::text)<=70000))
);
CREATE INDEX medical_document_scan_queue_idx ON portal_read_model.medical_document_scan(next_attempt_at,updated_at)
  WHERE status IN ('queued','processing');
ALTER TABLE portal_read_model.medical_document_scan ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.medical_document_scan FORCE ROW LEVEL SECURITY;
REVOKE ALL ON portal_read_model.medical_document_scan FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON portal_read_model.medical_document_scan TO service_role;

CREATE FUNCTION public.embe_get_document_scan(p_document_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('documentId',d.id,'recordId',d.record_id,'filename',d.original_filename,'mimeType',d.mime_type,
  'status',COALESCE(s.status,'idle'),'revision',COALESCE(s.revision,0),'completedPages',COALESCE(s.completed_pages,0),
  'pageCount',s.page_count,'error',s.error_code,'analysis',CASE WHEN s.status='confirmed' THEN s.confirmed_analysis ELSE s.analysis END,
  'confirmedAt',s.confirmed_at)
 FROM portal_read_model.pregnancy_medical_document d
 JOIN portal_read_model.pregnancy_medical_record r ON r.id=d.record_id
 LEFT JOIN portal_read_model.medical_document_scan s ON s.document_id=d.id
 WHERE d.id=p_document_id AND d.status='ready' AND r.deleted_at IS NULL;
$$;

CREATE FUNCTION public.embe_queue_document_scan(p_document_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF public.embe_get_document_scan(p_document_id) IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 INSERT INTO portal_read_model.medical_document_scan(document_id) VALUES(p_document_id)
 ON CONFLICT(document_id) DO UPDATE SET status='queued',attempts=0,next_attempt_at=now(),error_code=NULL,
  claim_token=NULL,claimed_at=NULL,completed_pages=0,page_count=NULL,analysis=NULL,revision=medical_document_scan.revision+1,updated_at=now()
 WHERE medical_document_scan.status='failed';
 RETURN public.embe_get_document_scan(p_document_id);
END; $$;

CREATE FUNCTION public.embe_claim_document_scan() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s portal_read_model.medical_document_scan%ROWTYPE; d portal_read_model.pregnancy_medical_document%ROWTYPE;
BEGIN
 UPDATE portal_read_model.medical_document_scan SET status='failed',claim_token=NULL,claimed_at=NULL,
  error_code='worker_timeout',revision=revision+1,updated_at=now()
 WHERE status='processing' AND attempts>=3 AND claimed_at<now()-interval '5 minutes';
 UPDATE portal_read_model.medical_document_scan q SET status='processing',attempts=q.attempts+1,
  claim_token=gen_random_uuid(),claimed_at=now(),completed_pages=0,page_count=NULL,error_code=NULL,revision=q.revision+1,updated_at=now()
 WHERE q.document_id=(SELECT c.document_id FROM portal_read_model.medical_document_scan c
  JOIN portal_read_model.pregnancy_medical_document d ON d.id=c.document_id
  JOIN portal_read_model.pregnancy_medical_record r ON r.id=d.record_id
  WHERE ((c.status='queued' AND c.next_attempt_at<=now()) OR (c.status='processing' AND c.claimed_at<now()-interval '5 minutes'))
   AND c.attempts<3 AND d.status='ready' AND r.deleted_at IS NULL
  ORDER BY c.updated_at FOR UPDATE OF c SKIP LOCKED LIMIT 1)
 RETURNING q.* INTO s;
 IF s.document_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO d FROM portal_read_model.pregnancy_medical_document WHERE id=s.document_id;
 RETURN jsonb_build_object('document_id',d.id,'storage_path',d.storage_path,'mime_type',d.mime_type,
  'byte_size',d.byte_size,'claim_token',s.claim_token);
END; $$;

CREATE FUNCTION public.embe_progress_document_scan(p_document_id uuid,p_claim_token uuid,p_completed integer,p_total integer) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_total NOT BETWEEN 1 AND 6 OR p_completed NOT BETWEEN 0 AND p_total THEN RAISE EXCEPTION 'invalid_progress'; END IF;
 UPDATE portal_read_model.medical_document_scan SET completed_pages=p_completed,page_count=p_total,claimed_at=now(),updated_at=now()
 WHERE document_id=p_document_id AND status='processing' AND claim_token=p_claim_token
 AND public.embe_get_document_scan(p_document_id) IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale_claim' USING ERRCODE='40001'; END IF;
END; $$;

CREATE FUNCTION public.embe_finish_document_scan(p_document_id uuid,p_claim_token uuid,p_checksum text,p_model text,p_analysis jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_checksum IS NULL OR p_checksum !~ '^[a-f0-9]{64}$' OR length(COALESCE(p_model,'')) NOT BETWEEN 1 AND 80
 OR COALESCE(p_analysis->>'version','')<>'1' OR jsonb_typeof(p_analysis->'pages') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'invalid_analysis' USING ERRCODE='22023'; END IF;
 UPDATE portal_read_model.medical_document_scan SET status='review',analysis=p_analysis,checksum=p_checksum,model=p_model,
  completed_pages=page_count,claim_token=NULL,claimed_at=NULL,revision=revision+1,updated_at=now()
 WHERE document_id=p_document_id AND claim_token=p_claim_token AND status='processing'
 AND page_count=jsonb_array_length(p_analysis->'pages') AND public.embe_get_document_scan(p_document_id) IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'stale_claim' USING ERRCODE='40001'; END IF;
END; $$;

CREATE FUNCTION public.embe_fail_document_scan(p_document_id uuid,p_claim_token uuid,p_error text,p_retry boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_error IS NULL OR p_error !~ '^[a-z0-9_]{1,48}$' THEN RAISE EXCEPTION 'invalid_error'; END IF;
 UPDATE portal_read_model.medical_document_scan SET status=CASE WHEN p_retry AND attempts<3 THEN 'queued' ELSE 'failed' END,
  next_attempt_at=now()+make_interval(secs=>60*attempts),error_code=p_error,claim_token=NULL,claimed_at=NULL,
  revision=revision+1,updated_at=now()
 WHERE document_id=p_document_id AND claim_token=p_claim_token AND status='processing';
 IF NOT FOUND THEN RAISE EXCEPTION 'stale_claim' USING ERRCODE='40001'; END IF;
END; $$;

CREATE FUNCTION public.embe_confirm_document_scan(p_document_id uuid,p_revision integer,p_analysis jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s portal_read_model.medical_document_scan%ROWTYPE;
BEGIN
 IF public.embe_get_document_scan(p_document_id) IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO s FROM portal_read_model.medical_document_scan WHERE document_id=p_document_id FOR UPDATE;
 IF s.status NOT IN ('review','confirmed') OR s.revision IS DISTINCT FROM p_revision
 THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='40001'; END IF;
 IF COALESCE(p_analysis->>'version','')<>'1' OR jsonb_typeof(p_analysis->'pages') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'invalid_analysis' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_analysis->'pages') IS DISTINCT FROM s.page_count THEN RAISE EXCEPTION 'invalid_pages' USING ERRCODE='22023'; END IF;
 UPDATE portal_read_model.medical_document_scan SET status='confirmed',confirmed_analysis=p_analysis,
  confirmed_at=now(),updated_at=now(),revision=revision+1 WHERE document_id=p_document_id;
 RETURN public.embe_get_document_scan(p_document_id);
END; $$;

REVOKE ALL ON FUNCTION public.embe_get_document_scan(uuid),public.embe_queue_document_scan(uuid),public.embe_claim_document_scan(),
 public.embe_progress_document_scan(uuid,uuid,integer,integer),public.embe_finish_document_scan(uuid,uuid,text,text,jsonb),
 public.embe_fail_document_scan(uuid,uuid,text,boolean),public.embe_confirm_document_scan(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_document_scan(uuid),public.embe_queue_document_scan(uuid),public.embe_claim_document_scan(),
 public.embe_progress_document_scan(uuid,uuid,integer,integer),public.embe_finish_document_scan(uuid,uuid,text,text,jsonb),
 public.embe_fail_document_scan(uuid,uuid,text,boolean),public.embe_confirm_document_scan(uuid,integer,jsonb) TO service_role;

ALTER TABLE portal_read_model.pregnancy_medical_record DROP CONSTRAINT pregnancy_medical_record_kind_check;
ALTER TABLE portal_read_model.pregnancy_medical_record ADD CONSTRAINT pregnancy_medical_record_kind_check
 CHECK(kind IN ('appointment','ultrasound','laboratory','prescription','receipt','clinical','discharge','other'));

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_medical_record_with_task(
  p_id uuid, p_kind text, p_status text, p_occurred_at timestamptz, p_title text,
  p_provider text, p_clinician text, p_notes text, p_gestational_week integer,
  p_next_appointment_at timestamptz, p_measurements jsonb, p_medicines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  result_id uuid := COALESCE(p_id, gen_random_uuid());
  appointment_at timestamptz;
  appointment_title text;
BEGIN
  IF p_kind NOT IN ('appointment', 'ultrasound', 'laboratory', 'prescription', 'receipt', 'clinical', 'discharge', 'other')
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
    appointment_at := p_occurred_at;
    appointment_title := 'Lịch khám: ' || trim(p_title);
  ELSIF p_status = 'completed' AND p_next_appointment_at IS NOT NULL THEN
    appointment_at := p_next_appointment_at;
    appointment_title := 'Lịch tái khám: ' || trim(p_title);
  END IF;

  IF appointment_at IS NOT NULL THEN
    INSERT INTO portal_read_model.family_task (
      idempotency_key, title, note, owner_role, category, link_target,
      due_on, due_time, repeat_rule
    ) VALUES (
      result_id, appointment_title, trim(COALESCE(p_provider, '')),
      'family', 'appointment', 'calendar',
      (appointment_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
      date_trunc('minute', appointment_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time,
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
COMMIT;
