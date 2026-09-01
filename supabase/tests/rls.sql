-- Regression test for Supabase read-model security: anon zero rows, approved-only reads, no writes.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(93);

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

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.media_item', 'SELECT'),
  'Anonymous clients cannot read private media metadata'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.media_item', 'SELECT'),
  'Authenticated clients cannot bypass the portal media proxy'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.embe_media_item', 'SELECT'),
  'Anonymous clients cannot query the curated media view'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.embe_media_locator', 'SELECT'),
  'Authenticated clients cannot read private storage locators'
);
SELECT ok(
  has_table_privilege('service_role', 'public.embe_media_locator', 'SELECT'),
  'The server role can resolve a curated preview locator'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_stage_media_batch(uuid,jsonb)', 'EXECUTE'),
  'Anonymous clients cannot stage media publication'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_stage_media_batch(uuid,jsonb)', 'EXECUTE'),
  'The publisher can stage bounded media batches'
);
SELECT ok(
  (SELECT NOT public FROM storage.buckets WHERE id = 'embe-portal-previews'),
  'The preview bucket remains private'
);

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.photo_upload', 'SELECT'),
  'Anonymous clients cannot inspect staged family uploads'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.photo_upload', 'INSERT'),
  'Authenticated clients cannot bypass the portal upload API'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_create_photo_upload(uuid,text,text,text,bigint,text,timestamptz)', 'EXECUTE'),
  'Anonymous clients cannot create photo upload sessions'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_create_photo_upload(uuid,text,text,text,bigint,text,timestamptz)', 'EXECUTE'),
  'The portal server can create photo upload sessions'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.embe_claim_photo_upload()', 'EXECUTE'),
  'Browser users cannot claim local import work'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_claim_photo_upload()', 'EXECUTE'),
  'The local worker can claim photo imports'
);
SELECT ok(
  (SELECT NOT public FROM storage.buckets WHERE id = 'embe-photo-inbox'),
  'The original photo inbox remains private'
);
SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'embe-photo-inbox'),
  25000000::bigint,
  'The original photo inbox enforces the 25 MB camera limit'
);
SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.media_reaction', 'SELECT'),
  'Anonymous clients cannot inspect family reactions'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.media_reaction', 'INSERT'),
  'Authenticated clients cannot bypass the reaction API'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_react_media(uuid,text,text)', 'EXECUTE'),
  'Anonymous clients cannot react to private memories'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_react_media(uuid,text,text)', 'EXECUTE'),
  'The portal server can store a family reaction'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_get_photo_upload(uuid)', 'EXECUTE'),
  'Anonymous clients cannot resolve staged photo metadata'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_get_photo_upload(uuid)', 'EXECUTE'),
  'The portal server can verify one staged photo'
);

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.pregnancy_profile', 'SELECT'),
  'Anonymous clients cannot read the pregnancy profile'
);
SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.pregnancy_day', 'SELECT'),
  'Anonymous clients cannot read pregnancy day state'
);
SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.pregnancy_check', 'SELECT'),
  'Anonymous clients cannot read pregnancy checklist state'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.pregnancy_check', 'INSERT'),
  'Authenticated clients cannot write pregnancy checklist state'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_get_pregnancy_state(date)', 'EXECUTE'),
  'Anonymous clients cannot read pregnancy state through the RPC'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_save_pregnancy_state(date,date,text[],boolean,boolean)', 'EXECUTE'),
  'Anonymous clients cannot write pregnancy state through the RPC'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_get_pregnancy_state(date)', 'EXECUTE'),
  'The portal server can read pregnancy state'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_save_pregnancy_state(date,date,text[],boolean,boolean)', 'EXECUTE'),
  'The portal server can write pregnancy state'
);
SET ROLE service_role;
DO $service_role_round_trip$
BEGIN
  PERFORM public.embe_save_pregnancy_state(
    DATE '2099-12-30', NULL, ARRAY['water-rest', 'notes']::text[], false, true
  );
