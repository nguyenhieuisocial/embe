-- Run only on the identified EmBe store with no pending handoff. Synthetic rows
-- remain uncommitted; the Studio advisory lock prevents a worker seeing fixtures.
-- No HTTP, storage upload, dispatch call or external side effect occurs here.
BEGIN;
SET LOCAL ROLE service_role;
SELECT pg_advisory_xact_lock(73915431);
DO $$
DECLARE p uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); q uuid; s uuid:=gen_random_uuid(); off_s uuid:=gen_random_uuid(); j jsonb; n integer;
  doc jsonb:='{"title":"Handoff fixture only","stage":"","caption":"","scenes":[{"heading":"Mẫu","text":"Một ghi chú thử."}],"sources":[{"title":"EmBe","url":"https://embe.hieu.asia"}],"autoRender":true}';
BEGIN
  IF EXISTS(SELECT 1 FROM embe_studio.render rr JOIN embe_studio.project pp ON pp.id=rr.project_id
    WHERE rr.status='completed' AND NOT pp.deleted AND rr.revision=pp.revision AND rr.snapshot=pp.payload
      AND pp.payload->'autoRender'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM embe_studio.review_request qq WHERE qq.render_id=rr.id))
    THEN RAISE EXCEPTION 'existing handoff must settle first'; END IF;
  INSERT INTO embe_studio.project(id,payload) VALUES(p,doc);
  INSERT INTO embe_studio.render(id,project_id,revision,snapshot,status) VALUES(r,p,1,doc,'queued');
  INSERT INTO portal_read_model.push_subscription(id,endpoint,p256dh,auth,device_role,enabled,detail_preview)
    VALUES(s,'https://push.example.invalid/studio-'||s,repeat('x',88),repeat('a',22),'family',true,false),
      (off_s,'https://push.example.invalid/studio-'||off_s,repeat('x',88),repeat('a',22),'family',false,true);
  j:=public.embe_studio_auto_handoff();IF (j->>'queued')::integer<>0 THEN RAISE EXCEPTION 'queued render admitted'; END IF;
  UPDATE embe_studio.render SET status='completed' WHERE id=r;
  UPDATE embe_studio.project SET payload=doc||'{"autoRender":false}' WHERE id=p;
  j:=public.embe_studio_auto_handoff();IF (j->>'queued')::integer<>0 THEN RAISE EXCEPTION 'changed or disabled draft admitted'; END IF;
  UPDATE embe_studio.project SET payload=doc,deleted=true WHERE id=p;
  j:=public.embe_studio_auto_handoff();IF (j->>'queued')::integer<>0 THEN RAISE EXCEPTION 'deleted draft admitted'; END IF;
  UPDATE embe_studio.project SET deleted=false WHERE id=p;
  j:=public.embe_studio_auto_handoff();IF (j->>'queued')::integer<>1 THEN RAISE EXCEPTION 'no handoff'; END IF;
  SELECT id INTO q FROM embe_studio.review_request WHERE render_id=r AND origin='automatic' AND status='pending' AND snapshot=doc AND target='undecided';
  IF q IS NULL THEN RAISE EXCEPTION 'handoff snapshot or origin'; END IF;
  IF NOT EXISTS(SELECT 1 FROM embe_studio.review_event WHERE request_id=q AND note LIKE 'EmBe tự chuyển%') THEN RAISE EXCEPTION 'false human acknowledgement'; END IF;
  IF NOT EXISTS(SELECT 1 FROM portal_read_model.push_delivery WHERE subscription_id=s AND notification_key='studio-ready:'||r AND body NOT LIKE '%Handoff fixture%' AND target_url='/studio/duyet-dang?du-an='||p) THEN RAISE EXCEPTION 'private notification'; END IF;
  IF EXISTS(SELECT 1 FROM portal_read_model.push_delivery WHERE subscription_id=off_s AND notification_key='studio-ready:'||r) THEN RAISE EXCEPTION 'disabled device notified'; END IF;
  SELECT count(*) INTO n FROM portal_read_model.push_delivery WHERE notification_key='studio-ready:'||r;
  j:=public.embe_studio_auto_handoff();IF (j->>'queued')::integer<>0 OR n<>(SELECT count(*) FROM portal_read_model.push_delivery WHERE notification_key='studio-ready:'||r) THEN RAISE EXCEPTION 'duplicate handoff or push'; END IF;
  UPDATE embe_studio.review_request SET status='cancelled' WHERE id=q;
  PERFORM public.embe_studio_auto_handoff();IF (SELECT status FROM embe_studio.review_request WHERE id=q)<>'cancelled' THEN RAISE EXCEPTION 'withdrawal ignored'; END IF;
  IF public.embe_studio_automation()->'publication'->>'status'<>'not_connected' THEN RAISE EXCEPTION 'false publication'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon','public.embe_studio_auto_handoff(integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.embe_studio_automation(boolean,integer)','EXECUTE')
    OR has_function_privilege('anon','public.embe_studio_creation_status(boolean,integer)','EXECUTE') THEN RAISE EXCEPTION 'private boundary failed'; END IF;
END $$;
ROLLBACK;
