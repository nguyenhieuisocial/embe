-- Synthetic rows exist only inside this transaction, never visible to running workers.
BEGIN;
DO $$
DECLARE rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid(); linked uuid:=gen_random_uuid(); snapshot timestamptz;
 a jsonb:='{"version":1,"pages":[{"page":1,"kind":"ultrasound","title":"SYNTHETIC","fields":[],"medicines":[],"charges":[],"warnings":[]}]}';
 details jsonb; path text; result jsonb; again jsonb; rid2 uuid:=gen_random_uuid(); did2 uuid:=gen_random_uuid();
BEGIN
 INSERT INTO portal_read_model.pregnancy_medical_record(id,kind,status,occurred_at,title,provider,notes)
 VALUES(linked,'appointment','planned','2026-09-07T02:00:00Z','SYNTHETIC LINK','BV Mẫu','Existing notes unchanged');
 PERFORM public.embe_create_document_intake(rid,'SYNTHETIC INTAKE');
 PERFORM public.embe_create_document_intake(rid,'SYNTHETIC INTAKE');
 path:='records/'||rid||'/'||did||'.pdf';
 INSERT INTO portal_read_model.pregnancy_medical_document(id,record_id,status,storage_path,original_filename,mime_type,byte_size)
 VALUES(did,rid,'ready',path,'synthetic.pdf','application/pdf',20);
 IF (SELECT count(*) FROM portal_read_model.medical_document_scan WHERE document_id=did)<>1 THEN RAISE EXCEPTION 'auto_queue_missing'; END IF;
 UPDATE portal_read_model.medical_document_scan SET status='review',analysis=a,page_count=1,completed_pages=1,revision=3 WHERE document_id=did;
 SELECT updated_at INTO snapshot FROM portal_read_model.pregnancy_medical_record WHERE id=rid;
 details:=jsonb_build_object('kind','ultrasound','title','SYNTHETIC SCAN','occurredOn','2026-09-07','provider','BV Mẫu','clinician','BS Mẫu','gestationalWeek',12,'linkedRecordId',linked,'measurements','{"crlMm":45.6}'::jsonb,'medicines','[]'::jsonb);
 BEGIN
  PERFORM public.embe_import_document(did,2,snapshot,a,details);
  RAISE EXCEPTION 'stale_scan_accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.embe_import_document(did,3,snapshot-interval '1 second',a,details);
  RAISE EXCEPTION 'stale_record_accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 result:=public.embe_import_document(did,3,snapshot,a,details);
 again:=public.embe_import_document(did,3,snapshot,a,details);
 IF result IS DISTINCT FROM again THEN RAISE EXCEPTION 'retry_not_idempotent'; END IF;
 IF (SELECT count(*) FROM portal_read_model.medical_document_import WHERE document_id=did)<>1 THEN RAISE EXCEPTION 'duplicate_import'; END IF;
 IF NOT EXISTS(SELECT 1 FROM portal_read_model.pregnancy_medical_record WHERE id=rid AND NOT document_intake AND document_date_only AND kind='ultrasound'
  AND provider='BV Mẫu' AND linked_record_id=linked AND measurements='{"crlMm":45.6}'::jsonb) THEN RAISE EXCEPTION 'not_integrated'; END IF;
 IF (SELECT notes FROM portal_read_model.pregnancy_medical_record WHERE id=linked)<>'Existing notes unchanged' THEN RAISE EXCEPTION 'linked_record_overwritten'; END IF;
 IF (SELECT storage_path FROM portal_read_model.pregnancy_medical_document WHERE id=did)<>path THEN RAISE EXCEPTION 'original_moved'; END IF;
 -- Existing conflicting measurements must leave both transcription and record untouched.
 INSERT INTO portal_read_model.pregnancy_medical_record(id,kind,status,occurred_at,title,measurements)
 VALUES(rid2,'ultrasound','completed',now(),'SYNTHETIC CONFLICT','{"crlMm":99}');
 INSERT INTO portal_read_model.pregnancy_medical_document(id,record_id,status,storage_path,original_filename,mime_type,byte_size)
 VALUES(did2,rid2,'ready','records/'||rid2||'/'||did2||'.pdf','synthetic.pdf','application/pdf',20);
 UPDATE portal_read_model.medical_document_scan SET status='review',analysis=a,page_count=1,revision=3 WHERE document_id=did2;
 SELECT updated_at INTO snapshot FROM portal_read_model.pregnancy_medical_record WHERE id=rid2;
 BEGIN
  PERFORM public.embe_import_document(did2,3,snapshot,a,details);
  RAISE EXCEPTION 'existing_value_overwritten';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF (public.embe_get_document_scan(did2))->>'status'<>'review' THEN RAISE EXCEPTION 'partial_commit'; END IF;
 UPDATE portal_read_model.pregnancy_medical_record SET deleted_at=now() WHERE id=rid;
 IF public.embe_document_import_context(did) IS NOT NULL THEN RAISE EXCEPTION 'deleted_visible'; END IF;
 IF has_function_privilege('anon','public.embe_import_document(uuid,integer,timestamptz,jsonb,jsonb)','EXECUTE')
 OR has_table_privilege('authenticated','portal_read_model.medical_document_import','SELECT') THEN RAISE EXCEPTION 'private_data_exposed'; END IF;
END $$;
ROLLBACK;
