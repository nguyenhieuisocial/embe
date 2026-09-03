BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(45);

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.medication_scan', 'SELECT'),
  'Anonymous clients cannot read prescription scan state'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.medication_scan', 'INSERT'),
  'Authenticated browsers cannot insert prescription scan work'
);
SELECT ok(
  has_table_privilege('service_role', 'portal_read_model.medication_scan', 'SELECT'),
  'The private server role can read prescription scan state'
);
SELECT ok(NOT has_function_privilege('anon', 'public.embe_queue_medication_scan(uuid)', 'EXECUTE'),
  'Anonymous clients cannot queue prescription OCR');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_get_medication_scan(uuid)', 'EXECUTE'),
  'Authenticated browsers cannot bypass the scan API');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_claim_medication_scan()', 'EXECUTE'),
  'Authenticated browsers cannot claim worker jobs');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_finish_medication_scan(uuid,text,text,jsonb)', 'EXECUTE'),
  'Authenticated browsers cannot publish model output');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_fail_medication_scan(uuid,text,integer)', 'EXECUTE'),
  'Authenticated browsers cannot mutate retry state');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_confirm_medication_scan(uuid,jsonb)', 'EXECUTE'),
  'Authenticated browsers cannot confirm medicines directly');
SELECT ok(has_function_privilege('service_role', 'public.embe_queue_medication_scan(uuid)', 'EXECUTE'),
  'The private API can queue a prescription image');
SELECT ok(has_function_privilege('service_role', 'public.embe_get_medication_scan(uuid)', 'EXECUTE'),
  'The private API can read review state');
SELECT ok(has_function_privilege('service_role', 'public.embe_claim_medication_scan()', 'EXECUTE'),
  'The local worker can claim prescription OCR');
SELECT ok(has_function_privilege('service_role', 'public.embe_finish_medication_scan(uuid,text,text,jsonb)', 'EXECUTE'),
  'The local worker can publish bounded extraction output');
SELECT ok(has_function_privilege('service_role', 'public.embe_fail_medication_scan(uuid,text,integer)', 'EXECUTE'),
  'The local worker can release failed work');
SELECT ok(has_function_privilege('service_role', 'public.embe_confirm_medication_scan(uuid,jsonb)', 'EXECUTE'),
  'The private API can confirm reviewed medicines');

INSERT INTO portal_read_model.pregnancy_medical_record (
  id, kind, status, occurred_at, title, medicines
) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'prescription', 'completed', timezone('utc', now()), 'Đơn thuốc hợp lệ', '[]'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'appointment', 'completed', timezone('utc', now()), 'Không phải đơn thuốc', '[]'::jsonb),
  ('a1000000-0000-4000-8000-000000000003', 'prescription', 'completed', timezone('utc', now()), 'Đơn thuốc đã xóa', '[]'::jsonb);
UPDATE portal_read_model.pregnancy_medical_record
SET deleted_at = timezone('utc', now())
WHERE id = 'a1000000-0000-4000-8000-000000000003';

INSERT INTO portal_read_model.pregnancy_medical_document (
  id, record_id, storage_path, original_filename, mime_type, byte_size, status, ready_at
) VALUES
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
   'records/a1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000001.jpg',
   'don-thuoc.jpg', 'image/jpeg', 2048, 'pending', NULL),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
   'records/a1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000002.pdf',
   'don-thuoc.pdf', 'application/pdf', 2048, 'ready', timezone('utc', now())),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002',
   'records/a1000000-0000-4000-8000-000000000002/b1000000-0000-4000-8000-000000000003.jpg',
   'lich-kham.jpg', 'image/jpeg', 2048, 'ready', timezone('utc', now())),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000003',
   'records/a1000000-0000-4000-8000-000000000003/b1000000-0000-4000-8000-000000000004.jpg',
   'don-da-xoa.jpg', 'image/jpeg', 2048, 'ready', timezone('utc', now())),
  ('b1000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001',
   'records/a1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000005.jpg',
   'don-chinh.jpg', 'image/jpeg', 4096, 'ready', timezone('utc', now())),
  ('b1000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001',
   'records/a1000000-0000-4000-8000-000000000001/b1000000-0000-4000-8000-000000000006.png',
   'don-thu-hai.png', 'image/png', 3072, 'ready', timezone('utc', now()));

SET ROLE service_role;

CREATE TEMP TABLE care_plan_baseline AS
SELECT count(*) AS row_count FROM portal_read_model.pregnancy_care_plan;

