-- Private editorial handoff, not clinical sign-off or a social-publishing credential.
CREATE TABLE embe_studio.review_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES embe_studio.project(id),
  project_revision integer NOT NULL,
  render_id uuid NOT NULL UNIQUE REFERENCES embe_studio.render(id),
  snapshot jsonb NOT NULL,
  target text NOT NULL CHECK (target IN ('undecided','tiktok','instagram','facebook','youtube','zalo')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cancelled')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE embe_studio.review_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES embe_studio.review_request(id),
  action text NOT NULL CHECK (action IN ('requested','commented','cancelled','reopened')),
  note text NOT NULL CHECK (length(note)<=1500),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE embe_studio.review_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE embe_studio.review_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON embe_studio.review_request,embe_studio.review_event FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON embe_studio.review_request TO service_role;
GRANT SELECT,INSERT ON embe_studio.review_event TO service_role;
GRANT USAGE,SELECT ON SEQUENCE embe_studio.review_event_id_seq TO service_role;
CREATE POLICY studio_service_only ON embe_studio.review_request TO service_role USING(true) WITH CHECK(true);
CREATE POLICY studio_service_only ON embe_studio.review_event TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.embe_studio_review(p_action text,p_id uuid DEFAULT NULL,p_revision integer DEFAULT NULL,p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p embe_studio.project; r embe_studio.render; q embe_studio.review_request; result jsonb; note text; event_action text;
BEGIN
  IF p_action='list' THEN
    RETURN jsonb_build_object('requests',coalesce((SELECT jsonb_agg(x ORDER BY updated_at DESC) FROM (
      SELECT q.id,q.project_id,q.project_revision,q.render_id,q.target,q.status,q.revision,q.created_at,q.updated_at,
        q.snapshot->>'title' AS title,(p.deleted OR p.revision<>q.project_revision OR p.payload<>q.snapshot) AS stale
      FROM embe_studio.review_request q JOIN embe_studio.project p ON p.id=q.project_id
      ORDER BY q.updated_at DESC LIMIT 100
    ) x),'[]'::jsonb));
  ELSIF p_action='get' THEN
    SELECT * INTO q FROM embe_studio.review_request WHERE id=p_id;
    IF NOT FOUND THEN RAISE sqlstate 'PT404' USING message='not_found'; END IF;
    SELECT * INTO p FROM embe_studio.project WHERE id=q.project_id;
    RETURN jsonb_build_object('request',to_jsonb(q)||jsonb_build_object('stale',p.deleted OR p.revision<>q.project_revision OR p.payload<>q.snapshot),
      'events',coalesce((SELECT jsonb_agg(x ORDER BY created_at,id) FROM (SELECT id,action,note,created_at FROM embe_studio.review_event WHERE request_id=q.id ORDER BY id LIMIT 100) x),'[]'::jsonb));
  END IF;
  IF p_action NOT IN ('request','comment','cancel') THEN RAISE sqlstate 'PT400' USING message='invalid_action'; END IF;
  note=coalesce(p_payload->>'note','');
  IF length(note)>1500 OR p_revision IS NULL OR p_revision<1 THEN RAISE sqlstate 'PT400' USING message='invalid_request'; END IF;
  -- Same lock as project saves: no request can bind a script that changed during admission.
  PERFORM pg_advisory_xact_lock(73915431);
  IF p_action='request' THEN
    IF coalesce(p_payload->>'target','') NOT IN ('undecided','tiktok','instagram','facebook','youtube','zalo') THEN RAISE sqlstate 'PT400' USING message='invalid_target'; END IF;
    SELECT * INTO p FROM embe_studio.project WHERE id=p_id FOR UPDATE;
    IF p.id IS NULL OR p.deleted THEN RAISE sqlstate 'PT404' USING message='not_found'; END IF;
    IF p.revision<>p_revision THEN RAISE sqlstate 'PT409' USING message='revision_conflict'; END IF;
    SELECT * INTO r FROM embe_studio.render WHERE project_id=p.id AND revision=p.revision AND status='completed' AND snapshot=p.payload;
    IF r.id IS NULL THEN RAISE sqlstate 'PT409' USING message='current_render_required'; END IF;
    SELECT * INTO q FROM embe_studio.review_request WHERE render_id=r.id FOR UPDATE;
    IF q.id IS NOT NULL AND q.status='pending' THEN RETURN jsonb_build_object('id',q.id); END IF;
    IF q.id IS NULL THEN
      IF (SELECT count(*) FROM embe_studio.review_request)>=100 THEN RAISE sqlstate 'PT429' USING message='queue_full'; END IF;
      INSERT INTO embe_studio.review_request(project_id,project_revision,render_id,snapshot,target)
        VALUES(p.id,p.revision,r.id,p.payload,p_payload->>'target') RETURNING * INTO q;
      event_action='requested';
    ELSE
      UPDATE embe_studio.review_request SET status='pending',target=p_payload->>'target',revision=revision+1,updated_at=now() WHERE id=q.id RETURNING * INTO q;
      event_action='reopened';
    END IF;
  ELSE
    SELECT * INTO q FROM embe_studio.review_request WHERE id=p_id FOR UPDATE;
    IF q.id IS NULL THEN RAISE sqlstate 'PT404' USING message='not_found'; END IF;
    IF q.revision<>p_revision OR q.status<>'pending' THEN RAISE sqlstate 'PT409' USING message='revision_conflict'; END IF;
    IF p_action='comment' AND length(trim(note))=0 THEN RAISE sqlstate 'PT400' USING message='note_required'; END IF;
    UPDATE embe_studio.review_request SET status=CASE WHEN p_action='cancel' THEN 'cancelled' ELSE status END,
      revision=revision+1,updated_at=now() WHERE id=q.id RETURNING * INTO q;
    event_action=CASE WHEN p_action='cancel' THEN 'cancelled' ELSE 'commented' END;
  END IF;
  IF (SELECT count(*) FROM embe_studio.review_event WHERE request_id=q.id)>=100 THEN RAISE sqlstate 'PT429' USING message='history_full'; END IF;
  INSERT INTO embe_studio.review_event(request_id,action,note) VALUES(q.id,event_action,note);
  RETURN jsonb_build_object('id',q.id);
END $$;
REVOKE ALL ON FUNCTION public.embe_studio_review(text,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.embe_studio_review(text,uuid,integer,jsonb) TO service_role;
COMMENT ON FUNCTION public.embe_studio_review IS 'Private family editorial queue only. No approval or publication action: requires separately verified clinician identity and authorized social connection.';
