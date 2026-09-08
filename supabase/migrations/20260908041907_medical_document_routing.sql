-- Extend the existing atomic importer; no backfill or new clinical store.
BEGIN;
CREATE OR REPLACE FUNCTION public.embe_import_document(p_document_id uuid,p_revision integer,p_record_updated_at timestamptz,p_analysis jsonb,p_details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 d portal_read_model.pregnancy_medical_document%ROWTYPE;
 r portal_read_model.pregnancy_medical_record%ROWTYPE;
 prior portal_read_model.medical_document_import%ROWTYPE;
 before_value jsonb; merged_metrics jsonb; merged_medicines jsonb; item jsonb; link_id uuid; next_at timestamptz;
 request_value jsonb := jsonb_build_object('analysis',p_analysis,'details',p_details);
BEGIN
 SELECT * INTO d FROM portal_read_model.pregnancy_medical_document WHERE id=p_document_id AND status='ready';
 IF d.id IS NULL THEN RAISE sqlstate 'PT404'; END IF;
 -- Every importer locks the destination record before the scan, preventing lost updates.
 SELECT * INTO r FROM portal_read_model.pregnancy_medical_record WHERE id=d.record_id AND deleted_at IS NULL FOR UPDATE;
 IF r.id IS NULL THEN RAISE sqlstate 'PT404'; END IF;
 SELECT * INTO prior FROM portal_read_model.medical_document_import WHERE document_id=d.id;
 IF prior.document_id IS NOT NULL THEN
  IF prior.source_revision=p_revision AND prior.request=request_value THEN RETURN jsonb_build_object('recordId',r.id,'imported',true); END IF;
  RAISE sqlstate 'PT409' USING message='already_imported';
 END IF;
 IF r.updated_at IS DISTINCT FROM p_record_updated_at THEN RAISE sqlstate 'PT409' USING message='record_changed'; END IF;
 IF jsonb_typeof(p_details) IS DISTINCT FROM 'object' OR p_details->>'kind' NOT IN ('receipt','prescription','ultrasound','laboratory','clinical','discharge','other')
  OR COALESCE(p_details->>'occurredOn','') !~ '^\d{4}-\d{2}-\d{2}$'
  OR jsonb_typeof(p_details->'measurements') IS DISTINCT FROM 'object' OR jsonb_typeof(p_details->'medicines') IS DISTINCT FROM 'array'
  THEN RAISE sqlstate '22023'; END IF;
 IF p_details ? 'nextAppointmentAt' AND p_details->>'nextAppointmentAt' IS NOT NULL THEN
  IF p_details->>'nextAppointmentAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00[.]000Z$'
  THEN RAISE sqlstate '22023' USING message='invalid_followup'; END IF;
  next_at := (p_details->>'nextAppointmentAt')::timestamptz;
  IF (next_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < (p_details->>'occurredOn')::date
  THEN RAISE sqlstate '22023' USING message='followup_before_visit'; END IF;
  IF r.next_appointment_at IS NOT NULL AND r.next_appointment_at IS DISTINCT FROM next_at
  THEN RAISE sqlstate 'PT409' USING message='followup_conflict'; END IF;
 END IF;
 link_id := (p_details->>'linkedRecordId')::uuid;
 IF link_id IS NOT NULL AND (link_id=r.id OR NOT EXISTS(SELECT 1 FROM portal_read_model.pregnancy_medical_record WHERE id=link_id AND deleted_at IS NULL AND NOT document_intake))
 THEN RAISE sqlstate 'PT409' USING message='linked_record_unavailable'; END IF;
 before_value := to_jsonb(r);
 merged_metrics := r.measurements;
 FOR item IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each(p_details->'measurements') LOOP
  IF merged_metrics ? (item->>'key') AND merged_metrics->(item->>'key') IS DISTINCT FROM item->'value'
  THEN RAISE sqlstate 'PT409' USING message='measurement_conflict'; END IF;
  merged_metrics := merged_metrics || jsonb_build_object(item->>'key',item->'value');
 END LOOP;
 merged_medicines := r.medicines;
 FOR item IN SELECT value FROM jsonb_array_elements(p_details->'medicines') LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(merged_medicines) m WHERE lower(trim(m->>'name'))=lower(trim(item->>'name')) AND m IS DISTINCT FROM item)
  THEN RAISE sqlstate 'PT409' USING message='medicine_conflict'; END IF;
  IF NOT merged_medicines @> jsonb_build_array(item) THEN merged_medicines := merged_medicines || jsonb_build_array(item); END IF;
 END LOOP;
 IF jsonb_array_length(merged_medicines)>12 THEN RAISE sqlstate '22023' USING message='too_many_medicines'; END IF;
 -- Confirmation and structured import commit together, or neither is changed.
 PERFORM public.embe_confirm_document_scan(d.id,p_revision,p_analysis);
 PERFORM public.embe_save_pregnancy_medical_record_with_task(r.id,
  CASE WHEN r.document_intake THEN p_details->>'kind' ELSE r.kind END,
  r.status,
  CASE WHEN r.document_intake THEN ((p_details->>'occurredOn')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') ELSE r.occurred_at END,
  CASE WHEN r.document_intake THEN p_details->>'title' ELSE r.title END,
  CASE WHEN r.provider='' THEN COALESCE(p_details->>'provider','') ELSE r.provider END,
  CASE WHEN r.clinician='' THEN COALESCE(p_details->>'clinician','') ELSE r.clinician END,
  r.notes,COALESCE(r.gestational_week,(p_details->>'gestationalWeek')::integer),COALESCE(r.next_appointment_at,next_at),merged_metrics,merged_medicines);
 UPDATE portal_read_model.pregnancy_medical_record SET document_date_only=document_date_only OR document_intake,
  document_intake=false,linked_record_id=COALESCE(link_id,linked_record_id) WHERE id=r.id;
 INSERT INTO portal_read_model.medical_document_import(document_id,record_id,source_revision,request,before_record,after_record)
 SELECT d.id,r.id,p_revision,request_value,before_value,to_jsonb(saved) FROM portal_read_model.pregnancy_medical_record saved WHERE saved.id=r.id;
 RETURN jsonb_build_object('recordId',r.id,'imported',true);
END $$;

-- Read the exact imported revision, not a newer edited OCR draft. Source page numbers
-- remain stable; the file must still be ready and its owning record active.
CREATE FUNCTION public.embe_imported_document_data(p_document_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('documentId',i.document_id,'recordId',i.record_id,
  'importedAt',i.imported_at,'analysis',i.request->'analysis')
 FROM portal_read_model.medical_document_import i
 JOIN portal_read_model.pregnancy_medical_document d ON d.id=i.document_id AND d.record_id=i.record_id
 JOIN portal_read_model.pregnancy_medical_record r ON r.id=i.record_id
 WHERE i.document_id=p_document_id AND d.status='ready' AND r.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.embe_imported_document_data(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_imported_document_data(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
