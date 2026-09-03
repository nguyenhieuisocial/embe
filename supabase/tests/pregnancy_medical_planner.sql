BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(11);

SELECT ok(
  has_function_privilege('service_role', 'public.embe_save_pregnancy_medical_record_with_task(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  'The portal server can atomically save a medical record and planner task'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.embe_save_pregnancy_medical_record_with_task(uuid,text,text,timestamptz,text,text,text,text,integer,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  'Authenticated browsers cannot call the atomic medical planner function'
);

SET ROLE service_role;
SELECT is(
  public.embe_save_pregnancy_medical_record_with_task(
    '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'planned',
    TIMESTAMPTZ '2099-12-28 02:30:00+00', 'Khám thai định kỳ', 'Bệnh viện', '', '',
    10, NULL, '{}'::jsonb, '[]'::jsonb
  ),
  '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'::uuid,
  'Saving a planned appointment returns its medical record id'
);
SELECT is(
  (SELECT title || '|' || due_on::text || '|' || to_char(due_time, 'HH24:MI') || '|' || (deleted_at IS NULL)::text
   FROM portal_read_model.family_task
   WHERE idempotency_key = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'Lịch khám: Khám thai định kỳ|2099-12-28|09:30|true',
  'Saving a planned appointment creates its active Vietnam-time planner task'
);

SELECT public.embe_save_pregnancy_medical_record_with_task(
  '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'planned',
  TIMESTAMPTZ '2099-12-29 03:45:00+00', 'Khám lại', 'Phòng khám', '', '',
  10, NULL, '{}'::jsonb, '[]'::jsonb
);
SELECT is(
  (SELECT title || '|' || due_on::text || '|' || to_char(due_time, 'HH24:MI') || '|' || note
   FROM portal_read_model.family_task
   WHERE idempotency_key = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'Lịch khám: Khám lại|2099-12-29|10:45|Phòng khám',
  'Updating a planned appointment updates the same planner task'
);

SELECT public.embe_save_pregnancy_medical_record_with_task(
  '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'completed',
  TIMESTAMPTZ '2099-12-29 03:45:00+00', 'Khám lại', 'Phòng khám', '', '',
  10, NULL, '{}'::jsonb, '[]'::jsonb
);
SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM portal_read_model.family_task
   WHERE idempotency_key = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'Completing an appointment removes it from the active planner'
);

SELECT public.embe_save_pregnancy_medical_record_with_task(
  '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'completed',
  TIMESTAMPTZ '2099-12-29 03:45:00+00', 'Khám lại', 'Phòng khám', '', '',
  10, TIMESTAMPTZ '2100-01-12 01:15:00+00', '{}'::jsonb, '[]'::jsonb
);
SELECT is(
  (SELECT title || '|' || due_on::text || '|' || to_char(due_time, 'HH24:MI') || '|' || (deleted_at IS NULL)::text
   FROM portal_read_model.family_task
   WHERE idempotency_key = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'Lịch tái khám: Khám lại|2100-01-12|08:15|true',
  'A completed visit with a follow-up date creates an active Vietnam-time appointment'
);

SELECT public.embe_save_pregnancy_medical_record_with_task(
  '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'completed',
  TIMESTAMPTZ '2099-12-29 03:45:00+00', 'Khám lại', 'Phòng khám', '', '',
  10, TIMESTAMPTZ '2100-01-19 02:00:00+00', '{}'::jsonb, '[]'::jsonb
);
SELECT is(
  (SELECT count(*)::text || '|' || due_on::text || '|' || to_char(due_time, 'HH24:MI')
   FROM portal_read_model.family_task
   WHERE idempotency_key = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'
   GROUP BY due_on, due_time),
  '1|2100-01-19|09:00',
  'Changing the follow-up date updates the same planner task without duplication'
);

SELECT public.embe_save_pregnancy_medical_record_with_task(
  '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'completed',
  TIMESTAMPTZ '2099-12-29 03:45:00+00', 'Khám lại', 'Phòng khám', '', '',
  10, NULL, '{}'::jsonb, '[]'::jsonb
);
SELECT ok(
  (SELECT deleted_at IS NOT NULL FROM portal_read_model.family_task
   WHERE idempotency_key = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'Clearing the follow-up date removes the linked appointment'
);

SELECT public.embe_save_pregnancy_medical_record_with_task(
  '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'planned',
  TIMESTAMPTZ '2099-12-29 03:45:00+00', 'Khám lại', 'Phòng khám', '', '',
  10, NULL, '{}'::jsonb, '[]'::jsonb
);
SELECT public.embe_delete_pregnancy_medical_record_with_task('711fe5a0-f59b-4f8c-8eb7-64fb2ef89256');
SELECT is(
  (SELECT (deleted_at IS NOT NULL)::text FROM portal_read_model.pregnancy_medical_record
   WHERE id = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256') || '|' ||
  (SELECT (deleted_at IS NOT NULL)::text FROM portal_read_model.family_task
   WHERE idempotency_key = '711fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'true|true',
  'Deleting a medical record also removes its planner task'
);

SELECT public.embe_save_pregnancy_medical_record(
  '811fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'planned',
  TIMESTAMPTZ '2099-12-30 01:15:00+00', 'Khám qua API cũ', 'Bệnh viện', '', '',
  10, NULL, '{}'::jsonb, '[]'::jsonb
);
SELECT is(
  (SELECT count(*) FROM portal_read_model.family_task
   WHERE idempotency_key = '811fe5a0-f59b-4f8c-8eb7-64fb2ef89256' AND deleted_at IS NULL),
  1::bigint,
  'The legacy save RPC also delegates to the atomic planner sync'
);

SET ROLE postgres;
SELECT finish();
ROLLBACK;