SELECT throws_ok(
  $$SELECT public.embe_queue_medication_scan('b1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'document is not a ready prescription image',
  'A pending document cannot enter the OCR queue'
);
SELECT throws_ok(
  $$SELECT public.embe_queue_medication_scan('b1000000-0000-4000-8000-000000000002')$$,
  'P0001', 'document is not a ready prescription image',
  'A PDF cannot enter the image-only OCR queue'
);
SELECT throws_ok(
  $$SELECT public.embe_queue_medication_scan('b1000000-0000-4000-8000-000000000003')$$,
  'P0001', 'document is not a ready prescription image',
  'An image on a non-prescription record cannot enter the queue'
);
SELECT throws_ok(
  $$SELECT public.embe_queue_medication_scan('b1000000-0000-4000-8000-000000000004')$$,
  'P0001', 'document is not a ready prescription image',
  'An image on a deleted prescription cannot enter the queue'
);

SELECT is(
  public.embe_queue_medication_scan('b1000000-0000-4000-8000-000000000005') ->> 'status',
  'queued',
  'A ready prescription image enters the review-first queue'
);
SELECT public.embe_queue_medication_scan('b1000000-0000-4000-8000-000000000005');
SELECT is(
  (SELECT count(*) FROM portal_read_model.medication_scan
   WHERE document_id = 'b1000000-0000-4000-8000-000000000005'),
  1::bigint,
  'Queueing the same document is idempotent'
);
SELECT ok(
  NOT (public.embe_get_medication_scan('b1000000-0000-4000-8000-000000000005') ? 'storage_path'),
  'The API review payload never exposes its private object locator'
);

CREATE TEMP TABLE first_medication_claim AS
SELECT public.embe_claim_medication_scan() AS payload;
SELECT is(
  (SELECT ARRAY(SELECT jsonb_object_keys(payload) ORDER BY 1) FROM first_medication_claim),
  ARRAY['attempts', 'byte_size', 'document_id', 'mime_type', 'storage_path'],
  'The worker claim returns exactly the agreed data-plane fields'
);
SELECT ok(
  (SELECT attempts = 1 AND claimed_at IS NOT NULL AND status = 'processing'
   FROM portal_read_model.medication_scan
   WHERE document_id = 'b1000000-0000-4000-8000-000000000005'),
  'Claiming records one bounded attempt and a lease timestamp'
);
SELECT is(
  public.embe_claim_medication_scan(),
  NULL::jsonb,
  'A live claim cannot be claimed by a second worker'
);

UPDATE portal_read_model.medication_scan
SET claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE document_id = 'b1000000-0000-4000-8000-000000000005';
SELECT is(
  public.embe_claim_medication_scan() ->> 'document_id',
  'b1000000-0000-4000-8000-000000000005',
  'An abandoned claim is recovered after its lease expires'
);
SELECT is(
  (SELECT attempts FROM portal_read_model.medication_scan
   WHERE document_id = 'b1000000-0000-4000-8000-000000000005'),
  2::smallint,
  'Recovering an abandoned claim consumes another bounded attempt'
);
SELECT throws_ok(
  $$SELECT public.embe_finish_medication_scan(
    'b1000000-0000-4000-8000-000000000005', 'bad', 'qwen3-vl:4b-instruct', '{}'::jsonb
  )$$,
  'P0001', 'invalid medication scan result',
  'A worker cannot store a malformed checksum'
);
SELECT lives_ok(
  $$SELECT public.embe_finish_medication_scan(
    'b1000000-0000-4000-8000-000000000005',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'qwen3-vl:4b-instruct',
    '{"medicines":[{"name":"Elevit","dose":"1 viên","frequency":"mỗi ngày","instructions":"sau ăn","confidence":0.92}],"questions":[]}'::jsonb
  )$$,
  'A claimed image becomes a reviewable extraction'
);
SELECT ok(
  (SELECT status = 'review' AND claimed_at IS NULL AND analyzed_at IS NOT NULL
   FROM portal_read_model.medication_scan
   WHERE document_id = 'b1000000-0000-4000-8000-000000000005'),
  'Finishing analysis releases the lease and waits for human review'
);
SELECT is(
  public.embe_get_medication_scan('b1000000-0000-4000-8000-000000000005')
    -> 'analysis' -> 'medicines' -> 0 ->> 'name',
  'Elevit',
  'The private API can resume the extracted review state'
);

SELECT throws_ok(
  $$SELECT public.embe_confirm_medication_scan(
    'b1000000-0000-4000-8000-000000000005',
    '{"medicines":[{"name":"Elevit","dose":"1 viên","frequency":"mỗi ngày","instructions":"sau ăn","confidence":0.92}]}'::jsonb
  )$$,
  'P0001', 'invalid confirmed medication scan',
  'Confirmation rejects unapproved medicine fields such as model confidence'
);
SELECT throws_ok(
  $$SELECT public.embe_confirm_medication_scan(
    'b1000000-0000-4000-8000-000000000005',
    jsonb_build_object('medicines', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', 'Thuốc ' || number, 'dose', '', 'frequency', '', 'instructions', ''
      )) FROM generate_series(1, 13) AS number
    ))
  )$$,
  'P0001', 'invalid confirmed medication scan',
  'Confirmation accepts at most twelve medicines'
);
SELECT throws_ok(
  $$SELECT public.embe_confirm_medication_scan(
    'b1000000-0000-4000-8000-000000000005',
    jsonb_build_object('medicines', jsonb_build_array(jsonb_build_object(
      'name', repeat('x', 101), 'dose', '', 'frequency', '', 'instructions', ''
    )))
  )$$,
  'P0001', 'invalid confirmed medication scan',
  'Confirmation rejects unbounded medicine text'
);
SELECT is(
  public.embe_confirm_medication_scan(
    'b1000000-0000-4000-8000-000000000005',
    '{"medicines":[{"name":"  Elevit  ","dose":" 1 viên ","frequency":" mỗi ngày ","instructions":" sau ăn "}]}'::jsonb
  ) ->> 'status',
  'confirmed',
  'A reviewed prescription can be confirmed explicitly'
);
SELECT is(
  (SELECT medicines -> 0 ->> 'name'
   FROM portal_read_model.pregnancy_medical_record
   WHERE id = 'a1000000-0000-4000-8000-000000000001'),
  'Elevit',
  'Confirmation atomically stores normalized medicines on the owning prescription'
);
SELECT ok(
  (SELECT status = 'confirmed'
      AND confirmed_analysis -> 'questions' = '[]'::jsonb
      AND confirmed_analysis -> 'medicines' -> 0 ->> 'dose' = '1 viên'
   FROM portal_read_model.medication_scan
   WHERE document_id = 'b1000000-0000-4000-8000-000000000005'),
  'The confirmed scan remains readable in the shared analysis shape'
);
SELECT is(
  (SELECT count(*) FROM portal_read_model.pregnancy_care_plan),
  (SELECT row_count FROM care_plan_baseline),
  'Confirming OCR never creates medication schedules or reminders'
);

