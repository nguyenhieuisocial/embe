BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(10);

SELECT ok(has_function_privilege('service_role', 'public.embe_restore_meal_analysis(uuid)', 'EXECUTE'), 'Server can restore a meal');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_restore_meal_analysis(uuid)', 'EXECUTE'), 'Browser cannot restore a meal directly');
SELECT ok(has_function_privilege('service_role', 'public.embe_restore_family_expense(uuid)', 'EXECUTE'), 'Server can restore an expense');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_restore_family_expense(uuid)', 'EXECUTE'), 'Browser cannot restore an expense directly');

SET ROLE service_role;
SELECT public.embe_create_meal_note(
  '931fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'mother', 'lunch',
  timezone('utc', now()) - interval '1 hour', 'Cơm và cá'
);
SELECT public.embe_delete_meal_analysis((SELECT id FROM portal_read_model.meal_analysis WHERE idempotency_key = '931fe5a0-f59b-4f8c-8eb7-64fb2ef89256'));
SELECT is((SELECT count(*) FROM jsonb_array_elements(public.embe_list_family_trash()) item WHERE item->>'kind' = 'meal' AND item->>'detail' = 'Cơm và cá'), 1::bigint, 'Deleted meal appears in trash');
SELECT public.embe_restore_meal_analysis((SELECT id FROM portal_read_model.meal_analysis WHERE idempotency_key = '931fe5a0-f59b-4f8c-8eb7-64fb2ef89256'));
SELECT is(
  (SELECT status || '|' || (deleted_at IS NULL)::text FROM portal_read_model.meal_analysis WHERE idempotency_key = '931fe5a0-f59b-4f8c-8eb7-64fb2ef89256'),
  'uploaded|true', 'Meal returns to its safe processing state'
);

SELECT public.embe_save_family_expense(
  '941fe5a0-f59b-4f8c-8eb7-64fb2ef89256', CURRENT_DATE, 'actual', 'medicine',
  320000, 'Vitamin', ''
);
SELECT public.embe_set_family_expense_deleted('941fe5a0-f59b-4f8c-8eb7-64fb2ef89256', true);
SELECT is((SELECT count(*) FROM jsonb_array_elements(public.embe_list_family_trash()) item WHERE item->>'kind' = 'expense' AND item->>'title' = 'Vitamin'), 1::bigint, 'Deleted expense appears in trash');
SELECT public.embe_restore_family_expense('941fe5a0-f59b-4f8c-8eb7-64fb2ef89256');
SELECT ok((SELECT deleted_at IS NULL FROM portal_read_model.family_expense WHERE id = '941fe5a0-f59b-4f8c-8eb7-64fb2ef89256'), 'Expense is restored');

SELECT is((SELECT count(*) FROM portal_read_model.family_audit_event WHERE entity_type = 'meal_analysis' AND entity_id = (SELECT id::text FROM portal_read_model.meal_analysis WHERE idempotency_key = '931fe5a0-f59b-4f8c-8eb7-64fb2ef89256')), 2::bigint, 'Meal delete and restore are audited');
SELECT is((SELECT count(*) FROM portal_read_model.family_audit_event WHERE entity_type = 'family_expense' AND entity_id = '941fe5a0-f59b-4f8c-8eb7-64fb2ef89256'), 2::bigint, 'Expense delete and restore are audited');

SET ROLE postgres;
SELECT finish();
ROLLBACK;
