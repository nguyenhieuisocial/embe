-- Private editorial workspace, separate from family health/media records.
CREATE SCHEMA embe_studio;
REVOKE ALL ON SCHEMA embe_studio FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA embe_studio TO service_role;
CREATE TABLE embe_studio.project (
  id uuid PRIMARY KEY, revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) < 24000),
  deleted boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE embe_studio.notebook (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), revision integer NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) <= 200 AND octet_length(items::text) < 1100000)
);
INSERT INTO embe_studio.notebook DEFAULT VALUES;
CREATE TABLE embe_studio.render (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES embe_studio.project(id),
  revision integer NOT NULL, snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','rendering','completed','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0, claim uuid, progress integer NOT NULL DEFAULT 0,
  error text, output jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision)
);
CREATE INDEX studio_render_queue ON embe_studio.render(status,created_at);
CREATE TABLE embe_studio.worker_state (id boolean PRIMARY KEY DEFAULT true CHECK(id), seen_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE embe_studio.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE embe_studio.notebook ENABLE ROW LEVEL SECURITY;
ALTER TABLE embe_studio.render ENABLE ROW LEVEL SECURITY;
ALTER TABLE embe_studio.worker_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA embe_studio FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA embe_studio TO service_role;

CREATE FUNCTION public.embe_studio_workspace(p_action text, p_id uuid DEFAULT NULL, p_revision integer DEFAULT NULL, p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p embe_studio.project; r embe_studio.render; b embe_studio.notebook; result jsonb;
BEGIN
  IF p_action = 'asset' THEN
    SELECT rr.* INTO r FROM embe_studio.render rr JOIN embe_studio.project pp ON pp.id=rr.project_id
      WHERE rr.id=p_id AND rr.status='completed' AND NOT pp.deleted;
    IF NOT FOUND THEN RAISE sqlstate 'PT404' USING message='not_found'; END IF;
    RETURN jsonb_build_object('render',to_jsonb(r)-'claim');
  ELSIF p_action = 'list' THEN
    SELECT jsonb_build_object('projects',coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC),'[]')) INTO result
    FROM (SELECT id,revision,payload,deleted,created_at,updated_at FROM embe_studio.project ORDER BY updated_at DESC LIMIT 100) x;
    RETURN result || jsonb_build_object('workerSeenAt',(SELECT seen_at FROM embe_studio.worker_state WHERE id));
  ELSIF p_action = 'get' THEN
    SELECT * INTO p FROM embe_studio.project WHERE id=p_id;
    IF NOT FOUND THEN RAISE sqlstate 'PT404' USING message='not_found'; END IF;
    RETURN jsonb_build_object('project',to_jsonb(p),'renders',(SELECT coalesce(jsonb_agg(to_jsonb(x) - 'snapshot' - 'claim' ORDER BY x.created_at DESC),'[]') FROM
      (SELECT * FROM embe_studio.render WHERE project_id=p_id ORDER BY created_at DESC LIMIT 10) x),
      'workerSeenAt',(SELECT seen_at FROM embe_studio.worker_state WHERE id));
  ELSIF p_action = 'board' THEN
    SELECT * INTO b FROM embe_studio.notebook WHERE id;
    RETURN jsonb_build_object('revision',b.revision,'items',b.items);
  ELSIF p_action = 'save-board' THEN
    SELECT * INTO b FROM embe_studio.notebook WHERE id FOR UPDATE;
    IF p_revision IS DISTINCT FROM b.revision THEN
      IF p_payload = b.items THEN RETURN jsonb_build_object('revision',b.revision,'items',b.items); END IF;
      RAISE sqlstate 'PT409' USING message='revision_conflict';
    END IF;
    UPDATE embe_studio.notebook SET items=p_payload,revision=revision+1 WHERE id RETURNING * INTO b;
    RETURN jsonb_build_object('revision',b.revision,'items',b.items);
  END IF;
  -- Serialize creates, edits and queue admission in this small two-person workspace.
  PERFORM pg_advisory_xact_lock(73915431);
  SELECT * INTO p FROM embe_studio.project WHERE id=p_id FOR UPDATE;
  IF p_action = 'save' AND NOT FOUND THEN
    IF p_revision IS DISTINCT FROM 0 OR p_id IS NULL THEN RAISE sqlstate 'PT409' USING message='revision_conflict'; END IF;
    IF (SELECT count(*) FROM embe_studio.project) >= 100 THEN RAISE sqlstate 'PT429' USING message='workspace_full'; END IF;
    INSERT INTO embe_studio.project(id,payload) VALUES(p_id,p_payload) RETURNING * INTO p;
    RETURN jsonb_build_object('project',to_jsonb(p));
  END IF;
  IF p.id IS NULL THEN RAISE sqlstate 'PT404' USING message='not_found'; END IF;
  IF p_revision IS DISTINCT FROM p.revision THEN
    IF p_action='save' AND NOT p.deleted AND p_payload=p.payload AND p_revision=p.revision-1 THEN RETURN jsonb_build_object('project',to_jsonb(p)); END IF;
    RAISE sqlstate 'PT409' USING message='revision_conflict';
  END IF;
  IF p_action IN ('save','delete','restore') THEN
    IF p_action='save' AND p.deleted THEN RAISE sqlstate 'PT409' USING message='project_deleted'; END IF;
    UPDATE embe_studio.project SET payload=CASE WHEN p_action='save' THEN p_payload ELSE payload END,
      deleted=CASE WHEN p_action='delete' THEN true WHEN p_action='restore' THEN false ELSE deleted END,
      revision=revision+1,updated_at=now() WHERE id=p_id RETURNING * INTO p;
    IF p_action='delete' THEN UPDATE embe_studio.render SET status='cancelled',claim=NULL,updated_at=now() WHERE project_id=p_id AND status IN ('queued','rendering'); END IF;
    RETURN jsonb_build_object('project',to_jsonb(p));
  ELSIF p_action='render' AND NOT p.deleted THEN
    SELECT * INTO r FROM embe_studio.render WHERE project_id=p_id AND revision=p_revision FOR UPDATE;
    IF r.status IN ('queued','rendering','completed') THEN RETURN jsonb_build_object('render',to_jsonb(r)-'snapshot'-'claim'); END IF;
    IF (SELECT count(*) FROM embe_studio.render WHERE status IN ('queued','rendering')) >= 3
      OR (r.id IS NULL AND (SELECT count(*) FROM embe_studio.render) >= 100) THEN RAISE sqlstate 'PT429' USING message='queue_full'; END IF;
    IF r.attempts >= 3 THEN RAISE sqlstate 'PT409' USING message='retry_limit'; END IF;
    IF r.id IS NULL THEN
      INSERT INTO embe_studio.render(project_id,revision,snapshot) VALUES(p_id,p_revision,p.payload) RETURNING * INTO r;
    ELSE
      UPDATE embe_studio.render SET status='queued',claim=NULL,error=NULL,progress=0,updated_at=now() WHERE id=r.id RETURNING * INTO r;
    END IF;
    RETURN jsonb_build_object('render',to_jsonb(r)-'snapshot'-'claim');
  ELSIF p_action='cancel' THEN
    UPDATE embe_studio.render SET status='cancelled',claim=NULL,updated_at=now() WHERE project_id=p_id AND revision=p_revision AND status IN ('queued','rendering');
    RETURN jsonb_build_object('ok',true);
  END IF;
  RAISE sqlstate 'PT400' USING message='invalid_action';
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_workspace(text,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_workspace(text,uuid,integer,jsonb) TO service_role;

CREATE FUNCTION public.embe_studio_worker(p_action text,p_id uuid DEFAULT NULL,p_claim uuid DEFAULT NULL,p_output jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r embe_studio.render;
BEGIN
  INSERT INTO embe_studio.worker_state(id,seen_at) VALUES(true,now()) ON CONFLICT(id) DO UPDATE SET seen_at=now();
  IF p_action='claim' THEN
    PERFORM pg_advisory_xact_lock(73915432);
    UPDATE embe_studio.render SET status='failed',error='interrupted',claim=NULL,updated_at=now()
      WHERE status='rendering' AND updated_at < now()-interval '15 minutes';
    IF EXISTS(SELECT 1 FROM embe_studio.render WHERE status='rendering') THEN RETURN NULL; END IF;
    SELECT * INTO r FROM embe_studio.render WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF r.id IS NULL THEN RETURN NULL; END IF;
    UPDATE embe_studio.render SET status='rendering',claim=gen_random_uuid(),attempts=attempts+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
    RETURN to_jsonb(r);
  END IF;
  SELECT * INTO r FROM embe_studio.render WHERE id=p_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'rendering' OR p_claim IS NULL OR r.claim IS DISTINCT FROM p_claim THEN RAISE sqlstate 'PT409' USING message='claim_lost'; END IF;
  IF p_action='progress' THEN
    UPDATE embe_studio.render SET progress=greatest(0,least(99,(p_output->>'progress')::integer)),updated_at=now() WHERE id=p_id;
  ELSIF p_action='finish' THEN
    IF jsonb_typeof(p_output) <> 'object' OR octet_length(p_output::text)>16000
      OR p_output->'video'->>'path' !~ '^editorial/[a-f0-9]{64}\.mp4$'
      OR p_output->'poster'->>'path' !~ '^editorial/[a-f0-9]{64}\.png$'
      OR NOT ((p_output->'video'->>'size')::integer BETWEEN 1 AND 4000000) THEN RAISE sqlstate 'PT400' USING message='invalid_output'; END IF;
    UPDATE embe_studio.render SET status='completed',output=p_output,progress=100,claim=NULL,updated_at=now() WHERE id=p_id;
  ELSIF p_action='fail' THEN
    UPDATE embe_studio.render SET status='failed',error=CASE WHEN p_output->>'error' IN ('text_does_not_fit','voice_too_long','render_budget_exceeded','storage_unavailable','invalid_project','worker_unavailable') THEN p_output->>'error' ELSE 'worker_unavailable' END,
      claim=NULL,updated_at=now() WHERE id=p_id;
  ELSE RAISE sqlstate 'PT400' USING message='invalid_action'; END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_worker(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_worker(text,uuid,uuid,jsonb) TO service_role;
