BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(10);

SELECT ok(
  NOT has_table_privilege('anon', 'portal_read_model.iphone_health_daily', 'SELECT'),
  'Anonymous clients cannot read private iPhone health aggregates'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.embe_ingest_iphone_health_v2(text,date,integer,numeric,numeric,integer,numeric,numeric,numeric,integer,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,integer,integer)',
    'EXECUTE'
  ),
  'Authenticated browsers cannot invoke the iPhone ingestion RPC'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_get_iphone_health_history(date,integer)', 'EXECUTE'),
  'The portal server can read bounded iPhone health history'
);

SET ROLE postgres;
INSERT INTO portal_read_model.iphone_health_device (token_hash, label)
VALUES (repeat('b', 64), 'iPhone test');

SET ROLE service_role;
SELECT is(
  public.embe_ingest_iphone_health_v2(
    repeat('b', 64), DATE '2026-09-01', 5200, 320, 1350, 450, 53.2, 160,
    4100, 1800, 78, 68, 15.2, 98, 36.7, 36.4, 42, 28, 10, 112, 72
  ),
  true,
  'A valid device can store the selected daily aggregates'
);

SET ROLE postgres;
SELECT ok(
  (SELECT height_cm = 160 AND resting_heart_rate_bpm = 68 AND distance_m = 4100
    AND systolic = 112 AND diastolic = 72 AND respiratory_rate = 15.2
    AND oxygen_saturation_percent = 98 AND body_temperature_c = 36.7
    AND wrist_temperature_c = 36.4 AND hrv_ms = 42
    AND exercise_minutes = 28 AND mindfulness_minutes = 10
   FROM portal_read_model.iphone_health_daily WHERE day = DATE '2026-09-01'),
  'The expanded metric set is persisted as daily summaries'
);
SELECT ok(
  (SELECT metric_synced_at ?& ARRAY[
    'heightCm', 'restingHeartRateBpm', 'distanceM', 'systolic', 'diastolic',
    'respiratoryRate', 'oxygenSaturationPercent', 'bodyTemperatureC',
    'wristTemperatureC', 'hrvMs', 'exerciseMinutes', 'mindfulnessMinutes'
  ] AND NOT metric_synced_at ?| ARRAY['samples', 'latitude', 'longitude', 'location']
   FROM portal_read_model.iphone_health_daily WHERE day = DATE '2026-09-01'),
  'Each metric keeps freshness without raw samples or location fields'
);

SET ROLE service_role;
SELECT is(
  public.embe_ingest_iphone_health_v2(
    repeat('b', 64), DATE '2026-09-01', NULL, NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 45, NULL, NULL, NULL, NULL
  ),
  true,
  'A later partial sync is accepted'
);

SET ROLE postgres;
SELECT ok(
  (SELECT height_cm = 160 AND systolic = 112 AND hrv_ms = 45
   FROM portal_read_model.iphone_health_daily WHERE day = DATE '2026-09-01'),
  'A partial sync updates its metric without erasing prior aggregates'
);

SET ROLE service_role;
SELECT is(
  jsonb_array_length(public.embe_get_iphone_health_history(DATE '2026-09-01', 30)),
  1,
  'A 30-day aggregate history is available'
);
SELECT throws_like(
  $$SELECT public.embe_get_iphone_health_history(DATE '2026-09-01', 28)$$,
  '%invalid iphone health history%',
  'Unsupported history windows are rejected'
);

SET ROLE postgres;
SELECT finish();
ROLLBACK;
