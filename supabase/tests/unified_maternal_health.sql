BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(9);

SELECT ok(
  has_function_privilege('service_role', 'public.embe_get_unified_pregnancy_health_history(date,integer)', 'EXECUTE'),
  'Portal server can read the unified maternal history'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_get_unified_pregnancy_health_history(date,integer)', 'EXECUTE'),
  'Anonymous clients cannot read the unified maternal history'
);

INSERT INTO portal_read_model.iphone_health_device (id, token_hash, label, subject_role)
VALUES
  ('61111111-1111-4111-8111-111111111111', repeat('c', 64), 'iPhone Mẹ test', 'mother'),
  ('62222222-2222-4222-8222-222222222222', repeat('d', 64), 'iPhone Ba test', 'father');

INSERT INTO portal_read_model.iphone_health_daily (
  device_id, day, sleep_minutes, weight_kg, water_ml, systolic, diastolic, metric_synced_at
) VALUES
  ('61111111-1111-4111-8111-111111111111', DATE '2026-09-01', 420, 55, 1000, 110, 70,
   '{"sleepMinutes":"2026-09-01T01:00:00Z","weightKg":"2026-09-01T01:00:00Z","waterMl":"2026-09-01T01:00:00Z","systolic":"2026-09-01T01:00:00Z","diastolic":"2026-09-01T01:00:00Z"}'),
  ('62222222-2222-4222-8222-222222222222', DATE '2026-09-01', 100, 90, 300, 180, 120,
   '{"sleepMinutes":"2026-09-01T02:00:00Z","weightKg":"2026-09-01T02:00:00Z"}');

INSERT INTO portal_read_model.pregnancy_day (day) VALUES (DATE '2026-09-01') ON CONFLICT DO NOTHING;
INSERT INTO portal_read_model.pregnancy_health (day, weight_kg, health_note)
VALUES (DATE '2026-09-01', 56.4, 'manual note')
ON CONFLICT (day) DO UPDATE SET weight_kg = EXCLUDED.weight_kg, health_note = EXCLUDED.health_note;

SET ROLE service_role;
SELECT is(
  (jsonb_path_query_first(public.embe_get_unified_pregnancy_health_history(DATE '2026-09-01', 7), '$[*] ? (@.day == "2026-09-01")') ->> 'weight_kg')::numeric,
  56.4::numeric,
  'A manual maternal value overrides the same iPhone metric'
);
SELECT is(
  jsonb_path_query_first(public.embe_get_unified_pregnancy_health_history(DATE '2026-09-01', 7), '$[*] ? (@.day == "2026-09-01")') ->> 'sleep_minutes',
  '420',
  'A missing manual metric is filled from the mother iPhone'
);
SELECT is(
  jsonb_path_query_first(public.embe_get_unified_pregnancy_health_history(DATE '2026-09-01', 7), '$[*] ? (@.day == "2026-09-01")') #>> '{metric_sources,weightKg}',
  'manual',
  'The unified response identifies the manual source'
);
SELECT is(
  jsonb_path_query_first(public.embe_get_unified_pregnancy_health_history(DATE '2026-09-01', 7), '$[*] ? (@.day == "2026-09-01")') #>> '{metric_sources,sleepMinutes}',
  'iphone',
  'The unified response identifies the iPhone source'
);
SELECT is(
  jsonb_path_query_first(public.embe_get_unified_pregnancy_health_history(DATE '2026-09-01', 7), '$[*] ? (@.day == "2026-09-01")') ->> 'water_ml',
  '1000',
  'Mother water remains millilitres and father data is excluded'
);

SELECT is(public.embe_revoke_iphone_health_device('61111111-1111-4111-8111-111111111111'), true, 'A mother iPhone connection can be revoked');
SELECT is(
  jsonb_path_query_first(public.embe_get_unified_pregnancy_health_history(DATE '2026-09-01', 7), '$[*] ? (@.day == "2026-09-01")') ->> 'sleep_minutes',
  '420',
  'Revoking future writes keeps the existing maternal history visible'
);

SET ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
