BEGIN;
DO $$
DECLARE rid uuid:=gen_random_uuid(); did uuid:=gen_random_uuid(); claimed jsonb; current_scan jsonb;
 a jsonb:='{"version":1,"pages":[{"page":1,"kind":"ultrasound","title":"SYNTHETIC TEST","fields":[],"medicines":[],"charges":[],"warnings":[]}]}';
BEGIN
 IF EXISTS(SELECT 1 FROM portal_read_model.medical_document_scan WHERE status IN ('queued','processing')) THEN
  RAISE EXCEPTION 'Run queue contract test only with no pending document jobs';
 END IF;
 INSERT INTO portal_read_model.pregnancy_medical_record(id,kind,status,occurred_at,title) VALUES(rid,'receipt','completed',now(),'SYNTHETIC ROLLBACK TEST');
 INSERT INTO portal_read_model.pregnancy_medical_document(id,record_id,status,storage_path,original_filename,mime_type,byte_size)
 VALUES(did,rid,'ready','records/'||rid||'/'||did||'.pdf','synthetic.pdf','application/pdf',20);
 PERFORM public.embe_queue_document_scan(did);
 PERFORM public.embe_queue_document_scan(did);
 IF (SELECT count(*) FROM portal_read_model.medical_document_scan WHERE document_id=did)<>1 THEN RAISE EXCEPTION 'duplicate'; END IF;
 claimed:=public.embe_claim_document_scan();
 IF claimed->>'document_id'<>did::text THEN RAISE EXCEPTION 'wrong_claim'; END IF;
 BEGIN
  PERFORM public.embe_progress_document_scan(did,gen_random_uuid(),0,1);
  RAISE EXCEPTION 'stale_claim_accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 PERFORM public.embe_progress_document_scan(did,(claimed->>'claim_token')::uuid,0,1);
 PERFORM public.embe_finish_document_scan(did,(claimed->>'claim_token')::uuid,repeat('a',64),'local-test',a);
 current_scan:=public.embe_get_document_scan(did);
 IF current_scan->>'status'<>'review' THEN RAISE EXCEPTION 'not_review'; END IF;
 PERFORM public.embe_confirm_document_scan(did,(current_scan->>'revision')::integer,a);
 BEGIN
  PERFORM public.embe_confirm_document_scan(did,(current_scan->>'revision')::integer,a);
  RAISE EXCEPTION 'stale_review_accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (public.embe_get_document_scan(did))->>'status'<>'confirmed' THEN RAISE EXCEPTION 'not_saved'; END IF;
 IF (SELECT medicines FROM portal_read_model.pregnancy_medical_record WHERE id=rid)<>'[]'::jsonb THEN RAISE EXCEPTION 'clinical_mutation'; END IF;
 UPDATE portal_read_model.pregnancy_medical_record SET deleted_at=now() WHERE id=rid;
 IF public.embe_get_document_scan(did) IS NOT NULL THEN RAISE EXCEPTION 'deleted_record_visible'; END IF;
 IF has_function_privilege('anon','public.embe_get_document_scan(uuid)','EXECUTE') OR
 has_table_privilege('authenticated','portal_read_model.medical_document_scan','SELECT') THEN RAISE EXCEPTION 'client_access'; END IF;
END; $$;
ROLLBACK;
