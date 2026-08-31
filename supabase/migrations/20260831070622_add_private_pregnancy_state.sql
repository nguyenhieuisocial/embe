-- Private cross-device pregnancy preferences and daily checklist state.
-- The browser never receives a Supabase credential; only the authenticated
-- Portal route calls these service-role-only RPCs.

CREATE TABLE portal_read_model.pregnancy_profile (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  due_date date CHECK (due_date IS NULL OR due_date BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE portal_read_model.pregnancy_day (
  day date PRIMARY KEY CHECK (day BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE portal_read_model.pregnancy_check (
  day date NOT NULL REFERENCES portal_read_model.pregnancy_day(day) ON DELETE CASCADE,
  task_id text NOT NULL CHECK (task_id IN (
    'supplements',
    'varied-meals',
    'food-safety',
    'no-alcohol',
    'movement',
    'water-rest',
    'notes'
  )),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (day, task_id)
);

COMMENT ON TABLE portal_read_model.pregnancy_profile IS
  'Private singleton pregnancy preference; server-only and never exposed directly to a browser.';
COMMENT ON TABLE portal_read_model.pregnancy_day IS
  'Marks an initialized daily checklist, including a deliberately empty day.';
COMMENT ON TABLE portal_read_model.pregnancy_check IS
  'Private completed task identifiers only; no symptom, diagnosis, medication name or free text.';

ALTER TABLE portal_read_model.pregnancy_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_day ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_day FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_check FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE portal_read_model.pregnancy_profile FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_day FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE portal_read_model.pregnancy_check FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_profile TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_day TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE portal_read_model.pregnancy_check TO service_role;

CREATE POLICY pregnancy_profile_deny_clients
ON portal_read_model.pregnancy_profile
FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE POLICY pregnancy_day_deny_clients
ON portal_read_model.pregnancy_day
FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE POLICY pregnancy_check_deny_clients
ON portal_read_model.pregnancy_check
FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_state(p_day date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_day IS NULL OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31' THEN
    RAISE EXCEPTION 'invalid pregnancy state day';
  END IF;

  RETURN jsonb_build_object(
    'due_date', (
      SELECT to_char(profile.due_date, 'YYYY-MM-DD')
      FROM portal_read_model.pregnancy_profile AS profile
      WHERE profile.singleton = true
    ),
    'completed', COALESCE((
      SELECT jsonb_agg(check_state.task_id ORDER BY check_state.task_id)
      FROM portal_read_model.pregnancy_check AS check_state
      WHERE check_state.day = p_day
    ), '[]'::jsonb),
    'has_profile', EXISTS (
      SELECT 1 FROM portal_read_model.pregnancy_profile AS profile
      WHERE profile.singleton = true
    ),
    'has_day_state', EXISTS (
      SELECT 1 FROM portal_read_model.pregnancy_day AS day_state
      WHERE day_state.day = p_day
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_state(
  p_day date,
  p_due_date date,
  p_completed text[],
  p_write_due_date boolean,
  p_write_completed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_day IS NULL
     OR p_day NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31'
     OR p_write_due_date IS NULL
     OR p_write_completed IS NULL
     OR (NOT p_write_due_date AND NOT p_write_completed)
     OR (p_write_due_date AND p_due_date IS NOT NULL AND p_due_date NOT BETWEEN DATE '2020-01-01' AND DATE '2100-12-31')
     OR (p_write_completed AND p_completed IS NULL) THEN
    RAISE EXCEPTION 'invalid pregnancy state';
  END IF;

  IF p_write_completed AND (
    NOT (p_completed <@ ARRAY[
      'supplements', 'varied-meals', 'food-safety', 'no-alcohol',
      'movement', 'water-rest', 'notes'
    ]::text[])
    OR cardinality(p_completed) <> (
      SELECT count(DISTINCT task_id)
      FROM unnest(p_completed) AS tasks(task_id)
    )
  ) THEN
    RAISE EXCEPTION 'invalid pregnancy checklist';
  END IF;

  IF p_write_due_date THEN
    INSERT INTO portal_read_model.pregnancy_profile (singleton, due_date, updated_at)
    VALUES (true, p_due_date, timezone('utc', now()))
    ON CONFLICT (singleton) DO UPDATE
    SET due_date = EXCLUDED.due_date,
        updated_at = EXCLUDED.updated_at;
  END IF;

  IF p_write_completed THEN
    INSERT INTO portal_read_model.pregnancy_day (day, updated_at)
    VALUES (p_day, timezone('utc', now()))
    ON CONFLICT (day) DO UPDATE SET updated_at = EXCLUDED.updated_at;

    DELETE FROM portal_read_model.pregnancy_check AS check_state
    WHERE check_state.day = p_day;

    INSERT INTO portal_read_model.pregnancy_check (day, task_id, updated_at)
    SELECT p_day, task_id, timezone('utc', now())
    FROM unnest(p_completed) AS task_id;
  END IF;

  RETURN public.embe_get_pregnancy_state(p_day);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_state(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_state(date, date, text[], boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_state(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_state(date, date, text[], boolean, boolean) TO service_role;

COMMENT ON FUNCTION public.embe_get_pregnancy_state(date) IS
  'Server-only read of a bounded pregnancy preference and daily checklist snapshot.';
COMMENT ON FUNCTION public.embe_save_pregnancy_state(date, date, text[], boolean, boolean) IS
  'Server-only atomic last-write-wins snapshot used by the authenticated family Portal.';
