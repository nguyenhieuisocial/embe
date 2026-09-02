BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;
SELECT plan(10);

SELECT has_table('portal_read_model', 'pregnancy_mental_health_checkin', 'mental-health check-in table exists');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'portal_read_model.pregnancy_mental_health_checkin'::regclass), 'mental-health RLS is forced');
SELECT ok(has_function_privilege('service_role', 'public.embe_get_pregnancy_mental_health_history(integer)', 'EXECUTE'), 'service role can read mental-health history');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_get_pregnancy_mental_health_history(integer)', 'EXECUTE'), 'browsers cannot read mental-health history directly');

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.embe_save_pregnancy_mental_health_checkin(
  now() - interval '2 minutes', 4, 2, 'Được nghỉ ngơi.', NULL, NULL, NULL, NULL
)$$, 'check-in without screening is accepted');
SELECT lives_ok($$SELECT public.embe_save_pregnancy_mental_health_checkin(
  now() - interval '1 minute', 3, 3, '', 1, 2, 0, 1
)$$, 'complete PHQ-2 and GAD-2 pairs are accepted');
SELECT throws_ok($$SELECT public.embe_save_pregnancy_mental_health_checkin(
  now(), 3, 3, '', 1, NULL, NULL, NULL
)$$, 'P0001', 'invalid pregnancy mental-health check-in', 'partial screening pair is rejected');
SELECT throws_ok($$SELECT public.embe_save_pregnancy_mental_health_checkin(
  now(), 6, 3, '', NULL, NULL, NULL, NULL
)$$, 'P0001', 'invalid pregnancy mental-health check-in', 'out-of-range mood is rejected');
SELECT is(jsonb_array_length(public.embe_get_pregnancy_mental_health_history(28)), 2, '28-day history returns saved check-ins');
SELECT throws_ok($$SELECT public.embe_get_pregnancy_mental_health_history(90)$$, 'P0001', 'invalid mental-health history window', 'history is bounded');

SET ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
