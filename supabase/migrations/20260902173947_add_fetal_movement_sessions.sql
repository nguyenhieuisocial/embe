CREATE TABLE portal_read_model.fetal_movement_session (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  movement_count integer NOT NULL DEFAULT 0 CHECK (movement_count BETWEEN 0 AND 500),
  last_movement_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (last_movement_at IS NULL OR last_movement_at >= started_at),
  CHECK (ended_at IS NULL OR ended_at <= started_at + interval '12 hours')
);
CREATE UNIQUE INDEX fetal_movement_one_active_idx
  ON portal_read_model.fetal_movement_session ((true)) WHERE ended_at IS NULL;
CREATE INDEX fetal_movement_started_at_idx
  ON portal_read_model.fetal_movement_session (started_at DESC);
ALTER TABLE portal_read_model.fetal_movement_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.fetal_movement_session FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.fetal_movement_session FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.fetal_movement_session TO service_role;
CREATE POLICY fetal_movement_session_deny_clients
  ON portal_read_model.fetal_movement_session FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_list_fetal_movement_sessions(p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', session.id, 'started_at', session.started_at, 'ended_at', session.ended_at,
    'movement_count', session.movement_count, 'note', session.note, 'created_at', session.created_at
  ) ORDER BY session.started_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM portal_read_model.fetal_movement_session
    ORDER BY started_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 50)
  ) AS session;
$f$;

CREATE OR REPLACE FUNCTION public.embe_start_fetal_movement_session(p_id uuid, p_started_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(87203411);
  IF p_started_at < timezone('utc', now()) - interval '24 hours'
     OR p_started_at > timezone('utc', now()) + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid movement session start';
  END IF;
  SELECT jsonb_build_object(
    'id', active.id, 'started_at', active.started_at, 'ended_at', active.ended_at,
    'movement_count', active.movement_count, 'note', active.note, 'created_at', active.created_at
  ) INTO result
  FROM portal_read_model.fetal_movement_session AS active WHERE active.ended_at IS NULL LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
  INSERT INTO portal_read_model.fetal_movement_session (id, started_at) VALUES (p_id, p_started_at)
  ON CONFLICT (id) DO NOTHING;
  SELECT jsonb_build_object(
    'id', saved.id, 'started_at', saved.started_at, 'ended_at', saved.ended_at,
    'movement_count', saved.movement_count, 'note', saved.note, 'created_at', saved.created_at
  ) INTO result FROM portal_read_model.fetal_movement_session AS saved WHERE saved.id = p_id;
  RETURN result;
END;
$f$;

CREATE OR REPLACE FUNCTION public.embe_record_fetal_movement(p_id uuid, p_recorded_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  UPDATE portal_read_model.fetal_movement_session AS session
  SET movement_count = session.movement_count + 1, last_movement_at = p_recorded_at,
      updated_at = timezone('utc', now())
  WHERE session.id = p_id AND session.ended_at IS NULL AND session.movement_count < 500
    AND p_recorded_at >= session.started_at
    AND p_recorded_at <= timezone('utc', now()) + interval '5 minutes'
  RETURNING jsonb_build_object(
    'id', session.id, 'started_at', session.started_at, 'ended_at', session.ended_at,
    'movement_count', session.movement_count, 'note', session.note, 'created_at', session.created_at
  ) INTO result;
  RETURN result;
END;
$f$;

CREATE OR REPLACE FUNCTION public.embe_finish_fetal_movement_session(p_id uuid, p_ended_at timestamptz, p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $f$
DECLARE result jsonb;
BEGIN
  IF char_length(trim(COALESCE(p_note, ''))) > 500 THEN RAISE EXCEPTION 'invalid movement note'; END IF;
  UPDATE portal_read_model.fetal_movement_session AS session
  SET ended_at = p_ended_at, note = trim(COALESCE(p_note, '')), updated_at = timezone('utc', now())
  WHERE session.id = p_id AND session.ended_at IS NULL
    AND p_ended_at >= session.started_at AND p_ended_at <= session.started_at + interval '12 hours'
    AND p_ended_at <= timezone('utc', now()) + interval '5 minutes'
  RETURNING jsonb_build_object(
    'id', session.id, 'started_at', session.started_at, 'ended_at', session.ended_at,
    'movement_count', session.movement_count, 'note', session.note, 'created_at', session.created_at
  ) INTO result;
  RETURN result;
END;
$f$;

REVOKE ALL ON FUNCTION public.embe_list_fetal_movement_sessions(integer),
  public.embe_start_fetal_movement_session(uuid, timestamptz),
  public.embe_record_fetal_movement(uuid, timestamptz),
  public.embe_finish_fetal_movement_session(uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_list_fetal_movement_sessions(integer),
  public.embe_start_fetal_movement_session(uuid, timestamptz),
  public.embe_record_fetal_movement(uuid, timestamptz),
  public.embe_finish_fetal_movement_session(uuid, timestamptz, text)
  TO service_role;

COMMENT ON TABLE portal_read_model.fetal_movement_session IS
  'Private, non-diagnostic sessions for recording the baby usual movement pattern.';
COMMENT ON FUNCTION public.embe_list_fetal_movement_sessions(integer) IS
  'Lists a bounded fetal movement history for the private family portal.';

CREATE OR REPLACE FUNCTION public.embe_export_family_data_v2()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $f$
  SELECT jsonb_set(
    jsonb_set(
      public.embe_export_family_data_v1(),
      '{data,pregnancy,mental_health}',
      public.embe_export_pregnancy_mental_health(),
      true
    ),
    '{data,pregnancy,fetal_movement_sessions}',
    COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM (
      SELECT id, started_at, ended_at, movement_count, last_movement_at, note, created_at, updated_at
      FROM portal_read_model.fetal_movement_session ORDER BY started_at, id
    ) AS row_data), '[]'::jsonb),
    true
  );
$f$;
REVOKE ALL ON FUNCTION public.embe_export_family_data_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_export_family_data_v2() TO service_role;