SELECT is(
  public.embe_queue_medication_scan('b1000000-0000-4000-8000-000000000006') ->> 'status',
  'queued',
  'A second prescription image can be queued independently'
);
SELECT is(
  public.embe_claim_medication_scan() ->> 'document_id',
  'b1000000-0000-4000-8000-000000000006',
  'The worker claims the next ready prescription image'
);
SELECT lives_ok(
  $$SELECT public.embe_fail_medication_scan(
    'b1000000-0000-4000-8000-000000000006', 'ollama_unavailable', 60
  )$$,
  'A failed worker releases the claim with bounded retry timing'
);
SELECT ok(
  (SELECT status = 'failed' AND claimed_at IS NULL
      AND last_error_code = 'ollama_unavailable'
      AND next_attempt_at > timezone('utc', now())
   FROM portal_read_model.medication_scan
   WHERE document_id = 'b1000000-0000-4000-8000-000000000006'),
  'A retryable failure is visible without leaking the source object'
);
SELECT throws_ok(
  $$SELECT public.embe_fail_medication_scan(
    'b1000000-0000-4000-8000-000000000006', 'bad error', 1
  )$$,
  'P0001', 'invalid medication scan failure',
  'Failure metadata and retry delays are bounded'
);

UPDATE portal_read_model.medication_scan
SET status = 'processing', attempts = 10,
    claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE document_id = 'b1000000-0000-4000-8000-000000000006';
SELECT is(
  public.embe_claim_medication_scan(),
  NULL::jsonb,
  'An exhausted stale prescription scan is not claimed again'
);
SELECT is(
  (SELECT status || '|' || last_error_code || '|' || (claimed_at IS NULL)::text
   FROM portal_read_model.medication_scan
   WHERE document_id = 'b1000000-0000-4000-8000-000000000006'),
  'rejected|worker_timeout|true',
  'An exhausted stale claim becomes a released terminal failure'
);

SET ROLE postgres;
SELECT finish();
ROLLBACK;
