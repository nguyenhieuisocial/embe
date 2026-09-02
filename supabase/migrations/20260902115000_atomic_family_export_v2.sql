BEGIN;

CREATE OR REPLACE FUNCTION public.embe_export_family_data_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT jsonb_set(
    public.embe_export_family_data_v1(),
    '{data,pregnancy,mental_health}',
    public.embe_export_pregnancy_mental_health(),
    true
  );
$function$;

REVOKE ALL ON FUNCTION public.embe_export_family_data_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_family_data_v2() TO service_role;

COMMENT ON FUNCTION public.embe_export_family_data_v2() IS
  'Atomic versioned family export including the complete safe pregnancy mental-health projection.';

COMMIT;
