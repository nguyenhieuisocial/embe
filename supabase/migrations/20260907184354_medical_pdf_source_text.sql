-- Private PDF source is immutable during review. Editable data remains bounded.
BEGIN;
ALTER TABLE portal_read_model.medical_document_scan
 DROP CONSTRAINT medical_document_scan_analysis_check,
 DROP CONSTRAINT medical_document_scan_confirmed_analysis_check,
 ADD CONSTRAINT medical_document_scan_analysis_check CHECK (analysis IS NULL OR (jsonb_typeof(analysis)='object' AND octet_length(analysis::text)<=1300000)),
 ADD CONSTRAINT medical_document_scan_confirmed_analysis_check CHECK (confirmed_analysis IS NULL OR (jsonb_typeof(confirmed_analysis)='object' AND octet_length(confirmed_analysis::text)<=1300000));

CREATE FUNCTION portal_read_model.preserve_medical_pdf_source() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE doc jsonb; pg jsonb; pages jsonb; editable jsonb;
BEGIN
 -- Older clients omit source text; newer clients also send editable data only.
 -- Always use the original worker output, never caller-supplied source text.
 IF NEW.confirmed_analysis IS NOT NULL AND (TG_OP='INSERT' OR NEW.confirmed_analysis IS DISTINCT FROM OLD.confirmed_analysis) THEN
  IF jsonb_typeof(NEW.confirmed_analysis->'pages') IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'invalid_analysis' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg((p.value - 'pdfText') || CASE
    WHEN jsonb_typeof(NEW.analysis->'pages'->(p.ordinality::integer-1)->'pdfText')='string'
    THEN jsonb_build_object('pdfText',NEW.analysis->'pages'->(p.ordinality::integer-1)->'pdfText') ELSE '{}'::jsonb END
    ORDER BY p.ordinality) INTO pages
   FROM jsonb_array_elements(NEW.confirmed_analysis->'pages') WITH ORDINALITY p;
  NEW.confirmed_analysis := jsonb_set(NEW.confirmed_analysis,'{pages}',COALESCE(pages,'[]'::jsonb));
 END IF;
 FOREACH doc IN ARRAY ARRAY[NEW.analysis,NEW.confirmed_analysis] LOOP
  IF doc IS NULL THEN CONTINUE; END IF;
  IF jsonb_typeof(doc->'pages') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_pages' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(doc->'pages') NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'invalid_pages' USING ERRCODE='22023'; END IF;
  FOR pg IN SELECT value FROM jsonb_array_elements(doc->'pages') LOOP
   IF jsonb_typeof(pg) IS DISTINCT FROM 'object' OR (pg ? 'pdfText' AND
    (jsonb_typeof(pg->'pdfText') IS DISTINCT FROM 'string' OR char_length(pg->>'pdfText')>48000))
   THEN RAISE EXCEPTION 'invalid_pdf_source' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT jsonb_agg(value-'pdfText' ORDER BY ordinality) INTO pages FROM jsonb_array_elements(doc->'pages') WITH ORDINALITY;
  editable := jsonb_set(doc,'{pages}',pages);
  IF octet_length(editable::text)>70000 THEN RAISE EXCEPTION 'analysis_too_large' USING ERRCODE='22023'; END IF;
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION portal_read_model.preserve_medical_pdf_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER preserve_medical_pdf_source BEFORE INSERT OR UPDATE OF analysis,confirmed_analysis
 ON portal_read_model.medical_document_scan FOR EACH ROW EXECUTE FUNCTION portal_read_model.preserve_medical_pdf_source();
COMMIT;
