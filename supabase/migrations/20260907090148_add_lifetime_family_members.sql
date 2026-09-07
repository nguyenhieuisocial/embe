BEGIN;

-- A person is the SUBJECT of a record, not a new portal login or tenant.
CREATE TABLE portal_read_model.family_member (
  id uuid PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('mother','father','child','relative')),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object' AND octet_length(profile::text) <= 49152),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  archived boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX family_member_parent_unique ON portal_read_model.family_member(role) WHERE role IN ('mother','father');

CREATE TABLE portal_read_model.family_member_record (
  id uuid PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES portal_read_model.family_member(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
  occurred_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_member_record_history ON portal_read_model.family_member_record(member_id, occurred_at DESC, id DESC);
CREATE TABLE portal_read_model.family_member_change (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES portal_read_model.family_member(id),
  entity_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('profile','record')),
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX family_member_change_history ON portal_read_model.family_member_change(member_id,id DESC);

ALTER TABLE portal_read_model.family_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_member FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_member_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_member_record FORCE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_member_change ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_read_model.family_member_change FORCE ROW LEVEL SECURITY;
REVOKE ALL ON portal_read_model.family_member, portal_read_model.family_member_record, portal_read_model.family_member_change FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON portal_read_model.family_member, portal_read_model.family_member_record TO service_role;
GRANT SELECT, INSERT ON portal_read_model.family_member_change TO service_role;
GRANT USAGE, SELECT ON SEQUENCE portal_read_model.family_member_change_id_seq TO service_role;

CREATE FUNCTION public.embe_family_member_json(p portal_read_model.family_member)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p.profile || jsonb_build_object('id',p.id,'role',p.role,'revision',p.revision,'archived',p.archived,'updatedAt',p.updated_at);
$$;
CREATE FUNCTION public.embe_family_record_json(p portal_read_model.family_member_record)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p.payload || jsonb_build_object('id',p.id,'memberId',p.member_id,'revision',p.revision,'deleted',p.deleted,'updatedAt',p.updated_at);
$$;
CREATE FUNCTION public.embe_family_member_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_TABLE_NAME = 'family_member' THEN
    INSERT INTO portal_read_model.family_member_change(member_id,entity_id,entity_type,revision,snapshot)
    VALUES(OLD.id,OLD.id,'profile',OLD.revision,public.embe_family_member_json(OLD::portal_read_model.family_member));
  ELSE
    INSERT INTO portal_read_model.family_member_change(member_id,entity_id,entity_type,revision,snapshot)
    VALUES(OLD.member_id,OLD.id,'record',OLD.revision,public.embe_family_record_json(OLD::portal_read_model.family_member_record));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER family_member_audit BEFORE UPDATE ON portal_read_model.family_member
FOR EACH ROW EXECUTE FUNCTION public.embe_family_member_audit();
CREATE TRIGGER family_member_record_audit BEFORE UPDATE ON portal_read_model.family_member_record
FOR EACH ROW EXECUTE FUNCTION public.embe_family_member_audit();

INSERT INTO portal_read_model.family_member(id,role,profile)
SELECT gen_random_uuid(), entry.role, jsonb_build_object('fullName',entry.name,'preferredName',entry.nickname,
  'birthDate',parent.birth_date,'sexAtBirth','unknown','details','{}'::jsonb)
FROM (VALUES
  ('mother','Trần Ngọc Quỳnh Ngân','Mẹ Ngân'),
  ('father','Nguyễn Xuân Hiếu','Ba Hiếu')
) AS entry(role,name,nickname)
LEFT JOIN portal_read_model.family_parent_profile parent ON parent.role=entry.role;

-- The original birthday editor and wellness profile stay authoritative too.
CREATE FUNCTION public.embe_sync_member_birthday()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE portal_read_model.family_member SET
    profile=jsonb_set(profile,'{birthDate}',COALESCE(to_jsonb(NEW.birth_date),'null'::jsonb)),
    revision=revision+1, updated_at=now()
  WHERE role=NEW.role AND profile->>'birthDate' IS DISTINCT FROM NEW.birth_date::text;
  RETURN NEW;
END;
$$;
CREATE TRIGGER family_member_birthday_sync AFTER INSERT OR UPDATE OF birth_date ON portal_read_model.family_parent_profile
FOR EACH ROW EXECUTE FUNCTION public.embe_sync_member_birthday();

CREATE FUNCTION public.embe_list_family_members()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(public.embe_family_member_json(m) ORDER BY
    CASE role WHEN 'mother' THEN 0 WHEN 'father' THEN 1 ELSE 2 END, profile->>'birthDate',id),'[]'::jsonb)
  FROM portal_read_model.family_member m;
$$;

CREATE FUNCTION public.embe_save_family_member(p_id uuid,p_revision integer,p_profile jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing portal_read_model.family_member; clean jsonb; birth date; role_name text;
BEGIN
  IF jsonb_typeof(p_profile) IS DISTINCT FROM 'object' OR octet_length(p_profile::text)>49152
    OR p_revision IS NULL OR p_revision<0 OR p_id IS NULL
    OR length(trim(COALESCE(p_profile->>'fullName',''))) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_profile->'details') IS DISTINCT FROM 'object'
    OR COALESCE(p_profile->>'role','') NOT IN ('mother','father','child','relative')
    OR COALESCE(p_profile->>'sexAtBirth','') NOT IN ('female','male','unknown')
    OR jsonb_typeof(p_profile->'archived') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'invalid member' USING ERRCODE='22023'; END IF;
  birth := (p_profile->>'birthDate')::date;
  role_name := p_profile->>'role';
  IF birth IS NOT NULL AND (birth<DATE '1800-01-01' OR birth>CURRENT_DATE
    OR role_name IN ('mother','father') AND birth<DATE '1940-01-01')
  THEN RAISE EXCEPTION 'invalid birthday' USING ERRCODE='22023'; END IF;
  clean := p_profile - ARRAY['id','role','revision','archived','updatedAt'];
  SELECT * INTO existing FROM portal_read_model.family_member WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF existing.role IS DISTINCT FROM role_name THEN RAISE EXCEPTION 'role is immutable' USING ERRCODE='22023'; END IF;
    IF existing.profile=clean AND existing.archived=(p_profile->>'archived')::boolean THEN RETURN public.embe_family_member_json(existing); END IF;
    IF existing.revision<>p_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
    IF role_name IN ('mother','father') AND (p_profile->>'archived')::boolean THEN RAISE EXCEPTION 'cannot archive parent' USING ERRCODE='22023'; END IF;
    -- A birthday correction must not silently invalidate recorded history.
    IF EXISTS (SELECT 1 FROM portal_read_model.family_member_record WHERE member_id=p_id
      AND (occurred_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<birth AND NOT deleted)
    THEN RAISE EXCEPTION 'birthday after recorded history' USING ERRCODE='22023'; END IF;
    UPDATE portal_read_model.family_member SET profile=clean, archived=(p_profile->>'archived')::boolean,
      revision=revision+1,updated_at=now() WHERE id=p_id RETURNING * INTO existing;
  ELSE
    IF p_revision<>0 OR (p_profile->>'archived')::boolean THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
    INSERT INTO portal_read_model.family_member(id,role,profile) VALUES(p_id,role_name,clean) RETURNING * INTO existing;
  END IF;
  IF role_name IN ('mother','father') THEN
    INSERT INTO portal_read_model.family_parent_profile(role,birth_date) VALUES(role_name,birth)
    ON CONFLICT(role) DO UPDATE SET birth_date=EXCLUDED.birth_date,updated_at=now();
    IF role_name='mother' THEN
      INSERT INTO portal_read_model.pregnancy_wellness_profile(singleton,birth_date) VALUES(true,birth)
      ON CONFLICT(singleton) DO UPDATE SET birth_date=EXCLUDED.birth_date,updated_at=now();
    END IF;
  END IF;
  RETURN public.embe_family_member_json(existing);
END;
$$;

CREATE FUNCTION public.embe_list_member_records(p_member_id uuid,p_offset integer DEFAULT 0,p_deleted boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('records',COALESCE(jsonb_agg(public.embe_family_record_json(r::portal_read_model.family_member_record)
    ORDER BY r.occurred_at DESC,r.id DESC),'[]'::jsonb),
    'latest',COALESCE((SELECT jsonb_agg(public.embe_family_record_json(latest::portal_read_model.family_member_record) ORDER BY latest.payload->>'metric')
      FROM (SELECT DISTINCT ON(payload->>'metric') * FROM portal_read_model.family_member_record
        WHERE member_id=p_member_id AND NOT deleted AND payload->>'kind'='measurement'
        ORDER BY payload->>'metric',occurred_at DESC,id DESC) latest),'[]'::jsonb))
  FROM (SELECT * FROM portal_read_model.family_member_record WHERE member_id=p_member_id AND deleted=p_deleted
    ORDER BY occurred_at DESC,id DESC LIMIT 41 OFFSET greatest(0,least(p_offset,1000000))) r;
$$;
CREATE FUNCTION public.embe_save_member_record(p_member_id uuid,p_id uuid,p_revision integer,p_record jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE existing portal_read_model.family_member_record; clean jsonb; moment timestamptz; member portal_read_model.family_member;
BEGIN
  SELECT * INTO member FROM portal_read_model.family_member WHERE id=p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'member not found' USING ERRCODE='P0002'; END IF;
  IF member.archived THEN RAISE EXCEPTION 'member archived' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_record) IS DISTINCT FROM 'object' OR octet_length(p_record::text)>16384
    OR p_id IS NULL OR p_revision IS NULL OR p_revision<0
    OR p_record->>'memberId' IS DISTINCT FROM p_member_id::text
    OR length(trim(COALESCE(p_record->>'title',''))) NOT BETWEEN 1 AND 160
    OR COALESCE(p_record->>'kind','') NOT IN ('measurement','visit','lab','vaccination','medication','allergy','condition','procedure','dental','vision','hearing','development','education','wellbeing','care','other')
    OR jsonb_typeof(p_record->'deleted') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'invalid record' USING ERRCODE='22023'; END IF;
  moment := (p_record->>'occurredAt')::timestamptz;
  IF moment IS NULL OR moment>now()+interval '5 minutes'
    OR (moment AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<COALESCE((member.profile->>'birthDate')::date,DATE '1800-01-01')
  THEN RAISE EXCEPTION 'invalid record time' USING ERRCODE='22023'; END IF;
  clean := p_record - ARRAY['id','memberId','revision','deleted','updatedAt'];
  SELECT * INTO existing FROM portal_read_model.family_member_record WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF existing.member_id<>p_member_id THEN RAISE EXCEPTION 'record not found' USING ERRCODE='P0002'; END IF;
    IF existing.payload=clean AND existing.deleted=(p_record->>'deleted')::boolean THEN RETURN public.embe_family_record_json(existing); END IF;
    IF existing.revision<>p_revision THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
    UPDATE portal_read_model.family_member_record SET payload=clean,occurred_at=moment,
      deleted=(p_record->>'deleted')::boolean,revision=revision+1,updated_at=now()
    WHERE id=p_id RETURNING * INTO existing;
  ELSE
    IF p_revision<>0 OR (p_record->>'deleted')::boolean THEN RAISE EXCEPTION 'revision conflict' USING ERRCODE='40001'; END IF;
    INSERT INTO portal_read_model.family_member_record(id,member_id,payload,occurred_at)
    VALUES(p_id,p_member_id,clean,moment) RETURNING * INTO existing;
  END IF;
  RETURN public.embe_family_record_json(existing);
END;
$$;
CREATE FUNCTION public.embe_member_change_history(p_member_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.id DESC),'[]'::jsonb)
  FROM (SELECT id,entity_type,revision,snapshot,changed_at FROM portal_read_model.family_member_change
    WHERE member_id=p_member_id ORDER BY id DESC LIMIT 50) c;
$$;

REVOKE ALL ON FUNCTION public.embe_family_member_json(portal_read_model.family_member), public.embe_family_record_json(portal_read_model.family_member_record), public.embe_family_member_audit(), public.embe_sync_member_birthday(), public.embe_list_family_members(), public.embe_save_family_member(uuid,integer,jsonb), public.embe_list_member_records(uuid,integer,boolean), public.embe_save_member_record(uuid,uuid,integer,jsonb), public.embe_member_change_history(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_family_member_json(portal_read_model.family_member), public.embe_family_record_json(portal_read_model.family_member_record), public.embe_family_member_audit(), public.embe_sync_member_birthday(), public.embe_list_family_members(), public.embe_save_family_member(uuid,integer,jsonb), public.embe_list_member_records(uuid,integer,boolean), public.embe_save_member_record(uuid,uuid,integer,jsonb), public.embe_member_change_history(uuid) TO service_role;

COMMIT;
