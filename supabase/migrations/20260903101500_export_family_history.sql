BEGIN;

CREATE OR REPLACE FUNCTION public.embe_export_family_data_v3()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_set(
    jsonb_set(
      public.embe_export_family_data_v2(),
      '{schema_version}',
      to_jsonb('embe-family-export/v3'::text),
      true
    ),
    '{data,history}',
    jsonb_build_object(
      'trash_actions', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT entity_type, entity_id, action, occurred_at
        FROM portal_read_model.family_audit_event ORDER BY occurred_at, id
      ) AS row_data), '[]'::jsonb),
      'family_activity', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT event_id, activity_kind, title, target_url, created_at
        FROM portal_read_model.family_activity_event ORDER BY created_at, event_id
      ) AS row_data), '[]'::jsonb)
    ),
    true
  );
$function$;

REVOKE ALL ON FUNCTION public.embe_export_family_data_v3() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_family_data_v3() TO service_role;

COMMENT ON FUNCTION public.embe_export_family_data_v3() IS
  'Portable family export including bounded operational history without credentials or provider locators.';

COMMIT;
