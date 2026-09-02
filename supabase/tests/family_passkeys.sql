BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;
SELECT plan(8);

SELECT has_table('portal_read_model', 'family_passkey', 'passkey table exists');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'portal_read_model.family_passkey'::regclass), 'passkey RLS is forced');
SELECT ok(has_function_privilege('service_role', 'public.embe_list_passkeys()', 'EXECUTE'), 'service role can list passkeys');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_list_passkeys()', 'EXECUTE'), 'authenticated clients cannot list passkeys');

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.embe_save_passkey('credential_123', 'AQID', 0, ARRAY['internal'], 'iPhone', 'multiDevice', true)$$, 'valid passkey can be saved');
SELECT is((public.embe_get_passkey('credential_123')->>'counter')::bigint, 0::bigint, 'saved passkey is readable server-side');
SELECT lives_ok($$SELECT public.embe_touch_passkey('credential_123', 1)$$, 'counter can advance');
SELECT throws_ok($$SELECT public.embe_touch_passkey('credential_123', 0)$$, 'P0001', 'passkey not found or stale counter', 'counter cannot move backwards');

SET ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
