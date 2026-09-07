-- Use intentional HTTP conflict/not-found responses, not retryable-looking database failures.
BEGIN;
CREATE OR REPLACE FUNCTION public.embe_confirm_document_scan(p_document_id uuid,p_revision integer,p_analysis jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s portal_read_model.medical_document_scan%ROWTYPE;
BEGIN
 IF public.embe_get_document_scan(p_document_id) IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='PT404'; END IF;
 SELECT * INTO s FROM portal_read_model.medical_document_scan WHERE document_id=p_document_id FOR UPDATE;
 IF s.status NOT IN ('review','confirmed') OR s.revision IS DISTINCT FROM p_revision
 THEN RAISE EXCEPTION 'revision_conflict' USING ERRCODE='PT409'; END IF;
 IF COALESCE(p_analysis->>'version','')<>'1' OR jsonb_typeof(p_analysis->'pages') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'invalid_analysis' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_analysis->'pages') IS DISTINCT FROM s.page_count THEN RAISE EXCEPTION 'invalid_pages' USING ERRCODE='22023'; END IF;
 UPDATE portal_read_model.medical_document_scan SET status='confirmed',confirmed_analysis=p_analysis,
  confirmed_at=now(),updated_at=now(),revision=revision+1 WHERE document_id=p_document_id;
 RETURN public.embe_get_document_scan(p_document_id);
END; $$;
COMMIT;
