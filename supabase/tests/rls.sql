-- Regression test for Supabase read-model security: anon zero rows, approved-only reads, no writes.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(13);

-- Prepare deterministic fixture
SET ROLE postgres;
TRUNCATE portal_read_model.timeline_event;

INSERT INTO portal_read_model.timeline_event
  (source_system, source_event_id, child_id, event_at, portal_event_type, title, caption, album_cover_url, portal_role, approved)
VALUES
  ('memos', 'seed-event-approved', 'child-01', timezone('utc', now()), 'milestone', 'Mục tiêu đã duyệt', 'Milestone đã duyệt', NULL, 'family', true),
  ('memos', 'seed-event-draft', 'child-01', timezone('utc', now()), 'milestone', 'Mục tiêu chưa duyệt', 'Milestone chưa duyệt', NULL, 'family', false);

-- 1) anonymous role receives zero rows (not denied by policy)
SET ROLE anon;
SELECT is(
  (SELECT count(*) FROM portal_read_model.timeline_event_public),
  0::bigint,
  'Anon role returns 0 rows from public timeline view'
);

-- 2) Authentication alone is not authorization.
SET ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM portal_read_model.timeline_event_public),
  0::bigint,
  'Authenticated role without family app_metadata returns 0 rows'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"portal_role":"family"}}',
  true
);

-- 3) An authorized family JWT only sees approved rows.
SELECT is(
  (SELECT count(*) FROM portal_read_model.timeline_event_public),
  1::bigint,
  'Authorized family role only sees approved rows'
);

SELECT is(
  (SELECT title FROM portal_read_model.timeline_event_public LIMIT 1),
  'Mục tiêu đã duyệt',
  'Approved-only view excludes the draft row'
);

-- 4) write attempts are blocked for client roles
SELECT throws_ok(
  'INSERT INTO portal_read_model.timeline_event (source_system, source_event_id, child_id, event_at, portal_event_type, title, caption, approved) VALUES (''memos'', ''seed-event-write-1'', ''child-01'', now(), ''milestone'', ''Test'', ''deny'', true)',
  '42501',
  'permission denied for table timeline_event',
  'Authenticated role cannot INSERT into timeline_event'
);

SELECT throws_ok(
  'UPDATE portal_read_model.timeline_event SET title = ''HACK'' WHERE source_event_id = ''seed-event-approved''',
  '42501',
  'permission denied for table timeline_event',
  'Authenticated role cannot UPDATE timeline_event'
);

SELECT throws_ok(
  'DELETE FROM portal_read_model.timeline_event WHERE source_event_id = ''seed-event-approved''',
  '42501',
  'permission denied for table timeline_event',
  'Authenticated role cannot DELETE timeline_event'
);

SET ROLE postgres;
SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.journal_inbox', 'SELECT'),
  'Anonymous clients cannot read the journal inbox'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.journal_inbox', 'INSERT'),
  'Authenticated clients cannot write the journal inbox'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_submit_journal(uuid,text,text)', 'EXECUTE'),
  'Anonymous clients cannot call the journal submit function'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_submit_journal(uuid,text,text)', 'EXECUTE'),
  'Only the server role can call the journal submit function'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_journal_queue_status()', 'EXECUTE'),
  'Anonymous clients cannot read journal queue health'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_journal_queue_status()', 'EXECUTE'),
  'The server role can read PII-free journal queue health'
);

SELECT finish();

ROLLBACK;
