BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(17);

SELECT ok(
  NOT has_function_privilege('anon', 'public.embe_export_family_data_v1()', 'EXECUTE'),
  'Anonymous clients cannot export family data'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.embe_export_family_data_v1()', 'EXECUTE'),
  'Authenticated browsers cannot bypass the server export route'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_export_family_data_v1()', 'EXECUTE'),
  'Only the portal server can build the family export'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_export_pregnancy_mental_health()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.embe_export_pregnancy_mental_health()', 'EXECUTE'),
  'Only the portal server can export the mental-health history'
);
SELECT ok(
  has_function_privilege('service_role', 'public.embe_export_family_data_v2()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.embe_export_family_data_v2()', 'EXECUTE'),
  'The atomic complete export is private to the portal server'
);
SELECT ok(
  to_regprocedure('portal_read_model.embe_export_rows(text,text[])') IS NULL,
  'No generic relation-reading export helper exists'
);

INSERT INTO portal_read_model.photo_upload (
  id, idempotency_key, author_role, original_filename, mime_type, byte_size,
  storage_path, caption, captured_at, status, latitude, longitude, location_name
) VALUES (
  '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
  'mother', 'private-name.jpg', 'image/jpeg', 42,
  'incoming/2026/09/30000000-0000-4000-8000-000000000001.jpg', 'Ảnh siêu âm',
  '2026-09-01 08:00:00+00', 'uploaded', 10.77, 106.69, 'Quận 1'
);

INSERT INTO portal_read_model.pregnancy_mental_health_checkin (
  occurred_at, mood, anxiety, note, phq2_interest, phq2_depressed, gad2_nervous, gad2_control
) VALUES ('2026-09-01 09:00:00+00', 4, 2, 'Bình yên', NULL, NULL, NULL, NULL);

SET ROLE service_role;
CREATE TEMP TABLE family_export_result AS SELECT public.embe_export_family_data_v1() AS payload;
SELECT is(payload ->> 'schema_version', 'embe-family-export/v1', 'The package carries a stable schema version')
  FROM family_export_result;
SELECT ok(payload ? 'generated_at', 'The package carries its generation time') FROM family_export_result;
SELECT ok(
  (payload -> 'data') ?& ARRAY['family_profile','pregnancy','tasks','meals','lifecycle','postpartum','baby','inventory','journal'],
  'The package covers every family-entered data domain'
) FROM family_export_result;
SELECT ok(
  (payload #> '{data,pregnancy}') ?& ARRAY[
    'profiles','days','checks','health','wellness','care_plans','care_intakes','care_contacts',
    'symptoms','medical_records','medical_documents','iphone_health_daily','birth_preparation','contractions'
  ],
  'Pregnancy export includes checklist, appointments and entered health records'
) FROM family_export_result;
SELECT ok(
  (payload #> '{data,tasks}') ?& ARRAY['items','completions']
    AND (payload #> '{data,inventory}') ?& ARRAY['items','actions'],
  'Planner and inventory exports include current data and family-entered history'
) FROM family_export_result;
SELECT ok(
  (payload #> '{data,baby}') ?& ARRAY['care_events','medical_records','medical_documents','growth','milestones']
    AND (payload #> '{data,journal}') ?& ARRAY['entries','memories','uploads','reactions'],
  'Baby data and journal metadata have explicit versioned sections'
) FROM family_export_result;
SELECT is(
  payload #>> '{data,journal,uploads,0,caption}', 'Ảnh siêu âm',
  'Safe family-entered upload metadata is exported'
) FROM family_export_result;
SELECT ok(
  (payload #> '{data,journal,uploads,0}') ?& ARRAY['id','author_role','caption','captured_at','location_name','status','created_at']
    AND NOT (payload #> '{data,journal,uploads,0}') ?| ARRAY[
      'idempotency_key','original_filename','storage_path','checksum_sha256','immich_asset_id',
      'latitude','longitude','attempts','last_error_code','claimed_at','metadata_claimed_at'
    ],
  'Upload export is an explicit safe projection without provider locators or precise coordinates'
) FROM family_export_result;
SELECT ok(
  payload::text !~ 'private-name|10.77|106.69',
  'Original filenames and precise coordinates do not leak'
) FROM family_export_result;
SELECT ok(
  payload::text !~ '"(token_hash|storage_path|object_path|checksum_sha256|idempotency_key|source_asset_id|immich_asset_id|babybuddy_id|source_product_id|product_id)"',
  'The package excludes credentials, binary media locators and provider identifiers'
) FROM family_export_result;
SELECT is(
  public.embe_export_pregnancy_mental_health() #>> '{0,note}', 'Bình yên',
  'The safe mental-health projection preserves the family-entered history'
);

SET ROLE postgres;
SELECT finish();
ROLLBACK;
