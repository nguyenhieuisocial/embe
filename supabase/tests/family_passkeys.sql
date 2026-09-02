BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;
SELECT plan(20);

SELECT has_table('portal_read_model', 'family_passkey', 'passkey table exists');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'portal_read_model.family_passkey'::regclass), 'passkey RLS is forced');
SELECT ok(has_function_privilege('service_role', 'public.embe_list_passkeys()', 'EXECUTE'), 'service role can list passkeys');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_list_passkeys()', 'EXECUTE'), 'authenticated clients cannot list passkeys');

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.embe_save_passkey('credential_123', 'AQID', 0, ARRAY['internal'], 'iPhone', 'multiDevice', true)$$, 'valid passkey can be saved');
SELECT is((public.embe_get_passkey('credential_123')->>'counter')::bigint, 0::bigint, 'saved passkey is readable server-side');
SELECT lives_ok($$SELECT public.embe_touch_passkey('credential_123', 0, 0)$$, 'zero counter authenticators remain supported');
SELECT lives_ok($$SELECT public.embe_touch_passkey('credential_123', 0, 1)$$, 'counter can advance from zero');
SELECT throws_ok($$SELECT public.embe_touch_passkey('credential_123', 0, 2)$$, 'P0001', 'passkey not found or stale counter', 'positive counters use compare-and-swap');
SELECT throws_ok($$SELECT public.embe_touch_passkey('credential_123', 1, 1)$$, 'P0001', 'passkey not found or stale counter', 'positive counters must strictly advance');
SELECT lives_ok($$SELECT public.embe_touch_passkey('credential_123', 1, 2)$$, 'matching positive counter can strictly advance');

SELECT has_table('portal_read_model', 'passkey_challenge', 'passkey challenge table exists');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'portal_read_model.passkey_challenge'::regclass), 'challenge RLS is forced');
SELECT ok(has_function_privilege('service_role', 'public.embe_create_passkey_challenge(text,text,timestamptz)', 'EXECUTE'), 'service role can create challenges');
SELECT ok(NOT has_function_privilege('authenticated', 'public.embe_consume_passkey_challenge(uuid,text,text)', 'EXECUTE'), 'authenticated clients cannot consume challenges');

INSERT INTO portal_read_model.passkey_challenge (challenge_hash, purpose, created_at, expires_at)
VALUES (repeat('e', 64), 'login', now() - interval '1 minute', now() - interval '1 second');
CREATE TEMP TABLE created_challenge AS
  SELECT public.embe_create_passkey_challenge(repeat('a', 64), 'login', now() + interval '5 minutes') AS id;
SELECT is((SELECT count(*) FROM portal_read_model.passkey_challenge WHERE challenge_hash = repeat('e', 64)), 0::bigint, 'creating a challenge cleans expired rows');
SELECT is((SELECT public.embe_consume_passkey_challenge(id, repeat('a', 64), 'login') FROM created_challenge), true, 'challenge is consumed once');
SELECT is((SELECT public.embe_consume_passkey_challenge(id, repeat('a', 64), 'login') FROM created_challenge), false, 'consumed challenge cannot be replayed');
SELECT lives_ok($test$DO $$ BEGIN FOR i IN 1..20 LOOP PERFORM public.embe_create_passkey_challenge(md5(i::text) || md5((i + 100)::text), 'login', now() + interval '5 minutes'); END LOOP; END $$;$test$, 'active challenge cap allows twenty rows');
SELECT throws_ok($$SELECT public.embe_create_passkey_challenge(repeat('f', 64), 'login', now() + interval '5 minutes')$$, 'P0001', 'too many active passkey challenges', 'active challenge cap rejects excess rows');

SET ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
