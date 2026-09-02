BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(11);

SELECT ok(has_function_privilege('service_role', 'public.embe_list_family_trash()', 'EXECUTE'), 'Server can list family trash');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_list_family_trash()', 'EXECUTE'), 'Browser cannot list family trash directly');
SELECT ok(has_function_privilege('service_role', 'public.embe_restore_family_task(bigint)', 'EXECUTE'), 'Server can restore a task');
SELECT ok(has_function_privilege('service_role', 'public.embe_restore_pregnancy_medical_record_with_task(uuid)', 'EXECUTE'), 'Server can atomically restore a pregnancy record');

SET ROLE service_role;
SELECT public.embe_create_family_task('911fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'Việc thử khôi phục', '', 'family', 'general', 'none', DATE '2099-12-28', NULL, 'none');
SELECT public.embe_delete_family_task((SELECT id FROM portal_read_model.family_task WHERE idempotency_key = '911fe5a0-f59b-4f8c-8eb7-64fb2ef89256'));
SELECT is((SELECT count(*) FROM jsonb_array_elements(public.embe_list_family_trash()) item WHERE item->>'title' = 'Việc thử khôi phục'), 1::bigint, 'Deleted task appears in trash');
SELECT public.embe_restore_family_task((SELECT id FROM portal_read_model.family_task WHERE idempotency_key = '911fe5a0-f59b-4f8c-8eb7-64fb2ef89256'));
SELECT ok((SELECT deleted_at IS NULL FROM portal_read_model.family_task WHERE idempotency_key = '911fe5a0-f59b-4f8c-8eb7-64fb2ef89256'), 'Task is restored');

SELECT public.embe_save_pregnancy_medical_record_with_task(
  '921fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'appointment', 'planned', TIMESTAMPTZ '2099-12-28 02:30:00+00',
  'Khám thai thử khôi phục', 'Bệnh viện', '', '', 10, NULL, '{}'::jsonb, '[]'::jsonb
);
SELECT public.embe_delete_pregnancy_medical_record_with_task('921fe5a0-f59b-4f8c-8eb7-64fb2ef89256');
SELECT throws_ok(
  format(
    'SELECT public.embe_restore_family_task(%s)',
    (SELECT id FROM portal_read_model.family_task WHERE idempotency_key = '921fe5a0-f59b-4f8c-8eb7-64fb2ef89256')
  ),
  'P0001', 'linked medical record must be restored first',
  'A linked appointment cannot be restored without its deleted medical record'
);
SELECT public.embe_restore_pregnancy_medical_record_with_task('921fe5a0-f59b-4f8c-8eb7-64fb2ef89256');
SELECT is(
  (SELECT (deleted_at IS NULL)::text FROM portal_read_model.pregnancy_medical_record WHERE id = '921fe5a0-f59b-4f8c-8eb7-64fb2ef89256') || '|' ||
  (SELECT (deleted_at IS NULL)::text FROM portal_read_model.family_task WHERE idempotency_key = '921fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'true|true', 'Pregnancy record and linked planner task restore together'
);
SELECT is((SELECT count(*) FROM portal_read_model.family_audit_event WHERE action = 'restore' AND entity_type = 'pregnancy_medical_record' AND entity_id = '921fe5a0-f59b-4f8c-8eb7-64fb2ef89256'), 1::bigint, 'Medical restore is audited once');
SELECT is((SELECT count(*) FROM portal_read_model.family_audit_event WHERE action = 'delete'), 2::bigint, 'Both delete mutations are audited');

INSERT INTO portal_read_model.family_task (
  idempotency_key, title, note, owner_role, category, link_target, due_on, repeat_rule, deleted_at
)
SELECT gen_random_uuid(), 'Việc cũ ' || value, '', 'family', 'general', 'none', DATE '2099-12-28', 'none', timezone('utc', now())
FROM generate_series(1, 101) AS value;
SELECT ok(jsonb_array_length(public.embe_list_family_trash()) <= 100, 'Trash list is bounded to 100 newest items');

SET ROLE postgres;
SELECT finish();
ROLLBACK;