END
$service_role_round_trip$;
SET ROLE postgres;
SELECT is(
  public.embe_save_pregnancy_state(
    DATE '2099-12-30',
    NULL,
    ARRAY['water-rest', 'notes']::text[],
    false,
    true
  ) -> 'completed',
  '["notes", "water-rest"]'::jsonb,
  'An atomic checklist save returns the normalized private state'
);

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.pregnancy_health', 'SELECT'),
  'Anonymous clients cannot read maternal health entries'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.pregnancy_health', 'INSERT'),
  'Authenticated clients cannot write maternal health entries directly'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_get_pregnancy_health_history(date,integer)', 'EXECUTE'),
  'Anonymous clients cannot read maternal health history'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_save_pregnancy_health(date,numeric,integer,integer,integer,integer,integer,integer)', 'EXECUTE'),
  'Anonymous clients cannot write maternal health history'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_get_pregnancy_health_history(date,integer)', 'EXECUTE'),
  'The portal server can read maternal health history'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_save_pregnancy_health(date,numeric,integer,integer,integer,integer,integer,integer)', 'EXECUTE'),
  'The portal server can save a bounded maternal health snapshot'
);
SET ROLE service_role;
SELECT is(
  public.embe_save_pregnancy_health(
    DATE '2099-12-29', 55.5, 110, 70, 420, 7, 25, 4
  ) -> 'weight_kg',
  '55.5'::jsonb,
  'The portal server can round-trip a bounded maternal snapshot'
);
SELECT is(
  public.embe_get_pregnancy_health_history(DATE '2099-12-29', 7) -> -1 ->> 'day',
  '2099-12-29',
  'The private history returns the requested end day'
);
SET ROLE postgres;

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.procurement_proposal', 'SELECT'),
  'Anonymous clients cannot read procurement proposals'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.procurement_action', 'INSERT'),
  'Authenticated clients cannot bypass the procurement action API'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.embe_procurement_proposal', 'SELECT'),
  'Anonymous clients cannot query the procurement projection'
);
SELECT ok(
  has_table_privilege('service_role', 'public.embe_procurement_proposal', 'SELECT'),
  'The portal server can read the bounded procurement projection'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_submit_procurement_action(uuid,uuid,text,text)', 'EXECUTE'),
  'Anonymous clients cannot submit procurement transitions'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_submit_procurement_action(uuid,uuid,text,text)', 'EXECUTE'),
  'The portal server can submit procurement transitions'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.embe_sync_procurement(jsonb)', 'EXECUTE'),
  'Authenticated clients cannot publish procurement state'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_sync_procurement(jsonb)', 'EXECUTE'),
  'The local worker can publish bounded procurement state'
);

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.meal_analysis', 'SELECT'),
  'Anonymous clients cannot read private meal photos or results'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.meal_analysis', 'INSERT'),
  'Authenticated clients cannot bypass the meal analysis API'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_create_meal_analysis(uuid,text,text,timestamptz,text,text,text,bigint)', 'EXECUTE'),
  'Anonymous clients cannot create meal analysis jobs'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_create_meal_analysis(uuid,text,text,timestamptz,text,text,text,bigint)', 'EXECUTE'),
  'The portal server can create bounded meal analysis jobs'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.embe_claim_meal_analysis()', 'EXECUTE'),
  'Authenticated clients cannot claim local vision work'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_claim_meal_analysis()', 'EXECUTE'),
  'The local worker can claim meal analysis jobs'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_confirm_meal_analysis(uuid,jsonb,text)', 'EXECUTE'),
  'Anonymous clients cannot confirm model output'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_confirm_meal_analysis(uuid,jsonb,text)', 'EXECUTE'),
  'The portal server can store user-confirmed meal results'
);

