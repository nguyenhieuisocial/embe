BEGIN;

CREATE TABLE portal_read_model.pregnancy_mental_health_checkin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL CHECK (
    occurred_at >= TIMESTAMPTZ '2020-01-01 00:00:00+00'
    AND occurred_at < TIMESTAMPTZ '2101-01-01 00:00:00+00'
  ),
  mood smallint NOT NULL CHECK (mood BETWEEN 1 AND 5),
  anxiety smallint NOT NULL CHECK (anxiety BETWEEN 1 AND 5),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  phq2_interest smallint CHECK (phq2_interest BETWEEN 0 AND 3),
  phq2_depressed smallint CHECK (phq2_depressed BETWEEN 0 AND 3),
  gad2_nervous smallint CHECK (gad2_nervous BETWEEN 0 AND 3),
  gad2_control smallint CHECK (gad2_control BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT pregnancy_mental_phq_pair CHECK ((phq2_interest IS NULL) = (phq2_depressed IS NULL)),
  CONSTRAINT pregnancy_mental_gad_pair CHECK ((gad2_nervous IS NULL) = (gad2_control IS NULL))
);

CREATE INDEX pregnancy_mental_health_occurred_idx
  ON portal_read_model.pregnancy_mental_health_checkin (occurred_at DESC, created_at DESC);

ALTER TABLE portal_read_model.pregnancy_mental_health_checkin ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.pregnancy_mental_health_checkin FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.pregnancy_mental_health_checkin FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE portal_read_model.pregnancy_mental_health_checkin TO service_role;
CREATE POLICY pregnancy_mental_health_deny_clients
  ON portal_read_model.pregnancy_mental_health_checkin
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_pregnancy_mental_health_history(p_days integer DEFAULT 28)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF p_days IS NULL OR p_days NOT IN (7, 28) THEN RAISE EXCEPTION 'invalid mental-health history window'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(entry) ORDER BY entry.occurred_at DESC, entry.created_at DESC), '[]'::jsonb)
    INTO result
    FROM (
      SELECT id, occurred_at, mood, anxiety, note,
        phq2_interest, phq2_depressed, gad2_nervous, gad2_control, created_at
      FROM portal_read_model.pregnancy_mental_health_checkin
      WHERE occurred_at >= now() - make_interval(days => p_days)
        AND occurred_at <= now() + INTERVAL '5 minutes'
      ORDER BY occurred_at DESC, created_at DESC
      LIMIT 100
    ) AS entry;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.embe_save_pregnancy_mental_health_checkin(
  p_occurred_at timestamptz,
  p_mood integer,
  p_anxiety integer,
  p_note text,
  p_phq2_interest integer,
  p_phq2_depressed integer,
  p_gad2_nervous integer,
  p_gad2_control integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result portal_read_model.pregnancy_mental_health_checkin;
BEGIN
  IF p_occurred_at IS NULL
    OR p_occurred_at < TIMESTAMPTZ '2020-01-01 00:00:00+00'
    OR p_occurred_at > now() + INTERVAL '5 minutes'
    OR p_mood NOT BETWEEN 1 AND 5
    OR p_anxiety NOT BETWEEN 1 AND 5
    OR char_length(COALESCE(p_note, '')) > 500
    OR (p_phq2_interest IS NULL) <> (p_phq2_depressed IS NULL)
    OR (p_gad2_nervous IS NULL) <> (p_gad2_control IS NULL)
    OR (p_phq2_interest IS NOT NULL AND p_phq2_interest NOT BETWEEN 0 AND 3)
    OR (p_phq2_depressed IS NOT NULL AND p_phq2_depressed NOT BETWEEN 0 AND 3)
    OR (p_gad2_nervous IS NOT NULL AND p_gad2_nervous NOT BETWEEN 0 AND 3)
    OR (p_gad2_control IS NOT NULL AND p_gad2_control NOT BETWEEN 0 AND 3)
  THEN RAISE EXCEPTION 'invalid pregnancy mental-health check-in'; END IF;

  INSERT INTO portal_read_model.pregnancy_mental_health_checkin (
    occurred_at, mood, anxiety, note,
    phq2_interest, phq2_depressed, gad2_nervous, gad2_control
  ) VALUES (
    p_occurred_at, p_mood, p_anxiety, btrim(COALESCE(p_note, '')),
    p_phq2_interest, p_phq2_depressed, p_gad2_nervous, p_gad2_control
  ) RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$function$;

REVOKE ALL ON FUNCTION public.embe_get_pregnancy_mental_health_history(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.embe_save_pregnancy_mental_health_checkin(timestamptz,integer,integer,text,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_pregnancy_mental_health_history(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.embe_save_pregnancy_mental_health_checkin(timestamptz,integer,integer,text,integer,integer,integer,integer) TO service_role;

COMMIT;
