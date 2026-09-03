BEGIN;

ALTER TABLE portal_read_model.birth_preparation
  ADD COLUMN IF NOT EXISTS hospital_bag_completed text[] NOT NULL DEFAULT '{}'::text[]
  CHECK (cardinality(hospital_bag_completed) <= 40);

CREATE OR REPLACE FUNCTION public.embe_get_hospital_bag()
RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT hospital_bag_completed FROM portal_read_model.birth_preparation WHERE singleton;
$f$;

CREATE OR REPLACE FUNCTION public.embe_save_hospital_bag(p_completed text[])
RETURNS text[] LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result text[];
BEGIN
  IF p_completed IS NULL OR cardinality(p_completed) > 40
     OR EXISTS (SELECT 1 FROM unnest(p_completed) item WHERE char_length(item) NOT BETWEEN 1 AND 48) THEN
    RAISE EXCEPTION 'invalid hospital bag';
  END IF;
  UPDATE portal_read_model.birth_preparation
  SET hospital_bag_completed = ARRAY(SELECT DISTINCT item FROM unnest(p_completed) item ORDER BY item),
      updated_at = timezone('utc', now())
  WHERE singleton
  RETURNING hospital_bag_completed INTO result;
  RETURN result;
END;
$f$;

REVOKE ALL ON FUNCTION public.embe_get_hospital_bag(), public.embe_save_hospital_bag(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_hospital_bag(), public.embe_save_hospital_bag(text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.embe_export_family_data_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          public.embe_export_family_data_v1(),
          '{data,pregnancy,mental_health}', public.embe_export_pregnancy_mental_health(), true
        ),
        '{data,pregnancy,fetal_movement_sessions}',
        COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
          SELECT id, started_at, ended_at, movement_count, last_movement_at, note, created_at, updated_at
          FROM portal_read_model.fetal_movement_session ORDER BY started_at, id
        ) AS row_data), '[]'::jsonb), true
      ),
      '{data,budget}',
      COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
        SELECT id, incurred_on, kind, category, amount_vnd, description, note, created_at, updated_at, deleted_at
        FROM portal_read_model.family_expense ORDER BY incurred_on, id
      ) AS row_data), '[]'::jsonb), true
    ),
    '{data,pregnancy,hospital_bag}',
    COALESCE((SELECT to_jsonb(hospital_bag_completed) FROM portal_read_model.birth_preparation WHERE singleton), '[]'::jsonb), true
  );
$f$;

REVOKE ALL ON FUNCTION public.embe_export_family_data_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_family_data_v2() TO service_role;

COMMIT;