-- A local worker can disappear after claiming work. Claims are leases: stale
-- work is reclaimed, and an exhausted stale claim reaches a terminal state.
SET ROLE service_role;
DELETE FROM portal_read_model.photo_upload;
INSERT INTO portal_read_model.photo_upload (
  id, idempotency_key, author_role, original_filename, mime_type, byte_size,
  storage_path, caption, captured_at, status
) VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'a1111111-1111-4111-8111-111111111111',
  'mother', 'photo.jpg', 'image/jpeg', 1024,
  'incoming/2099/01/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
  '', timezone('utc', now()), 'uploaded'
);
SELECT is(
  public.embe_claim_photo_upload() ->> 'id',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'A photo worker can claim ready work'
);
SELECT ok(
  (SELECT attempts = 1 AND claimed_at IS NOT NULL
   FROM portal_read_model.photo_upload
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'A photo claim records its attempt and lease timestamp'
);
UPDATE portal_read_model.photo_upload
SET claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT is(
  public.embe_claim_photo_upload() ->> 'id',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'An expired photo lease is reclaimed'
);
SELECT is(
  (SELECT attempts FROM portal_read_model.photo_upload
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  2,
  'Reclaiming a photo consumes another bounded attempt'
);
UPDATE portal_read_model.photo_upload
SET attempts = 20, claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT is(
  public.embe_claim_photo_upload(),
  NULL::jsonb,
  'An exhausted stale photo claim is not reclaimed again'
);
SELECT is(
  (SELECT status || '|' || last_error_code || '|' || (claimed_at IS NULL)::text
   FROM portal_read_model.photo_upload
   WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'rejected|worker_timeout|true',
  'An exhausted stale photo claim becomes a released terminal failure'
);

DELETE FROM portal_read_model.meal_analysis;
INSERT INTO portal_read_model.meal_analysis (
  id, idempotency_key, author_role, meal_type, eaten_at, note,
  original_filename, mime_type, byte_size, storage_path, status
) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'b1111111-1111-4111-8111-111111111111',
  'mother', 'lunch', timezone('utc', now()), '',
  'meal.jpg', 'image/jpeg', 1024,
  'incoming/2099/01/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg',
  'uploaded'
);
SELECT is(
  public.embe_claim_meal_analysis() ->> 'id',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'A meal worker can claim ready vision work'
);
SELECT ok(
  (SELECT attempts = 1 AND claimed_at IS NOT NULL
   FROM portal_read_model.meal_analysis
   WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'A meal vision claim records its attempt and lease timestamp'
);
UPDATE portal_read_model.meal_analysis
SET claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT is(
  public.embe_claim_meal_analysis() ->> 'id',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'An expired meal vision lease is reclaimed'
);
SELECT is(
  (SELECT attempts FROM portal_read_model.meal_analysis
   WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  2,
  'Reclaiming meal vision work consumes another bounded attempt'
);
UPDATE portal_read_model.meal_analysis
SET attempts = 10, claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SELECT is(
  public.embe_claim_meal_analysis(),
  NULL::jsonb,
  'Exhausted stale meal vision work is not reclaimed again'
);
SELECT is(
  (SELECT status || '|' || last_error_code || '|' || (claimed_at IS NULL)::text
   FROM portal_read_model.meal_analysis
   WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  'rejected|worker_timeout|true',
  'Exhausted stale meal vision work becomes a released terminal failure'
);

DELETE FROM portal_read_model.meal_analysis;
INSERT INTO portal_read_model.meal_analysis (
  id, idempotency_key, author_role, meal_type, eaten_at, note,
  original_filename, mime_type, byte_size, storage_path, status,
  confirmed_analysis, confirmed_at
) VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'c1111111-1111-4111-8111-111111111111',
  'mother', 'dinner', timezone('utc', now()), '',
  'meal.jpg', 'image/jpeg', 1024,
  'incoming/2099/01/cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg',
  'nutrition_pending', '{"foods":[]}'::jsonb, timezone('utc', now())
);
SELECT is(
  public.embe_claim_meal_nutrition() ->> 'id',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'A meal worker can claim ready nutrition work'
);
SELECT ok(
  (SELECT attempts = 1 AND claimed_at IS NOT NULL
   FROM portal_read_model.meal_analysis
   WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'A nutrition claim records its attempt and lease timestamp'
);
UPDATE portal_read_model.meal_analysis
SET claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT is(
  public.embe_claim_meal_nutrition() ->> 'id',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'An expired nutrition lease is reclaimed'
);
SELECT is(
  (SELECT attempts FROM portal_read_model.meal_analysis
   WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  2,
  'Reclaiming nutrition work consumes another bounded attempt'
);
UPDATE portal_read_model.meal_analysis
SET attempts = 10, claimed_at = timezone('utc', now()) - interval '16 minutes'
WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT is(
  public.embe_claim_meal_nutrition(),
  NULL::jsonb,
  'Exhausted stale nutrition work is not reclaimed again'
);
SELECT is(
  (SELECT status || '|' || last_error_code || '|' ||
          (confirmed_analysis -> 'nutrition' ->> 'status') || '|' ||
          (claimed_at IS NULL)::text
   FROM portal_read_model.meal_analysis
   WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  'confirmed|worker_timeout|unavailable|true',
  'Exhausted nutrition work preserves the meal with an unavailable marker'
);
SET ROLE postgres;

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.family_task', 'SELECT'),
  'Anonymous clients cannot read private family plans'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'portal_read_model.family_task_completion', 'INSERT'),
  'Authenticated clients cannot bypass the family planner API'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_list_family_tasks(date,date)', 'EXECUTE'),
  'Anonymous clients cannot list private family plans'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_create_family_task(uuid,text,text,text,text,text,date,time,text)', 'EXECUTE'),
  'The portal server can create family plans'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_set_family_task_completion(bigint,date,boolean,text)', 'EXECUTE'),
  'The portal server can store per-day task completion'
);
SET ROLE service_role;
SELECT is(
  public.embe_create_family_task(
    '611fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'Việc thử nghiệm', '', 'family',
    'general', 'calendar', DATE '2099-12-28', NULL, 'daily'
  ) ->> 'id',
  public.embe_create_family_task(
    '611fe5a0-f59b-4f8c-8eb7-64fb2ef89256', 'Việc thử nghiệm', '', 'family',
    'general', 'calendar', DATE '2099-12-28', NULL, 'daily'
  ) ->> 'id',
  'Creating the same task command twice is idempotent'
);
SELECT is(
  public.embe_list_family_tasks(DATE '2099-12-28', DATE '2099-12-29') -> 1 ->> 'occurrence_on',
  '2099-12-29',
  'A daily plan produces one occurrence for each requested day'
);
SET ROLE postgres;

SELECT finish();

ROLLBACK;
