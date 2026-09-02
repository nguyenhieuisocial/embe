BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(8);

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.login_rate_limit', 'SELECT'),
  'Anonymous clients cannot read login limiter state'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.embe_record_login_failure(text,timestamptz)', 'EXECUTE'),
  'Authenticated browsers cannot mutate login limiter state'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_check_login_rate_limit(text,timestamptz)', 'EXECUTE'),
  'The portal server can check login backoff'
);

SET ROLE service_role;
SELECT is(
  public.embe_check_login_rate_limit(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:00+00') ->> 'allowed',
  'true',
  'A new HMAC key is allowed'
);
SELECT public.embe_record_login_failure(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:00+00');
SELECT public.embe_record_login_failure(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:01+00');
SELECT public.embe_record_login_failure(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:02+00');
SELECT public.embe_record_login_failure(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:03+00');
SELECT is(
  public.embe_check_login_rate_limit(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:04+00') ->> 'allowed',
  'true',
  'Four failures in the window still allow the family to retry'
);
SELECT is(
  public.embe_record_login_failure(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:04+00') ->> 'retry_after_seconds',
  '30',
  'The fifth failure starts a short 30 second backoff'
);
SELECT is(
  public.embe_check_login_rate_limit(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:10+00') ->> 'allowed',
  'false',
  'An active backoff blocks another password attempt'
);
SELECT public.embe_reset_login_rate_limit(repeat('a', 64));
SELECT is(
  public.embe_check_login_rate_limit(repeat('a', 64), TIMESTAMPTZ '2026-09-02 00:00:11+00') ->> 'allowed',
  'true',
  'A correct login resets failures and backoff'
);

SET ROLE postgres;
SELECT finish();
ROLLBACK;
