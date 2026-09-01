CREATE TABLE portal_read_model.birth_preparation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  hospital_name text NOT NULL DEFAULT '' CHECK (char_length(hospital_name) <= 160),
  hospital_address text NOT NULL DEFAULT '' CHECK (char_length(hospital_address) <= 300),
  hospital_phone text NOT NULL DEFAULT '' CHECK (hospital_phone ~ '^[0-9+ ().-]{0,30}$'),
  support_phone text NOT NULL DEFAULT '' CHECK (support_phone ~ '^[0-9+ ().-]{0,30}$'),
  preferences text NOT NULL DEFAULT '' CHECK (char_length(preferences) <= 3000),
  clinician_notes text NOT NULL DEFAULT '' CHECK (char_length(clinician_notes) <= 3000),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
INSERT INTO portal_read_model.birth_preparation (singleton) VALUES (true);
ALTER TABLE portal_read_model.birth_preparation ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.birth_preparation FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.birth_preparation FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE portal_read_model.birth_preparation TO service_role;
CREATE POLICY birth_preparation_deny_clients ON portal_read_model.birth_preparation FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE TABLE portal_read_model.contraction_event (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX contraction_event_time_idx ON portal_read_model.contraction_event (started_at DESC);
ALTER TABLE portal_read_model.contraction_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.contraction_event FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE portal_read_model.contraction_event FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE portal_read_model.contraction_event TO service_role;
CREATE POLICY contraction_event_deny_clients ON portal_read_model.contraction_event FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.embe_get_birth_preparation() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT jsonb_build_object('hospital_name',hospital_name,'hospital_address',hospital_address,'hospital_phone',hospital_phone,'support_phone',support_phone,'preferences',preferences,'clinician_notes',clinician_notes) FROM portal_read_model.birth_preparation WHERE singleton;
$f$;
CREATE OR REPLACE FUNCTION public.embe_save_birth_preparation(p_hospital_name text,p_hospital_address text,p_hospital_phone text,p_support_phone text,p_preferences text,p_clinician_notes text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF char_length(p_hospital_name)>160 OR char_length(p_hospital_address)>300 OR char_length(p_preferences)>3000 OR char_length(p_clinician_notes)>3000 OR p_hospital_phone !~ '^[0-9+ ().-]{0,30}$' OR p_support_phone !~ '^[0-9+ ().-]{0,30}$' THEN RAISE EXCEPTION 'invalid birth preparation'; END IF;
 UPDATE portal_read_model.birth_preparation SET hospital_name=trim(p_hospital_name),hospital_address=trim(p_hospital_address),hospital_phone=trim(p_hospital_phone),support_phone=trim(p_support_phone),preferences=trim(p_preferences),clinician_notes=trim(p_clinician_notes),updated_at=timezone('utc',now()) WHERE singleton;
 RETURN public.embe_get_birth_preparation();
END;$f$;
CREATE OR REPLACE FUNCTION public.embe_list_contractions() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'started_at',started_at,'ended_at',ended_at) ORDER BY started_at DESC),'[]'::jsonb) FROM (SELECT * FROM portal_read_model.contraction_event WHERE started_at > timezone('utc',now())-interval '24 hours' ORDER BY started_at DESC LIMIT 50) recent;
$f$;
CREATE OR REPLACE FUNCTION public.embe_start_contraction(p_id uuid,p_started_at timestamptz) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ INSERT INTO portal_read_model.contraction_event(id,started_at) VALUES(p_id,p_started_at) ON CONFLICT(id) DO NOTHING;$f$;
CREATE OR REPLACE FUNCTION public.embe_end_contraction(p_id uuid,p_ended_at timestamptz) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $f$ UPDATE portal_read_model.contraction_event SET ended_at=p_ended_at WHERE id=p_id AND ended_at IS NULL AND p_ended_at>=started_at;$f$;
REVOKE ALL ON FUNCTION public.embe_get_birth_preparation(), public.embe_save_birth_preparation(text,text,text,text,text,text), public.embe_list_contractions(), public.embe_start_contraction(uuid,timestamptz), public.embe_end_contraction(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_get_birth_preparation(), public.embe_save_birth_preparation(text,text,text,text,text,text), public.embe_list_contractions(), public.embe_start_contraction(uuid,timestamptz), public.embe_end_contraction(uuid,timestamptz) TO service_role;
