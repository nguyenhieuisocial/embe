BEGIN;

CREATE OR REPLACE FUNCTION public.embe_export_pregnancy_mental_health()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.occurred_at, row_data.created_at), '[]'::jsonb)
  FROM (
    SELECT id, occurred_at, mood, anxiety, note,
           phq2_interest, phq2_depressed, gad2_nervous, gad2_control, created_at
    FROM portal_read_model.pregnancy_mental_health_checkin
    ORDER BY occurred_at, created_at
  ) AS row_data;
$function$;

REVOKE ALL ON FUNCTION public.embe_export_pregnancy_mental_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_pregnancy_mental_health() TO service_role;

COMMENT ON FUNCTION public.embe_export_pregnancy_mental_health() IS
  'Safe full-history projection merged into the versioned family export by the private portal route.';

COMMIT;
