CREATE OR REPLACE FUNCTION public.embe_claim_document_scan() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s portal_read_model.medical_document_scan%ROWTYPE; source_doc portal_read_model.pregnancy_medical_document%ROWTYPE;
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
 SELECT * INTO source_doc FROM portal_read_model.pregnancy_medical_document WHERE id=s.document_id;
 RETURN jsonb_build_object('document_id',source_doc.id,'storage_path',source_doc.storage_path,'mime_type',source_doc.mime_type,
  'byte_size',source_doc.byte_size,'claim_token',s.claim_token);
END; $$;
