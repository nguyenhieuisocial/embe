-- Private, independent OCR text stays separate from PDF text and editable fields.
-- Reuses the existing trigger and ACL; no new tables, grants or public endpoints.
BEGIN;
CREATE OR REPLACE FUNCTION portal_read_model.preserve_medical_pdf_source() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE doc jsonb; pg jsonb; pages jsonb; editable jsonb; slot integer; page_index integer;
BEGIN
 FOR slot IN 1..2 LOOP
  doc := CASE WHEN slot=1 THEN NEW.analysis ELSE NEW.confirmed_analysis END;
  IF doc IS NULL THEN CONTINUE; END IF;
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR doc->'version' IS DISTINCT FROM '1'::jsonb
   OR jsonb_typeof(doc->'pages') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'invalid_analysis' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(doc->'pages') NOT BETWEEN 1 AND 6
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(doc) k WHERE k NOT IN ('version','pages'))
  THEN RAISE EXCEPTION 'invalid_pages' USING ERRCODE='22023'; END IF;

  -- Caller-supplied source keys are always discarded before source validation.
  -- This also accepts older clients that omit all source metadata.
  IF slot=2 THEN
   SELECT jsonb_agg(value-ARRAY['pdfText','ocrText','ocrEngine'] ORDER BY ordinality) INTO pages
    FROM jsonb_array_elements(doc->'pages') WITH ORDINALITY;
   doc := jsonb_set(doc,'{pages}',pages);
  END IF;
  page_index := 0;
  FOR pg IN SELECT value FROM jsonb_array_elements(doc->'pages') LOOP
   page_index := page_index+1;
   IF jsonb_typeof(pg) IS DISTINCT FROM 'object' OR pg->'page' IS DISTINCT FROM to_jsonb(page_index)
   THEN RAISE EXCEPTION 'invalid_pages' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(pg) k WHERE k NOT IN
    ('page','kind','title','fields','medicines','charges','warnings','pdfText','ocrText','ocrEngine'))
   THEN RAISE EXCEPTION 'invalid_source_metadata' USING ERRCODE='22023'; END IF;
   IF pg ? 'pdfText' AND (jsonb_typeof(pg->'pdfText') IS DISTINCT FROM 'string'
    OR char_length(pg->>'pdfText')>48000 OR (pg->>'pdfText') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]')
   THEN RAISE EXCEPTION 'invalid_pdf_source' USING ERRCODE='22023'; END IF;
   IF (pg ? 'ocrText') IS DISTINCT FROM (pg ? 'ocrEngine') OR (pg ? 'ocrText' AND
    (jsonb_typeof(pg->'ocrText') IS DISTINCT FROM 'string' OR char_length(pg->>'ocrText')>48000
     OR (pg->>'ocrText') ~ '[\x01-\x08\x0b\x0c\x0e-\x1f]'
     OR pg->'ocrEngine' IS DISTINCT FROM '"tesseract-vie-eng"'::jsonb))
   THEN RAISE EXCEPTION 'invalid_ocr_source' USING ERRCODE='22023'; END IF;
  END LOOP;
  SELECT jsonb_agg(value-ARRAY['pdfText','ocrText','ocrEngine'] ORDER BY ordinality) INTO pages
   FROM jsonb_array_elements(doc->'pages') WITH ORDINALITY;
  editable := jsonb_set(doc,'{pages}',pages);
  -- Keep the existing editable SQL envelope, including JSONB formatting overhead.
  IF octet_length(editable::text)>70000 THEN RAISE EXCEPTION 'analysis_too_large' USING ERRCODE='22023'; END IF;
  IF octet_length(doc::text)>1250000 THEN RAISE EXCEPTION 'analysis_too_large' USING ERRCODE='22023'; END IF;
  IF slot=2 THEN NEW.confirmed_analysis := doc; END IF;
 END LOOP;

 IF NEW.confirmed_analysis IS NOT NULL THEN
  IF NEW.analysis IS NOT NULL AND jsonb_array_length(NEW.analysis->'pages') IS DISTINCT FROM
   jsonb_array_length(NEW.confirmed_analysis->'pages')
  THEN RAISE EXCEPTION 'invalid_pages' USING ERRCODE='22023'; END IF;
  -- Both page arrays are sequentially validated above. Never attach page 1's
  -- source to a caller-renumbered page, even when that page contains valid text.
  SELECT jsonb_agg(p.value || COALESCE((
    SELECT jsonb_object_agg(s.key,s.value)
    FROM jsonb_each(NEW.analysis->'pages'->(p.ordinality::integer-1)) s
    WHERE s.key IN ('pdfText','ocrText','ocrEngine')
   ),'{}'::jsonb) ORDER BY p.ordinality) INTO pages
   FROM jsonb_array_elements(NEW.confirmed_analysis->'pages') WITH ORDINALITY p;
  NEW.confirmed_analysis := jsonb_set(NEW.confirmed_analysis,'{pages}',pages);
  IF octet_length(NEW.confirmed_analysis::text)>1250000
  THEN RAISE EXCEPTION 'analysis_too_large' USING ERRCODE='22023'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION portal_read_model.preserve_medical_pdf_source() FROM PUBLIC,anon,authenticated;
COMMIT;
