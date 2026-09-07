-- Ordered after the existing 19:00 recognition migrations. Private, additive, no family backfill.
BEGIN;
ALTER TABLE portal_read_model.pregnancy_medical_record
 ADD COLUMN document_intake boolean NOT NULL DEFAULT false,
 ADD COLUMN document_date_only boolean NOT NULL DEFAULT false,
 ADD COLUMN linked_record_id uuid REFERENCES portal_read_model.pregnancy_medical_record(id) ON DELETE SET NULL,
 ADD CONSTRAINT medical_record_not_self_link CHECK (linked_record_id IS DISTINCT FROM id);
CREATE INDEX medical_record_link_idx ON portal_read_model.pregnancy_medical_record(linked_record_id) WHERE linked_record_id IS NOT NULL;
CREATE TABLE portal_read_model.medical_document_import (
 document_id uuid PRIMARY KEY REFERENCES portal_read_model.pregnancy_medical_document(id) ON DELETE CASCADE,
 record_id uuid NOT NULL REFERENCES portal_read_model.pregnancy_medical_record(id) ON DELETE CASCADE,
 source_revision integer NOT NULL, request jsonb NOT NULL, before_record jsonb NOT NULL, after_record jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 CHECK (octet_length(request::text) <= 95000)
);
ALTER TABLE portal_read_model.medical_document_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.medical_document_import FORCE ROW LEVEL SECURITY;
REVOKE ALL ON portal_read_model.medical_document_import FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON portal_read_model.medical_document_import TO service_role;

CREATE FUNCTION public.embe_create_document_intake(p_id uuid,p_title text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_id IS NULL OR char_length(trim(p_title)) NOT BETWEEN 1 AND 100 THEN RAISE sqlstate '22023'; END IF;
 INSERT INTO portal_read_model.pregnancy_medical_record(id,kind,status,occurred_at,title,document_intake)
 VALUES(p_id,'other','completed',now(),trim(p_title),true) ON CONFLICT(id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM portal_read_model.pregnancy_medical_record WHERE id=p_id AND document_intake AND deleted_at IS NULL)
 THEN RAISE sqlstate 'PT409' USING message='intake_conflict'; END IF;
 RETURN p_id;
END $$;

-- Queue as part of the upload-completion transaction, even if the phone closes immediately.
CREATE FUNCTION portal_read_model.queue_medical_document_after_upload() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.status='ready' THEN
  INSERT INTO portal_read_model.medical_document_scan(document_id) VALUES(NEW.id) ON CONFLICT(document_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION portal_read_model.queue_medical_document_after_upload() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION portal_read_model.queue_medical_document_after_upload() TO service_role;
CREATE TRIGGER medical_document_queue_after_upload AFTER INSERT OR UPDATE OF status ON portal_read_model.pregnancy_medical_document
 FOR EACH ROW EXECUTE FUNCTION portal_read_model.queue_medical_document_after_upload();

CREATE FUNCTION public.embe_document_import_context(p_document_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('recordUpdatedAt',r.updated_at,'intake',r.document_intake,
  'imported',EXISTS(SELECT 1 FROM portal_read_model.medical_document_import i WHERE i.document_id=d.id))
 FROM portal_read_model.pregnancy_medical_document d JOIN portal_read_model.pregnancy_medical_record r ON r.id=d.record_id
 WHERE d.id=p_document_id AND d.status='ready' AND r.deleted_at IS NULL;
$$;

CREATE FUNCTION public.embe_import_document(p_document_id uuid,p_revision integer,p_record_updated_at timestamptz,p_analysis jsonb,p_details jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
 d portal_read_model.pregnancy_medical_document%ROWTYPE;
 r portal_read_model.pregnancy_medical_record%ROWTYPE;
 prior portal_read_model.medical_document_import%ROWTYPE;
 before_value jsonb; merged_metrics jsonb; merged_medicines jsonb; item jsonb; link_id uuid;
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
  r.notes,COALESCE(r.gestational_week,(p_details->>'gestationalWeek')::integer),r.next_appointment_at,merged_metrics,merged_medicines);
 UPDATE portal_read_model.pregnancy_medical_record SET document_date_only=document_date_only OR document_intake,
  document_intake=false,linked_record_id=COALESCE(link_id,linked_record_id) WHERE id=r.id;
 INSERT INTO portal_read_model.medical_document_import(document_id,record_id,source_revision,request,before_record,after_record)
 SELECT d.id,r.id,p_revision,request_value,before_value,to_jsonb(saved) FROM portal_read_model.pregnancy_medical_record saved WHERE saved.id=r.id;
 RETURN jsonb_build_object('recordId',r.id,'imported',true);
END $$;

CREATE OR REPLACE FUNCTION public.embe_list_pregnancy_medical_records() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg((to_jsonb(r)-'deleted_at') || jsonb_build_object('documents',COALESCE((
  SELECT jsonb_agg(jsonb_build_object('id',d.id,'original_filename',d.original_filename,'mime_type',d.mime_type,
   'byte_size',d.byte_size,'created_at',d.created_at,'scan_status',COALESCE(s.status,'idle'),
   'imported',EXISTS(SELECT 1 FROM portal_read_model.medical_document_import i WHERE i.document_id=d.id)) ORDER BY d.created_at)
  FROM portal_read_model.pregnancy_medical_document d LEFT JOIN portal_read_model.medical_document_scan s ON s.document_id=d.id
  WHERE d.record_id=r.id AND d.status='ready'), '[]'::jsonb)) ORDER BY r.occurred_at DESC),'[]'::jsonb)
 FROM portal_read_model.pregnancy_medical_record r WHERE r.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.embe_create_document_intake(uuid,text),public.embe_document_import_context(uuid),public.embe_import_document(uuid,integer,timestamptz,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_create_document_intake(uuid,text),public.embe_document_import_context(uuid),public.embe_import_document(uuid,integer,timestamptz,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
