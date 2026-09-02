BEGIN;

CREATE TABLE portal_read_model.pregnancy_symptom_entry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL CHECK (
    occurred_at >= TIMESTAMPTZ '2020-01-01 00:00:00+00'
    AND occurred_at < TIMESTAMPTZ '2101-01-01 00:00:00+00'
  ),
  symptoms text[] NOT NULL CHECK (
    cardinality(symptoms) BETWEEN 1 AND 10
    AND symptoms <@ ARRAY[
      'bleeding', 'severe_abdominal_pain', 'severe_headache', 'vision_change',
      'sudden_swelling', 'fever', 'fluid_leak', 'reduced_fetal_movement',
      'persistent_vomiting', 'other'
    ]::text[]
  ),
  severity text NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
  status text NOT NULL CHECK (status IN ('tracking', 'resolved')),
  mood text CHECK (mood IS NULL OR mood IN ('difficult', 'mixed', 'okay', 'good')),
  worry text CHECK (worry IS NULL OR worry IN ('none', 'some', 'hard_to_manage')),
  mental_note text NOT NULL DEFAULT '' CHECK (char_length(mental_note) <= 500),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX pregnancy_symptom_entry_occurred_idx
  ON portal_read_model.pregnancy_symptom_entry (occurred_at DESC, created_at DESC);

ALTER TABLE portal_read_model.pregnancy_symptom_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_symptom_entry FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.pregnancy_symptom_entry FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.pregnancy_symptom_entry TO service_role;
CREATE POLICY pregnancy_symptom_entry_deny_clients
  ON portal_read_model.pregnancy_symptom_entry
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_symptom_history(p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid symptom history limit'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(entry) ORDER BY entry.occurred_at DESC, entry.created_at DESC), '[]'::jsonb)
    INTO result
    FROM (
      SELECT id, occurred_at, symptoms, severity, status, mood, worry, mental_note, notes, created_at
      FROM portal_read_model.pregnancy_symptom_entry
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT p_limit
    ) AS entry;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_symptom_entry(
  p_occurred_at timestamptz, p_symptoms text[], p_severity text, p_status text,
  p_mood text, p_worry text, p_mental_note text, p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result portal_read_model.pregnancy_symptom_entry;
BEGIN
  IF p_occurred_at IS NULL
    OR p_occurred_at < TIMESTAMPTZ '2020-01-01 00:00:00+00'
    OR p_occurred_at > now() + INTERVAL '5 minutes'
    OR cardinality(p_symptoms) NOT BETWEEN 1 AND 10
    OR NOT p_symptoms <@ ARRAY[
      'bleeding', 'severe_abdominal_pain', 'severe_headache', 'vision_change',
      'sudden_swelling', 'fever', 'fluid_leak', 'reduced_fetal_movement',
      'persistent_vomiting', 'other'
    ]::text[]
    OR cardinality(p_symptoms) <> cardinality(ARRAY(SELECT DISTINCT unnest(p_symptoms)))
    OR p_severity NOT IN ('mild', 'moderate', 'severe')
    OR p_status NOT IN ('tracking', 'resolved')
    OR (p_mood IS NOT NULL AND p_mood NOT IN ('difficult', 'mixed', 'okay', 'good'))
    OR (p_worry IS NOT NULL AND p_worry NOT IN ('none', 'some', 'hard_to_manage'))
    OR char_length(COALESCE(p_mental_note, '')) > 500
    OR char_length(COALESCE(p_notes, '')) > 1000
  THEN RAISE EXCEPTION 'invalid pregnancy symptom entry'; END IF;

  INSERT INTO portal_read_model.pregnancy_symptom_entry (
    occurred_at, symptoms, severity, status, mood, worry, mental_note, notes
  ) VALUES (
    p_occurred_at, p_symptoms, p_severity, p_status, p_mood, p_worry,
    btrim(COALESCE(p_mental_note, '')), btrim(COALESCE(p_notes, ''))
  ) RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_resolve_pregnancy_symptom_entry(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result portal_read_model.pregnancy_symptom_entry;
BEGIN
  IF p_id IS NULL THEN RAISE EXCEPTION 'invalid pregnancy symptom entry id'; END IF;
  UPDATE portal_read_model.pregnancy_symptom_entry
    SET status = 'resolved'
    WHERE id = p_id AND status = 'tracking'
    RETURNING * INTO result;
  IF result.id IS NULL THEN
    SELECT * INTO result FROM portal_read_model.pregnancy_symptom_entry
      WHERE id = p_id AND status = 'resolved';
  END IF;
  IF result.id IS NULL THEN RAISE EXCEPTION 'pregnancy symptom entry not found'; END IF;
  RETURN to_jsonb(result);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_symptom_history(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_symptom_entry(timestamptz,text[],text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_resolve_pregnancy_symptom_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_symptom_history(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_symptom_entry(timestamptz,text[],text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_resolve_pregnancy_symptom_entry(uuid) TO service_role;

COMMIT;
