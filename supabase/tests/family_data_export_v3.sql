BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SET ROLE postgres;
SET search_path = public, extensions, pg_temp;

SELECT plan(4);
SELECT ok(has_function_privilege('service_role', 'public.embe_export_family_data_v3()', 'EXECUTE'), 'Server can create the complete v3 export');
SELECT ok(NOT has_function_privilege('anon', 'public.embe_export_family_data_v3()', 'EXECUTE'), 'Anonymous clients cannot export family history');
SET ROLE service_role;
SELECT is(public.embe_export_family_data_v3() ->> 'schema_version', 'embe-family-export/v3', 'Export declares its actual schema version');
SELECT ok((public.embe_export_family_data_v3() #> '{data,history}') ?& ARRAY['trash_actions','family_activity'], 'Export includes recoverable and recent activity history');
SET ROLE postgres;
SELECT finish();
ROLLBACK;
