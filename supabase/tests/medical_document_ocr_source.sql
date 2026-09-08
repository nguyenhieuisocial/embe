-- SYNTHETIC ONLY. Invoke only against an explicitly approved EmBe database.
-- Exercises the deployed trigger on a temporary table; no family records,
-- document queues, storage objects or permanent application rows are touched.
BEGIN;
CREATE TEMP TABLE embe_medical_ocr_fixture (
 id integer PRIMARY KEY, analysis jsonb, confirmed_analysis jsonb
) ON COMMIT DROP;
CREATE TRIGGER preserve_medical_source_fixture BEFORE INSERT OR UPDATE OF analysis,confirmed_analysis
 ON embe_medical_ocr_fixture FOR EACH ROW
 EXECUTE FUNCTION portal_read_model.preserve_medical_pdf_source();

DO $$
DECLARE
 base_page jsonb := '{"page":1,"kind":"clinical","title":"SYNTHETIC OCR FIXTURE","fields":[],"medicines":[],"charges":[],"warnings":[]}';
 plain jsonb; original jsonb; supplied jsonb; result jsonb; bad jsonb; candidate jsonb; oversized jsonb;
BEGIN
 plain := jsonb_build_object('version',1,'pages',jsonb_build_array(base_page));
 original := jsonb_set(plain,'{pages,0}',base_page || jsonb_build_object(
  'pdfText','PDF SOURCE PAGE 1','ocrText','OCR SOURCE PAGE 1','ocrEngine','tesseract-vie-eng'));
 supplied := jsonb_set(plain,'{pages,0}',base_page || jsonb_build_object(
  'pdfText','FORGED PDF','ocrText',jsonb_build_array('FORGED OCR'),'ocrEngine','FORGED ENGINE'));

 -- Untrusted confirmation metadata is discarded, not accepted or selected.
 INSERT INTO embe_medical_ocr_fixture VALUES(1,original,supplied);
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=1;
 IF result IS DISTINCT FROM original THEN RAISE EXCEPTION 'forged_confirmation_source'; END IF;

 -- Older clients omit source; page text is still restored on each confirmation.
 UPDATE embe_medical_ocr_fixture SET confirmed_analysis=plain WHERE id=1;
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=1;
 IF result IS DISTINCT FROM original THEN RAISE EXCEPTION 'omitted_confirmation_source'; END IF;

 -- Source changes cannot leave stale independent text on the confirmed copy.
 original := jsonb_set(original,'{pages,0,ocrText}','"UPDATED LOCAL SOURCE"');
 UPDATE embe_medical_ocr_fixture SET analysis=original WHERE id=1;
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=1;
 IF result IS DISTINCT FROM original THEN RAISE EXCEPTION 'stale_confirmation_source'; END IF;

 -- No worker source means no caller-supplied read-only text can survive.
 INSERT INTO embe_medical_ocr_fixture VALUES(2,NULL,supplied);
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=2;
 IF result IS DISTINCT FROM plain THEN RAISE EXCEPTION 'source_forged_without_worker'; END IF;

 -- Legacy PDF-only and paired OCR-only analyses remain readable.
 original := jsonb_set(plain,'{pages,0,pdfText}','"LEGACY PDF"');
 INSERT INTO embe_medical_ocr_fixture VALUES(3,original,plain);
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=3;
 IF result IS DISTINCT FROM original OR result->'pages'->0 ? 'ocrText'
 THEN RAISE EXCEPTION 'legacy_pdf_broken'; END IF;
 original := jsonb_set(plain,'{pages,0}',base_page || jsonb_build_object('ocrText','','ocrEngine','tesseract-vie-eng'));
 INSERT INTO embe_medical_ocr_fixture VALUES(4,original,plain);
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=4;
 IF result IS DISTINCT FROM original OR result->'pages'->0 ? 'pdfText'
 THEN RAISE EXCEPTION 'ocr_only_broken'; END IF;

 -- Same page number, independent sources: no mixing page 1 with page 2.
 original := jsonb_build_object('version',1,'pages',jsonb_build_array(
  base_page || jsonb_build_object('pdfText','PDF 1','ocrText','OCR 1','ocrEngine','tesseract-vie-eng'),
  base_page || jsonb_build_object('page',2,'pdfText','PDF 2','ocrText','OCR 2','ocrEngine','tesseract-vie-eng')));
 supplied := jsonb_build_object('version',1,'pages',jsonb_build_array(base_page,base_page || '{"page":2}'::jsonb));
 INSERT INTO embe_medical_ocr_fixture VALUES(5,original,supplied);
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=5;
 IF result IS DISTINCT FROM original THEN RAISE EXCEPTION 'sources_mixed_between_pages'; END IF;

 -- Unicode codepoints, not bytes or UTF-16 units: 48,000 supplementary characters fit one source.
 original := jsonb_set(plain,'{pages,0}',base_page || jsonb_build_object(
  'ocrText',repeat(U&'\+020000',48000),'ocrEngine','tesseract-vie-eng'));
 INSERT INTO embe_medical_ocr_fixture VALUES(6,original,plain);
 SELECT confirmed_analysis INTO result FROM embe_medical_ocr_fixture WHERE id=6;
 IF char_length(result->'pages'->0->>'ocrText')<>48000 THEN RAISE EXCEPTION 'unicode_source_truncated'; END IF;

 FOR bad IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('ocrText','UNPAIRED'),
  jsonb_build_object('ocrEngine','tesseract-vie-eng'),
  jsonb_build_object('ocrText','TEXT','ocrEngine','unknown'),
  jsonb_build_object('ocrText',NULL,'ocrEngine','tesseract-vie-eng'),
  jsonb_build_object('ocrText',jsonb_build_array('TEXT'),'ocrEngine','tesseract-vie-eng'),
  jsonb_build_object('ocrText','TEXT','ocrEngine',NULL),
  jsonb_build_object('ocrText',repeat('x',48001),'ocrEngine','tesseract-vie-eng'),
  jsonb_build_object('ocrText','TEXT'||chr(1),'ocrEngine','tesseract-vie-eng'),
  jsonb_build_object('ocrText','TEXT','ocrEngine','tesseract-vie-eng','ocrConfidence',1),
  jsonb_build_object('pdfText',repeat('x',48001)),
  jsonb_build_object('pdfText','TEXT'||chr(1)),
  jsonb_build_object('pdfText',NULL),
  jsonb_build_object('page',2)
 )) LOOP
  candidate := jsonb_set(plain,'{pages,0}',base_page || bad);
  BEGIN
   INSERT INTO embe_medical_ocr_fixture VALUES(99,candidate,NULL);
   RAISE EXCEPTION 'invalid_worker_source_accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
 END LOOP;

 -- Invalid page order/count cannot borrow another page's original source.
 FOREACH candidate IN ARRAY ARRAY[
  jsonb_build_object('version',1,'pages',jsonb_build_array(base_page || '{"page":2}'::jsonb,base_page)),
  jsonb_build_object('version',1,'pages',jsonb_build_array(base_page,base_page)),
  plain
 ] LOOP
  BEGIN
   UPDATE embe_medical_ocr_fixture SET confirmed_analysis=candidate WHERE id=5;
   RAISE EXCEPTION 'wrong_page_confirmation_accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
 END LOOP;

 -- Every page's sources individually fit, but the shared byte envelope still applies.
 SELECT jsonb_build_object('version',1,'pages',jsonb_agg(base_page || jsonb_build_object(
  'page',i,'pdfText',repeat('ữ',48000),'ocrText',repeat('ữ',48000),'ocrEngine','tesseract-vie-eng') ORDER BY i))
 INTO oversized FROM generate_series(1,6) i;
 BEGIN
  INSERT INTO embe_medical_ocr_fixture VALUES(99,oversized,NULL);
  RAISE EXCEPTION 'oversized_combined_source_accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;

 -- Read-only allowance must not increase the editable JSON envelope.
 candidate := jsonb_set(plain,'{pages,0,fields}',jsonb_build_array(jsonb_build_object('value',repeat('x',70001))));
 BEGIN
  INSERT INTO embe_medical_ocr_fixture VALUES(99,candidate,NULL);
  RAISE EXCEPTION 'oversized_editable_data_accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;

 IF has_function_privilege('anon','portal_read_model.preserve_medical_pdf_source()','EXECUTE')
  OR has_function_privilege('authenticated','portal_read_model.preserve_medical_pdf_source()','EXECUTE')
  OR has_table_privilege('authenticated','portal_read_model.medical_document_scan','SELECT')
 THEN RAISE EXCEPTION 'source_access_expanded'; END IF;
END; $$;
ROLLBACK;
